"""Data exploration endpoint — runs rs.explore_data() once after model config is confirmed."""

import json as _json
import logging
import time
from pathlib import Path
from typing import Any

import rustystats as rs
from fastapi import APIRouter, HTTPException

from atelier.schemas import ExploreRequest
from atelier.services.dataset_service import apply_split, classify_columns, load_dataframe
from atelier.services.model_service import save_null_model

log = logging.getLogger(__name__)

router = APIRouter(tags=["explore"])


@router.post("/explore")
async def explore_data(req: ExploreRequest):
    """Run pre-fit data exploration using rustystats."""
    df = load_dataframe(Path(req.dataset_path))

    # Apply data split — explore train data only, but keep validation for null model
    df, validation_df = apply_split(df, req.split)

    # Classify columns (exclude response, offset, and split column)
    reserved = {req.response}
    if req.offset:
        reserved.add(req.offset)
    if req.split:
        reserved.add(req.split.column)

    cat_factors, cont_factors = classify_columns(df, reserved)

    t0 = time.perf_counter()
    try:
        kwargs: dict[str, Any] = {
            "data": df,
            "response": req.response,
            "family": req.family,
        }
        if cat_factors:
            kwargs["categorical_factors"] = cat_factors
        if cont_factors:
            kwargs["continuous_factors"] = cont_factors
        if req.offset:
            kwargs["exposure"] = req.offset

        exploration = rs.explore_data(**kwargs)
        result_json = _json.loads(exploration.to_json())
        ms = int((time.perf_counter() - t0) * 1000)
        log.info(f"[explore] completed in {ms}ms")
    except Exception as exc:
        log.warning(f"[explore] failed: {exc}")
        raise HTTPException(422, f"Exploration failed: {exc}")

    # Fit a null model (intercept only) to get score tests for all factors
    null_diagnostics = None
    try:
        t1 = time.perf_counter()
        null_kwargs: dict[str, Any] = {
            "response": req.response,
            "terms": {},
            "data": df,
            "family": req.family,
        }
        if req.offset:
            null_kwargs["offset"] = req.offset

        null_result = rs.glm_dict(**null_kwargs).fit()

        diag_kwargs: dict[str, Any] = {
            "train_data": df,
        }
        if validation_df is not None:
            diag_kwargs["test_data"] = validation_df
        if cat_factors:
            diag_kwargs["categorical_factors"] = cat_factors
        if cont_factors:
            diag_kwargs["continuous_factors"] = cont_factors

        null_diag = null_result.diagnostics(**diag_kwargs)
        null_diagnostics = _json.loads(null_diag.to_json())
        null_ms = int((time.perf_counter() - t1) * 1000)
        log.info(f"[explore] null model diagnostics: {null_ms}ms")
    except Exception as exc:
        log.warning(f"[explore] null model failed (non-fatal): {exc}")

    result_json["null_diagnostics"] = null_diagnostics

    # Save null model as version 1 in history (if project_id provided and no versions yet)
    if req.project_id and null_diagnostics is not None:
        await save_null_model(
            project_id=req.project_id,
            null_result=null_result,
            null_diagnostics=null_diagnostics,
            req=req,
            n_obs=df.height,
            n_validation=validation_df.height if validation_df is not None else None,
            fit_ms=null_ms,
        )

    return result_json
