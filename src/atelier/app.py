from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from atelier.config import ensure_data_dir
from atelier.db.engine import enable_wal
from atelier.db.migrations import ensure_schema

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_data_dir()
    await ensure_schema()
    await enable_wal()
    yield


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

    app.include_router(datasets_router, prefix="/api")
    app.include_router(explore_router, prefix="/api")
    app.include_router(fit_router, prefix="/api")

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
        return FileResponse(STATIC_DIR / "index.html")

    return app
