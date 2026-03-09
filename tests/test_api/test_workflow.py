"""Full workflow integration test — project creation through model versioning.

Tests the complete journey:
  1. Create project  2. Upload dataset  3. Explore  4. Fit
  5. Save model  6. History  7. Detail  8. Fit v2  9. Save v2  10. History diff
"""

import io

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from atelier.app import create_app
from atelier.db.engine import get_session
from atelier.db.models import Base


# ---------------------------------------------------------------------------
# Fixture: isolated DB client that also patches model_service session factory
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def wf_client(app, tmp_path):
    """Workflow test client with fully isolated DB (includes model_service patch)."""
    db_path = tmp_path / "test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_session():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    # Patch model_service so save_null_model uses test DB
    import atelier.services.model_service as ms_mod
    original_get_factory = ms_mod.get_session_factory
    ms_mod.get_session_factory = lambda: factory

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    ms_mod.get_session_factory = original_get_factory
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
class TestFullWorkflow:
    """End-to-end workflow: project -> upload -> explore -> fit -> save -> history -> detail."""

    async def test_complete_modeling_journey(self, wf_client, sample_csv_path):
        client = wf_client

        # ----- Step 1: Create a project -----
        resp = await client.post("/api/projects", json={"name": "Workflow Test"})
        assert resp.status_code == 200
        project_id = resp.json()["id"]
        assert len(project_id) == 36

        # Verify project exists
        resp = await client.get(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Workflow Test"
        assert resp.json()["n_versions"] == 0

        # ----- Step 2: Upload dataset -----
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("mtpl.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        dataset_path = resp.json()["file_path"]
        assert dataset_path.endswith(".csv") or dataset_path.endswith(".parquet")

        # Verify columns came back from upload
        upload_data = resp.json()
        col_names = {c["name"] for c in upload_data["columns"]}
        assert "ClaimNb" in col_names
        assert "Exposure" in col_names
        assert "Region" in col_names
        assert upload_data["n_rows"] == 200

        # ----- Step 3: Explore the data -----
        resp = await client.post("/api/explore", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "project_id": project_id,
        })
        assert resp.status_code == 200
        explore_data = resp.json()
        assert "factor_stats" in explore_data
        assert "data_summary" in explore_data
        assert explore_data["data_summary"]["n_rows"] == 200
        assert "null_diagnostics" in explore_data
        assert explore_data["null_diagnostics"] is not None

        # After explore, null model should be saved as v1
        resp = await client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 1
        assert history[0]["version"] == 1
        assert history[0]["n_terms"] == 0

        # ----- Step 4: Fit a model with terms -----
        terms_v2 = [{"column": "Region", "type": "categorical"}]
        resp = await client.post("/api/fit", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": terms_v2,
        })
        assert resp.status_code == 200
        fit_result = resp.json()
        assert fit_result["success"] is True
        assert fit_result["n_obs"] == 200
        assert fit_result["deviance"] is not None
        assert fit_result["aic"] is not None
        assert fit_result["coef_table"] is not None
        assert len(fit_result["coef_table"]) > 0

        # ----- Step 5: Save the model -----
        save_payload = {
            "project_id": project_id,
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": terms_v2,
            "deviance": fit_result["deviance"],
            "null_deviance": fit_result["null_deviance"],
            "aic": fit_result["aic"],
            "bic": fit_result["bic"],
            "n_obs": fit_result["n_obs"],
            "n_params": fit_result["n_params"],
            "fit_duration_ms": fit_result["fit_duration_ms"],
            "summary": fit_result["summary"],
            "coef_table": fit_result["coef_table"],
            "diagnostics": fit_result["diagnostics"],
        }
        resp = await client.post("/api/models/save", json=save_payload)
        assert resp.status_code == 200
        save_data = resp.json()
        model_v2_id = save_data["id"]
        assert save_data["version"] == 2  # v1 is null model

        # ----- Step 6: Get history (should show null + saved model) -----
        resp = await client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 2
        # Newest first
        assert history[0]["version"] == 2
        assert history[1]["version"] == 1
        # v2 should have Region as an added change
        v2_entry = history[0]
        assert v2_entry["n_terms"] == 1
        assert v2_entry["family"] == "poisson"
        assert v2_entry["train"]["n_obs"] is not None
        assert len(v2_entry["changes"]) > 0
        assert any("Region" in c["description"] for c in v2_entry["changes"])

        # ----- Step 7: Get model detail -----
        resp = await client.get(f"/api/models/detail/{model_v2_id}")
        assert resp.status_code == 200
        detail = resp.json()
        assert detail["version"] == 2
        assert detail["spec"]["family"] == "poisson"
        assert detail["spec"]["response"] == "ClaimNb"
        assert detail["spec"]["offset"] == "Exposure"
        assert len(detail["spec"]["terms"]) == 1
        assert detail["spec"]["terms"][0]["column"] == "Region"
        assert detail["deviance"] is not None
        assert detail["aic"] is not None
        assert detail["n_obs"] == 200
        assert detail["coef_table"] is not None
        assert len(detail["coef_table"]) > 0
        assert detail["diagnostics"] is not None

        # ----- Step 8: Fit a second model with different terms -----
        terms_v3 = [
            {"column": "Region", "type": "categorical"},
            {"column": "DrivAge", "type": "linear"},
        ]
        resp = await client.post("/api/fit", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": terms_v3,
        })
        assert resp.status_code == 200
        fit_result_v3 = resp.json()
        assert fit_result_v3["success"] is True
        assert fit_result_v3["n_terms"] == 2

        # ----- Step 9: Save second model (version should increment) -----
        save_payload_v3 = {
            "project_id": project_id,
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": terms_v3,
            "deviance": fit_result_v3["deviance"],
            "null_deviance": fit_result_v3["null_deviance"],
            "aic": fit_result_v3["aic"],
            "bic": fit_result_v3["bic"],
            "n_obs": fit_result_v3["n_obs"],
            "n_params": fit_result_v3["n_params"],
            "fit_duration_ms": fit_result_v3["fit_duration_ms"],
            "summary": fit_result_v3["summary"],
            "coef_table": fit_result_v3["coef_table"],
            "diagnostics": fit_result_v3["diagnostics"],
        }
        resp = await client.post("/api/models/save", json=save_payload_v3)
        assert resp.status_code == 200
        save_data_v3 = resp.json()
        model_v3_id = save_data_v3["id"]
        assert save_data_v3["version"] == 3

        # ----- Step 10: History should show all 3 models with changes diff -----
        resp = await client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 3
        # Newest first
        assert history[0]["version"] == 3
        assert history[1]["version"] == 2
        assert history[2]["version"] == 1

        # v3 should show DrivAge was added (Region was already in v2)
        v3_entry = history[0]
        assert v3_entry["n_terms"] == 2
        assert len(v3_entry["changes"]) > 0
        assert any("DrivAge" in c["description"] for c in v3_entry["changes"])
        # The Region term should NOT appear as a change (it was already in v2)
        region_changes = [c for c in v3_entry["changes"]
                          if "Region" in c["description"]]
        assert len(region_changes) == 0, (
            f"Region should not be in v3 changes since it was already in v2: {region_changes}"
        )

        # v2 should show Region was added (compared to null model v1)
        v2_entry = history[1]
        assert any("Region" in c["description"] for c in v2_entry["changes"])

        # v1 (null model) should have no changes (first version)
        v1_entry = history[2]
        assert len(v1_entry["changes"]) == 0

    async def test_workflow_with_data_split(self, wf_client, sample_csv_path):
        """Workflow with train/validation split throughout."""
        client = wf_client

        # Create project and upload
        resp = await client.post("/api/projects", json={"name": "Split Workflow"})
        project_id = resp.json()["id"]
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("data.csv", io.BytesIO(content), "text/csv")},
        )
        dataset_path = resp.json()["file_path"]

        split = {
            "column": "Group",
            "mapping": {"1": "train", "2": "train", "3": "train",
                        "4": "validation", "5": "holdout"},
        }

        # Explore with split
        resp = await client.post("/api/explore", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "project_id": project_id,
            "split": split,
        })
        assert resp.status_code == 200
        explore_data = resp.json()
        assert explore_data["data_summary"]["n_rows"] < 200  # Only train data

        # Fit with split
        resp = await client.post("/api/fit", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "split": split,
        })
        assert resp.status_code == 200
        fit = resp.json()
        assert fit["n_obs"] < 200
        assert fit["n_validation"] is not None
        assert fit["n_validation"] > 0

        # Save model with split
        save_payload = {
            "project_id": project_id,
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "split": split,
            "deviance": fit["deviance"],
            "null_deviance": fit["null_deviance"],
            "aic": fit["aic"],
            "n_obs": fit["n_obs"],
            "n_validation": fit["n_validation"],
            "n_params": fit["n_params"],
            "fit_duration_ms": fit["fit_duration_ms"],
            "summary": fit["summary"],
            "coef_table": fit["coef_table"],
            "diagnostics": fit["diagnostics"],
        }
        resp = await client.post("/api/models/save", json=save_payload)
        assert resp.status_code == 200
        assert resp.json()["version"] == 2  # v1 is null model from explore

        # Verify history has train and test metrics
        resp = await client.get(f"/api/models/{project_id}/history")
        history = resp.json()
        assert len(history) == 2  # null model + fitted model
        v2 = history[0]
        assert v2["train"]["n_obs"] is not None
        assert v2["test"] is not None
        assert v2["test"]["n_obs"] is not None

    async def test_project_deletion_cascades_to_models(self, wf_client, sample_csv_path):
        """Deleting a project should remove all its models."""
        client = wf_client

        # Create, upload, explore, fit, save
        resp = await client.post("/api/projects", json={"name": "Delete Test"})
        project_id = resp.json()["id"]
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("data.csv", io.BytesIO(content), "text/csv")},
        )
        dataset_path = resp.json()["file_path"]

        # Explore (creates null model)
        await client.post("/api/explore", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "project_id": project_id,
        })

        # Fit and save
        resp = await client.post("/api/fit", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        fit = resp.json()
        await client.post("/api/models/save", json={
            "project_id": project_id,
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "deviance": fit["deviance"],
            "n_obs": fit["n_obs"],
            "n_params": fit["n_params"],
            "coef_table": fit["coef_table"],
            "diagnostics": fit["diagnostics"],
        })

        # Verify history has models
        resp = await client.get(f"/api/models/{project_id}/history")
        assert len(resp.json()) == 2

        # Delete the project
        resp = await client.delete(f"/api/projects/{project_id}")
        assert resp.status_code == 200

        # Project gone
        resp = await client.get(f"/api/projects/{project_id}")
        assert resp.status_code == 404

        # Models gone too
        resp = await client.get(f"/api/models/{project_id}/history")
        assert resp.json() == []

    async def test_model_detail_roundtrips_all_fields(self, wf_client, sample_csv_path):
        """All fields saved through /models/save should be retrievable via /models/detail."""
        client = wf_client

        resp = await client.post("/api/projects", json={"name": "Roundtrip"})
        project_id = resp.json()["id"]
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("data.csv", io.BytesIO(content), "text/csv")},
        )
        dataset_path = resp.json()["file_path"]

        terms = [
            {"column": "Region", "type": "categorical"},
            {"column": "DrivAge", "type": "ns", "df": 4},
            {"column": "VehAge", "type": "linear"},
        ]
        resp = await client.post("/api/fit", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": terms,
        })
        fit = resp.json()

        save_payload = {
            "project_id": project_id,
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": terms,
            "deviance": fit["deviance"],
            "null_deviance": fit["null_deviance"],
            "aic": fit["aic"],
            "bic": fit["bic"],
            "n_obs": fit["n_obs"],
            "n_params": fit["n_params"],
            "fit_duration_ms": fit["fit_duration_ms"],
            "summary": fit["summary"],
            "coef_table": fit["coef_table"],
            "diagnostics": fit["diagnostics"],
        }
        resp = await client.post("/api/models/save", json=save_payload)
        model_id = resp.json()["id"]

        # Retrieve detail and verify roundtrip
        resp = await client.get(f"/api/models/detail/{model_id}")
        assert resp.status_code == 200
        detail = resp.json()

        assert detail["deviance"] == pytest.approx(fit["deviance"], rel=1e-6)
        assert detail["null_deviance"] == pytest.approx(fit["null_deviance"], rel=1e-6)
        assert detail["aic"] == pytest.approx(fit["aic"], rel=1e-6)
        if fit["bic"] is not None:
            assert detail["bic"] == pytest.approx(fit["bic"], rel=1e-6)
        assert detail["n_obs"] == fit["n_obs"]
        assert detail["n_params"] == fit["n_params"]
        assert detail["fit_duration_ms"] == fit["fit_duration_ms"]
        assert detail["summary"] == fit["summary"]
        assert detail["coef_table"] == fit["coef_table"]
        assert detail["diagnostics"] is not None

        # Verify spec terms roundtrip
        spec_terms = detail["spec"]["terms"]
        assert len(spec_terms) == 3
        assert spec_terms[0]["column"] == "Region"
        assert spec_terms[0]["type"] == "categorical"
        assert spec_terms[1]["column"] == "DrivAge"
        assert spec_terms[1]["type"] == "ns"
        assert spec_terms[1]["df"] == 4
        assert spec_terms[2]["column"] == "VehAge"
        assert spec_terms[2]["type"] == "linear"

    async def test_multiple_projects_independent(self, wf_client, sample_csv_path):
        """Models saved to different projects should be independent."""
        client = wf_client

        # Create two projects
        resp_a = await client.post("/api/projects", json={"name": "Project A"})
        project_a = resp_a.json()["id"]
        resp_b = await client.post("/api/projects", json={"name": "Project B"})
        project_b = resp_b.json()["id"]

        # Upload dataset
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("data.csv", io.BytesIO(content), "text/csv")},
        )
        dataset_path = resp.json()["file_path"]

        # Fit a model
        resp = await client.post("/api/fit", json={
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        fit = resp.json()

        base_payload = {
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "deviance": fit["deviance"],
            "n_obs": fit["n_obs"],
            "n_params": fit["n_params"],
            "coef_table": fit["coef_table"],
        }

        # Save 3 versions to project A
        for _ in range(3):
            resp = await client.post("/api/models/save", json={
                **base_payload, "project_id": project_a,
            })
            assert resp.status_code == 200

        # Save 1 version to project B
        resp = await client.post("/api/models/save", json={
            **base_payload, "project_id": project_b,
        })
        assert resp.status_code == 200
        assert resp.json()["version"] == 1  # Independent versioning

        # Verify independent histories
        resp_a = await client.get(f"/api/models/{project_a}/history")
        resp_b = await client.get(f"/api/models/{project_b}/history")
        assert len(resp_a.json()) == 3
        assert len(resp_b.json()) == 1
