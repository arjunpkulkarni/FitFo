import asyncio

from app.celery_app import celery_app
from app.services import ingestion_pipeline, slideshow_pipeline


@celery_app.task(name="run_ingestion_job")
def run_ingestion_job(job_id: str, source_url: str):
    asyncio.run(
        ingestion_pipeline.run_ingestion_job(
            job_id,
            source_url,
        )
    )


@celery_app.task(name="run_slideshow_job")
def run_slideshow_job(job_id: str, source_url: str):
    asyncio.run(
        slideshow_pipeline.run_slideshow_job(
            job_id,
            source_url,
        )
    )


@celery_app.task(name="test_task")
def test_task(x, y):
    return x + y
