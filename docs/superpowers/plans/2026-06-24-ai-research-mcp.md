# AI Research MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a containerised MCP server that lets an AI agent list, search, and fetch family tree persons from PocketBase, then write research findings back as unverified facts.

**Architecture:** Python FastMCP server (HTTP/SSE transport) in `tools/ai_research_mcp/`. Business logic is extracted into plain functions that accept a `PBClient` instance, keeping them unit-testable without MCP or network. Tool decorators are thin wrappers over those functions.

**Tech Stack:** Python 3.12, `mcp[cli]>=1.0.0`, `httpx>=0.27.0`, PocketBase admin API, Docker.

## Global Constraints

- All AI-written facts: `ai_generated=True, verified=False` — never override this
- PocketBase admin auth via env vars `PB_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`
- SSE listen port from `PORT` env var, default `8765`
- Tests use `unittest.mock` — no live network calls, no pytest required (use `python -m unittest`)
- Follow `tools/gedcom_sync/` file and test layout conventions
- No new dependencies beyond `mcp[cli]` and `httpx`

---

## File Map

| File | Role |
|---|---|
| `backend/pb_migrations/1718500017_add_fact_verification.js` | Adds `ai_generated` + `verified` bools to `person_facts` |
| `tools/ai_research_mcp/requirements.txt` | Python deps |
| `tools/ai_research_mcp/server.py` | PBClient, business logic functions, MCP tool wiring |
| `tools/ai_research_mcp/test_server.py` | Unit tests (mocked PBClient) |
| `tools/ai_research_mcp/Dockerfile` | Container image |
| `tools/ai_research_mcp/compose.yml` | Unraid deployment |

---

### Task 1: Migration — add verification fields to person_facts

**Files:**
- Create: `backend/pb_migrations/1718500017_add_fact_verification.js`

**Interfaces:**
- Produces: `person_facts` collection gains `ai_generated` (bool, default false) and `verified` (bool, default false) fields, visible to all later tasks

- [ ] **Step 1: Write the migration**

```javascript
// backend/pb_migrations/1718500017_add_fact_verification.js
/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("person_facts");

  collection.schema.addField(new SchemaField({
    name: "ai_generated",
    type: "bool",
    options: { noInit: false },
  }));
  collection.schema.addField(new SchemaField({
    name: "verified",
    type: "bool",
    options: { noInit: false },
  }));

  return dao.saveCollection(collection);
}, (db) => {
  // PocketBase renames removed fields to __pb_old_* — no clean rollback
});
```

- [ ] **Step 2: Verify migration filename is next in sequence**

```bash
ls backend/pb_migrations/ | sort | tail -3
```

Expected: last file is `1718500016_add_trees.js`, confirming `1718500017_...` is correct.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/1718500017_add_fact_verification.js
git commit -m "feat(migrations): add ai_generated and verified fields to person_facts"
```

---

### Task 2: Scaffold — requirements, PBClient, test harness

**Files:**
- Create: `tools/ai_research_mcp/requirements.txt`
- Create: `tools/ai_research_mcp/server.py` (PBClient + FACT_TYPES only)
- Create: `tools/ai_research_mcp/test_server.py` (PBClient tests)

**Interfaces:**
- Produces: `PBClient(base_url, admin_email, admin_password)` with `.get(path, **params) -> dict | None` and `.post(path, body) -> dict`
- Produces: `FACT_TYPES: list[str]` constant

- [ ] **Step 1: Write requirements.txt**

```
# tools/ai_research_mcp/requirements.txt
mcp[cli]>=1.0.0
httpx>=0.27.0
```

- [ ] **Step 2: Write failing tests for PBClient**

```python
# tools/ai_research_mcp/test_server.py
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestPBClientAuth -v
```

Expected: `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 4: Install dependencies**

```bash
pip install -r tools/ai_research_mcp/requirements.txt
```

- [ ] **Step 5: Write server.py — PBClient and FACT_TYPES**

