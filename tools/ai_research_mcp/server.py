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
