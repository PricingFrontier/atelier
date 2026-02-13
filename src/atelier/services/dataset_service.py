"""Dataset service — file I/O, column metadata, data splitting."""

import logging
from pathlib import Path

import polars as pl
from fastapi import HTTPException

from atelier.schemas import SplitSpec

log = logging.getLogger(__name__)

DEFAULT_CAT_THRESHOLD = 50


def _is_categorical(s: pl.Series, threshold: int = DEFAULT_CAT_THRESHOLD) -> bool:
    """Heuristic: treat string columns and low-cardinality integers as categorical."""
    return s.dtype in (pl.Utf8, pl.Categorical, pl.String) or (
        s.dtype.is_numeric() and s.n_unique() <= threshold
    )


def load_dataframe(path: Path) -> pl.DataFrame:
    """Load a CSV or Parquet file into a polars DataFrame."""
    if not path.exists():
        raise HTTPException(400, f"Dataset not found: {path}")
    try:
        if path.suffix == ".parquet":
            return pl.read_parquet(path)
        else:
            return pl.read_csv(path)
    except Exception as e:
        raise HTTPException(400, f"Failed to read dataset: {e}")


def load_column(path: Path, column: str) -> pl.Series:
    """Load a single column from a CSV or Parquet file."""
    if not path.exists():
        raise HTTPException(400, f"Dataset not found: {path}")
    try:
        if path.suffix == ".parquet":
            df = pl.read_parquet(path, columns=[column])
        else:
            df = pl.read_csv(path, columns=[column])
    except Exception as e:
        raise HTTPException(400, f"Failed to read column: {e}")
    if column not in df.columns:
        raise HTTPException(400, f"Column '{column}' not found")
    return df[column]


def column_meta(df: pl.DataFrame) -> list[dict]:
    """Extract column metadata from a polars DataFrame."""
    cols = []
    for name in df.columns:
        s = df[name]
        is_cat = _is_categorical(s)
        is_num = s.dtype.is_numeric()
        cols.append(
            {
                "name": name,
                "dtype": str(s.dtype),
                "n_unique": s.n_unique(),
                "n_missing": s.null_count(),
                "is_numeric": is_num,
                "is_categorical": is_cat,
            }
        )
    return cols


def classify_columns(
    df: pl.DataFrame,
    reserved: set[str],
    cat_threshold: int = 50,
) -> tuple[list[str], list[str]]:
    """Classify DataFrame columns into categorical and continuous factors.

    Returns (categorical_factors, continuous_factors), excluding reserved columns.
    """
    cat_factors: list[str] = []
    cont_factors: list[str] = []
    for col_name in df.columns:
        if col_name in reserved:
            continue
        s = df[col_name]
        if _is_categorical(s, cat_threshold):
            cat_factors.append(col_name)
        elif s.dtype.is_numeric():
            cont_factors.append(col_name)
    return cat_factors, cont_factors


def apply_split(
    df: pl.DataFrame,
    split: SplitSpec | None,
) -> tuple[pl.DataFrame, pl.DataFrame | None]:
    """Filter DataFrame into train and validation sets based on split config.

    Returns (train_df, validation_df). If no split, returns (df, None).
    """
    if not split or split.column not in df.columns:
        return df, None

    str_col = df[split.column].cast(pl.Utf8)
    train_vals = [v for v, g in split.mapping.items() if g == "train"]
    val_vals = [v for v, g in split.mapping.items() if g == "validation"]

    train_df = df.filter(str_col.is_in(train_vals)) if train_vals else df
    validation_df = df.filter(str_col.is_in(val_vals)) if val_vals else None

    return train_df, validation_df