```python
# tools/ai_research_mcp/server.py
"""AI Research MCP server — exposes family tree person data to AI agents."""

import os
import re
import httpx
from mcp.server.fastmcp import FastMCP

# ── Constants ────────────────────────────────────────────────────────────────

FACT_TYPES = [
    "birth", "death", "burial", "cremation",
    "baptism", "christening", "christening_adult", "bar_mitzvah", "bat_mitzvah",
    "confirmation", "first_communion", "blessing", "ordination",
    "adoption", "immigration", "emigration", "naturalization", "military",
    "graduation", "retirement", "census", "will", "probate", "residence", "property",
    "marriage", "divorce", "engagement", "annulment",
    "occupation", "education", "religion", "nationality", "title",
    "physical_description", "medical", "ssn", "national_id",
    "address", "website", "email", "phone", "note", "other",
]


# ── PocketBase client ────────────────────────────────────────────────────────

class PBClient:
    def __init__(self, base_url: str, admin_email: str, admin_password: str):
        self._base = base_url.rstrip("/")
        self._email = admin_email
        self._password = admin_password
        self._token: str | None = None

    def _authenticate(self) -> None:
        r = httpx.request(
            "POST",
            f"{self._base}/api/admins/auth-with-password",
            json={"identity": self._email, "password": self._password},
            timeout=10,
        )
        r.raise_for_status()
        self._token = r.json()["token"]

    def _request(self, method: str, path: str, **kwargs) -> dict | None:
        if not self._token:
            self._authenticate()
        url = f"{self._base}{path}"
        r = httpx.request(method, url, headers={"Authorization": self._token}, **kwargs)
        if r.status_code == 401:
            self._authenticate()
            r = httpx.request(method, url, headers={"Authorization": self._token}, **kwargs)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def get(self, path: str, **params) -> dict | None:
        return self._request("GET", path, params=params, timeout=10)

    def post(self, path: str, body: dict) -> dict:
        return self._request("POST", path, json=body, timeout=10)
```

- [ ] **Step 6: Run tests — confirm they pass**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestPBClientAuth -v
```

Expected: 4 tests, 0 failures

- [ ] **Step 7: Commit**

```bash
git add tools/ai_research_mcp/requirements.txt tools/ai_research_mcp/server.py tools/ai_research_mcp/test_server.py
git commit -m "feat(mcp): scaffold AI research MCP server with PBClient"
```

---

### Task 3: list_persons and search_persons

**Files:**
- Modify: `tools/ai_research_mcp/server.py` — add `_researched_person_ids`, `_shape_person_list_item`, `_list_persons`, `_search_persons`
- Modify: `tools/ai_research_mcp/test_server.py` — add `TestListPersons`, `TestSearchPersons`

**Interfaces:**
- Consumes: `PBClient.get(path, **params) -> dict | None`
- Produces: `_list_persons(pb, page, per_page, needs_research) -> list[dict]`
- Produces: `_search_persons(pb, query) -> list[dict]`
- Each item shape: `{id, display_name, birth_date, death_date, living, needs_research}`

- [ ] **Step 1: Write failing tests**

Append to `test_server.py`:

```python
from server import _list_persons, _search_persons


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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestListPersons test_server.TestSearchPersons -v
```

Expected: `ImportError` or `AttributeError: module 'server' has no attribute '_list_persons'`

- [ ] **Step 3: Add business logic to server.py**

Add after the `PBClient` class:

```python
# ── Shared helpers ───────────────────────────────────────────────────────────

def _researched_person_ids(pb: PBClient) -> set:
    """Return person IDs that have at least one verified fact."""
    resp = pb.get(
        "/api/collections/person_facts/records",
        filter="(verified=true)",
        fields="person",
        perPage=500,
    )
    return {item["person"] for item in (resp or {}).get("items", [])}


def _shape_list_item(p: dict, researched_ids: set) -> dict:
    return {
        "id": p["id"],
        "display_name": p.get("display_name"),
        "birth_date": p.get("birth_date"),
        "death_date": p.get("death_date"),
        "living": p.get("living"),
        "needs_research": p["id"] not in researched_ids,
    }


# ── Tool implementations ─────────────────────────────────────────────────────

