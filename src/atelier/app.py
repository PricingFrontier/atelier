import logging
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from atelier.config import ensure_data_dir
from atelier.db.engine import enable_wal
from atelier.db.migrations import ensure_schema

log = logging.getLogger("atelier")

STATIC_DIR = Path(__file__).parent / "static"


def configure_logging(*, log_to_file: bool = True) -> None:
    """Set up structured logging for the entire atelier package and uvicorn.

    Args:
        log_to_file: If True (default), also write logs to
                     ~/.atelier/logs/atelier.log with rotation.
                     Pass False or use ``--no-log-file`` to disable.
    """
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler()
    console.setFormatter(fmt)

    handlers: list[logging.Handler] = [console]

    if log_to_file:
        log_path = Path.cwd() / "atelier.log"
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=5 * 1024 * 1024,  # 5 MB per file
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(fmt)
        handlers.append(file_handler)

    # Atelier logger (and all children like atelier.api.*, atelier.db.*, etc.)
    atelier_log = logging.getLogger("atelier")
    atelier_log.setLevel(logging.DEBUG)
    atelier_log.handlers.clear()
    for h in handlers:
        atelier_log.addHandler(h)
    atelier_log.propagate = False

    # Also format uvicorn's loggers consistently
    for uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(uv_name)
        uv_logger.handlers.clear()
        for h in handlers:
            uv_logger.addHandler(h)
        uv_logger.propagate = False

    if log_to_file:
        log.info("Logging initialised (level=DEBUG, file=%s)", Path.cwd() / "atelier.log")
    else:
        log.info("Logging initialised (level=DEBUG, file=disabled)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Atelier lifespan — ensuring data dirs, schema, and WAL mode")
    ensure_data_dir()
    log.info("Data directories ready")
    await ensure_schema()
    log.info("Database schema up-to-date")
    await enable_wal()
    log.info("WAL mode enabled — startup complete")
    yield
    log.info("Atelier shutting down")


def create_app() -> FastAPI:
    app = FastAPI(title="Atelier", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- API routers ---
    from atelier.api.datasets import router as datasets_router
    from atelier.api.explore import router as explore_router
    from atelier.api.fit import router as fit_router
    from atelier.api.models import router as models_router
    from atelier.api.projects import router as projects_router

    app.include_router(datasets_router, prefix="/api")
    app.include_router(explore_router, prefix="/api")
    app.include_router(fit_router, prefix="/api")
    app.include_router(models_router, prefix="/api")
    app.include_router(projects_router, prefix="/api")

    # --- WebSocket router will be registered here ---
    # app.include_router(ws.router, prefix="/ws")

    # Static assets (JS/CSS bundles)
    if (STATIC_DIR / "assets").is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=STATIC_DIR / "assets"),
            name="assets",
        )

    # SPA catch-all — must be registered last
    @app.get("/{full_path:path}")
    async def spa_catch_all(full_path: str):
        return FileResponse(
            STATIC_DIR / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    return app
