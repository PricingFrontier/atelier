"""Tests for sanitize_floats — the NaN/Inf → None recursive sanitiser."""

import math

from atelier.api._json_utils import sanitize_floats


class TestSanitizeFloats:
    def test_nan_replaced_with_none(self):
        assert sanitize_floats(float("nan")) is None

    def test_inf_replaced_with_none(self):
        assert sanitize_floats(float("inf")) is None

    def test_neg_inf_replaced_with_none(self):
        assert sanitize_floats(float("-inf")) is None

    def test_normal_float_preserved(self):
        assert sanitize_floats(3.14) == 3.14

    def test_zero_preserved(self):
        assert sanitize_floats(0.0) == 0.0

    def test_negative_float_preserved(self):
        assert sanitize_floats(-2.5) == -2.5

    def test_nested_dict(self):
        result = sanitize_floats({"a": {"b": float("nan"), "c": 1.0}})
        assert result == {"a": {"b": None, "c": 1.0}}

    def test_nested_list(self):
        result = sanitize_floats([1.0, [float("inf"), 2.0]])
        assert result == [1.0, [None, 2.0]]

    def test_mixed_types_passthrough(self):
        obj = {"s": "hello", "i": 42, "b": True, "n": None, "f": 1.5}
        result = sanitize_floats(obj)
        assert result == obj

    def test_empty_dict(self):
        assert sanitize_floats({}) == {}

    def test_empty_list(self):
        assert sanitize_floats([]) == []

    def test_int_passthrough(self):
        assert sanitize_floats(42) == 42

    def test_string_passthrough(self):
        assert sanitize_floats("hello") == "hello"

    def test_none_passthrough(self):
        assert sanitize_floats(None) is None

    def test_deeply_nested(self):
        obj = {"a": [{"b": [float("nan"), {"c": float("-inf")}]}, 3.14]}
        result = sanitize_floats(obj)
        assert result == {"a": [{"b": [None, {"c": None}]}, 3.14]}

    def test_list_of_dicts_with_nan(self):
        """Mimics a real coef_table response."""
        coefs = [
            {"name": "Intercept", "coef": -2.5, "se": 0.1, "pvalue": 0.001},
            {"name": "Region_R24", "coef": float("nan"), "se": float("inf"), "pvalue": None},
        ]
        result = sanitize_floats(coefs)
        assert result[0]["coef"] == -2.5
        assert result[1]["coef"] is None
        assert result[1]["se"] is None
        assert result[1]["pvalue"] is None
