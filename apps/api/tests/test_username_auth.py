import unittest

from fastapi import HTTPException

from app.routers.auth import _clean_username


class UsernameAuthTests(unittest.TestCase):
    def test_clean_username_normalizes_case_and_whitespace(self) -> None:
        self.assertEqual(_clean_username("  FitFo_Lifter42  "), "fitfo_lifter42")

    def test_clean_username_rejects_too_short(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _clean_username("ab")

        self.assertEqual(raised.exception.status_code, 400)

    def test_clean_username_rejects_invalid_characters(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _clean_username("fitfo.king")

        self.assertEqual(raised.exception.status_code, 400)

    def test_clean_username_rejects_edge_underscores(self) -> None:
        for value in ("_fitfo", "fitfo_"):
            with self.subTest(value=value):
                with self.assertRaises(HTTPException):
                    _clean_username(value)


if __name__ == "__main__":
    unittest.main()
