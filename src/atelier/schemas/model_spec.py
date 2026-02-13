"""Pydantic schemas for model specification, terms, and fit requests."""

from pydantic import BaseModel


class SplitSpec(BaseModel):
    column: str
    mapping: dict[str, str | None]  # value -> "train" | "validation" | "holdout" | null


class TermSpec(BaseModel):
    column: str
    type: str  # categorical, target_encoding, frequency_encoding, linear, bs, ns, expression
    df: int | None = None
    k: int | None = None
    monotonicity: str | None = None  # increasing, decreasing
    expr: str | None = None


class FitRequest(BaseModel):
    dataset_path: str
    response: str
    family: str = "poisson"
    link: str | None = None
    offset: str | None = None
    weights: str | None = None
    terms: list[TermSpec]
    split: SplitSpec | None = None


class ExploreRequest(BaseModel):
    dataset_path: str
    response: str
    family: str = "poisson"
    link: str | None = None
    offset: str | None = None
    weights: str | None = None
    split: SplitSpec | None = None
    project_id: str | None = None
