"""Dataset upload endpoint — accepts CSV/Parquet, stores file, returns column metadata."""

import logging
import uuid
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, UploadFile

import numpy as np

from atelier.config import PROJECTS_DIR, SUPPORTED_FORMATS
from atelier.schemas import ColumnValuesRequest, ValidateRequest, ValidateIssue, ValidateResponse
from atelier.services.dataset_service import column_meta, load_dataframe, load_column

log = logging.getLogger(__name__)

router = APIRouter(tags=["datasets"])

UPLOADS_DIR = PROJECTS_DIR / "_uploads"


@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile):
    """Upload a CSV or Parquet file. Returns dataset_id and column metadata."""
    log.info("[upload] received file=%s  content_type=%s", file.filename, file.content_type)
    if not file.filename:
        log.warning("[upload] rejected: no filename provided")
        raise HTTPException(400, "No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in SUPPORTED_FORMATS:
        log.warning("[upload] rejected: unsupported format '.%s'", ext)
        raise HTTPException(400, f"Unsupported format '.{ext}'. Use: {SUPPORTED_FORMATS}")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    dataset_id = str(uuid.uuid4())
    dest = UPLOADS_DIR / f"{dataset_id}.{ext}"
    log.debug("[upload] dataset_id=%s  dest=%s", dataset_id, dest)

    content = await file.read()
    content_size_mb = len(content) / (1024 * 1024)
    log.info("[upload] read %.2f MB from upload stream", content_size_mb)
    dest.write_bytes(content)
    log.debug("[upload] wrote file to disk: %s", dest)

    try:
        df = load_dataframe(dest)
    except Exception as exc:
        log.error("[upload] failed to parse uploaded file %s: %s", dest, exc, exc_info=True)
        dest.unlink(missing_ok=True)
        raise

    columns = column_meta(df)
    log.info(
        "[upload] success: dataset_id=%s  filename=%s  rows=%d  cols=%d  columns=%s",
        dataset_id, file.filename, df.height, df.width,
        [c["name"] for c in columns],
    )

    return {
        "dataset_id": dataset_id,
        "filename": file.filename,
        "n_rows": df.height,
        "n_cols": df.width,
        "columns": columns,
        "file_path": str(dest),
    }


@router.post("/datasets/column-values")
async def get_column_values(req: ColumnValuesRequest):
    """Return unique values for a column (up to 200)."""
    log.info("[column-values] column=%s  dataset_path=%s", req.column, req.dataset_path)
    try:
        series = load_column(Path(req.dataset_path), req.column)
        values = series.drop_nulls().unique().sort().to_list()[:200]
        log.info("[column-values] returning %d unique values for '%s'", len(values), req.column)
        return {"column": req.column, "values": [str(v) for v in values]}
    except Exception as exc:
        log.error("[column-values] failed for column=%s: %s", req.column, exc, exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Family-specific response constraints (mirrors rustystats validation)
# ---------------------------------------------------------------------------
_FAMILY_CHECKS: dict[str, dict] = {
    "gaussian":         {"min": None, "max": None, "strict_min": False, "strict_max": False},
    "poisson":          {"min": 0,    "max": None, "strict_min": False, "strict_max": False},
    "quasipoisson":     {"min": 0,    "max": None, "strict_min": False, "strict_max": False},
    "binomial":         {"min": 0,    "max": 1,    "strict_min": False, "strict_max": False},
    "quasibinomial":    {"min": 0,    "max": 1,    "strict_min": False, "strict_max": False},
    "gamma":            {"min": 0,    "max": None, "strict_min": True,  "strict_max": False},
    "inverse_gaussian": {"min": 0,    "max": None, "strict_min": True,  "strict_max": False},
    "negbinomial":      {"min": 0,    "max": None, "strict_min": False, "strict_max": False},
    "tweedie":          {"min": 0,    "max": None, "strict_min": False, "strict_max": False},
}

_FAMILY_LABELS: dict[str, str] = {
    "gaussian": "Gaussian",
    "poisson": "Poisson",
    "quasipoisson": "Quasi-Poisson",
    "binomial": "Binomial",
    "quasibinomial": "Quasi-Binomial",
    "gamma": "Gamma",
    "inverse_gaussian": "Inverse Gaussian",
    "negbinomial": "Negative Binomial",
    "tweedie": "Tweedie",
}


def _check_numeric_array(
    series: pl.Series, field: str, label: str,
) -> tuple[list[ValidateIssue], list[ValidateIssue], np.ndarray | None]:
    """Validate a numeric column, returning (errors, warnings, numpy_array)."""
    errors: list[ValidateIssue] = []
    warnings: list[ValidateIssue] = []

    if not series.dtype.is_numeric():
        errors.append(ValidateIssue(
            field=field,
            message=f"{label} column cannot be converted to numeric values.",
            suggestion="Ensure all values are numeric (int, float, Decimal).",
        ))
        return errors, warnings, None

    arr = series.to_numpy(allow_copy=True).astype(np.float64, copy=False)

    n_nan = int(np.isnan(arr).sum())
    if n_nan > 0:
        pct = n_nan / len(arr) * 100
        errors.append(ValidateIssue(
            field=field,
            message=f"{label} contains {n_nan:,} missing/NaN values ({pct:.1f}%).",
            suggestion="Remove rows with missing values or impute them before fitting.",
        ))

    n_inf = int(np.isinf(arr).sum())
    if n_inf > 0:
        errors.append(ValidateIssue(
            field=field,
            message=f"{label} contains {n_inf:,} infinite values.",
            suggestion="Replace Inf/−Inf with finite values or remove those rows.",
        ))

    return errors, warnings, arr


@router.post("/datasets/validate", response_model=ValidateResponse)
async def validate_dataset(req: ValidateRequest):
    """Run data quality checks on response/offset/weights for the chosen family."""
    log.info(
        "[validate] dataset=%s  response=%s  family=%s  offset=%s  weights=%s",
        req.dataset_path, req.response, req.family, req.offset, req.weights,
    )
    df = load_dataframe(Path(req.dataset_path))
    errors: list[ValidateIssue] = []
    warnings: list[ValidateIssue] = []

    # --- Response column ---
    if req.response not in df.columns:
        errors.append(ValidateIssue(
            field="response",
            message=f"Response column '{req.response}' not found in dataset.",
        ))
        log.warning("[validate] response column '%s' not found", req.response)
        return ValidateResponse(errors=errors, warnings=warnings)

    y_series = df[req.response]
    y_errs, y_warns, y_arr = _check_numeric_array(y_series, "response", "Response")
    errors.extend(y_errs)
    warnings.extend(y_warns)

    if y_arr is not None:
        finite = y_arr[np.isfinite(y_arr)]

        # Empty
        if len(finite) == 0:
            errors.append(ValidateIssue(
                field="response",
                message="Response is empty after removing missing/infinite values.",
                suggestion="Check that your data has valid observations.",
            ))
        else:
            # Constant
            if np.all(finite == finite[0]):
                errors.append(ValidateIssue(
                    field="response",
                    message=f"Response is constant (all values = {finite[0]}). A GLM requires variation in the response.",
                ))

            # Family-specific bounds
            family = req.family.lower()
            check = _FAMILY_CHECKS.get(family)
            label = _FAMILY_LABELS.get(family, family)
            if check:
                lo, hi = check["min"], check["max"]
                strict_lo, strict_hi = check["strict_min"], check["strict_max"]

                if lo is not None:
                    if strict_lo:
                        n_bad = int((finite <= lo).sum())
                        op = "<="
                        constraint = f"strictly positive (y > {lo})"
                    else:
                        n_bad = int((finite < lo).sum())
                        op = "<"
                        constraint = f"non-negative (y ≥ {lo})"
                    if n_bad > 0:
                        errors.append(ValidateIssue(
                            field="response",
                            message=f"{label} family requires {constraint} response. Found {n_bad:,} values {op} {lo} (min={finite.min():.4g}).",
                            suggestion=f"Remove or filter rows where the response is {op} {lo}.",
                        ))

                if hi is not None:
                    if strict_hi:
                        n_bad = int((finite >= hi).sum())
                        op = ">="
                    else:
                        n_bad = int((finite > hi).sum())
                        op = ">"
                    if n_bad > 0:
                        errors.append(ValidateIssue(
                            field="response",
                            message=f"{label} family requires response in [0, {hi}]. Found {n_bad:,} values {op} {hi} (max={finite.max():.4g}).",
                            suggestion=f"For count data (successes/trials), divide by trials to get proportions.",
                        ))

            # Family-specific warnings
            if family in ("poisson", "quasipoisson", "negbinomial"):
                if not np.allclose(finite, np.round(finite)):
                    warnings.append(ValidateIssue(
                        field="response",
                        message=f"Response contains non-integer values for {label} family.",
                        suggestion="This may indicate overdispersed data. Consider Quasi-Poisson or Negative Binomial.",
                    ))

            if family in ("binomial", "quasibinomial"):
                uniq = np.unique(finite)
                if len(uniq) == 2 and not (set(uniq) <= {0.0, 1.0}):
                    warnings.append(ValidateIssue(
                        field="response",
                        message=f"Response has 2 unique values ({uniq[0]:.4g}, {uniq[1]:.4g}) but they are not 0 and 1.",
                        suggestion="Recode to 0/1 for binary classification.",
                    ))

    # --- Offset / exposure column ---
    if req.offset:
        if req.offset not in df.columns:
            errors.append(ValidateIssue(
                field="offset",
                message=f"Offset column '{req.offset}' not found in dataset.",
            ))
        else:
            o_series = df[req.offset]
            o_errs, o_warns, o_arr = _check_numeric_array(o_series, "offset", "Offset")
            errors.extend(o_errs)
            warnings.extend(o_warns)

            if o_arr is not None:
                family = req.family.lower()
                needs_positive = family in ("poisson", "quasipoisson", "gamma", "negbinomial", "tweedie")
                if needs_positive:
                    finite_o = o_arr[np.isfinite(o_arr)]
                    n_bad = int((finite_o <= 0).sum())
                    if n_bad > 0:
                        errors.append(ValidateIssue(
                            field="offset",
                            message=f"Exposure must be strictly positive for {_FAMILY_LABELS.get(family, family)} family with log link. Found {n_bad:,} values ≤ 0.",
                            suggestion="Exposure represents the denominator (e.g. time, population) and cannot be zero or negative.",
                        ))

    # --- Weights column ---
    if req.weights:
        if req.weights not in df.columns:
            errors.append(ValidateIssue(
                field="weights",
                message=f"Weights column '{req.weights}' not found in dataset.",
            ))
        else:
            w_series = df[req.weights]
            w_errs, w_warns, w_arr = _check_numeric_array(w_series, "weights", "Weights")
            errors.extend(w_errs)
            warnings.extend(w_warns)

            if w_arr is not None:
                finite_w = w_arr[np.isfinite(w_arr)]
                n_neg = int((finite_w < 0).sum())
                if n_neg > 0:
                    errors.append(ValidateIssue(
                        field="weights",
                        message=f"Weights contain {n_neg:,} negative values. Weights must be non-negative.",
                    ))
                if finite_w.sum() == 0:
                    errors.append(ValidateIssue(
                        field="weights",
                        message="Weights sum to zero. At least some observations must have positive weight.",
                    ))
                else:
                    pct_zero = (finite_w == 0).sum() / len(finite_w) * 100
                    if pct_zero > 50:
                        warnings.append(ValidateIssue(
                            field="weights",
                            message=f"{pct_zero:.0f}% of weights are zero. These observations will not contribute to the fit.",
                        ))

    log.info("[validate] result: %d errors, %d warnings", len(errors), len(warnings))
    for e in errors:
        log.warning("[validate] ERROR  field=%s  %s", e.field, e.message)
    for w in warnings:
        log.info("[validate] WARN   field=%s  %s", w.field, w.message)

    return ValidateResponse(errors=errors, warnings=warnings)
