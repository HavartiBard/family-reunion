import unittest
from unittest.mock import MagicMock, patch, call
import httpx

from server import PBClient, FACT_TYPES


class TestPBClientAuth(unittest.TestCase):
    @patch("httpx.request")
    def test_authenticates_on_first_get(self, mock_request):
        auth_resp = MagicMock(status_code=200)
        auth_resp.json.return_value = {"token": "tok123"}
        data_resp = MagicMock(status_code=200)
        data_resp.json.return_value = {"items": []}
        mock_request.side_effect = [auth_resp, data_resp]

        pb = PBClient("http://pb", "admin@example.com", "secret")
        result = pb.get("/api/collections/persons/records")

        self.assertEqual(result, {"items": []})
        first_call = mock_request.call_args_list[0]
        self.assertIn("/api/admins/auth-with-password", first_call[0][1])

    @patch("httpx.request")
    def test_retries_after_401(self, mock_request):
        auth_resp = MagicMock(status_code=200)
        auth_resp.json.return_value = {"token": "tok1"}
        stale_resp = MagicMock(status_code=401)
        reauth_resp = MagicMock(status_code=200)
        reauth_resp.json.return_value = {"token": "tok2"}
        ok_resp = MagicMock(status_code=200)
        ok_resp.json.return_value = {"items": ["x"]}
        mock_request.side_effect = [auth_resp, stale_resp, reauth_resp, ok_resp]

        pb = PBClient("http://pb", "a@b.com", "pw")
        result = pb.get("/api/collections/persons/records")

        self.assertEqual(result, {"items": ["x"]})

    @patch("httpx.request")
    def test_get_returns_none_on_404(self, mock_request):
        auth_resp = MagicMock(status_code=200)
        auth_resp.json.return_value = {"token": "tok"}
        not_found = MagicMock(status_code=404)
        mock_request.side_effect = [auth_resp, not_found]

        pb = PBClient("http://pb", "a@b.com", "pw")
        result = pb.get("/api/collections/persons/records/missing")

        self.assertIsNone(result)

    def test_fact_types_contains_expected_values(self):
        for v in ["birth", "death", "occupation", "immigration", "other"]:
            self.assertIn(v, FACT_TYPES)


if __name__ == "__main__":
    unittest.main()
