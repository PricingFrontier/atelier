"""Integration tests for /api/datasets/* endpoints — real uploads, real polars parsing."""

import io

import pytest


@pytest.mark.asyncio
class TestUploadDataset:
    async def test_upload_csv(self, client, sample_csv_path):
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["n_rows"] == 200
        assert data["n_cols"] == 8
        assert data["filename"] == "test.csv"
        assert "file_path" in data
        assert "dataset_id" in data
        # Verify columns metadata is present and correct
        col_names = {c["name"] for c in data["columns"]}
        assert col_names == {"ClaimNb", "Exposure", "DrivAge", "VehAge", "BonusMalus", "Region", "Area", "Group"}

    async def test_upload_parquet(self, client, sample_parquet_path):
        content = sample_parquet_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("test.parquet", io.BytesIO(content), "application/octet-stream")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["n_rows"] == 200
        assert data["filename"] == "test.parquet"

    async def test_upload_unsupported_format_rejected(self, client):
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("test.xlsx", io.BytesIO(b"fake"), "application/octet-stream")},
        )
        assert resp.status_code == 400

    async def test_upload_returns_correct_column_types(self, client, sample_csv_path):
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("types.csv", io.BytesIO(content), "text/csv")},
        )
        data = resp.json()
        cols_by_name = {c["name"]: c for c in data["columns"]}
        # Region is string → categorical
        assert cols_by_name["Region"]["is_categorical"] is True
        assert cols_by_name["Region"]["is_numeric"] is False
        # Exposure is float with many unique values → numeric, not categorical
        assert cols_by_name["Exposure"]["is_numeric"] is True
        assert cols_by_name["Exposure"]["is_categorical"] is False

    async def test_each_upload_gets_unique_id(self, client, sample_csv_path):
        content = sample_csv_path.read_bytes()
        ids = set()
        for _ in range(3):
            resp = await client.post(
                "/api/datasets/upload",
                files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
            )
            ids.add(resp.json()["dataset_id"])
        assert len(ids) == 3


@pytest.mark.asyncio
class TestColumnValues:
    async def _upload(self, client, sample_csv_path) -> str:
        """Helper: upload and return file_path."""
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        return resp.json()["file_path"]

    async def test_returns_unique_sorted_values(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post(
            "/api/datasets/column-values",
            json={"dataset_path": path, "column": "Region"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["column"] == "Region"
        values = data["values"]
        # Should be unique and sorted
        assert values == sorted(set(values))
        # Should contain our known regions
        assert set(values) == {"R11", "R24", "R31", "R52", "R82", "R93"}

    async def test_group_column_has_five_values(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post(
            "/api/datasets/column-values",
            json={"dataset_path": path, "column": "Group"},
        )
        values = resp.json()["values"]
        assert set(values) == {"1", "2", "3", "4", "5"}

    async def test_numeric_column_values_are_strings(self, client, sample_csv_path):
        """API always returns values as strings, even for numeric columns."""
        path = await self._upload(client, sample_csv_path)
        resp = await client.post(
            "/api/datasets/column-values",
            json={"dataset_path": path, "column": "ClaimNb"},
        )
        values = resp.json()["values"]
        assert all(isinstance(v, str) for v in values)

    async def test_nonexistent_dataset_fails(self, client):
        resp = await client.post(
            "/api/datasets/column-values",
            json={"dataset_path": "/tmp/does_not_exist_12345.csv", "column": "Region"},
        )
        assert resp.status_code == 400
