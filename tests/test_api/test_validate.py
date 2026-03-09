"""Integration tests for /api/datasets/validate — family-specific validation logic."""

import csv
import io
import tempfile
from pathlib import Path

import pytest

from tests.conftest import upload_dataset


def _make_csv(rows: list[dict]) -> bytes:
    """Build a CSV in memory from a list of dicts."""
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue().encode()


async def _upload_custom(client, rows: list[dict], filename="custom.csv") -> str:
    """Upload a custom CSV and return the file_path."""
    content = _make_csv(rows)
    resp = await client.post(
        "/api/datasets/upload",
        files={"file": (filename, io.BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200
    return resp.json()["file_path"]


def _base_rows(n=20, response_val=0, exposure_val=1.0, **overrides):
    """Generate simple rows with controllable response/exposure."""
    rows = []
    for i in range(n):
        row = {
            "Response": response_val if not callable(response_val) else response_val(i),
            "Exposure": exposure_val if not callable(exposure_val) else exposure_val(i),
            "Weight": 1.0,
            "X": f"level_{i % 3}",
        }
        row.update(overrides)
        rows.append(row)
    return rows


@pytest.mark.asyncio
class TestValidateResponse:
    """Tests for response column validation."""

    async def test_valid_poisson_passes(self, client, uploaded_path):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["errors"]) == 0

    async def test_response_column_not_found(self, client, uploaded_path):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": uploaded_path,
            "response": "NonExistentColumn",
            "family": "poisson",
        })
        data = resp.json()
        assert len(data["errors"]) == 1
        assert "not found" in data["errors"][0]["message"].lower()

    async def test_non_numeric_response(self, client):
        path = await _upload_custom(client, _base_rows(response_val="text"))
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "X", "family": "poisson",
        })
        data = resp.json()
        assert any("numeric" in e["message"].lower() for e in data["errors"])

    async def test_poisson_negative_response(self, client):
        rows = _base_rows(response_val=lambda i: -1 if i == 0 else 0)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "poisson",
        })
        data = resp.json()
        assert any("non-negative" in e["message"].lower() for e in data["errors"])

    async def test_gamma_zero_response(self, client):
        rows = _base_rows(response_val=lambda i: 0.0 if i == 0 else 1.0)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gamma",
        })
        data = resp.json()
        assert any("strictly positive" in e["message"].lower() for e in data["errors"])

    async def test_gamma_positive_response_passes(self, client):
        rows = _base_rows(response_val=lambda i: 0.5 + i * 0.1)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gamma",
        })
        data = resp.json()
        assert len(data["errors"]) == 0

    async def test_binomial_out_of_range(self, client):
        rows = _base_rows(response_val=lambda i: 2.0 if i == 0 else 0.5)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "binomial",
        })
        data = resp.json()
        assert any(e["field"] == "response" for e in data["errors"])

    async def test_binomial_valid_proportions(self, client):
        rows = _base_rows(response_val=lambda i: round(i / 19, 4))
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "binomial",
        })
        data = resp.json()
        assert len(data["errors"]) == 0

    async def test_gaussian_allows_negatives(self, client):
        rows = _base_rows(response_val=lambda i: i - 10)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian",
        })
        data = resp.json()
        assert len(data["errors"]) == 0

    async def test_tweedie_negative_response(self, client):
        rows = _base_rows(response_val=lambda i: -1 if i == 0 else 1)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "tweedie",
        })
        data = resp.json()
        assert any(e["field"] == "response" for e in data["errors"])

    async def test_inverse_gaussian_zero_response(self, client):
        rows = _base_rows(response_val=lambda i: 0 if i == 0 else 1.0)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "inverse_gaussian",
        })
        data = resp.json()
        assert any("strictly positive" in e["message"].lower() for e in data["errors"])

    async def test_constant_response(self, client):
        rows = _base_rows(response_val=5)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian",
        })
        data = resp.json()
        assert any("constant" in e["message"].lower() for e in data["errors"])

    async def test_negbinomial_non_integer_warning(self, client):
        rows = _base_rows(response_val=lambda i: 0.5 * i)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "negbinomial",
        })
        data = resp.json()
        assert any("non-integer" in w["message"].lower() for w in data["warnings"])

    async def test_poisson_non_integer_warning(self, client):
        rows = _base_rows(response_val=lambda i: 0.3 * i)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "poisson",
        })
        data = resp.json()
        assert any("non-integer" in w["message"].lower() for w in data["warnings"])

    async def test_binomial_two_values_not_01_warning(self, client):
        rows = _base_rows(response_val=lambda i: 0.2 if i % 2 == 0 else 0.8)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "binomial",
        })
        data = resp.json()
        assert any("not 0 and 1" in w["message"].lower() for w in data["warnings"])