def _list_persons(pb: PBClient, page: int = 1, per_page: int = 50,
                  needs_research: bool = False) -> list:
    resp = pb.get(
        "/api/collections/persons/records",
        page=page,
        perPage=per_page,
        sort="family_name,given_name",
    )
    researched_ids = _researched_person_ids(pb)
    items = [_shape_list_item(p, researched_ids) for p in (resp or {}).get("items", [])]
    if needs_research:
        items = [i for i in items if i["needs_research"]]
    return items


def _search_persons(pb: PBClient, query: str) -> list:
    q = query.replace("'", "\\'")
    filter_str = (
        f"(display_name~'{q}'||given_name~'{q}'"
        f"||family_name~'{q}'||birth_surname~'{q}')"
    )
    resp = pb.get(
        "/api/collections/persons/records",
        filter=filter_str,
        perPage=50,
        sort="family_name,given_name",
    )
    researched_ids = _researched_person_ids(pb)
    return [_shape_list_item(p, researched_ids) for p in (resp or {}).get("items", [])]
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestListPersons test_server.TestSearchPersons -v
```

Expected: 5 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add tools/ai_research_mcp/server.py tools/ai_research_mcp/test_server.py
git commit -m "feat(mcp): add list_persons and search_persons business logic"
```

---

### Task 4: get_person

**Files:**
- Modify: `tools/ai_research_mcp/server.py` — add `_get_person`
- Modify: `tools/ai_research_mcp/test_server.py` — add `TestGetPerson`

**Interfaces:**
- Consumes: `PBClient.get(path, **params) -> dict | None`
- Produces: `_get_person(pb, person_id) -> dict` — full research payload per spec, or `{"error": "person not found", "id": ...}`

- [ ] **Step 1: Write failing tests**

Append to `test_server.py`:

```python
from server import _get_person


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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestGetPerson -v
```

Expected: `ImportError` or `AttributeError: module 'server' has no attribute '_get_person'`

- [ ] **Step 3: Add _get_person to server.py**

Add after `_search_persons`:

```python
def _get_person(pb: PBClient, person_id: str) -> dict:
    person = pb.get(
        f"/api/collections/persons/records/{person_id}",
        expand="father,mother",
    )
    if person is None:
        return {"error": "person not found", "id": person_id}

    children_resp = pb.get(
        "/api/collections/persons/records",
        filter=f"(father='{person_id}'||mother='{person_id}')",
        perPage=200,
        fields="id,display_name",
    )
    couples_resp = pb.get(
        "/api/collections/couples/records",
        filter=f"(partner_a='{person_id}'||partner_b='{person_id}')",
        expand="partner_a,partner_b",
        perPage=50,
    )
    facts_resp = pb.get(
        "/api/collections/person_facts/records",
        filter=f"(person='{person_id}')",
        perPage=500,
        sort="sort_year",
    )

    expand = person.get("expand") or {}
    parents = []
    if expand.get("father"):
        f = expand["father"]
        parents.append({"id": f["id"], "display_name": f["display_name"], "relation": "father"})
    if expand.get("mother"):
        m = expand["mother"]
        parents.append({"id": m["id"], "display_name": m["display_name"], "relation": "mother"})

    children = [
        {"id": c["id"], "display_name": c["display_name"]}
        for c in (children_resp or {}).get("items", [])
    ]

    spouses = []
    for couple in (couples_resp or {}).get("items", []):
        ce = couple.get("expand") or {}
        if couple.get("partner_a") == person_id:
            partner = ce.get("partner_b")
        else:
            partner = ce.get("partner_a")
        if partner:
            spouses.append({
                "id": partner["id"],
                "display_name": partner["display_name"],
                "status": couple.get("status"),
                "married_date": couple.get("married_date"),
            })

    facts = [
        {
            "fact_type": f.get("fact_type"),
            "value": f.get("value"),
            "date_text": f.get("date_text"),
            "place": f.get("place"),
            "description": f.get("description"),
            "source": f.get("source"),
            "verified": f.get("verified", False),
            "ai_generated": f.get("ai_generated", False),
        }
        for f in (facts_resp or {}).get("items", [])
    ]

    return {
        "id": person["id"],
        "display_name": person.get("display_name"),
        "given_name": person.get("given_name"),
        "middle_name": person.get("middle_name"),
        "family_name": person.get("family_name"),
        "birth_surname": person.get("birth_surname"),
        "gender": person.get("gender"),
        "birth_date": person.get("birth_date"),
        "death_date": person.get("death_date"),
        "living": person.get("living"),
        "bio": person.get("bio"),
        "parents": parents,
        "children": children,
        "spouses": spouses,
        "facts": facts,
    }
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestGetPerson -v
```

