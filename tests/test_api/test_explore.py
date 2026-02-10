"""Integration tests for /api/explore endpoint — real rustystats exploration."""

import io

import pytest


@pytest.mark.asyncio
class TestExploreEndpoint:
    async def _upload(self, client, sample_csv_path) -> str:
        """Helper: upload and return file_path."""
        content = sample_csv_path.read_bytes()
        resp = await client.post(
            "/api/datasets/upload",
            files={"file": ("test.csv", io.BytesIO(content), "text/csv")},
        )
        return resp.json()["file_path"]

    async def test_basic_exploration(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
        })
        assert resp.status_code == 200
        data = resp.json()
        # Must have factor_stats
        assert "factor_stats" in data
        factor_names = {f["name"] for f in data["factor_stats"]}
        # Response and exposure should be excluded from factors
        assert "ClaimNb" not in factor_names
        assert "Exposure" not in factor_names
        # Other columns should be present as factors
        assert "Region" in factor_names
        assert "DrivAge" in factor_names

    async def test_factor_stats_have_correct_types(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
        })
        data = resp.json()
        stats_by_name = {f["name"]: f for f in data["factor_stats"]}
        # Region is string → should be classified as categorical
        assert stats_by_name["Region"]["type"] == "categorical"
        assert "levels" in stats_by_name["Region"]
        assert len(stats_by_name["Region"]["levels"]) == 6  # R11..R93

    async def test_categorical_levels_have_exposure(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
        })
        data = resp.json()
        region = next(f for f in data["factor_stats"] if f["name"] == "Region")
        for level in region["levels"]:
            assert "exposure" in level
            assert level["exposure"] > 0
            assert "count" in level
            assert level["count"] > 0
            assert "response_rate" in level

    async def test_continuous_factors_have_bins(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
        })
        data = resp.json()
        stats_by_name = {f["name"]: f for f in data["factor_stats"]}
        # DrivAge should have many unique values → continuous with bins
        if "DrivAge" in stats_by_name and stats_by_name["DrivAge"]["type"] == "continuous":
            assert "response_by_bin" in stats_by_name["DrivAge"]
            bins = stats_by_name["DrivAge"]["response_by_bin"]
            assert len(bins) > 0
            for b in bins:
                assert "bin_lower" in b
                assert "bin_upper" in b
                assert "response_rate" in b

    async def test_split_filters_to_train_only(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        # Explore without split
        resp_full = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
        })
        # Explore with split (groups 1-3 = train)
        resp_split = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        assert resp_full.status_code == 200
        assert resp_split.status_code == 200
        full_data = resp_full.json()
        split_data = resp_split.json()
        # data_summary should show fewer rows when split
        assert split_data["data_summary"]["n_rows"] < full_data["data_summary"]["n_rows"]

    async def test_split_column_excluded_from_factors(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
            "exposure": "Exposure",
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        data = resp.json()
        factor_names = {f["name"] for f in data["factor_stats"]}
        assert "Group" not in factor_names

    async def test_nonexistent_dataset_fails(self, client):
        resp = await client.post("/api/explore", json={
            "dataset_path": "/tmp/nonexistent_999.csv",
            "response": "ClaimNb",
            "family": "poisson",
        })
        assert resp.status_code == 400

    async def test_data_summary_present(self, client, sample_csv_path):
        path = await self._upload(client, sample_csv_path)
        resp = await client.post("/api/explore", json={
            "dataset_path": path,
            "response": "ClaimNb",
            "family": "poisson",
        })
        data = resp.json()
        assert "data_summary" in data
        summary = data["data_summary"]
        assert summary["n_rows"] == 200
        assert summary["response_column"] == "ClaimNb"
