"""Pydantic schemas for model specification, terms, and fit requests."""

from typing import Literal

from pydantic import BaseModel, field_validator

VALID_FAMILIES: set[str] = {
    "gaussian",
    "poisson",
    "quasipoisson",
    "binomial",
    "quasibinomial",
    "gamma",
    "inverse_gaussian",
    "negbinomial",
    "tweedie",
}


class SplitSpec(BaseModel):
    column: str
    mapping: dict[str, Literal["train", "validation", "holdout"] | None]


class TermSpec(BaseModel):
    column: str
    type: Literal[
        "categorical",
        "target_encoding",
        "frequency_encoding",
        "linear",
        "bs",
        "ns",
        "expression",
    ]
    df: int | None = None
    k: int | None = None
    monotonicity: str | None = None  # increasing, decreasing
    expr: str | None = None

    @field_validator("expr")
    @classmethod
    def expr_required_for_expression(cls, v: str | None, info) -> str | None:
        if info.data.get("type") == "expression" and not v:
            raise ValueError("'expr' must not be empty when type is 'expression'")
        return v


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
