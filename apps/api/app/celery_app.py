import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()


def _env(name: str) -> str | None:
    value = (os.getenv(name) or "").strip()
    return value or None


_default_queue = (os.getenv("CELERY_TASK_DEFAULT_QUEUE") or "imports").strip() or "imports"

celery_app = Celery(
    "fitfo",
    broker=_env("CELERY_BROKER_URL"),
    backend=_env("CELERY_RESULT_BACKEND"),
    include=["app.tasks"],
)

celery_app.conf.update(
    task_default_queue=_default_queue,
    task_routes={
        "run_ingestion_job": {"queue": _default_queue},
        "run_slideshow_job": {"queue": _default_queue},
    },
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_ignore_result=_env("CELERY_RESULT_BACKEND") is None,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    broker_connection_timeout=5,
)
