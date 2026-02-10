import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    n_versions: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)
    n_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    n_cols: Mapped[int | None] = mapped_column(Integer, nullable=True)
    columns: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    exploration_json: Mapped[str | None] = mapped_column(Text, nullable=True)


class Model(Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    dataset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("datasets.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    spec: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fit_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    coef_table_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    relativities_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnostics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    deviance: Mapped[float | None] = mapped_column(Float, nullable=True)
    null_deviance: Mapped[float | None] = mapped_column(Float, nullable=True)
    aic: Mapped[float | None] = mapped_column(Float, nullable=True)
    bic: Mapped[float | None] = mapped_column(Float, nullable=True)
    converged: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    iterations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    n_obs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    n_validation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    n_params: Mapped[int | None] = mapped_column(Integer, nullable=True)
    df_model: Mapped[float | None] = mapped_column(Float, nullable=True)
    df_resid: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    generated_code: Mapped[str | None] = mapped_column(Text, nullable=True)
