import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import connect, disconnect, prisma
from .routers import stories, jobs, orders, payments, admin, uploads


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    # Auto-seed on first boot so a fresh database is immediately usable.
    try:
        count = await prisma.story.count()
        if count == 0:
            from .seed_data import STORIES

            for s in STORIES:
                await prisma.story.upsert(
                    where={"slug": s["slug"]},
                    data={"create": s, "update": s},
                )
    except Exception as e:  # pragma: no cover
        print(f"[startup] seed skipped: {e}")
    yield
    await disconnect()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Backend for KuttyStory — personalized AI storybooks.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stories.router)
app.include_router(jobs.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(admin.router)
app.include_router(uploads.router)

# Serve generated page images + print PDFs (composed by the worker into storage).
os.makedirs(settings.storage_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.storage_dir), name="uploads")


@app.get("/", tags=["meta"])
async def root():
    return {"name": settings.app_name, "status": "ok", "docs": "/docs"}


@app.get("/config", tags=["meta"])
async def public_config():
    """Public runtime config — the single source of truth for the frontend.
    Aligns the flip-book free-page count / paywall copy with the backend renderer
    (which only renders FREE_PREVIEW_PAGES preview pages)."""
    from .app_settings import face_outline_enabled

    return {
        "freePreviewPages": settings.free_preview_pages,
        "totalPages": settings.total_pages,
        "faceOutlineEnabled": face_outline_enabled(),
    }


@app.get("/health", tags=["meta"])
async def health():
    db_ok = prisma.is_connected()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "payments_live": settings.payments_live,
        "gpu_live": settings.gpu_live,
        "environment": settings.environment,
    }
