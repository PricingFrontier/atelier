"""Model fit endpoint — accepts model spec, calls rustystats, returns results."""

import json as _json
import logging
import time
from pathlib import Path
from typing import Any

import rustystats as rs
from fastapi import APIRouter, HTTPException

from atelier.schemas import FitRequest, TermSpec
from atelier.services.dataset_service import apply_split, classify_columns, load_dataframe

log = logging.getLogger(__name__)

router = APIRouter(tags=["fit"])


_VARIABLE_AWARE_TYPES = {"target_encoding", "frequency_encoding"}


def _build_terms_dict(terms: list[TermSpec]) -> dict[str, dict[str, Any]]:
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


@router.post("/fit")
async def fit_model(req: FitRequest):
    """Fit a GLM using rustystats and return results."""
    df = load_dataframe(Path(req.dataset_path))

    # Apply data split
    train_df, validation_df = apply_split(df, req.split)

    # Build terms dict
    terms_dict = _build_terms_dict(req.terms)

    if not terms_dict:
        raise HTTPException(400, "No terms specified")

    # Build kwargs
    kwargs: dict[str, Any] = {
        "response": req.response,
        "terms": terms_dict,
        "data": train_df,
        "family": req.family,
    }
    if req.link:
        kwargs["link"] = req.link
    if req.offset:
        kwargs["offset"] = req.offset
    if req.weights:
        kwargs["weights"] = req.weights

    # Fit
    t0 = time.perf_counter()
    try:
        result = rs.glm_dict(**kwargs).fit()
    except Exception as e:
        raise HTTPException(422, f"Model fit failed: {e}")
    fit_ms = int((time.perf_counter() - t0) * 1000)
    log.info(f"[fit] model fit: {fit_ms}ms")

    # Extract results
    summary = result.summary()

    # Coefficient table
    params = result.params
    feature_names = result.feature_names
    try:
        se = result.bse()
        tvals = result.tvalues()
        pvals = result.pvalues()
    except Exception:
        se = [None] * len(params)
        tvals = [None] * len(params)
        pvals = [None] * len(params)

    coef_table = []
    for i, name in enumerate(feature_names):
        coef_table.append({
            "name": name,
            "coef": float(params[i]) if params[i] is not None else None,
            "se": float(se[i]) if se[i] is not None else None,
            "z": float(tvals[i]) if tvals[i] is not None else None,
            "pvalue": float(pvals[i]) if pvals[i] is not None else None,
        })

    # Diagnostics
    try:
        deviance = float(result.deviance)
    except Exception:
        deviance = None
    try:
        null_deviance = float(result.null_deviance())
    except Exception:
        null_deviance = None
    try:
        aic = float(result.aic())
    except Exception:
        aic = None
    try:
        bic = float(result.bic())
    except Exception:
        bic = None

    # Run diagnostics for all factors
    diagnostics_json: dict[str, Any] | None = None
    try:
        reserved = {req.response}
        if req.offset:
            reserved.add(req.offset)
        if req.weights:
            reserved.add(req.weights)
        if req.split:
            reserved.add(req.split.column)

        cat_factors, cont_factors = classify_columns(train_df, reserved)

        t1 = time.perf_counter()
        diag_kwargs: dict[str, Any] = {
            "train_data": train_df,
            "categorical_factors": cat_factors or None,
            "continuous_factors": cont_factors or None,
        }
        if validation_df is not None:
            diag_kwargs["test_data"] = validation_df
        diag = result.diagnostics(**diag_kwargs)
        diag_ms = int((time.perf_counter() - t1) * 1000)
        log.info(f"[fit] diagnostics: {diag_ms}ms")
        diagnostics_json = _json.loads(diag.to_json())
    except Exception as exc:
        log.warning(f"[fit] diagnostics failed: {exc}")
        diagnostics_json = None

    return {
        "success": True,
        "fit_duration_ms": fit_ms,
        "summary": summary,
        "coef_table": coef_table,
        "n_obs": train_df.height,
        "n_validation": validation_df.height if validation_df is not None else None,
        "deviance": deviance,
        "null_deviance": null_deviance,
        "aic": aic,
        "bic": bic,
        "family": req.family,
        "link": req.link or "canonical",
        "n_terms": len(terms_dict),
        "n_params": len(feature_names),
        "diagnostics": diagnostics_json,
    }
