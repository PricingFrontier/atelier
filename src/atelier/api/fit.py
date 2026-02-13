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
    log.info(
        "[fit] request: response=%s  family=%s  link=%s  offset=%s  weights=%s  "
        "n_terms=%d  split=%s  dataset_path=%s",
        req.response, req.family, req.link, req.offset, req.weights,
        len(req.terms), req.split.column if req.split else None, req.dataset_path,
    )
    for i, t in enumerate(req.terms):
        log.debug("[fit] term[%d]: column=%s  type=%s  df=%s  k=%s  mono=%s  expr=%s",
                  i, t.column, t.type, t.df, t.k, t.monotonicity, t.expr)

    df = load_dataframe(Path(req.dataset_path))
    log.info("[fit] loaded dataframe: rows=%d  cols=%d", df.height, df.width)

    # Apply data split
    train_df, validation_df = apply_split(df, req.split)
    log.info(
        "[fit] after split: train_rows=%d  validation_rows=%s",
        train_df.height, validation_df.height if validation_df is not None else "none",
    )

    # Build terms dict
    terms_dict = _build_terms_dict(req.terms)
    log.debug("[fit] built terms_dict with %d entries: %s", len(terms_dict), list(terms_dict.keys()))

    if not terms_dict:
        log.warning("[fit] rejected: no terms specified")
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
    log.debug("[fit] calling rs.glm_dict with kwargs keys=%s", list(kwargs.keys()))
    t0 = time.perf_counter()
    try:
        result = rs.glm_dict(**kwargs).fit()
    except Exception as e:
        fit_ms = int((time.perf_counter() - t0) * 1000)
        log.error("[fit] rs.glm_dict().fit() FAILED after %dms: %s", fit_ms, e, exc_info=True)
        raise HTTPException(422, f"Model fit failed: {e}")
    fit_ms = int((time.perf_counter() - t0) * 1000)
    log.info("[fit] model fit completed in %dms", fit_ms)

    # Extract results
    log.debug("[fit] extracting summary and coefficient table")
    summary = result.summary()

    # Coefficient table
    params = result.params
    feature_names = result.feature_names
    log.info("[fit] model has %d parameters / features", len(feature_names))
    try:
        se = result.bse()
    except Exception as exc:
        log.debug("[fit] bse() failed: %s", exc)
        se = [None] * len(params)
    try:
        tvals = result.tvalues()
    except Exception as exc:
        log.debug("[fit] tvalues() failed: %s", exc)
        tvals = [None] * len(params)
    try:
        pvals = result.pvalues()
    except Exception as exc:
        log.debug("[fit] pvalues() failed: %s", exc)
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

    log.debug("[fit] coefficient table built with %d rows", len(coef_table))

    # Diagnostics
    try:
        deviance = float(result.deviance)
    except Exception as exc:
        log.debug("[fit] deviance extraction failed: %s", exc)
        deviance = None
    try:
        null_deviance = float(result.null_deviance())
    except Exception as exc:
        log.debug("[fit] null_deviance() failed: %s", exc)
        null_deviance = None
    try:
        aic = float(result.aic())
    except Exception as exc:
        log.debug("[fit] aic() failed: %s", exc)
        aic = None
    try:
        bic = float(result.bic())
    except Exception as exc:
        log.debug("[fit] bic() failed: %s", exc)
        bic = None

    log.info(
        "[fit] metrics: deviance=%s  null_deviance=%s  aic=%s  bic=%s",
        deviance, null_deviance, aic, bic,
    )

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
        log.info(
            "[fit] diagnostics: %d cat factors, %d cont factors  reserved=%s",
            len(cat_factors), len(cont_factors), reserved,
        )

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
        diagnostics_json = _json.loads(diag.to_json())
        log.info(
            "[fit] diagnostics completed in %dms  diag_keys=%s",
            diag_ms, list(diagnostics_json.keys()) if diagnostics_json else "none",
        )
    except Exception as exc:
        log.warning("[fit] diagnostics failed: %s", exc, exc_info=True)
        diagnostics_json = None

    log.info(
        "[fit] returning result: n_obs=%d  n_params=%d  n_terms=%d  fit_ms=%d",
        train_df.height, len(feature_names), len(terms_dict), fit_ms,
    )
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
