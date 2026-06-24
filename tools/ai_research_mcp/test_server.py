import unittest
from unittest.mock import MagicMock, patch, call
import httpx

from server import PBClient, FACT_TYPES, _list_persons, _search_persons


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


class TestListPersons(unittest.TestCase):
    def _make_pb(self, persons_items, facts_items=None):
        pb = MagicMock(spec=PBClient)
        pb.get.side_effect = [
            {"items": persons_items},
            {"items": facts_items or []},
        ]
        return pb

    def test_returns_shaped_items(self):
        pb = self._make_pb([
            {"id": "p1", "display_name": "Alice Smith",
             "birth_date": "1950", "death_date": None, "living": True},
        ])
        result = _list_persons(pb, page=1, per_page=50, needs_research=False)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "p1")
        self.assertEqual(result[0]["display_name"], "Alice Smith")
        self.assertIn("needs_research", result[0])

    def test_needs_research_true_filters_out_researched(self):
        pb = self._make_pb(
            persons_items=[
                {"id": "p1", "display_name": "Alice", "birth_date": "1950", "death_date": None, "living": True},
                {"id": "p2", "display_name": "Bob",   "birth_date": "1960", "death_date": None, "living": True},
            ],
            facts_items=[{"person": "p1"}],  # p1 has a verified fact
        )
        result = _list_persons(pb, page=1, per_page=50, needs_research=True)
        ids = [r["id"] for r in result]
        self.assertNotIn("p1", ids)
        self.assertIn("p2", ids)

    def test_needs_research_flag_accurate_on_items(self):
        pb = self._make_pb(
            persons_items=[
                {"id": "p1", "display_name": "Alice", "birth_date": "1950", "death_date": None, "living": True},
                {"id": "p2", "display_name": "Bob",   "birth_date": "1960", "death_date": None, "living": True},
            ],
            facts_items=[{"person": "p1"}],
        )
        result = _list_persons(pb, page=1, per_page=50, needs_research=False)
        by_id = {r["id"]: r for r in result}
        self.assertFalse(by_id["p1"]["needs_research"])
        self.assertTrue(by_id["p2"]["needs_research"])


class TestSearchPersons(unittest.TestCase):
    def test_returns_matching_persons(self):
        pb = MagicMock(spec=PBClient)
        pb.get.side_effect = [
            {"items": [{"id": "p1", "display_name": "Harold Klassen",
                        "birth_date": "1947", "death_date": None, "living": True}]},
            {"items": []},  # _researched_person_ids
        ]
        result = _search_persons(pb, "Harold")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["display_name"], "Harold Klassen")

    def test_passes_query_in_filter(self):
        pb = MagicMock(spec=PBClient)
        pb.get.side_effect = [{"items": []}, {"items": []}]
        _search_persons(pb, "Smith")
        filter_arg = pb.get.call_args_list[0][1].get("filter", "")
        self.assertIn("Smith", filter_arg)


if __name__ == "__main__":
    unittest.main()
