"""Pydantic schemas for dataset endpoints."""

from pydantic import BaseModel


class ColumnValuesRequest(BaseModel):
    dataset_path: str
    column: str


class ValidateRequest(BaseModel):
    dataset_path: str
    response: str
    family: str = "poisson"
    offset: str | None = None
    weights: str | None = None


class ValidateIssue(BaseModel):
    field: str
    message: str
    suggestion: str | None = None


class ValidateResponse(BaseModel):
    errors: list[ValidateIssue] = []
    warnings: list[ValidateIssue] = []
