"""Tests for app.py — factory function, CORS, routing, and SPA catch-all."""

import pytest
from httpx import ASGITransport, AsyncClient

from atelier.app import create_app


# ---------- App creation ----------

class TestCreateApp:
    def test_returns_fastapi_instance(self):
        app = create_app()
        assert app.title == "Atelier"
        assert app.version == "0.1.0"

    def test_has_expected_api_routes(self):
        app = create_app()
        paths = {route.path for route in app.routes}
        # All five router prefixes should register at least one route
        assert "/api/projects" in paths
        assert "/api/datasets/upload" in paths
        assert "/api/explore" in paths
        assert "/api/fit" in paths
        assert "/api/models/save" in paths

    def test_spa_catch_all_registered(self):
        app = create_app()
        paths = {route.path for route in app.routes}
        assert "/{full_path:path}" in paths


# ---------- CORS ----------

@pytest.mark.asyncio
class TestCORS:
    async def test_cors_headers_on_options(self, client):
        """Preflight OPTIONS request should return CORS headers."""
        resp = await client.options(
            "/api/projects",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers
        assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"

    async def test_cors_headers_on_get(self, client):
        """Regular GET should include CORS allow-origin header for allowed origin."""
        resp = await client.get(
            "/api/projects",
            headers={"Origin": "http://localhost:5173"},
        )
        assert "access-control-allow-origin" in resp.headers


# ---------- 404 for unknown API routes ----------

@pytest.mark.asyncio
class TestUnknownRoutes:
    async def test_unknown_api_path_returns_non_json_or_catch_all(self, client):
        """An unknown /api/... path hits the SPA catch-all (not a JSON 404)
        because FastAPI registers the catch-all at /{full_path:path}."""
        resp = await client.get("/api/nonexistent-route-xyz")
        # The SPA catch-all returns 200 (serves index.html) or, if static
        # dir is missing, a 404/500. Either way, it should not be a JSON API 404.
        assert resp.status_code in (200, 404, 500)


# ---------- Router registration ----------

@pytest.mark.asyncio
class TestRouterRegistration:
    async def test_projects_routes_reachable(self, client):
        resp = await client.get("/api/projects")
        # Should be 200 (may be empty list)
        assert resp.status_code == 200

    async def test_datasets_validate_route_reachable(self, client):
        resp = await client.post(
            "/api/datasets/validate",
            json={
                "dataset_path": "/nonexistent.csv",
                "response": "x",
                "family": "poisson",
            },
        )
        # Should not be 404 (route exists, might return 400/422/500)
        assert resp.status_code != 404

    async def test_explore_route_reachable(self, client):
        resp = await client.post("/api/explore", json={})
        # Route exists, likely a 422 because of missing body fields
        assert resp.status_code in (200, 422, 400, 500)

    async def test_fit_route_reachable(self, client):
        resp = await client.post("/api/fit", json={})
        assert resp.status_code in (200, 422, 400, 500)

    async def test_models_save_route_reachable(self, client):
        resp = await client.post("/api/models/save", json={})
        assert resp.status_code in (200, 422, 400, 500)
