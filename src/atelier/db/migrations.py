from sqlalchemy import text

from atelier.db.engine import get_engine
from atelier.db.models import Base


async def ensure_schema() -> None:
    """Create all tables if they don't exist, then add any missing columns."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
    async with engine.begin() as conn:
        for table, column, col_type in _COLUMN_MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                )
            except Exception:
                pass  # column already exists
