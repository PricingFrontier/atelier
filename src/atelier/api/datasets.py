"""Dataset upload endpoint — accepts CSV/Parquet, stores file, returns column metadata."""

import logging
import uuid
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, UploadFile

from atelier.config import PROJECTS_DIR, SUPPORTED_FORMATS
from atelier.schemas import ColumnValuesRequest
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
