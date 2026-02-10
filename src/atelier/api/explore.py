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

log = logging.getLogger(__name__)

router = APIRouter(tags=["explore"])


@router.post("/explore")
async def explore_data(req: ExploreRequest):
    """Run pre-fit data exploration using rustystats."""
    df = load_dataframe(Path(req.dataset_path))

    # Apply data split — explore train data only
    df, _ = apply_split(df, req.split)

    # Classify columns (exclude response, exposure, and split column)
    reserved = {req.response}
    if req.exposure:
        reserved.add(req.exposure)
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
        if req.exposure:
            kwargs["exposure"] = req.exposure

        exploration = rs.explore_data(**kwargs)
        result_json = _json.loads(exploration.to_json())
        ms = int((time.perf_counter() - t0) * 1000)
        log.info(f"[explore] completed in {ms}ms")
        return result_json
    except Exception as exc:
        log.warning(f"[explore] failed: {exc}")
        raise HTTPException(422, f"Exploration failed: {exc}")
