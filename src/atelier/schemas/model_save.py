"""Pydantic schemas for model save / history endpoints."""

from typing import Literal

from pydantic import BaseModel

from atelier.schemas.model_spec import SplitSpec, TermSpec


class ModelSaveRequest(BaseModel):
    """Payload sent after a successful fit to persist the model."""

    project_id: str
    dataset_path: str
    response: str
    family: str
    link: str | None = None
    offset: str | None = None
    weights: str | None = None
    terms: list[TermSpec]
    split: SplitSpec | None = None

    # Fit results
    deviance: float | None = None
    null_deviance: float | None = None
    aic: float | None = None
    bic: float | None = None
    n_obs: int | None = None
    n_validation: int | None = None
    n_params: int | None = None
    fit_duration_ms: int | None = None
    summary: str | None = None
    converged: bool | None = None
    iterations: int | None = None
    coef_table: list[dict] | None = None
    diagnostics: dict | None = None
    generated_code: str | None = None


class VersionChange(BaseModel):
    """A single diff item between consecutive versions."""

    kind: Literal["added", "removed", "modified"]
    description: str  # e.g. "+VehPower (spline, df=5)"


class SplitMetrics(BaseModel):
    """Key metrics for a single data split (train or test)."""

    n_obs: int | None = None
    mean_deviance: float | None = None
    aic: float | None = None
    gini: float | None = None


class ModelSummary(BaseModel):
    """Compact representation for the history list."""

    id: str
    version: int
    created_at: str
    n_terms: int
    family: str | None = None
    fit_duration_ms: int | None = None
    train: SplitMetrics = SplitMetrics()
    test: SplitMetrics | None = None
    changes: list[VersionChange] = []


class ModelDetail(BaseModel):
    """Full model detail — contains everything to reconstruct a FitResult."""

    id: str
    version: int
    created_at: str
    spec: dict
    deviance: float | None = None
    null_deviance: float | None = None
    aic: float | None = None
    bic: float | None = None
    n_obs: int | None = None
    n_validation: int | None = None
    n_params: int | None = None
    fit_duration_ms: int | None = None
    summary: str | None = None
    converged: bool | None = None
    iterations: int | None = None
    coef_table: list[dict] | None = None
    diagnostics: dict | None = None
    generated_code: str | None = None
