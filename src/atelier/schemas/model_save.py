"""Pydantic schemas for model save / history endpoints."""

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
    n_params: int | None = None
    fit_duration_ms: int | None = None
    converged: bool | None = None
    iterations: int | None = None
    coef_table: list[dict] | None = None
    diagnostics: dict | None = None
    generated_code: str | None = None


class ModelSummary(BaseModel):
    """Compact representation for the history list."""

    id: str
    version: int
    created_at: str
    n_terms: int
    deviance: float | None = None
    aic: float | None = None
    bic: float | None = None
    n_obs: int | None = None
    family: str | None = None
    fit_duration_ms: int | None = None


class ModelDetail(BaseModel):
    """Full model detail for restoring a saved version."""

    id: str
    version: int
    created_at: str
    spec: dict
    deviance: float | None = None
    null_deviance: float | None = None
    aic: float | None = None
    bic: float | None = None
    n_obs: int | None = None
    fit_duration_ms: int | None = None
    converged: bool | None = None
    iterations: int | None = None
    coef_table: list[dict] | None = None
    diagnostics: dict | None = None
    generated_code: str | None = None
