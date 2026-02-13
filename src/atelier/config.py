from pathlib import Path

ATELIER_HOME = Path.home() / ".atelier"
PROJECTS_DIR = ATELIER_HOME / "projects"
LOGS_DIR = ATELIER_HOME / "logs"
DB_PATH = ATELIER_HOME / "atelier.db"
MAX_UPLOAD_SIZE_MB = 500
SUPPORTED_FORMATS = {"csv", "parquet"}


def ensure_data_dir() -> None:
    """Create ~/.atelier/ and subdirectories if missing."""
    ATELIER_HOME.mkdir(exist_ok=True)
    PROJECTS_DIR.mkdir(exist_ok=True)
    LOGS_DIR.mkdir(exist_ok=True)
