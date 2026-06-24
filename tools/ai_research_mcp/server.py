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
