"""Model service — persistence logic extracted from API handlers."""

import json as _json
import logging
from typing import Any

from sqlalchemy import func, select

from atelier.db.engine import get_session_factory
from atelier.db.models import Model, Project
from atelier.schemas import ExploreRequest

log = logging.getLogger(__name__)


async def save_null_model(
    *,
    project_id: str,
    null_result: Any,
    null_diagnostics: dict,
    req: ExploreRequest,
    n_obs: int,
    n_validation: int | None,
    fit_ms: int,
) -> None:
    """Save a null (intercept-only) model as v1 if no versions exist yet."""
    try:
        session_factory = get_session_factory()
        async with session_factory() as session:
            project = await session.get(Project, project_id)
            if not project:
                return

            # Check if there are already versions
            existing = await session.execute(
                select(func.coalesce(func.max(Model.version), 0)).where(
                    Model.project_id == project_id
                )
            )
            max_version = existing.scalar_one()
            if max_version != 0:
                return

            # Extract null model metrics
            null_dev = None
            null_aic = None
            try:
                null_dev = float(null_result.deviance)
            except Exception as exc:
                log.debug("[model_service] null deviance extraction failed: %s", exc)
            try:
                null_aic = float(null_result.aic())
            except Exception as exc:
                log.debug("[model_service] null aic() failed: %s", exc)

            null_model_row = Model(
                project_id=project_id,
                version=1,
                name="v1",
                spec={
                    "dataset_path": req.dataset_path,
                    "response": req.response,
                    "family": req.family,
                    "link": req.link,
                    "offset": req.offset,
                    "weights": req.weights,
                    "terms": [],
                    "split": req.split.model_dump() if req.split else None,
                },
                status="fitted",
                deviance=null_dev,
                null_deviance=null_dev,
                aic=null_aic,
                n_obs=n_obs,
                n_validation=n_validation,
                n_params=1,
                fit_duration_ms=fit_ms,
                summary_text="Null model (intercept only)",
                coef_table_json=None,
                diagnostics_json=_json.dumps(null_diagnostics),
            )
            session.add(null_model_row)
            project.n_versions = 1
            await session.commit()
            log.info("[model_service] saved null model as v1 for project '%s'", project.name)
    except Exception as exc:
        log.warning("[model_service] failed to save null model (non-fatal): %s", exc)