Expected: 5 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add tools/ai_research_mcp/server.py tools/ai_research_mcp/test_server.py
git commit -m "feat(mcp): add get_person with relation resolution"
```

---

### Task 5: add_fact

**Files:**
- Modify: `tools/ai_research_mcp/server.py` — add `_extract_sort_year`, `_add_fact`
- Modify: `tools/ai_research_mcp/test_server.py` — add `TestAddFact`

**Interfaces:**
- Consumes: `PBClient.post(path, body) -> dict`, `FACT_TYPES: list[str]`
- Produces: `_add_fact(pb, person_id, fact_type, value, date_text, place, description, source) -> dict`
- On success: `{"id": "...", "person": "...", "fact_type": "...", "status": "created"}`
- On invalid fact_type: `{"error": "...", "valid_types": [...]}`

- [ ] **Step 1: Write failing tests**

Append to `test_server.py`:

```python
from server import _add_fact


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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestAddFact -v
```

Expected: `ImportError` or `AttributeError: module 'server' has no attribute '_add_fact'`

- [ ] **Step 3: Add _extract_sort_year and _add_fact to server.py**

Add after `_get_person`:

```python
def _extract_sort_year(date_text: str) -> int | None:
    m = re.search(r'\b(\d{4})\b', date_text or "")
    return int(m.group(1)) if m else None


def _add_fact(pb: PBClient, person_id: str, fact_type: str, value: str,
              date_text: str = "", place: str = "",
              description: str = "", source: str = "") -> dict:
    if fact_type not in FACT_TYPES:
        return {
            "error": f"Invalid fact_type '{fact_type}'.",
            "valid_types": FACT_TYPES,
        }
    body = {
        "person": person_id,
        "fact_type": fact_type,
        "value": value,
        "date_text": date_text,
        "sort_year": _extract_sort_year(date_text),
        "place": place,
        "description": description,
        "source": source,
        "ai_generated": True,
        "verified": False,
    }
    result = pb.post("/api/collections/person_facts/records", body)
    return {"id": result["id"], "person": person_id, "fact_type": fact_type, "status": "created"}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd tools/ai_research_mcp
python -m unittest test_server.TestAddFact -v
```

Expected: 4 tests, 0 failures

- [ ] **Step 5: Run full test suite**

```bash
cd tools/ai_research_mcp
python -m unittest -v
```

Expected: all tests pass (12+ tests, 0 failures)

- [ ] **Step 6: Commit**

```bash
git add tools/ai_research_mcp/server.py tools/ai_research_mcp/test_server.py
git commit -m "feat(mcp): add add_fact with validation and sort_year extraction"
```

---

### Task 6: MCP server wiring and smoke test

**Files:**
- Modify: `tools/ai_research_mcp/server.py` — add FastMCP setup, tool decorators, `main()`

**Interfaces:**
- Consumes: `_list_persons`, `_search_persons`, `_get_person`, `_add_fact`
- Produces: running MCP SSE server at `http://0.0.0.0:{PORT}/sse`

- [ ] **Step 1: Add MCP wiring to the bottom of server.py**

