"""Tests for _build_terms_dict — converts TermSpec list to rustystats dict."""

from atelier.api.fit import _build_terms_dict
from atelier.schemas import TermSpec


def _term(**kwargs) -> TermSpec:
    """Shorthand to create a TermSpec with defaults."""
    defaults = {"column": "X", "type": "categorical"}
    defaults.update(kwargs)
    return TermSpec(**defaults)


class TestBuildTermsDict:
    def test_single_categorical(self):
        result = _build_terms_dict([_term(column="Region", type="categorical")])
        assert "Region" in result
        assert result["Region"]["type"] == "categorical"

    def test_single_linear(self):
        result = _build_terms_dict([_term(column="DrivAge", type="linear")])
        assert result["DrivAge"]["type"] == "linear"

    def test_spline_with_df(self):
        result = _build_terms_dict([_term(column="DrivAge", type="ns", df=4)])
        assert result["DrivAge"]["type"] == "ns"
        assert result["DrivAge"]["df"] == 4

    def test_spline_with_k(self):
        result = _build_terms_dict([_term(column="DrivAge", type="bs", k=3)])
        assert result["DrivAge"]["k"] == 3

    def test_monotonicity_included(self):
        result = _build_terms_dict([_term(column="DrivAge", type="ns", df=4, monotonicity="increasing")])
        assert result["DrivAge"]["monotonicity"] == "increasing"

    def test_expression_uses_expr_as_key(self):
        result = _build_terms_dict([_term(column="DrivAge", type="expression", expr="np.log(DrivAge)")])
        assert "np.log(DrivAge)" in result
        assert result["np.log(DrivAge)"]["type"] == "expression"
        assert result["np.log(DrivAge)"]["expr"] == "np.log(DrivAge)"

    def test_same_column_categorical_then_te(self):
        terms = [
            _term(column="Region", type="categorical"),
            _term(column="Region", type="target_encoding"),
        ]
        result = _build_terms_dict(terms)
        # Categorical keeps plain key, TE gets suffixed key with variable field
        assert "Region" in result
        assert result["Region"]["type"] == "categorical"
        assert "Region__target_encoding" in result
        assert result["Region__target_encoding"]["type"] == "target_encoding"
        assert result["Region__target_encoding"]["variable"] == "Region"

    def test_same_column_te_then_categorical(self):
        terms = [
            _term(column="Region", type="target_encoding"),
            _term(column="Region", type="categorical"),
        ]
        result = _build_terms_dict(terms)
        # TE gets re-keyed, categorical takes plain key
        assert "Region" in result
        assert result["Region"]["type"] == "categorical"
        assert "Region__target_encoding" in result
        assert result["Region__target_encoding"]["variable"] == "Region"

    def test_multiple_independent_columns(self):
        terms = [
            _term(column="Region", type="categorical"),
            _term(column="DrivAge", type="linear"),
            _term(column="Area", type="categorical"),
        ]
        result = _build_terms_dict(terms)
        assert len(result) == 3
        assert set(result.keys()) == {"Region", "DrivAge", "Area"}

    def test_empty_terms_list(self):
        result = _build_terms_dict([])
        assert result == {}

    def test_optional_params_excluded_when_none(self):
        result = _build_terms_dict([_term(column="Region", type="categorical")])
        spec = result["Region"]
        assert "df" not in spec
        assert "k" not in spec
        assert "monotonicity" not in spec
        assert "expr" not in spec

    def test_frequency_encoding_rekey(self):
        terms = [
            _term(column="Region", type="categorical"),
            _term(column="Region", type="frequency_encoding"),
        ]
        result = _build_terms_dict(terms)
        assert "Region" in result
        assert "Region__frequency_encoding" in result
        assert result["Region__frequency_encoding"]["variable"] == "Region"
