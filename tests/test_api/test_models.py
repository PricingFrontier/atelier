"""Integration tests for /api/models/* endpoints — save, history, detail with DB isolation."""

import io

import pytest


async def _create_project(client, name="Test Project") -> str:
    """Create a project and return its ID."""
    resp = await client.post("/api/projects", json={"name": name})
    assert resp.status_code == 200
    return resp.json()["id"]


async def _upload(client, csv_path) -> str:
    """Upload CSV and return file_path."""
    content = csv_path.read_bytes()
    resp = await client.post(
        "/api/datasets/upload",
        files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200
    return resp.json()["file_path"]


async def _fit_model(client, dataset_path, terms=None):
    """Fit a model and return the full response JSON."""
    if terms is None:
        terms = [{"column": "Region", "type": "categorical"}]
    resp = await client.post("/api/fit", json={
        "dataset_path": dataset_path,
        "response": "ClaimNb",
        "family": "poisson",
        "offset": "Exposure",
        "terms": terms,
    })
    assert resp.status_code == 200
    return resp.json()


def _build_save_payload(project_id, dataset_path, fit_result, terms=None):
    """Build a ModelSaveRequest payload from a fit result."""
    if terms is None:
        terms = [{"column": "Region", "type": "categorical"}]
    return {
        "project_id": project_id,
        "dataset_path": dataset_path,
        "response": "ClaimNb",
        "family": "poisson",
        "offset": "Exposure",
        "terms": terms,
        "deviance": fit_result.get("deviance"),
        "null_deviance": fit_result.get("null_deviance"),
        "aic": fit_result.get("aic"),
        "bic": fit_result.get("bic"),
        "n_obs": fit_result.get("n_obs"),
        "n_params": fit_result.get("n_params"),
        "fit_duration_ms": fit_result.get("fit_duration_ms"),
        "summary": fit_result.get("summary"),
        "coef_table": fit_result.get("coef_table"),
        "diagnostics": fit_result.get("diagnostics"),
        "n_terms": fit_result.get("n_terms"),
    }


@pytest.mark.asyncio
class TestSaveModel:
    async def test_save_returns_version_1(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        resp = await db_client.post("/api/models/save", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 1
        assert "id" in data

    async def test_save_increments_version(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        resp1 = await db_client.post("/api/models/save", json=payload)
        resp2 = await db_client.post("/api/models/save", json=payload)
        assert resp1.json()["version"] == 1
        assert resp2.json()["version"] == 2

    async def test_save_without_project_id(self, db_client, sample_csv_path):
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(None, path, fit)
        payload.pop("project_id", None)
        resp = await db_client.post("/api/models/save", json=payload)
        # Pydantic rejects missing required field with 422, or handler returns 400
        assert resp.status_code in (400, 422)

    async def test_save_nonexistent_project(self, db_client, sample_csv_path):
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload("00000000-0000-0000-0000-000000000000", path, fit)
        resp = await db_client.post("/api/models/save", json=payload)
        assert resp.status_code == 404

    async def test_save_updates_project_n_versions(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        await db_client.post("/api/models/save", json=payload)
        # Check project detail
        detail = await db_client.get(f"/api/projects/{project_id}")
        assert detail.json()["n_versions"] == 1

    async def test_save_with_split(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        payload["split"] = {
            "column": "Group",
            "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
        }
        resp = await db_client.post("/api/models/save", json=payload)
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestModelHistory:
    async def test_history_empty_for_new_project(self, db_client):
        project_id = await _create_project(db_client)
        resp = await db_client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_history_returns_all_versions(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        # Save 3 versions
        for _ in range(3):
            await db_client.post("/api/models/save", json=payload)
        resp = await db_client.get(f"/api/models/{project_id}/history")
        history = resp.json()
        assert len(history) == 3

    async def test_history_newest_first(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        await db_client.post("/api/models/save", json=payload)
        await db_client.post("/api/models/save", json=payload)
        resp = await db_client.get(f"/api/models/{project_id}/history")
        history = resp.json()
        assert history[0]["version"] == 2
        assert history[1]["version"] == 1

    async def test_history_includes_changes(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        # v1 with Region only
        fit1 = await _fit_model(db_client, path, terms=[{"column": "Region", "type": "categorical"}])
        payload1 = _build_save_payload(project_id, path, fit1,
                                       terms=[{"column": "Region", "type": "categorical"}])
        await db_client.post("/api/models/save", json=payload1)
        # v2 with Region + DrivAge
        fit2 = await _fit_model(db_client, path, terms=[
            {"column": "Region", "type": "categorical"},
            {"column": "DrivAge", "type": "linear"},
        ])
        payload2 = _build_save_payload(project_id, path, fit2, terms=[
            {"column": "Region", "type": "categorical"},
            {"column": "DrivAge", "type": "linear"},
        ])
        await db_client.post("/api/models/save", json=payload2)
        resp = await db_client.get(f"/api/models/{project_id}/history")
        history = resp.json()
        v2 = history[0]  # newest first
        assert v2["version"] == 2
        assert len(v2["changes"]) > 0
        # DrivAge was added
        assert any("DrivAge" in c["description"] for c in v2["changes"])

    async def test_history_includes_train_metrics(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        await db_client.post("/api/models/save", json=payload)
        resp = await db_client.get(f"/api/models/{project_id}/history")
        history = resp.json()
        v1 = history[0]
        assert v1["train"] is not None
        assert v1["train"]["n_obs"] is not None


@pytest.mark.asyncio
class TestModelDetail:
    async def test_detail_returns_full_model(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        save_resp = await db_client.post("/api/models/save", json=payload)
        model_id = save_resp.json()["id"]
        resp = await db_client.get(f"/api/models/detail/{model_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 1
        assert data["spec"] is not None
        assert data["spec"]["family"] == "poisson"
        assert data["spec"]["response"] == "ClaimNb"

    async def test_detail_has_metrics(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        save_resp = await db_client.post("/api/models/save", json=payload)
        model_id = save_resp.json()["id"]
        resp = await db_client.get(f"/api/models/detail/{model_id}")
        data = resp.json()
        assert data["deviance"] is not None
        assert data["aic"] is not None
        assert data["n_obs"] == 200

    async def test_detail_has_coef_table(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        save_resp = await db_client.post("/api/models/save", json=payload)
        model_id = save_resp.json()["id"]
        resp = await db_client.get(f"/api/models/detail/{model_id}")
        data = resp.json()
        assert data["coef_table"] is not None
        assert len(data["coef_table"]) > 0
        assert "name" in data["coef_table"][0]
        assert "coef" in data["coef_table"][0]

    async def test_detail_has_diagnostics(self, db_client, sample_csv_path):
        project_id = await _create_project(db_client)
        path = await _upload(db_client, sample_csv_path)
        fit = await _fit_model(db_client, path)
        payload = _build_save_payload(project_id, path, fit)
        save_resp = await db_client.post("/api/models/save", json=payload)
        model_id = save_resp.json()["id"]
        resp = await db_client.get(f"/api/models/detail/{model_id}")
        data = resp.json()
        assert data["diagnostics"] is not None
        assert "train_test" in data["diagnostics"]

    async def test_detail_nonexistent_returns_404(self, db_client):
        resp = await db_client.get("/api/models/detail/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