```python
# ── MCP server ───────────────────────────────────────────────────────────────

mcp = FastMCP("Family Research")
_pb_client: PBClient | None = None


def _pb() -> PBClient:
    global _pb_client
    if _pb_client is None:
        _pb_client = PBClient(
            base_url=os.environ["PB_URL"],
            admin_email=os.environ["PB_ADMIN_EMAIL"],
            admin_password=os.environ["PB_ADMIN_PASSWORD"],
        )
    return _pb_client


@mcp.tool()
def list_persons(page: int = 1, per_page: int = 50, needs_research: bool = False) -> list:
    """List persons. Set needs_research=true to get only those with no verified facts."""
    return _list_persons(_pb(), page, per_page, needs_research)


@mcp.tool()
def get_person(id: str) -> dict:
    """Get full research profile: identity, relationships, known facts, bio."""
    return _get_person(_pb(), id)


@mcp.tool()
def search_persons(query: str) -> list:
    """Search persons by name (display_name, given_name, family_name, birth_surname)."""
    return _search_persons(_pb(), query)


@mcp.tool()
def add_fact(person_id: str, fact_type: str, value: str,
             date_text: str = "", place: str = "",
             description: str = "", source: str = "") -> dict:
    """Write a research finding as an unverified AI fact. Always flagged for human review."""
    return _add_fact(_pb(), person_id, fact_type, value, date_text, place, description, source)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    mcp.settings.port = port
    mcp.settings.host = "0.0.0.0"
    mcp.run(transport="sse")
```

- [ ] **Step 2: Verify all tests still pass**

```bash
cd tools/ai_research_mcp
python -m unittest -v
```

Expected: all tests pass, 0 failures

- [ ] **Step 3: Smoke test the server locally**

```bash
export PB_URL=https://reunion-api.klsll.com
export PB_ADMIN_EMAIL=<your-admin-email>
export PB_ADMIN_PASSWORD=<your-admin-password>
cd tools/ai_research_mcp
python server.py
```

Expected output: server starts, logs SSE endpoint at `http://0.0.0.0:8765`

In a second terminal, verify the SSE endpoint responds:
```bash
curl -N http://localhost:8765/sse
```

Expected: SSE stream opens (you see `event:` lines or an open connection)

- [ ] **Step 4: Commit**

```bash
git add tools/ai_research_mcp/server.py
git commit -m "feat(mcp): wire MCP tools and SSE transport"
```

---

### Task 7: Dockerfile and compose.yml

**Files:**
- Create: `tools/ai_research_mcp/Dockerfile`
- Create: `tools/ai_research_mcp/compose.yml`

**Interfaces:**
- Produces: `docker compose up` starts the MCP server on `PORT` (default 8765)

- [ ] **Step 1: Write Dockerfile**

```dockerfile
# tools/ai_research_mcp/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
EXPOSE 8765
CMD ["python", "server.py"]
```

- [ ] **Step 2: Write compose.yml**

```yaml
# tools/ai_research_mcp/compose.yml
services:
  ai-research-mcp:
    build: .
    ports:
      - "${PORT:-8765}:${PORT:-8765}"
    environment:
      PB_URL: ${PB_URL}
      PB_ADMIN_EMAIL: ${PB_ADMIN_EMAIL}
      PB_ADMIN_PASSWORD: ${PB_ADMIN_PASSWORD}
      PORT: ${PORT:-8765}
    restart: unless-stopped
```

- [ ] **Step 3: Build and run the container**

```bash
cd tools/ai_research_mcp
PB_URL=https://reunion-api.klsll.com \
PB_ADMIN_EMAIL=<admin-email> \
PB_ADMIN_PASSWORD=<admin-password> \
docker compose up --build
```

Expected: container builds and server starts, logs show SSE listening on port 8765

- [ ] **Step 4: Verify from host**

```bash
curl -N http://localhost:8765/sse
```

Expected: SSE stream opens

- [ ] **Step 5: Add Claude Desktop config comment to compose.yml**

Add to the top of `compose.yml` above `services:`:

```yaml
# Claude Desktop connection: http://<unraid-ip>:8765/sse
# Add to claude_desktop_config.json:
#   "mcpServers": {
#     "family-research": { "url": "http://<unraid-ip>:8765/sse" }
#   }
```

- [ ] **Step 6: Commit**

```bash
git add tools/ai_research_mcp/Dockerfile tools/ai_research_mcp/compose.yml
git commit -m "feat(mcp): add Dockerfile and compose.yml for Unraid deployment"
```
