import unittest

from fastapi import HTTPException

from app.routers.auth import _clean_instagram_handle


class InstagramHandleAuthTests(unittest.TestCase):
    def test_clean_instagram_handle_strips_at_and_whitespace(self) -> None:
        self.assertEqual(_clean_instagram_handle("  @FitFo.App  "), "fitfo.app")

    def test_clean_instagram_handle_rejects_too_long(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _clean_instagram_handle("a" * 31)

        self.assertEqual(raised.exception.status_code, 400)

    def test_clean_instagram_handle_rejects_invalid_characters(self) -> None:
        with self.assertRaises(HTTPException):
            _clean_instagram_handle("fitfo king")

    def test_clean_instagram_handle_rejects_edge_punctuation(self) -> None:
        for value in (".fitfo", "fitfo.", "_fitfo", "fitfo_"):
            with self.subTest(value=value):
                with self.assertRaises(HTTPException):
                    _clean_instagram_handle(value)


if __name__ == "__main__":
    unittest.main()
