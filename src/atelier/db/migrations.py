from atelier.db.engine import get_engine
from atelier.db.models import Base


async def ensure_schema() -> None:
    """Create all tables if they don't exist."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
