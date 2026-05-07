from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env before importing app code that reads os.environ.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    admin_corpus,
    auth,
    body_weight,
    chat,
    completed_workouts,
    ingest,
    jobs,
    saved_workouts,
    scheduled_workouts,
    webhooks,
)
from app.services import notification_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Trial / conversion push notifications run in-process via APScheduler.
    # Single API instance today; if you scale to >1 worker, add a DB-backed
    # advisory lock around fire_* or move to Celery beat — schema unchanged.
    notification_scheduler.start_scheduler()
    try:
        yield
    finally:
        notification_scheduler.shutdown_scheduler()


app = FastAPI(title="LiftSync API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(saved_workouts.router)
app.include_router(completed_workouts.router)
app.include_router(body_weight.router)
app.include_router(scheduled_workouts.router)
app.include_router(admin_corpus.router)
app.include_router(chat.router)
app.include_router(webhooks.router)


@app.get("/health")
def health():
    return {"status": "ok"}
