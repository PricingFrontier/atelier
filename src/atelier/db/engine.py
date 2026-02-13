import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from atelier.config import DB_PATH

log = logging.getLogger(__name__)

_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        url = f"sqlite+aiosqlite:///{DB_PATH}"
        log.info("[db/engine] creating async engine  url=%s", url)
        _engine = create_async_engine(
            url,
            echo=False,
            connect_args={"check_same_thread": False},
        )
        log.debug("[db/engine] engine created successfully")
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        log.debug("[db/engine] creating session factory")
        _session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async session, auto-closes on exit."""
    log.debug("[db/engine] opening new async session")
    async with get_session_factory()() as session:
        yield session
    log.debug("[db/engine] async session closed")


async def enable_wal() -> None:
    """Enable WAL mode for concurrent reads during background fits."""
    log.info("[db/engine] enabling WAL journal mode")
    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        log.info("[db/engine] WAL mode enabled")
