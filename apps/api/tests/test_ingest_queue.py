from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.routers.deps import require_profile_id
from app.services import job_queue


class IngestQueueEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[require_profile_id] = lambda: "user-123"
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.pop(require_profile_id, None)

    def test_instagram_ingest_creates_job_and_enqueues_video_task(self) -> None:
        with (
            patch(
                "app.routers.ingest.supabase_db.create_ingestion_job",
                return_value={"id": "00000000-0000-0000-0000-000000000123"},
            ) as create_job,
            patch(
                "app.routers.ingest.job_queue.enqueue_import_job",
                return_value="celery-task-1",
            ) as enqueue,
        ):
            response = self.client.post(
                "/ingest",
                json={"source_url": "https://www.instagram.com/reel/abc123/"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["job_id"], "00000000-0000-0000-0000-000000000123")
        create_job.assert_called_once()
        self.assertEqual(create_job.call_args.kwargs["user_id"], "user-123")
        provider_meta = create_job.call_args.kwargs["provider_meta"]
        self.assertEqual(provider_meta["source_type"], "instagram")
        self.assertEqual(
            provider_meta["instagram_reachability_check"],
            "deferred_to_apify",
        )
        enqueue.assert_called_once_with(
            job_id="00000000-0000-0000-0000-000000000123",
            source_url="https://www.instagram.com/reel/abc123/",
            media_type="video",
        )

    def test_tiktok_slideshow_ingest_enqueues_slideshow_task_without_oembed(self) -> None:
        with (
            patch(
                "app.routers.ingest.supabase_db.create_ingestion_job",
                return_value={"id": "00000000-0000-0000-0000-000000000456"},
            ) as create_job,
            patch(
                "app.routers.ingest.tiktok_url.verify_video_via_oembed",
            ) as verify_oembed,
            patch(
                "app.routers.ingest.job_queue.enqueue_import_job",
                return_value="celery-task-2",
            ) as enqueue,
        ):
            response = self.client.post(
                "/ingest",
                json={"source_url": "https://www.tiktok.com/@coach/photo/123"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        verify_oembed.assert_not_called()
        provider_meta = create_job.call_args.kwargs["provider_meta"]
        self.assertEqual(provider_meta["media_type"], "slideshow")
        self.assertEqual(provider_meta["oembed_skipped_reason"], "tiktok_slideshow")
        enqueue.assert_called_once_with(
            job_id="00000000-0000-0000-0000-000000000456",
            source_url="https://www.tiktok.com/@coach/photo/123",
            media_type="slideshow",
        )

    def test_enqueue_failure_marks_job_failed_and_returns_503(self) -> None:
        with (
            patch(
                "app.routers.ingest.supabase_db.create_ingestion_job",
                return_value={"id": "00000000-0000-0000-0000-000000000789"},
            ),
            patch(
                "app.routers.ingest.job_queue.enqueue_import_job",
                side_effect=job_queue.JobQueueError("broker down"),
            ),
            patch("app.routers.ingest.supabase_db.update_ingestion_job") as update_job,
        ):
            response = self.client.post(
                "/ingest",
                json={"source_url": "https://www.instagram.com/reel/abc123/"},
            )

        self.assertEqual(response.status_code, 503, response.text)
        update_job.assert_called_once_with(
            "00000000-0000-0000-0000-000000000789",
            status="failed",
            error="Import queue is unavailable. Please try again in a minute.",
        )


class JobQueueConfigTests(unittest.TestCase):
    def test_enqueue_requires_broker_url_before_importing_celery(self) -> None:
        with patch.dict("os.environ", {"CELERY_BROKER_URL": ""}):
            with self.assertRaises(job_queue.JobQueueNotConfiguredError):
                job_queue.enqueue_import_job(
                    job_id="job-1",
                    source_url="https://example.com/video",
                    media_type="video",
                )


if __name__ == "__main__":
    unittest.main()
