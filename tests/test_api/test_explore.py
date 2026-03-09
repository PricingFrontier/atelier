"""Integration tests for /api/explore endpoint — real rustystats exploration."""

import pytest


@pytest.mark.asyncio
class TestExploreEndpoint:
    async def test_basic_exploration(self, client, uploaded_path):
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "factor_stats" in data
        factor_names = {f["name"] for f in data["factor_stats"]}
        assert "ClaimNb" not in factor_names
        assert "Exposure" not in factor_names
        assert "Region" in factor_names
        assert "DrivAge" in factor_names

    async def test_factor_stats_have_correct_types(self, client, uploaded_path):
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        data = resp.json()
        stats_by_name = {f["name"]: f for f in data["factor_stats"]}
        assert stats_by_name["Region"]["type"] == "categorical"
        assert "levels" in stats_by_name["Region"]
        assert len(stats_by_name["Region"]["levels"]) == 6

    async def test_categorical_levels_have_exposure(self, client, uploaded_path):
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        data = resp.json()
        region = next(f for f in data["factor_stats"] if f["name"] == "Region")
        for level in region["levels"]:
            assert "exposure" in level
            assert level["exposure"] > 0
            assert "count" in level
            assert level["count"] > 0
            assert "response_rate" in level

    async def test_continuous_factors_have_bins(self, client, uploaded_path):
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        data = resp.json()
        stats_by_name = {f["name"]: f for f in data["factor_stats"]}
        assert "DrivAge" in stats_by_name, "DrivAge missing from factor stats"
        assert stats_by_name["DrivAge"]["type"] == "continuous", (
            f"DrivAge should be continuous, got {stats_by_name['DrivAge']['type']}"
        )
        bins = stats_by_name["DrivAge"]["response_by_bin"]
        assert len(bins) > 1, "Continuous factor should have multiple bins"
        for b in bins:
            assert b["bin_lower"] < b["bin_upper"]
            assert "response_rate" in b

    async def test_split_filters_to_train_only(self, client, uploaded_path):
        resp_full = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        resp_split = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        assert resp_full.status_code == 200
        assert resp_split.status_code == 200
        assert resp_split.json()["data_summary"]["n_rows"] < resp_full.json()["data_summary"]["n_rows"]

    async def test_split_column_excluded_from_factors(self, client, uploaded_path):
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        factor_names = {f["name"] for f in resp.json()["factor_stats"]}
        assert "Group" not in factor_names

    async def test_nonexistent_dataset_fails(self, client):
        resp = await client.post("/api/explore", json={
            "dataset_path": "/tmp/nonexistent_999.csv",
            "response": "ClaimNb",
            "family": "poisson",
        })
        assert resp.status_code == 400

    async def test_data_summary_present(self, client, uploaded_path):
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
        })
        data = resp.json()
        assert "data_summary" in data
        summary = data["data_summary"]
        assert summary["n_rows"] == 200
        assert summary["response_column"] == "ClaimNb"

    async def test_null_diagnostics_present(self, client, uploaded_path):
        """Exploration should fit a null model and return score tests for all factors."""
        resp = await client.post("/api/explore", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "null_diagnostics" in data
        assert data["null_diagnostics"] is not None
        factors = data["null_diagnostics"]["factors"]
        assert len(factors) > 0
        for f in factors:
            assert f["in_model"] is False
            assert f["score_test"] is not None
            assert "statistic" in f["score_test"]
            assert "pvalue" in f["score_test"]
            assert "significant" in f["score_test"]
