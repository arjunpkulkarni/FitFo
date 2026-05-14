import unittest

from app.services import supabase_db


class TestDetectProfileImagePayload(unittest.TestCase):
    def test_jpeg_png_webp(self) -> None:
        self.assertEqual(
            supabase_db.detect_profile_image_payload(b"\xff\xd8\xff" + b"\x00" * 32),
            "image/jpeg",
        )
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        self.assertEqual(supabase_db.detect_profile_image_payload(png), "image/png")
        webp = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 28
        self.assertEqual(supabase_db.detect_profile_image_payload(webp), "image/webp")

    def test_rejects_garbage(self) -> None:
        with self.assertRaises(ValueError):
            supabase_db.detect_profile_image_payload(b"not an image!!")