@pytest.mark.asyncio
class TestValidateOffset:
    """Tests for offset/exposure column validation."""

    async def test_offset_not_found(self, client, uploaded_path):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "NonExistent",
        })
        data = resp.json()
        assert any("not found" in e["message"].lower() and e["field"] == "offset" for e in data["errors"])

    async def test_offset_positive_for_poisson(self, client, uploaded_path):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "offset": "Exposure",
        })
        data = resp.json()
        # Exposure is all positive — should pass
        offset_errors = [e for e in data["errors"] if e["field"] == "offset"]
        assert len(offset_errors) == 0

    async def test_offset_zero_for_poisson(self, client):
        rows = _base_rows(exposure_val=lambda i: 0.0 if i == 0 else 1.0)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "poisson", "offset": "Exposure",
        })
        data = resp.json()
        assert any("strictly positive" in e["message"].lower() and e["field"] == "offset" for e in data["errors"])

    async def test_offset_negative_ok_for_gaussian(self, client):
        rows = _base_rows(exposure_val=lambda i: i - 10)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian", "offset": "Exposure",
        })
        data = resp.json()
        offset_errors = [e for e in data["errors"] if e["field"] == "offset"]
        assert len(offset_errors) == 0

    async def test_offset_zero_for_gamma(self, client):
        rows = _base_rows(response_val=lambda i: 1.0 + i, exposure_val=lambda i: 0.0 if i == 0 else 1.0)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gamma", "offset": "Exposure",
        })
        data = resp.json()
        assert any(e["field"] == "offset" for e in data["errors"])


@pytest.mark.asyncio
class TestValidateWeights:
    """Tests for weights column validation."""

    async def test_weights_not_found(self, client, uploaded_path):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
            "weights": "NonExistent",
        })
        data = resp.json()
        assert any("not found" in e["message"].lower() and e["field"] == "weights" for e in data["errors"])

    async def test_weights_negative(self, client):
        rows = []
        for i in range(20):
            rows.append({"Response": i, "Weight": -1 if i == 0 else 1.0, "X": "a"})
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian", "weights": "Weight",
        })
        data = resp.json()
        assert any("negative" in e["message"].lower() and e["field"] == "weights" for e in data["errors"])

    async def test_weights_sum_zero(self, client):
        rows = [{"Response": i, "Weight": 0.0, "X": "a"} for i in range(20)]
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian", "weights": "Weight",
        })
        data = resp.json()
        assert any("sum to zero" in e["message"].lower() for e in data["errors"])

    async def test_weights_mostly_zero_warning(self, client):
        rows = [{"Response": i, "Weight": 0.0 if i < 15 else 1.0, "X": "a"} for i in range(20)]
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian", "weights": "Weight",
        })
        data = resp.json()
        assert any("zero" in w["message"].lower() and w["field"] == "weights" for w in data["warnings"])

    async def test_valid_weights_pass(self, client):
        rows = _base_rows()
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "gaussian", "weights": "Weight",
        })
        data = resp.json()
        weight_errors = [e for e in data["errors"] if e["field"] == "weights"]
        assert len(weight_errors) == 0


@pytest.mark.asyncio
class TestValidateEdgeCases:
    """Edge cases and combined scenarios."""

    async def test_no_offset_no_weights(self, client, uploaded_path):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": uploaded_path,
            "response": "ClaimNb",
            "family": "poisson",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["errors"]) == 0

    async def test_multiple_errors_at_once(self, client):
        rows = [{"Response": -1, "Exposure": 0.0, "Weight": -1.0, "X": "a"} for _ in range(20)]
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path,
            "response": "Response",
            "family": "poisson",
            "offset": "Exposure",
            "weights": "Weight",
        })
        data = resp.json()
        # Should have errors for response (negative for poisson + constant) and offset (zero)
        fields_with_errors = {e["field"] for e in data["errors"]}
        assert "response" in fields_with_errors
        assert "offset" in fields_with_errors

    async def test_nonexistent_dataset_fails(self, client):
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": "/tmp/nonexistent_999.csv",
            "response": "ClaimNb",
            "family": "poisson",
        })
        assert resp.status_code == 400

    async def test_quasipoisson_same_as_poisson(self, client):
        rows = _base_rows(response_val=lambda i: -1 if i == 0 else 0)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "quasipoisson",
        })
        data = resp.json()
        assert any("non-negative" in e["message"].lower() for e in data["errors"])

    async def test_quasibinomial_same_as_binomial(self, client):
        rows = _base_rows(response_val=lambda i: 2.0 if i == 0 else 0.5)
        path = await _upload_custom(client, rows)
        resp = await client.post("/api/datasets/validate", json={
            "dataset_path": path, "response": "Response", "family": "quasibinomial",
        })
        data = resp.json()
        assert any(e["field"] == "response" for e in data["errors"])
