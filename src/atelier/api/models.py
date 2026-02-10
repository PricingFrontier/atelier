"""API endpoints for saving and retrieving model versions."""

import json
import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from atelier.db.engine import get_session_factory
from atelier.db.models import Model, Project
from atelier.schemas import ModelDetail, ModelSaveRequest, ModelSummary
from atelier.schemas.model_save import SplitMetrics, VersionChange

log = logging.getLogger(__name__)

router = APIRouter(tags=["models"])


@router.post("/models/save")
async def save_model(req: ModelSaveRequest):
    """Persist a fitted model as a new version within its project."""
    if not req.project_id:
        raise HTTPException(status_code=400, detail="project_id is required")

    session_factory = get_session_factory()
    async with session_factory() as session:
        project = await session.get(Project, req.project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Determine next version number within this project
        result = await session.execute(
            select(func.coalesce(func.max(Model.version), 0)).where(
                Model.project_id == req.project_id
            )
        )
        next_version = result.scalar_one() + 1

        spec = {
            "dataset_path": req.dataset_path,
            "response": req.response,
            "family": req.family,
            "link": req.link,
            "offset": req.offset,
            "weights": req.weights,
            "terms": [t.model_dump() for t in req.terms],
            "split": req.split.model_dump() if req.split else None,
        }

        model = Model(
            project_id=req.project_id,
            dataset_id=req.project_id,  # reuse project_id as dataset_id
            version=next_version,
            name=f"v{next_version}",
            spec=spec,
            status="fitted",
            deviance=req.deviance,
            null_deviance=req.null_deviance,
            aic=req.aic,
            bic=req.bic,
            n_obs=req.n_obs,
            n_validation=req.n_validation,
            n_params=req.n_params,
            fit_duration_ms=req.fit_duration_ms,
            summary_text=req.summary,
            converged=req.converged,
            iterations=req.iterations,
            coef_table_json=json.dumps(req.coef_table) if req.coef_table else None,
            diagnostics_json=json.dumps(req.diagnostics) if req.diagnostics else None,
            generated_code=req.generated_code,
        )

        session.add(model)

        # Update project version count
        project.n_versions = next_version
        await session.commit()
        await session.refresh(model)

        log.info("Saved model v%d for project '%s'", next_version, project.name)

        return {
            "id": model.id,
            "version": next_version,
        }


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


def _compute_changes(
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


def _extract_split_metrics(diag_json: str | None, split: str) -> SplitMetrics:
    """Extract key metrics for a train/test split from stored diagnostics JSON."""
    if not diag_json:
        return SplitMetrics()
    try:
        diag = json.loads(diag_json) if isinstance(diag_json, str) else diag_json
        tt = diag.get("train_test", {})
        data = tt.get(split)
        if not data:
            return SplitMetrics()
        n_obs = data.get("n_obs")
        deviance = data.get("deviance")
        mean_dev = round(deviance / n_obs, 6) if deviance is not None and n_obs else None
        return SplitMetrics(
            n_obs=n_obs,
            mean_deviance=mean_dev,
            aic=data.get("aic"),
            gini=data.get("gini"),
        )
    except Exception:
        return SplitMetrics()


@router.get("/models/{project_id}/history")
async def list_models(project_id: str):
    """Return all saved model versions for a project, newest first, with diffs."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            select(Model)
            .where(Model.project_id == project_id)
            .order_by(Model.version.asc())
        )
        rows = result.scalars().all()

        summaries: list[dict] = []
        prev_terms: list[dict] = []

        for m in rows:
            curr_terms = m.spec.get("terms", []) if m.spec else []
            changes = _compute_changes(prev_terms, curr_terms) if m.version > 1 else []

            train = _extract_split_metrics(m.diagnostics_json, "train")
            test_metrics = _extract_split_metrics(m.diagnostics_json, "test")

            summaries.append(
                ModelSummary(
                    id=m.id,
                    version=m.version,
                    created_at=m.created_at.isoformat() if m.created_at else "",
                    n_terms=len(curr_terms),
                    family=m.spec.get("family") if m.spec else None,
                    fit_duration_ms=m.fit_duration_ms,
                    train=train,
                    test=test_metrics if test_metrics.n_obs is not None else None,
                    changes=changes,
                ).model_dump()
            )
            prev_terms = curr_terms

        summaries.reverse()  # newest first
        return summaries


@router.get("/models/detail/{model_id}")
async def get_model(model_id: str):
    """Return full detail for a single saved model."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        model = await session.get(Model, model_id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        return ModelDetail(
            id=model.id,
            version=model.version,
            created_at=model.created_at.isoformat() if model.created_at else "",
            spec=model.spec or {},
            deviance=model.deviance,
            null_deviance=model.null_deviance,
            aic=model.aic,
            bic=model.bic,
            n_obs=model.n_obs,
            n_validation=model.n_validation,
            n_params=model.n_params,
            fit_duration_ms=model.fit_duration_ms,
            summary=model.summary_text,
            converged=model.converged,
            iterations=model.iterations,
            coef_table=json.loads(model.coef_table_json) if model.coef_table_json else None,
            diagnostics=json.loads(model.diagnostics_json) if model.diagnostics_json else None,
            generated_code=model.generated_code,
        ).model_dump()
