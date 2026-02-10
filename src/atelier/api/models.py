"""API endpoints for saving and retrieving model versions."""

import json
import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from atelier.db.engine import get_session_factory
from atelier.db.models import Model, Project
from atelier.schemas import ModelDetail, ModelSaveRequest, ModelSummary

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
            fit_duration_ms=req.fit_duration_ms,
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


@router.get("/models/{project_id}/history")
async def list_models(project_id: str):
    """Return all saved model versions for a project, newest first."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            select(Model)
            .where(Model.project_id == project_id)
            .order_by(Model.version.desc())
        )
        rows = result.scalars().all()

        return [
            ModelSummary(
                id=m.id,
                version=m.version,
                created_at=m.created_at.isoformat() if m.created_at else "",
                n_terms=len(m.spec.get("terms", [])) if m.spec else 0,
                deviance=m.deviance,
                aic=m.aic,
                bic=m.bic,
                n_obs=m.n_obs,
                family=m.spec.get("family") if m.spec else None,
                fit_duration_ms=m.fit_duration_ms,
            ).model_dump()
            for m in rows
        ]


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
            fit_duration_ms=model.fit_duration_ms,
            converged=model.converged,
            iterations=model.iterations,
            coef_table=json.loads(model.coef_table_json) if model.coef_table_json else None,
            diagnostics=json.loads(model.diagnostics_json) if model.diagnostics_json else None,
            generated_code=model.generated_code,
        ).model_dump()
