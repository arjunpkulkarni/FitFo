from __future__ import annotations

import importlib
import os
from typing import Literal


ImportMediaType = Literal["video", "slideshow"]


class JobQueueError(RuntimeError):
    pass


class JobQueueNotConfiguredError(JobQueueError):
    pass


def _broker_url() -> str | None:
    value = (os.environ.get("CELERY_BROKER_URL") or "").strip()
    return value or None


def enqueue_import_job(
    *,
    job_id: str,
    source_url: str,
    media_type: ImportMediaType,
) -> str:
    """Publish an import job to Celery and return the Celery task id.

    The mobile app tracks progress through Supabase, not Celery results, so
    enqueueing should fail quickly when Redis/Valkey is unavailable. A slow
    publish retry here would put the API back on the critical path.
    """
    if _broker_url() is None:
        raise JobQueueNotConfiguredError("CELERY_BROKER_URL is not configured")

    try:
        tasks = importlib.import_module("app.tasks")
    except ModuleNotFoundError as exc:
        if exc.name != "celery":
            raise
        raise JobQueueNotConfiguredError(
            "Celery is not installed. Install requirements.txt and restart the API."
        ) from exc

    task = (
        tasks.run_slideshow_job
        if media_type == "slideshow"
        else tasks.run_ingestion_job
    )

    try:
        result = task.apply_async(args=[job_id, source_url], retry=False)
    except Exception as exc:  # noqa: BLE001 - broker errors vary by transport
        raise JobQueueError("Import queue is unavailable") from exc

    task_id = getattr(result, "id", None)
    return str(task_id or "")
