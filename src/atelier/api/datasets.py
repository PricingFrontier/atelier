"""Dataset upload endpoint — accepts CSV/Parquet, stores file, returns column metadata."""

import uuid
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, UploadFile

from atelier.config import PROJECTS_DIR, SUPPORTED_FORMATS
from atelier.schemas import ColumnValuesRequest
from atelier.services.dataset_service import column_meta, load_dataframe, load_column

router = APIRouter(tags=["datasets"])

UPLOADS_DIR = PROJECTS_DIR / "_uploads"


@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile):
    """Upload a CSV or Parquet file. Returns dataset_id and column metadata."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(400, f"Unsupported format '.{ext}'. Use: {SUPPORTED_FORMATS}")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    dataset_id = str(uuid.uuid4())
    dest = UPLOADS_DIR / f"{dataset_id}.{ext}"

    content = await file.read()
    dest.write_bytes(content)

    try:
        df = load_dataframe(dest)
    except Exception:
        dest.unlink(missing_ok=True)
        raise

    columns = column_meta(df)

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
    series = load_column(Path(req.dataset_path), req.column)
    values = series.drop_nulls().unique().sort().to_list()[:200]
    return {"column": req.column, "values": [str(v) for v in values]}
