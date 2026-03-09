"""Integration tests for /api/fit endpoint — real rustystats model fitting."""

import pytest


@pytest.mark.asyncio
class TestFitEndpoint:
    async def test_basic_poisson_fit(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "categorical"},
                {"column": "DrivAge", "type": "linear"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["family"] == "poisson"
        assert data["n_obs"] == 200
        assert data["n_terms"] == 2
        assert data["fit_duration_ms"] >= 0

    async def test_fit_returns_coefficients(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "categorical"},
                {"column": "DrivAge", "type": "linear"},
            ],
        })
        data = resp.json()
        coefs = data["coef_table"]
        assert len(coefs) > 0
        coef_names = [c["name"] for c in coefs]
        assert any("ntercept" in n for n in coef_names), f"No intercept in {coef_names}"
        for c in coefs:
            assert c["coef"] is not None
            assert isinstance(c["coef"], (int, float))

    async def test_fit_returns_model_metrics(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        data = resp.json()
        assert data["deviance"] is not None
        assert data["deviance"] > 0
        assert data["aic"] is not None
        assert data["aic"] > 0
        assert data["summary"] is not None
        assert len(data["summary"]) > 50

    async def test_fit_returns_diagnostics(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "categorical"},
                {"column": "DrivAge", "type": "linear"},
            ],
        })
        data = resp.json()
        diag = data["diagnostics"]
        assert diag is not None
        assert "train_test" in diag
        train = diag["train_test"]["train"]
        assert train["n_obs"] == 200
        assert train["total_exposure"] > 0
        assert "Region" in train["factor_diagnostics"]
        region_diag = train["factor_diagnostics"]["Region"]
        assert len(region_diag) == 6
        for level in region_diag:
            assert "actual" in level
            assert "predicted" in level
            assert "n" in level
            assert level["n"] > 0

    async def test_fit_with_split(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["n_obs"] < 200
        assert data["n_obs"] > 0
        assert data["n_validation"] is not None
        assert data["n_validation"] > 0
        assert data["n_validation"] < data["n_obs"]

    async def test_split_produces_train_and_test_diagnostics(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        data = resp.json()
        diag = data["diagnostics"]
        assert diag is not None
        train = diag["train_test"]["train"]
        test = diag["train_test"].get("test")
        assert test is not None, "Split fit should produce test diagnostics"
        assert train["n_obs"] != test["n_obs"]
        assert train["n_obs"] > test["n_obs"]
        assert "Region" in train["factor_diagnostics"]
        assert "Region" in test["factor_diagnostics"]

    async def test_split_column_excluded_from_diagnostics_factors(self, client, uploaded_path):
        """The Group column used for splitting should NOT appear in diagnostics factors."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train", "4": "validation", "5": "holdout"},
            },
        })
        data = resp.json()
        diag = data["diagnostics"]
        train = diag["train_test"]["train"]
        all_diag_factors = set(train.get("factor_diagnostics", {}).keys()) | set(train.get("continuous_diagnostics", {}).keys())
        assert "Group" not in all_diag_factors

    async def test_no_terms_returns_400(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "terms": [],
        })
        assert resp.status_code == 400

    async def test_nonexistent_dataset_fails(self, client):
        resp = await client.post("/api/fit", json={
            "dataset_path": "/tmp/nonexistent_999.csv",
            "response": "ClaimNb",
            "family": "poisson",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        assert resp.status_code == 400

    async def test_spline_term_type(self, client, uploaded_path):
        """Fit with a natural spline term — tests _build_terms_dict handles df correctly."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "DrivAge", "type": "ns", "df": 4},
                {"column": "Region", "type": "categorical"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        coef_names = [c["name"] for c in data["coef_table"]]
        driv_age_coefs = [n for n in coef_names if "DrivAge" in n]
        assert len(driv_age_coefs) >= 2, f"Expected spline params for DrivAge, got {driv_age_coefs}"

    async def test_target_encoding_term(self, client, uploaded_path):
        """Fit with target encoding — produces a single coefficient per TE column."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "target_encoding"},
                {"column": "DrivAge", "type": "linear"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    async def test_gaussian_family(self, client, uploaded_path):
        """Fit with gaussian family (no offset) — different code path."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "gaussian",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["family"] == "gaussian"

    async def test_fit_without_split_has_no_validation(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        data = resp.json()
        assert data["n_validation"] is None
        diag = data["diagnostics"]
        assert diag is not None
        assert diag["train_test"].get("test") is None

    async def test_split_diagnostics_have_independent_metrics(self, client, uploaded_path):
        """Train and test diagnostics should each have valid, independently computed metrics."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
            "split": {
                "column": "Group",
                "mapping": {"1": "train", "2": "train", "3": "train",
                            "4": "validation", "5": "holdout"},
            },
        })
        data = resp.json()
        train = data["diagnostics"]["train_test"]["train"]
        test = data["diagnostics"]["train_test"]["test"]
        # Both must have valid positive metrics
        assert train["total_exposure"] > 0
        assert test["total_exposure"] > 0
        assert train["total_actual"] >= 0
        assert test["total_actual"] >= 0
        # Row counts must reflect the split (groups 1-3 vs group 4)
        assert train["n_obs"] > test["n_obs"]
        assert train["n_obs"] + test["n_obs"] < 200  # holdout excluded
        # Both must have factor diagnostics for each model term
        for subset in (train, test):
            assert "Region" in subset["factor_diagnostics"]
            assert len(subset["factor_diagnostics"]["Region"]) == 6

    async def test_categorical_and_target_encoding_same_column(self, client, uploaded_path):
        """Both categorical and target_encoding on the same column should produce coefficients for both."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "categorical"},
                {"column": "Region", "type": "target_encoding"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        coef_names = [c["name"] for c in data["coef_table"]]
        region_dummies = [n for n in coef_names if "Region" in n and "TE" not in n]
        te_coefs = [n for n in coef_names if "TE" in n]
        assert len(region_dummies) > 0, f"No categorical Region coefficients: {coef_names}"
        assert len(te_coefs) > 0, f"No target encoding coefficients: {coef_names}"

    async def test_target_encoding_then_categorical_same_column(self, client, uploaded_path):
        """Reverse order: target_encoding first, then categorical — both should be present."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "target_encoding"},
                {"column": "Region", "type": "categorical"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        coef_names = [c["name"] for c in data["coef_table"]]
        region_dummies = [n for n in coef_names if "Region" in n and "TE" not in n]
        te_coefs = [n for n in coef_names if "TE" in n]
        assert len(region_dummies) > 0, f"No categorical Region coefficients: {coef_names}"
        assert len(te_coefs) > 0, f"No target encoding coefficients: {coef_names}"

    async def test_multiple_terms_increases_params(self, client, uploaded_path):
        """More terms should produce more parameters."""
        resp1 = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        resp3 = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "categorical"},
                {"column": "Area", "type": "categorical"},
                {"column": "DrivAge", "type": "linear"},
            ],
        })
        data1 = resp1.json()
        data3 = resp3.json()
        assert data3["n_params"] > data1["n_params"]
        assert data3["n_terms"] == 3
        assert data1["n_terms"] == 1


@pytest.mark.asyncio
class TestFitEdgeCases:
    """Additional edge cases for the fit endpoint."""

    async def test_nonexistent_column_in_terms(self, client, uploaded_path):
        """A term referencing a column not in the dataset should fail."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "NonExistentColumn", "type": "categorical"}],
        })
        assert resp.status_code == 422

    async def test_gamma_family_with_positive_response(self, client, uploaded_path):
        """Gamma family requires positive response — use Exposure as response."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "Exposure",
            "family": "gamma",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["family"] == "gamma"

    async def test_fit_with_all_term_types_combined(self, client, uploaded_path):
        """Multiple term types in a single model."""
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [
                {"column": "Region", "type": "categorical"},
                {"column": "DrivAge", "type": "ns", "df": 3},
                {"column": "VehAge", "type": "linear"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["n_terms"] == 3

    async def test_fit_returns_null_deviance(self, client, uploaded_path):
        resp = await client.post("/api/fit", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
            "terms": [{"column": "Region", "type": "categorical"}],
        })
        data = resp.json()
        assert data["null_deviance"] is not None
        assert data["null_deviance"] > 0
        # Deviance with terms should be less than null deviance
        assert data["deviance"] < data["null_deviance"]
