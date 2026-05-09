from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import frame_ocr


class FrameOCRTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.original_env = os.environ.copy()

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.original_env)

    def test_sample_frames_returns_one_second_interval_frames(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "video.mp4"
            video_path.write_bytes(b"video")

            positions: list[str] = []

            def fake_run(cmd: list[str], **kwargs):
                if cmd[0] == "ffprobe":
                    return SimpleNamespace(returncode=0, stdout="12.0", stderr="")

                positions.append(cmd[3])
                out_path = Path(cmd[-1])
                out_path.write_bytes(f"frame-{len(positions)}".encode("utf-8"))
                return SimpleNamespace(returncode=0, stdout="", stderr="")

            with patch("app.services.frame_ocr.subprocess.run", side_effect=fake_run):
                frames = frame_ocr.sample_frames(video_path, count=3)

        self.assertEqual(positions, ["0.50", "1.50", "2.50"])
        self.assertEqual(
            frames,
            [b"frame-1", b"frame-2", b"frame-3"],
        )

    def test_sample_frames_returns_empty_when_ffprobe_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "video.mp4"
            video_path.write_bytes(b"video")

            with patch(
                "app.services.frame_ocr.subprocess.run",
                return_value=SimpleNamespace(returncode=1, stdout="", stderr="boom"),
            ):
                frames = frame_ocr.sample_frames(video_path, count=3)

        self.assertEqual(frames, [])

    def test_sample_frames_returns_empty_when_file_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "missing.mp4"
            self.assertEqual(frame_ocr.sample_frames(video_path, count=3), [])

    async def test_extract_on_screen_text_uses_openai(self) -> None:
        os.environ["ENABLE_FRAME_OCR"] = "1"
        os.environ["OPENAI_API_KEY"] = "openai-key"
        os.environ["OPENAI_VISION_MODEL"] = "gpt-4.1-mini"

        with patch(
            "app.services.frame_ocr._extract_with_provider",
            new=AsyncMock(return_value=("RDL 4x8", "gpt-4.1-mini")),
        ) as extract_mock:
            result = await frame_ocr.extract_on_screen_text([b"frame-1"])

        self.assertTrue(result.ok)
        self.assertEqual(result.text, "RDL 4x8")
        self.assertEqual(result.provider, "openai")
        self.assertEqual(result.model, "gpt-4.1-mini")
        self.assertFalse(result.fallback_used)
        self.assertEqual(extract_mock.await_args_list[0].args[0], "openai")

    async def test_extract_on_screen_text_returns_empty_when_disabled(self) -> None:
        os.environ["ENABLE_FRAME_OCR"] = "0"
        result = await frame_ocr.extract_on_screen_text([b"frame-1"])
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "disabled")
        self.assertEqual(result.text, "")

    async def test_extract_on_screen_text_returns_empty_when_all_providers_fail(self) -> None:
        os.environ["ENABLE_FRAME_OCR"] = "1"
        os.environ["OPENAI_API_KEY"] = "openai-key"

        with patch(
            "app.services.frame_ocr._extract_with_provider",
            side_effect=frame_ocr.FrameOCRError("provider down"),
        ):
            result = await frame_ocr.extract_on_screen_text([b"frame-1"])

        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "provider_error")
        self.assertIn("provider down", result.error or "")

    def test_build_user_content_uses_low_detail(self) -> None:
        content = frame_ocr._build_user_content([b"frame-bytes"])
        self.assertEqual(content[0]["type"], "text")
        image_entry = content[1]
        self.assertEqual(image_entry["type"], "image_url")
        self.assertEqual(image_entry["image_url"]["detail"], "low")
        self.assertTrue(
            image_entry["image_url"]["url"].startswith("data:image/jpeg;base64,")
        )

    def test_max_frames_from_env_clamps_invalid_values(self) -> None:
        os.environ["OCR_MAX_FRAMES"] = "not-a-number"
        self.assertEqual(frame_ocr._max_frames_from_env(), frame_ocr.DEFAULT_MAX_FRAMES)

        os.environ["OCR_MAX_FRAMES"] = "0"
        self.assertEqual(frame_ocr._max_frames_from_env(), 1)

        os.environ["OCR_MAX_FRAMES"] = "9999"
        self.assertEqual(frame_ocr._max_frames_from_env(), 80)

        os.environ["OCR_MAX_FRAMES"] = "8"
        self.assertEqual(frame_ocr._max_frames_from_env(), 8)

    def test_collect_ocr_frames_prefers_scene_change(self) -> None:
        scene_frames = [b"scene-1", b"scene-2", b"scene-3"]
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "video.mp4"
            video_path.write_bytes(b"video")
            with patch(
                "app.services.frame_ocr.sample_frames_by_scene_change",
                return_value=scene_frames,
            ) as scene_mock, patch(
                "app.services.frame_ocr.sample_frames",
            ) as even_mock:
                frames = frame_ocr.collect_ocr_frames(video_path, max_frames=20)

        self.assertEqual(frames, scene_frames)
        scene_mock.assert_called_once()
        even_mock.assert_not_called()

    def test_collect_ocr_frames_falls_back_to_even_sampling(self) -> None:
        even_frames = [b"even-1", b"even-2"]
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "video.mp4"
            video_path.write_bytes(b"video")
            with patch(
                "app.services.frame_ocr.sample_frames_by_scene_change",
                return_value=[],
            ), patch(
                "app.services.frame_ocr.sample_frames",
                return_value=even_frames,
            ) as even_mock:
                frames = frame_ocr.collect_ocr_frames(video_path, max_frames=15)

        self.assertEqual(frames, even_frames)
        even_mock.assert_called_once()
        # propagates the requested cap into the fallback sampler
        self.assertEqual(even_mock.call_args.kwargs.get("count"), 15)

    def test_collect_ocr_frames_caps_scene_results(self) -> None:
        scene_frames = [f"f{i}".encode() for i in range(40)]
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = Path(tmp_dir) / "video.mp4"
            video_path.write_bytes(b"video")
            with patch(
                "app.services.frame_ocr.sample_frames_by_scene_change",
                return_value=scene_frames,
            ):
                frames = frame_ocr.collect_ocr_frames(video_path, max_frames=10)

        self.assertEqual(len(frames), 10)
        self.assertEqual(frames, scene_frames[:10])
