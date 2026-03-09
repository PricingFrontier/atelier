"""Model service — persistence logic extracted from API handlers."""

import json as _json
import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from atelier.db.engine import get_session_factory
from atelier.db.models import Model, Project
from atelier.schemas import ExploreRequest
from atelier.schemas.model_save import VersionChange

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Spec construction
# ---------------------------------------------------------------------------

def build_model_spec(
    *,
    dataset_path: str,
    response: str,
    family: str,
    link: str | None,
    offset: str | None,
    weights: str | None,
    terms: list[dict],
    split: dict | None,
) -> dict[str, Any]:
    """Build a canonical model spec dict for storage.

    Used by both the save_model API endpoint and save_null_model to ensure
    consistent spec format.
    """
    return {
        "dataset_path": dataset_path,
        "response": response,
        "family": family,
        "link": link,
        "offset": offset,
        "weights": weights,
        "terms": terms,
        "split": split,
    }


# ---------------------------------------------------------------------------
# Term diffing helpers (used by models API for version history)
# ---------------------------------------------------------------------------

def _term_key(t: dict) -> str:
    """Unique identity for a term (column + type)."""
    return f"{t.get('column', '')}::{t.get('type', '')}"


def _term_label(t: dict) -> str:
    """Human-readable label for a term."""
    col = t.get("column", "?")
    typ = t.get("type", "?")
    extras = []
    if t.get("df") is not None:
        extras.append(f"df={t['df']}")
    if t.get("k") is not None:
        extras.append(f"k={t['k']}")
    if t.get("monotonicity"):
        extras.append(t["monotonicity"])
    suffix = f", {', '.join(extras)}" if extras else ""
    return f"{col} ({typ}{suffix})"


def _term_params(t: dict) -> dict:
    """Extract tunable params for modification detection."""
    return {
        "df": t.get("df"),
        "k": t.get("k"),
        "monotonicity": t.get("monotonicity"),
        "expr": t.get("expr"),
    }


def compute_changes(
    prev_terms: list[dict], curr_terms: list[dict]
) -> list[VersionChange]:
    """Diff two term lists and return a list of changes."""
    prev_map = {_term_key(t): t for t in prev_terms}
    curr_map = {_term_key(t): t for t in curr_terms}

    changes: list[VersionChange] = []

    # Added
    for key in curr_map:
        if key not in prev_map:
            changes.append(
                VersionChange(kind="added", description=f"+ {_term_label(curr_map[key])}")
            )

    # Removed
    for key in prev_map:
        if key not in curr_map:
            changes.append(
                VersionChange(kind="removed", description=f"− {_term_label(prev_map[key])}")
            )

    # Modified (same column+type but different params)
    for key in curr_map:
        if key in prev_map and _term_params(curr_map[key]) != _term_params(prev_map[key]):
            changes.append(
                VersionChange(
                    kind="modified",
                    description=f"~ {_term_label(curr_map[key])}",
                )
            )

    return changes


# ---------------------------------------------------------------------------
# Null model persistence
# ---------------------------------------------------------------------------

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

            spec = build_model_spec(
                dataset_path=req.dataset_path,
                response=req.response,
                family=req.family,
                link=req.link,
                offset=req.offset,
                weights=req.weights,
                terms=[],
                split=req.split.model_dump() if req.split else None,
            )

            null_model_row = Model(
                project_id=project_id,
                version=1,
                name="v1",
                spec=spec,
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
            try:
                await session.commit()
                log.info("[model_service] saved null model as v1 for project '%s'", project.name)
            except IntegrityError:
                # Another concurrent explore already saved v1 — that's fine.
                log.info(
                    "[model_service] null model v1 already exists for project '%s' (concurrent insert); ignoring",
                    project.name,
                )
                await session.rollback()
    except Exception as exc:
        log.warning("[model_service] failed to save null model (non-fatal): %s", exc)
