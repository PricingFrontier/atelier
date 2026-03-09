"""Integration tests for /api/projects/* endpoints — CRUD with DB isolation."""

import pytest


@pytest.mark.asyncio
class TestCreateProject:
    async def test_create_returns_id_and_name(self, db_client):
        resp = await db_client.post("/api/projects", json={"name": "Test Project"})
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["name"] == "Test Project"
        assert len(data["id"]) == 36  # UUID format

    async def test_create_with_config(self, db_client):
        config = {
            "dataset_path": "/tmp/test.csv",
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        }
        resp = await db_client.post("/api/projects", json={"name": "Configured", "config": config})
        assert resp.status_code == 200
        project_id = resp.json()["id"]
        # Verify config persisted
        detail = await db_client.get(f"/api/projects/{project_id}")
        assert detail.status_code == 200
        assert detail.json()["config"]["family"] == "poisson"
        assert detail.json()["config"]["response"] == "ClaimNb"


@pytest.mark.asyncio
class TestListProjects:
    async def test_empty_initially(self, db_client):
        resp = await db_client.get("/api/projects")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_returns_created_projects(self, db_client):
        await db_client.post("/api/projects", json={"name": "Project A"})
        await db_client.post("/api/projects", json={"name": "Project B"})
        resp = await db_client.get("/api/projects")
        names = {p["name"] for p in resp.json()}
        assert "Project A" in names
        assert "Project B" in names

    async def test_newest_first(self, db_client):
        await db_client.post("/api/projects", json={"name": "First"})
        await db_client.post("/api/projects", json={"name": "Second"})
        resp = await db_client.get("/api/projects")
        projects = resp.json()
        assert len(projects) >= 2
        # Newest should be first
        assert projects[0]["name"] == "Second"


@pytest.mark.asyncio
class TestGetProject:
    async def test_get_by_id(self, db_client):
        create_resp = await db_client.post("/api/projects", json={"name": "Detail Test"})
        project_id = create_resp.json()["id"]
        resp = await db_client.get(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Detail Test"
        assert data["id"] == project_id

    async def test_nonexistent_returns_404(self, db_client):
        resp = await db_client.get("/api/projects/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestUpdateProjectConfig:
    async def test_update_config(self, db_client):
        create_resp = await db_client.post("/api/projects", json={"name": "Update Test"})
        project_id = create_resp.json()["id"]
        new_config = {"response": "ClaimNb", "family": "gamma", "offset": "Exposure"}
        resp = await db_client.put(f"/api/projects/{project_id}/config", json={"config": new_config})
        assert resp.status_code == 200
        # Verify update
        detail = await db_client.get(f"/api/projects/{project_id}")
        assert detail.json()["config"]["family"] == "gamma"

    async def test_update_nonexistent_returns_404(self, db_client):
        resp = await db_client.put(
            "/api/projects/00000000-0000-0000-0000-000000000000/config",
            json={"config": {"family": "poisson"}},
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestDeleteProject:
    async def test_delete_removes_project(self, db_client):
        create_resp = await db_client.post("/api/projects", json={"name": "Delete Me"})
        project_id = create_resp.json()["id"]
        # Delete
        resp = await db_client.delete(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        # Verify gone
        get_resp = await db_client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 404

    async def test_delete_nonexistent_returns_404(self, db_client):
        resp = await db_client.delete("/api/projects/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    async def test_delete_removes_from_list(self, db_client):
        create_resp = await db_client.post("/api/projects", json={"name": "Listed Then Gone"})
        project_id = create_resp.json()["id"]
        # Verify in list
        list_resp = await db_client.get("/api/projects")
        ids = {p["id"] for p in list_resp.json()}
        assert project_id in ids
        # Delete
        await db_client.delete(f"/api/projects/{project_id}")
        # Verify gone from list
        list_resp = await db_client.get("/api/projects")
        ids = {p["id"] for p in list_resp.json()}
        assert project_id not in ids
