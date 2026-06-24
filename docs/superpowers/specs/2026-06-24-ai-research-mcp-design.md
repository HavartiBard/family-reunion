# AI Research MCP Server — Design Spec

**Date:** 2026-06-24
**Branch:** feat/api-endpoints

## Overview

A local MCP (Model Context Protocol) server that exposes family tree person data to an AI agent for genealogical research. The agent reads person profiles, discovers life milestones and relatives, and writes findings back as unverified facts for human review.

## Architecture

```
Claude (local) ──SSE──► MCP Server (Unraid container, port 8765)
                              │
                         PocketBase admin API
                              │
                         reunion-api.klsll.com
```

- Python MCP server using the `mcp` SDK, HTTP/SSE transport
- Authenticates to PocketBase using admin credentials (`PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`)
- Lives in `tools/ai_research_mcp/` alongside `gedcom_sync`, `photos_sync`
- All AI-written facts are flagged `ai_generated=true, verified=false`; human approves in the SPA (review UI is out of scope)

## Migration

**File:** `backend/pb_migrations/1718500017_add_fact_verification.js`

Adds two boolean fields to `person_facts`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `ai_generated` | bool | false | Marks facts written by the AI agent |
| `verified` | bool | false | Human approval gate — unverified facts are hidden or flagged in the SPA |

Existing facts get both as `false` (human-entered, pending confirmation).

## MCP Tools

### `list_persons(page?, per_page?, needs_research?)`

Returns a paginated list of persons. When `needs_research=true`, filters to persons with zero verified facts — the research queue.

Response shape (per item):
```json
{
  "id": "abc123",
  "display_name": "Harold James Klassen",
  "birth_date": "1947-03-12",
  "death_date": null,
  "living": true,
  "needs_research": true
}
```

### `get_person(id)`

Full research payload for one person. Resolves all relations server-side (returns names, not raw IDs).

Response shape:
```json
{
  "id": "abc123",
  "display_name": "Harold James Klassen",
  "given_name": "Harold",
  "middle_name": "James",
  "family_name": "Klassen",
  "birth_surname": null,
  "gender": "male",
  "birth_date": "1947-03-12",
  "death_date": null,
  "living": true,
  "bio": "Harold grew up in...",
  "parents": [
    {"id": "p1", "display_name": "John Klassen", "relation": "father"},
    {"id": "p2", "display_name": "Mary Klassen", "relation": "mother"}
  ],
  "children": [
    {"id": "c1", "display_name": "Susan Klassen"}
  ],
  "spouses": [
    {"id": "s1", "display_name": "Dorothy Smith", "status": "married", "married_date": "1971"}
  ],
  "facts": [
    {
      "fact_type": "occupation",
      "value": "Farmer",
      "date_text": "1970s",
      "place": "Manitoba",
      "description": null,
      "source": null,
      "verified": true,
      "ai_generated": false
    }
  ]
}
```

### `search_persons(query)`

Name search across `display_name`, `given_name`, `family_name`, `birth_surname`. Returns the same shape as `list_persons`.

### `add_fact(person_id, fact_type, value, date_text?, place?, description?, source?)`

Writes a fact to `person_facts` with `ai_generated=true, verified=false`. `fact_type` is validated against the existing enum before writing — invalid types return an error listing valid values.

Valid fact types: `birth`, `death`, `burial`, `cremation`, `baptism`, `christening`, `christening_adult`, `bar_mitzvah`, `bat_mitzvah`, `confirmation`, `first_communion`, `blessing`, `ordination`, `adoption`, `immigration`, `emigration`, `naturalization`, `military`, `graduation`, `retirement`, `census`, `will`, `probate`, `residence`, `property`, `marriage`, `divorce`, `engagement`, `annulment`, `occupation`, `education`, `religion`, `nationality`, `title`, `physical_description`, `medical`, `ssn`, `national_id`, `address`, `website`, `email`, `phone`, `note`, `other`

## File Layout

```
tools/ai_research_mcp/
├── server.py          # MCP server — tool definitions, PocketBase client, relation resolver
├── Dockerfile         # python:3.12-slim, exposes PORT (default 8765)
├── compose.yml        # Unraid deployment
├── requirements.txt   # mcp[cli], httpx
└── test_server.py     # unit tests with mocked PocketBase HTTP calls
```

## Configuration

| Env var | Required | Description |
|---|---|---|
| `PB_URL` | yes | PocketBase base URL (`https://reunion-api.klsll.com`) |
| `PB_ADMIN_EMAIL` | yes | Admin account email |
| `PB_ADMIN_PASSWORD` | yes | Admin account password |
| `PORT` | no | SSE listen port (default `8765`) |

Claude Desktop connection: `http://unraid-ip:8765/sse`

## Error Handling

| Scenario | Behaviour |
|---|---|
| PocketBase auth failure on startup | Log error, exit with non-zero code |
| PocketBase request failure mid-session | Tool returns structured error message; server stays up |
| `get_person` — id not found | Returns `{"error": "person not found", "id": "..."}` |
| `add_fact` — invalid `fact_type` | Returns error with list of valid types; no write occurs |
| Living person privacy | No additional restriction at MCP layer (admin-authed); privacy enforcement is a follow-on |

## Testing

`test_server.py` uses `unittest.mock` to stub PocketBase HTTP responses — same pattern as `tools/gedcom_sync/test_gedcom_sync.py`. Tests cover:

- `list_persons` with and without `needs_research` filter
- `get_person` relation resolution (parents, children, spouses)
- `search_persons` query passthrough
- `add_fact` happy path, invalid fact_type rejection, PocketBase error propagation

## Out of Scope

- SPA review UI for unverified/AI-generated facts
- Per-person privacy enforcement at the MCP layer
- AI agent prompt / orchestration logic (the MCP server is the tool layer only)
- Remote/cloud deployment (local Unraid container to start)
