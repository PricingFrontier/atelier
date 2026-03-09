import logging

from sqlalchemy import text

from atelier.db.engine import get_engine
from atelier.db.models import Base

log = logging.getLogger(__name__)


async def ensure_schema() -> None:
    """Create all tables if they don't exist, then add any missing columns."""
    log.info("[migrations] ensuring schema (create_all)")
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("[migrations] base tables ensured")

    # Lightweight column migrations for SQLite (ALTER TABLE ADD COLUMN).
    # SAFETY: table/column/type values below are compile-time constants only.
    # Never use dynamic or user-supplied input here.
    _COLUMN_MIGRATIONS: list[tuple[str, str, str]] = [
        ("models", "df_model", "REAL"),
        ("models", "df_resid", "REAL"),
        ("models", "n_validation", "INTEGER"),
        ("models", "n_params", "INTEGER"),
        ("projects", "config", "JSON"),
        ("projects", "n_versions", "INTEGER DEFAULT 0"),
    ]
    log.info("[migrations] running %d column migrations", len(_COLUMN_MIGRATIONS))
    async with engine.begin() as conn:
        for table, column, col_type in _COLUMN_MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                )
                log.info("[migrations] added column %s.%s (%s)", table, column, col_type)
            except Exception:
                log.debug("[migrations] column %s.%s already exists", table, column)
    # Create unique index for concurrency safety on (project_id, version).
    _INDEX_MIGRATIONS: list[str] = [
        "CREATE UNIQUE INDEX IF NOT EXISTS uix_model_project_version ON models(project_id, version)",
    ]
    log.info("[migrations] running %d index migrations", len(_INDEX_MIGRATIONS))
    async with engine.begin() as conn:
        for ddl in _INDEX_MIGRATIONS:
            try:
                await conn.execute(text(ddl))
                log.info("[migrations] executed: %s", ddl)
            except Exception:
                log.debug("[migrations] index already exists or skipped: %s", ddl)
    log.info("[migrations] schema migration complete")
