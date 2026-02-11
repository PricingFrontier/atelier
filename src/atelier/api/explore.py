"""Data exploration endpoint — runs rs.explore_data() once after model config is confirmed."""

import json as _json
import logging
import time
from pathlib import Path
from typing import Any

import rustystats as rs
from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from atelier.db.engine import get_session_factory
from atelier.db.models import Model, Project
from atelier.schemas import ExploreRequest
from atelier.services.dataset_service import apply_split, classify_columns, load_dataframe

log = logging.getLogger(__name__)

router = APIRouter(tags=["explore"])


@router.post("/explore")
async def explore_data(req: ExploreRequest):
    """Run pre-fit data exploration using rustystats."""
    df = load_dataframe(Path(req.dataset_path))

    # Apply data split — explore train data only, but keep validation for null model
    df, validation_df = apply_split(df, req.split)

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
        if req.exposure:
            null_kwargs["offset"] = req.exposure

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
        try:
            session_factory = get_session_factory()
            async with session_factory() as session:
                project = await session.get(Project, req.project_id)
                if project:
                    # Check if there are already versions
                    existing = await session.execute(
                        select(func.coalesce(func.max(Model.version), 0)).where(
                            Model.project_id == req.project_id
                        )
                    )
                    max_version = existing.scalar_one()
                    if max_version == 0:
                        # Extract null model metrics
                        null_dev = None
                        null_aic = None
                        null_n_obs = df.height
                        try:
                            null_dev = float(null_result.deviance)
                        except Exception:
                            pass
                        try:
                            null_aic = float(null_result.aic())
                        except Exception:
                            pass

                        null_model_row = Model(
                            project_id=req.project_id,
                            dataset_id=req.project_id,
                            version=1,
                            name="v1",
                            spec={
                                "dataset_path": req.dataset_path,
                                "response": req.response,
                                "family": req.family,
                                "link": req.link,
                                "offset": req.exposure,
                                "weights": req.weights,
                                "terms": [],
                                "split": req.split.model_dump() if req.split else None,
                            },
                            status="fitted",
                            deviance=null_dev,
                            null_deviance=null_dev,
                            aic=null_aic,
                            n_obs=null_n_obs,
                            n_validation=validation_df.height if validation_df is not None else None,
                            n_params=1,
                            fit_duration_ms=null_ms,
                            summary_text="Null model (intercept only)",
                            coef_table_json=None,
                            diagnostics_json=_json.dumps(null_diagnostics),
                        )
                        session.add(null_model_row)
                        project.n_versions = 1
                        await session.commit()
                        log.info("[explore] saved null model as v1 for project '%s'", project.name)
        except Exception as exc:
            log.warning("[explore] failed to save null model (non-fatal): %s", exc)

    return result_json
