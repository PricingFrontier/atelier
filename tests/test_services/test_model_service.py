"""Tests for model_service.save_null_model — verifying null model persistence via the explore API."""

import io

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from atelier.app import create_app
from atelier.db.engine import get_session
from atelier.db.models import Base, Model, Project


# ---------------------------------------------------------------------------
# Fixture: db_client that also patches get_session_factory so that
# save_null_model (which bypasses DI) uses the same test database.
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def model_svc_client(app, tmp_path):
    """Client with isolated DB that also patches get_session_factory for model_service."""
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

    # Patch get_session_factory so save_null_model uses the test DB
    import atelier.services.model_service as ms_mod
    original_get_factory = ms_mod.get_session_factory
    ms_mod.get_session_factory = lambda: factory

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, factory

    ms_mod.get_session_factory = original_get_factory
    app.dependency_overrides.clear()
    await engine.dispose()


async def _create_project(client, name="Test Project") -> str:
    resp = await client.post("/api/projects", json={"name": name})
    assert resp.status_code == 200
    return resp.json()["id"]


async def _upload(client, csv_path) -> str:
    content = csv_path.read_bytes()
    resp = await client.post(
        "/api/datasets/upload",
        files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200
    return resp.json()["file_path"]


async def _explore(client, dataset_path, project_id=None, split=None):
    payload = {
        "dataset_path": dataset_path,
        "response": "ClaimNb",
        "family": "poisson",
        "offset": "Exposure",
    }
    if project_id is not None:
        payload["project_id"] = project_id
    if split is not None:
        payload["split"] = split
    resp = await client.post("/api/explore", json=payload)
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
class TestSaveNullModel:
    async def test_explore_with_project_saves_null_model(self, model_svc_client, sample_csv_path):
        """After exploration with a project_id, a null model (v1) should exist in the DB."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)

        # Check DB directly for the null model
        async with factory() as session:
            result = await session.execute(
                select(Model).where(Model.project_id == project_id)
            )
            models = result.scalars().all()
            assert len(models) == 1, f"Expected 1 null model, got {len(models)}"
            null_model = models[0]
            assert null_model.version == 1
            assert null_model.name == "v1"
            assert null_model.status == "fitted"
            assert null_model.summary_text == "Null model (intercept only)"
            assert null_model.n_params == 1
            assert null_model.spec is not None
            assert null_model.spec["terms"] == []

    async def test_null_model_has_metrics(self, model_svc_client, sample_csv_path):
        """The null model should have deviance and AIC populated."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)

        async with factory() as session:
            result = await session.execute(
                select(Model).where(Model.project_id == project_id)
            )
            null_model = result.scalars().first()
            assert null_model is not None
            # Null deviance and deviance should be equal for null model
            assert null_model.deviance is not None
            assert null_model.null_deviance is not None
            assert null_model.deviance == null_model.null_deviance
            assert null_model.aic is not None
            assert null_model.n_obs == 200

    async def test_null_model_has_diagnostics(self, model_svc_client, sample_csv_path):
        """The null model should have diagnostics JSON stored."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)

        async with factory() as session:
            result = await session.execute(
                select(Model).where(Model.project_id == project_id)
            )
            null_model = result.scalars().first()
            assert null_model is not None
            assert null_model.diagnostics_json is not None

    async def test_null_model_spec_matches_explore_request(self, model_svc_client, sample_csv_path):
        """The null model spec should reflect the explore request parameters."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)

        async with factory() as session:
            result = await session.execute(
                select(Model).where(Model.project_id == project_id)
            )
            null_model = result.scalars().first()
            spec = null_model.spec
            assert spec["response"] == "ClaimNb"
            assert spec["family"] == "poisson"
            assert spec["offset"] == "Exposure"
            assert spec["dataset_path"] == path
            assert spec["terms"] == []

    async def test_duplicate_explore_does_not_create_duplicate_null_model(
        self, model_svc_client, sample_csv_path
    ):
        """Running explore twice should not create a second null model."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)
        await _explore(client, path, project_id=project_id)

        async with factory() as session:
            result = await session.execute(
                select(Model).where(Model.project_id == project_id)
            )
            models = result.scalars().all()
            assert len(models) == 1, f"Expected 1 null model after 2 explores, got {len(models)}"

    async def test_explore_without_project_id_does_not_save_model(
        self, model_svc_client, sample_csv_path
    ):
        """Exploration without project_id should not create any model row."""
        client, factory = model_svc_client
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=None)

        async with factory() as session:
            result = await session.execute(select(Model))
            models = result.scalars().all()
            assert len(models) == 0

    async def test_null_model_updates_project_n_versions(self, model_svc_client, sample_csv_path):
        """After saving null model, project.n_versions should be 1."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)

        async with factory() as session:
            project = await session.get(Project, project_id)
            assert project.n_versions == 1

    async def test_null_model_appears_in_history(self, model_svc_client, sample_csv_path):
        """The null model should appear in the model history endpoint."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        await _explore(client, path, project_id=project_id)

        resp = await client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == 1
        assert history[0]["version"] == 1
        assert history[0]["n_terms"] == 0  # null model has no terms
        assert history[0]["family"] == "poisson"

    async def test_explore_with_split_saves_correct_n_obs(self, model_svc_client, sample_csv_path):
        """With a split, the null model should store train-only row count."""
        client, factory = model_svc_client
        project_id = await _create_project(client)
        path = await _upload(client, sample_csv_path)

        split = {
            "column": "Group",
            "mapping": {"1": "train", "2": "train", "3": "train",
                        "4": "validation", "5": "holdout"},
        }
        await _explore(client, path, project_id=project_id, split=split)

        async with factory() as session:
            result = await session.execute(
                select(Model).where(Model.project_id == project_id)
            )
            null_model = result.scalars().first()
            assert null_model is not None
            # Train is groups 1-3, so n_obs should be less than 200
            assert null_model.n_obs < 200
            assert null_model.n_obs > 0
            # n_validation should be set (group 4)
            assert null_model.n_validation is not None
            assert null_model.n_validation > 0

    async def test_explore_nonexistent_project_does_not_crash(
        self, model_svc_client, sample_csv_path
    ):
        """Exploring with a non-existent project_id should not cause errors."""
        client, factory = model_svc_client
        path = await _upload(client, sample_csv_path)

        # Use a fake UUID — save_null_model should silently return
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "project_id": "00000000-0000-0000-0000-000000000000",
        })
        assert resp.status_code == 200
        # No model should have been saved
        async with factory() as session:
            result = await session.execute(select(Model))
            models = result.scalars().all()
            assert len(models) == 0
