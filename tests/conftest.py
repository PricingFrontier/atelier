"""Shared test fixtures — realistic dataset, FastAPI test client, temp paths."""

import csv
import random
import tempfile
from pathlib import Path

import polars as pl
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from atelier.app import create_app


# ---------------------------------------------------------------------------
# Realistic fixture dataset (mimics French MTPL-style frequency data)
# ---------------------------------------------------------------------------

REGIONS = ["R11", "R24", "R31", "R52", "R82", "R93"]
AREAS = ["A", "B", "C", "D", "E", "F"]

def _make_rows(n: int = 200, seed: int = 42) -> list[dict]:
    """Generate n rows of realistic actuarial pricing data."""
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        exposure = round(rng.uniform(0.01, 1.0), 4)
        driv_age = rng.randint(18, 85)
        veh_age = rng.randint(0, 30)
        bonus_malus = rng.randint(50, 230)
        region = rng.choice(REGIONS)
        area = rng.choice(AREAS)
        # Poisson-like claim count: higher for young drivers, high BM
        base_rate = 0.05 + (0.02 if driv_age < 25 else 0) + (bonus_malus - 100) * 0.0002
        claim_nb = rng.choices([0, 1, 2], weights=[1 - base_rate, base_rate * 0.9, base_rate * 0.1])[0]
        # Split group: 1-5, mimicking train/validation/holdout
        group = str((i % 5) + 1)
        rows.append({
            "ClaimNb": claim_nb,
            "Exposure": exposure,
            "DrivAge": driv_age,
            "VehAge": veh_age,
            "BonusMalus": bonus_malus,
            "Region": region,
            "Area": area,
            "Group": group,
        })
    return rows


@pytest.fixture(scope="session")
def sample_rows() -> list[dict]:
    """Raw rows for the fixture dataset."""
    return _make_rows()


@pytest.fixture(scope="session")
def sample_df(sample_rows) -> pl.DataFrame:
    """Polars DataFrame of the fixture dataset."""
    return pl.DataFrame(sample_rows)


@pytest.fixture(scope="session")
def sample_csv_path(sample_rows) -> Path:
    """Write fixture data to a temporary CSV file. Persists for the session."""
    tmp = tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="")
    writer = csv.DictWriter(tmp, fieldnames=sample_rows[0].keys())
    writer.writeheader()
    writer.writerows(sample_rows)
    tmp.flush()
    tmp.close()
    path = Path(tmp.name)
    yield path
    path.unlink(missing_ok=True)


@pytest.fixture(scope="session")
def sample_parquet_path(sample_df) -> Path:
    """Write fixture data to a temporary Parquet file. Persists for the session."""
    tmp = tempfile.NamedTemporaryFile(suffix=".parquet", delete=False)
    tmp.close()
    path = Path(tmp.name)
    sample_df.write_parquet(path)
    yield path
    path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# FastAPI async test client
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    """Create the FastAPI app once per session."""
    return create_app()


@pytest_asyncio.fixture
async def client(app):
    """Async HTTP client wired to the FastAPI app (no real server needed)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
