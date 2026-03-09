"""Concurrency safety tests — verify race conditions are handled correctly.

Tests exercise the retry-on-IntegrityError logic in model save and the
duplicate-suppression in null model creation during explore.
"""

import asyncio
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
# (mirrors wf_client from test_workflow.py)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def cc_client(app, tmp_path):
    """Concurrency test client with fully isolated DB (includes model_service patch)."""
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

    # Patch model_service so save_null_model uses the test DB
    import atelier.services.model_service as ms_mod
    original_get_factory = ms_mod.get_session_factory
    ms_mod.get_session_factory = lambda: factory

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    ms_mod.get_session_factory = original_get_factory
    app.dependency_overrides.clear()
    await engine.dispose()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_project(client: AsyncClient, name: str = "Concurrency Test") -> str:
    resp = await client.post("/api/projects", json={"name": name})
    assert resp.status_code == 200
    return resp.json()["id"]


async def _upload(client: AsyncClient, csv_path) -> str:
    content = csv_path.read_bytes()
    resp = await client.post(
        "/api/datasets/upload",
        files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200
    return resp.json()["file_path"]


async def _fit_model(client: AsyncClient, dataset_path: str, terms=None):
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
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestConcurrentModelSaves:
    """Launch multiple saves to the same project at once — versions must be unique."""

    async def test_concurrent_saves_produce_unique_sequential_versions(
        self, cc_client, sample_csv_path
    ):
        project_id = await _create_project(cc_client)
        dataset_path = await _upload(cc_client, sample_csv_path)
        fit = await _fit_model(cc_client, dataset_path)
        payload = _build_save_payload(project_id, dataset_path, fit)

        n_concurrent = 5

        async def _save():
            return await cc_client.post("/api/models/save", json=payload)

        responses = await asyncio.gather(*[_save() for _ in range(n_concurrent)])

        # All saves should succeed (no 500 errors)
        statuses = [r.status_code for r in responses]
        assert all(s == 200 for s in statuses), f"Some saves failed: {statuses}"

        # All versions should be unique
        versions = sorted(r.json()["version"] for r in responses)
        assert versions == list(range(1, n_concurrent + 1)), (
            f"Versions should be sequential 1..{n_concurrent}, got {versions}"
        )

        # Verify through the history endpoint
        resp = await cc_client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        history = resp.json()
        assert len(history) == n_concurrent
        history_versions = sorted(h["version"] for h in history)
        assert history_versions == list(range(1, n_concurrent + 1))


@pytest.mark.asyncio
class TestConcurrentExplores:
    """Multiple explores to the same project should create exactly one null model."""

    async def test_concurrent_explores_produce_single_null_model(
        self, cc_client, sample_csv_path
    ):
        project_id = await _create_project(cc_client)
        dataset_path = await _upload(cc_client, sample_csv_path)

        n_concurrent = 3
        explore_payload = {
            "dataset_path": dataset_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "project_id": project_id,
        }

        async def _explore():
            return await cc_client.post("/api/explore", json=explore_payload)

        responses = await asyncio.gather(*[_explore() for _ in range(n_concurrent)])

        # All explores should succeed
        statuses = [r.status_code for r in responses]
        assert all(s == 200 for s in statuses), f"Some explores failed: {statuses}"

        # Only ONE null model (v1) should exist
        resp = await cc_client.get(f"/api/models/{project_id}/history")
        assert resp.status_code == 200
        history = resp.json()

        v1_entries = [h for h in history if h["version"] == 1]
        assert len(v1_entries) == 1, (
            f"Expected exactly 1 null model (v1), found {len(v1_entries)}"
        )
        assert len(history) == 1, (
            f"Expected exactly 1 model total, found {len(history)}"
        )


@pytest.mark.asyncio
class TestMixedReadWrite:
    """Reading history while a save is in progress should not error."""

    async def test_read_history_during_save(self, cc_client, sample_csv_path):
        project_id = await _create_project(cc_client)
        dataset_path = await _upload(cc_client, sample_csv_path)
        fit = await _fit_model(cc_client, dataset_path)
        payload = _build_save_payload(project_id, dataset_path, fit)

        async def _save():
            return await cc_client.post("/api/models/save", json=payload)

        async def _read_history():
            return await cc_client.get(f"/api/models/{project_id}/history")

        # Interleave saves and reads
        tasks = []
        for _ in range(3):
            tasks.append(_save())
            tasks.append(_read_history())

        responses = await asyncio.gather(*tasks)

        # No 500 errors on any request
        for resp in responses:
            assert resp.status_code == 200, (
                f"Got status {resp.status_code}: {resp.text}"
            )


@pytest.mark.asyncio
class TestConcurrentProjectConfigUpdates:
    """Multiple config updates to the same project should all succeed."""

    async def test_concurrent_config_updates_no_errors(
        self, cc_client, sample_csv_path
    ):
        project_id = await _create_project(cc_client)
        dataset_path = await _upload(cc_client, sample_csv_path)

        n_concurrent = 3

        async def _update(i: int):
            config = {
                "dataset_path": dataset_path,
                "response": "ClaimNb",
                "family": "poisson" if i % 2 == 0 else "gamma",
                "offset": "Exposure",
            }
            return await cc_client.put(
                f"/api/projects/{project_id}/config",
                json={"config": config},
            )

        responses = await asyncio.gather(*[_update(i) for i in range(n_concurrent)])

        # All updates should succeed
        statuses = [r.status_code for r in responses]
        assert all(s == 200 for s in statuses), f"Some updates failed: {statuses}"

        # Project should be readable with a valid config
        resp = await cc_client.get(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        project = resp.json()
        assert project["config"] is not None
        assert project["config"]["family"] in ("poisson", "gamma")
