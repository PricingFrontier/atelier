"""Pydantic schemas for dataset endpoints."""

from pydantic import BaseModel, field_validator

from atelier.schemas.model_spec import VALID_FAMILIES


class ColumnValuesRequest(BaseModel):
    dataset_path: str
    column: str


class ValidateRequest(BaseModel):
    dataset_path: str
    response: str
    family: str = "poisson"
    offset: str | None = None
    weights: str | None = None

    @field_validator("family", mode="before")
    @classmethod
    def validate_family(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in VALID_FAMILIES:
            raise ValueError(
                f"invalid family '{v}', must be one of: {sorted(VALID_FAMILIES)}"
            )
        return v


class ValidateIssue(BaseModel):
    field: str
    message: str
    suggestion: str | None = None


class ValidateResponse(BaseModel):
    errors: list[ValidateIssue] = []
    warnings: list[ValidateIssue] = []
