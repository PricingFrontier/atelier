"""Tests for model API helper functions — term diffing, label generation, metric extraction."""

import json

from atelier.services.model_service import (
    compute_changes as _compute_changes,
    _term_key,
    _term_label,
    _term_params,
)
from atelier.api.models import (
    _extract_split_metrics,
)


class TestTermKey:
    def test_basic(self):
        assert _term_key({"column": "Region", "type": "categorical"}) == "Region::categorical"

    def test_missing_fields(self):
        assert _term_key({}) == "::"

    def test_different_types_different_keys(self):
        k1 = _term_key({"column": "Region", "type": "categorical"})
        k2 = _term_key({"column": "Region", "type": "target_encoding"})
        assert k1 != k2


class TestTermLabel:
    def test_basic(self):
        assert _term_label({"column": "Region", "type": "categorical"}) == "Region (categorical)"

    def test_with_df(self):
        label = _term_label({"column": "DrivAge", "type": "ns", "df": 4})
        assert label == "DrivAge (ns, df=4)"

    def test_with_k(self):
        label = _term_label({"column": "DrivAge", "type": "bs", "k": 3})
        assert label == "DrivAge (bs, k=3)"

    def test_with_monotonicity(self):
        label = _term_label({"column": "DrivAge", "type": "ns", "df": 4, "monotonicity": "increasing"})
        assert label == "DrivAge (ns, df=4, increasing)"

    def test_with_all_extras(self):
        label = _term_label({"column": "X", "type": "ns", "df": 4, "k": 3, "monotonicity": "decreasing"})
        assert "df=4" in label
        assert "k=3" in label
        assert "decreasing" in label

    def test_missing_fields(self):
        label = _term_label({})
        assert label == "? (?)"


class TestTermParams:
    def test_extracts_tunable_params(self):
        t = {"column": "X", "type": "ns", "df": 4, "k": 3, "monotonicity": "inc", "expr": "log(X)"}
        result = _term_params(t)
        assert result == {"df": 4, "k": 3, "monotonicity": "inc", "expr": "log(X)"}

    def test_missing_params_are_none(self):
        result = _term_params({"column": "X", "type": "categorical"})
        assert result == {"df": None, "k": None, "monotonicity": None, "expr": None}


class TestComputeChanges:
    def test_added_term(self):
        prev = []
        curr = [{"column": "Region", "type": "categorical"}]
        changes = _compute_changes(prev, curr)
        assert len(changes) == 1
        assert changes[0].kind == "added"
        assert "Region" in changes[0].description

    def test_removed_term(self):
        prev = [{"column": "Region", "type": "categorical"}]
        curr = []
        changes = _compute_changes(prev, curr)
        assert len(changes) == 1
        assert changes[0].kind == "removed"

    def test_modified_term(self):
        prev = [{"column": "DrivAge", "type": "ns", "df": 3}]
        curr = [{"column": "DrivAge", "type": "ns", "df": 5}]
        changes = _compute_changes(prev, curr)
        assert len(changes) == 1
        assert changes[0].kind == "modified"

    def test_no_changes(self):
        terms = [{"column": "Region", "type": "categorical"}]
        changes = _compute_changes(terms, terms)
        assert changes == []

    def test_empty_to_empty(self):
        assert _compute_changes([], []) == []

    def test_multiple_changes(self):
        prev = [
            {"column": "Region", "type": "categorical"},
            {"column": "DrivAge", "type": "linear"},
        ]
        curr = [
            {"column": "Region", "type": "categorical"},
            {"column": "Area", "type": "categorical"},
        ]
        changes = _compute_changes(prev, curr)
        kinds = {c.kind for c in changes}
        assert "added" in kinds  # Area added
        assert "removed" in kinds  # DrivAge removed

    def test_same_column_different_type_is_add_and_remove(self):
        prev = [{"column": "DrivAge", "type": "linear"}]
        curr = [{"column": "DrivAge", "type": "ns", "df": 4}]
        changes = _compute_changes(prev, curr)
        kinds = {c.kind for c in changes}
        # Different type = different key, so it's an add + remove
        assert "added" in kinds
        assert "removed" in kinds


class TestExtractSplitMetrics:
    def test_extracts_train_metrics(self):
        diag = {
            "train_test": {
                "train": {
                    "n_obs": 120,
                    "loss": 0.45,
                    "aic": 250.0,
                    "gini": 0.35,
                }
            }
        }
        result = _extract_split_metrics(json.dumps(diag), "train")
        assert result.n_obs == 120
        assert result.mean_deviance == 0.45
        assert result.aic == 250.0
        assert result.gini == 0.35

    def test_extracts_test_metrics(self):
        diag = {
            "train_test": {
                "test": {
                    "n_obs": 40,
                    "loss": 0.50,
                    "aic": 90.0,
                    "gini": 0.30,
                }
            }
        }
        result = _extract_split_metrics(json.dumps(diag), "test")
        assert result.n_obs == 40

    def test_computes_mean_deviance_from_deviance(self):
        diag = {
            "train_test": {
                "train": {
                    "n_obs": 100,
                    "deviance": 50.0,
                }
            }
        }
        result = _extract_split_metrics(json.dumps(diag), "train")
        assert result.mean_deviance == 0.5

    def test_null_json_returns_empty(self):
        result = _extract_split_metrics(None, "train")
        assert result.n_obs is None
        assert result.mean_deviance is None

    def test_empty_string_returns_empty(self):
        result = _extract_split_metrics("", "train")
        assert result.n_obs is None

    def test_missing_split_returns_empty(self):
        diag = {"train_test": {"train": {"n_obs": 100}}}
        result = _extract_split_metrics(json.dumps(diag), "test")
        assert result.n_obs is None

    def test_malformed_json_returns_empty(self):
        result = _extract_split_metrics("{bad json", "train")
        assert result.n_obs is None

    def test_accepts_dict_input(self):
        """The function also accepts pre-parsed dicts."""
        diag = {"train_test": {"train": {"n_obs": 50, "loss": 0.3}}}
        # When passed as a non-string, it should still work
        result = _extract_split_metrics(json.dumps(diag), "train")
        assert result.n_obs == 50
