import unittest
from unittest.mock import MagicMock, patch, call
import httpx

from server import PBClient, FACT_TYPES, _list_persons, _search_persons, _get_person, _add_fact


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


class TestGetPerson(unittest.TestCase):
    def _make_pb(self, person=None, children=None, couples=None, facts=None):
        pb = MagicMock(spec=PBClient)
        # Calls in order: get_person record, children, couples, facts
        pb.get.side_effect = [
            person,
            {"items": children or []},
            {"items": couples or []},
            {"items": facts or []},
        ]
        return pb

    def test_not_found_returns_error(self):
        pb = MagicMock(spec=PBClient)
        pb.get.return_value = None
        result = _get_person(pb, "missing")
        self.assertEqual(result["error"], "person not found")
        self.assertEqual(result["id"], "missing")

    def test_returns_core_identity_fields(self):
        person_record = {
            "id": "p1", "display_name": "Harold Klassen",
            "given_name": "Harold", "middle_name": "James",
            "family_name": "Klassen", "birth_surname": None,
            "gender": "male", "birth_date": "1947-03-12",
            "death_date": None, "living": True, "bio": "Farmer.",
            "expand": {},
        }
        pb = self._make_pb(person=person_record)
        result = _get_person(pb, "p1")
        self.assertEqual(result["id"], "p1")
        self.assertEqual(result["given_name"], "Harold")
        self.assertEqual(result["birth_date"], "1947-03-12")
        self.assertEqual(result["bio"], "Farmer.")

    def test_resolves_parents_from_expand(self):
        person_record = {
            "id": "p1", "display_name": "Harold Klassen",
            "given_name": "Harold", "middle_name": None,
            "family_name": "Klassen", "birth_surname": None,
            "gender": "male", "birth_date": "1947", "death_date": None,
            "living": True, "bio": None,
            "expand": {
                "father": {"id": "f1", "display_name": "John Klassen"},
                "mother": {"id": "m1", "display_name": "Mary Klassen"},
            },
        }
        pb = self._make_pb(person=person_record)
        result = _get_person(pb, "p1")
        relations = {r["relation"]: r for r in result["parents"]}
        self.assertEqual(relations["father"]["id"], "f1")
        self.assertEqual(relations["mother"]["display_name"], "Mary Klassen")

    def test_resolves_spouse_from_couples(self):
        person_record = {
            "id": "p1", "display_name": "Harold Klassen",
            "given_name": "Harold", "middle_name": None,
            "family_name": "Klassen", "birth_surname": None,
            "gender": "male", "birth_date": "1947", "death_date": None,
            "living": True, "bio": None, "expand": {},
        }
        couple = {
            "partner_a": "p1", "partner_b": "s1",
            "status": "married", "married_date": "1971",
            "expand": {
                "partner_a": {"id": "p1", "display_name": "Harold Klassen"},
                "partner_b": {"id": "s1", "display_name": "Dorothy Smith"},
            },
        }
        pb = self._make_pb(person=person_record, couples=[couple])
        result = _get_person(pb, "p1")
        self.assertEqual(len(result["spouses"]), 1)
        self.assertEqual(result["spouses"][0]["display_name"], "Dorothy Smith")
        self.assertEqual(result["spouses"][0]["status"], "married")

    def test_includes_facts_with_verification_flags(self):
        person_record = {
            "id": "p1", "display_name": "Harold Klassen",
            "given_name": "Harold", "middle_name": None,
            "family_name": "Klassen", "birth_surname": None,
            "gender": "male", "birth_date": "1947", "death_date": None,
            "living": True, "bio": None, "expand": {},
        }
        fact = {
            "fact_type": "occupation", "value": "Farmer",
            "date_text": "1970s", "place": "Manitoba",
            "description": None, "source": None,
            "verified": True, "ai_generated": False,
        }
        pb = self._make_pb(person=person_record, facts=[fact])
        result = _get_person(pb, "p1")
        self.assertEqual(len(result["facts"]), 1)
        self.assertTrue(result["facts"][0]["verified"])
        self.assertFalse(result["facts"][0]["ai_generated"])


class TestAddFact(unittest.TestCase):
    def test_happy_path_writes_with_ai_flags(self):
        pb = MagicMock(spec=PBClient)
        pb.post.return_value = {"id": "fact1"}

        result = _add_fact(pb, "p1", "occupation", "Farmer",
                           date_text="1970s", place="Manitoba")

        self.assertEqual(result["status"], "created")
        self.assertEqual(result["id"], "fact1")
        body = pb.post.call_args[0][1]
        self.assertTrue(body["ai_generated"])
        self.assertFalse(body["verified"])
        self.assertEqual(body["fact_type"], "occupation")
        self.assertEqual(body["value"], "Farmer")

    def test_rejects_invalid_fact_type(self):
        pb = MagicMock(spec=PBClient)
        result = _add_fact(pb, "p1", "not_a_real_type", "some value")
        self.assertIn("error", result)
        self.assertIn("valid_types", result)
        pb.post.assert_not_called()

    def test_extracts_sort_year_from_date_text(self):
        pb = MagicMock(spec=PBClient)
        pb.post.return_value = {"id": "fact2"}
        _add_fact(pb, "p1", "birth", "Born", date_text="March 1947")
        body = pb.post.call_args[0][1]
        self.assertEqual(body["sort_year"], 1947)

    def test_sort_year_none_when_no_year_in_date_text(self):
        pb = MagicMock(spec=PBClient)
        pb.post.return_value = {"id": "fact3"}
        _add_fact(pb, "p1", "note", "Something", date_text="spring")
        body = pb.post.call_args[0][1]
        self.assertIsNone(body["sort_year"])


if __name__ == "__main__":
    unittest.main()
