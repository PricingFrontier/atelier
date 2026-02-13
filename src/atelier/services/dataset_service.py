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
    log.info("[load_dataframe] path=%s  exists=%s  suffix=%s", path, path.exists(), path.suffix)
    if not path.exists():
        log.error("[load_dataframe] dataset file not found: %s", path)
        raise HTTPException(400, f"Dataset not found: {path}")
    try:
        if path.suffix == ".parquet":
            df = pl.read_parquet(path)
        else:
            df = pl.read_csv(path)

        # Cast Decimal columns to Float64 — numpy/rustystats can't handle
        # python Decimal values (especially mixed with nulls).
        decimal_cols = [c for c in df.columns if df[c].dtype.base_type() == pl.Decimal]
        if decimal_cols:
            log.info("[load_dataframe] casting %d Decimal columns to Float64: %s", len(decimal_cols), decimal_cols)
            df = df.with_columns([pl.col(c).cast(pl.Float64) for c in decimal_cols])

        log.info("[load_dataframe] loaded %d rows x %d cols from %s", df.height, df.width, path.name)
        log.debug("[load_dataframe] dtypes: %s", {c: str(df[c].dtype) for c in df.columns})
        return df
    except Exception as e:
        log.error("[load_dataframe] failed to read %s: %s", path, e, exc_info=True)
        raise HTTPException(400, f"Failed to read dataset: {e}")


def load_column(path: Path, column: str) -> pl.Series:
    """Load a single column from a CSV or Parquet file."""
    log.info("[load_column] path=%s  column=%s", path, column)
    if not path.exists():
        log.error("[load_column] dataset file not found: %s", path)
        raise HTTPException(400, f"Dataset not found: {path}")
    try:
        if path.suffix == ".parquet":
            df = pl.read_parquet(path, columns=[column])
        else:
            df = pl.read_csv(path, columns=[column])
    except Exception as e:
        log.error("[load_column] failed to read column '%s' from %s: %s", column, path, e, exc_info=True)
        raise HTTPException(400, f"Failed to read column: {e}")
    if column not in df.columns:
        log.error("[load_column] column '%s' not found in %s  available=%s", column, path, df.columns)
        raise HTTPException(400, f"Column '{column}' not found")
    log.debug("[load_column] loaded column '%s': dtype=%s  len=%d  nulls=%d", column, df[column].dtype, len(df[column]), df[column].null_count())
    return df[column]


def column_meta(df: pl.DataFrame) -> list[dict]:
    """Extract column metadata from a polars DataFrame."""
    log.debug("[column_meta] extracting metadata for %d columns", df.width)
    cols = []
    for name in df.columns:
        s = df[name]
        is_cat = _is_categorical(s)
        is_num = s.dtype.is_numeric()
        meta = {
            "name": name,
            "dtype": str(s.dtype),
            "n_unique": s.n_unique(),
            "n_missing": s.null_count(),
            "is_numeric": is_num,
            "is_categorical": is_cat,
        }
        log.debug("[column_meta] %s: dtype=%s  n_unique=%d  n_missing=%d  is_num=%s  is_cat=%s",
                  name, meta["dtype"], meta["n_unique"], meta["n_missing"], is_num, is_cat)
        cols.append(meta)
    log.info("[column_meta] extracted metadata for %d columns (%d numeric, %d categorical)",
             len(cols), sum(1 for c in cols if c["is_numeric"]), sum(1 for c in cols if c["is_categorical"]))
    return cols


def classify_columns(
    df: pl.DataFrame,
    reserved: set[str],
    cat_threshold: int = 50,
) -> tuple[list[str], list[str]]:
    """Classify DataFrame columns into categorical and continuous factors.

    Returns (categorical_factors, continuous_factors), excluding reserved columns.
    """
    log.debug("[classify_columns] %d total columns  reserved=%s  cat_threshold=%d", df.width, reserved, cat_threshold)
    cat_factors: list[str] = []
    cont_factors: list[str] = []
    skipped: list[str] = []
    for col_name in df.columns:
        if col_name in reserved:
            continue
        s = df[col_name]
        if _is_categorical(s, cat_threshold):
            cat_factors.append(col_name)
        elif s.dtype.is_numeric():
            cont_factors.append(col_name)
        else:
            skipped.append(col_name)
    if skipped:
        log.debug("[classify_columns] skipped non-numeric/non-cat columns: %s", skipped)
    log.info("[classify_columns] result: %d categorical, %d continuous (skipped %d)", len(cat_factors), len(cont_factors), len(skipped))
    return cat_factors, cont_factors


def apply_split(
    df: pl.DataFrame,
    split: SplitSpec | None,
) -> tuple[pl.DataFrame, pl.DataFrame | None]:
    """Filter DataFrame into train and validation sets based on split config.

    Returns (train_df, validation_df). If no split, returns (df, None).
    """
    if not split or split.column not in df.columns:
        log.info("[apply_split] no split applied (split=%s)  returning full df (%d rows)", split is not None, df.height)
        return df, None

    log.info("[apply_split] splitting on column='%s'  mapping=%s", split.column, split.mapping)
    str_col = df[split.column].cast(pl.Utf8)
    train_vals = [v for v, g in split.mapping.items() if g == "train"]
    val_vals = [v for v, g in split.mapping.items() if g == "validation"]
    log.debug("[apply_split] train_vals=%s  val_vals=%s", train_vals, val_vals)

    train_df = df.filter(str_col.is_in(train_vals)) if train_vals else df
    validation_df = df.filter(str_col.is_in(val_vals)) if val_vals else None

    log.info(
        "[apply_split] result: train=%d rows  validation=%s rows  (from %d total)",
        train_df.height, validation_df.height if validation_df is not None else "none", df.height,
    )
    return train_df, validation_df
