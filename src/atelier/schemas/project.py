"""Pydantic schemas for project endpoints."""

from pydantic import BaseModel

from atelier.schemas.model_spec import SplitSpec, TermSpec


class ProjectConfig(BaseModel):
    """Full model setup stored with the project."""

    dataset_path: str | None = None
    response: str | None = None
    family: str | None = None
    link: str | None = None
    offset: str | None = None
    weights: str | None = None
    split: SplitSpec | None = None
    columns: list[dict] | None = None


class CreateProjectRequest(BaseModel):
    name: str
    config: ProjectConfig | None = None


class UpdateProjectConfigRequest(BaseModel):
    config: ProjectConfig


class ProjectSummary(BaseModel):
    id: str
    name: str
    n_versions: int
    created_at: str
    updated_at: str
    family: str | None = None
    response: str | None = None


class ProjectDetail(BaseModel):
    id: str
    name: str
    description: str
    config: ProjectConfig | None = None
    n_versions: int
    created_at: str
    updated_at: str
