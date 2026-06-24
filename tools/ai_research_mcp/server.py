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
