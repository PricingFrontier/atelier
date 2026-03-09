"""Tests for database schema creation and migrations."""

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from atelier.db.models import Base


@pytest_asyncio.fixture
async def fresh_engine(tmp_path):
    """Create a fresh SQLite engine with no tables."""
    db_path = tmp_path / "test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    yield engine
    await engine.dispose()


@pytest.mark.asyncio
class TestEnsureSchema:
    async def test_creates_tables(self, fresh_engine):
        async with fresh_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with fresh_engine.connect() as conn:
            result = await conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ))
            tables = {row[0] for row in result.fetchall()}
        assert "projects" in tables
        assert "models" in tables

    async def test_idempotent(self, fresh_engine):
        """Running create_all twice should not error."""
        async with fresh_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with fresh_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        # If we get here without error, it's idempotent
        async with fresh_engine.connect() as conn:
            result = await conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
            ))
            assert result.fetchone() is not None

    async def test_wal_mode(self, fresh_engine):
        async with fresh_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            result = await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        async with fresh_engine.connect() as conn:
            result = await conn.exec_driver_sql("PRAGMA journal_mode")
            mode = result.scalar()
        assert mode == "wal"
