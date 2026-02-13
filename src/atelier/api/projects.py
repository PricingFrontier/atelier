"""API endpoints for project management."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from atelier.db.engine import get_session
from atelier.db.models import Model, Project
from atelier.schemas import (
    CreateProjectRequest,
    ProjectDetail,
    ProjectSummary,
    UpdateProjectConfigRequest,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["projects"])


@router.post("/projects")
async def create_project(req: CreateProjectRequest, session: AsyncSession = Depends(get_session)):
    """Create a new named project."""
    log.info("[projects/create] name='%s'  has_config=%s", req.name, req.config is not None)
    project = Project(
        name=req.name,
        config=req.config.model_dump() if req.config else None,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)

    log.info("[projects/create] created project '%s' (id=%s)", req.name, project.id)
    return {"id": project.id, "name": project.name}


@router.get("/projects")
async def list_projects(session: AsyncSession = Depends(get_session)):
    """Return all projects, newest first."""
    log.info("[projects/list] fetching all projects")
    result = await session.execute(
        select(Project).order_by(Project.updated_at.desc())
    )
    rows = result.scalars().all()
    log.info("[projects/list] returning %d projects", len(rows))

    return [
        ProjectSummary(
            id=p.id,
            name=p.name,
            n_versions=p.n_versions or 0,
            created_at=p.created_at.isoformat() if p.created_at else "",
            updated_at=p.updated_at.isoformat() if p.updated_at else "",
            family=(p.config or {}).get("family"),
            response=(p.config or {}).get("response"),
        ).model_dump()
        for p in rows
    ]


@router.get("/projects/{project_id}")
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    """Return full project detail including config."""
    log.info("[projects/get] project_id=%s", project_id)
    project = await session.get(Project, project_id)
    if not project:
        log.warning("[projects/get] project not found: %s", project_id)
        raise HTTPException(status_code=404, detail="Project not found")
    log.debug(
        "[projects/get] found project '%s'  n_versions=%s  has_config=%s",
        project.name, project.n_versions, project.config is not None,
    )

    from atelier.schemas.project import ProjectConfig

    config = None
    if project.config:
        config = ProjectConfig(**project.config)

    return ProjectDetail(
        id=project.id,
        name=project.name,
        description=project.description or "",
        config=config,
        n_versions=project.n_versions or 0,
        created_at=project.created_at.isoformat() if project.created_at else "",
        updated_at=project.updated_at.isoformat() if project.updated_at else "",
    ).model_dump()


@router.put("/projects/{project_id}/config")
async def update_project_config(project_id: str, req: UpdateProjectConfigRequest, session: AsyncSession = Depends(get_session)):
    """Update the stored config for a project."""
    log.info("[projects/config] updating config for project_id=%s", project_id)
    project = await session.get(Project, project_id)
    if not project:
        log.warning("[projects/config] project not found: %s", project_id)
        raise HTTPException(status_code=404, detail="Project not found")

    project.config = req.config.model_dump()
    await session.commit()
    log.info("[projects/config] config updated for project '%s' (id=%s)", project.name, project_id)
    return {"ok": True}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, session: AsyncSession = Depends(get_session)):
    """Delete a project and all its saved model versions."""
    log.info("[projects/delete] project_id=%s", project_id)
    project = await session.get(Project, project_id)
    if not project:
        log.warning("[projects/delete] project not found: %s", project_id)
        raise HTTPException(status_code=404, detail="Project not found")

    await session.execute(
        sa_delete(Model).where(Model.project_id == project_id)
    )
    await session.delete(project)
    await session.commit()

    log.info("[projects/delete] deleted project '%s' (id=%s) and all its models", project.name, project_id)
    return {"ok": True}
