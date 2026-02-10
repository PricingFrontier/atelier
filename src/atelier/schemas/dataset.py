"""Pydantic schemas for dataset endpoints."""

from pydantic import BaseModel


class ColumnValuesRequest(BaseModel):
    dataset_path: str
    column: str
