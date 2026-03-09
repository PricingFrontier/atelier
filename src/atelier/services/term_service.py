"""Term service — build term dictionaries for rustystats from request specs."""

from typing import Any

from atelier.schemas import TermSpec

_VARIABLE_AWARE_TYPES = {"target_encoding", "frequency_encoding"}


def build_terms_dict(terms: list[TermSpec]) -> dict[str, dict[str, Any]]:
    """Convert list of TermSpec to rustystats terms dict."""
    result: dict[str, dict[str, Any]] = {}

    for t in terms:
        spec: dict[str, Any] = {"type": t.type}

        if t.df is not None:
            spec["df"] = t.df
        if t.k is not None:
            spec["k"] = t.k
        if t.monotonicity is not None:
            spec["monotonicity"] = t.monotonicity
        if t.type == "expression" and t.expr is not None:
            spec["expr"] = t.expr

        # For expressions, use a unique key
        if t.type == "expression":
            key = t.expr or t.column
        elif t.column in result and t.type in _VARIABLE_AWARE_TYPES:
            # Same column already has a term — use a unique key with
            # the 'variable' field so rustystats resolves the column
            key = f"{t.column}__{t.type}"
            spec["variable"] = t.column
        elif t.column in result and result[t.column]["type"] in _VARIABLE_AWARE_TYPES:
            # Existing entry is an encoding type — re-key it so we can
            # use the plain column name for the new (non-encoding) term
            existing = result.pop(t.column)
            existing["variable"] = t.column
            result[f"{t.column}__{existing['type']}"] = existing
            key = t.column
        else:
            key = t.column

        result[key] = spec

    return result
