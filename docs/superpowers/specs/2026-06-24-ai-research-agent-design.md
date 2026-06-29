# Lineage Research Agent — Design Spec

**Date:** 2026-06-24  
**Branch:** feat/api-endpoints  
**Depends on:** `tools/ai_research_mcp/` (must be deployed and running)

## Overview

A Python agent that uses a local LLM (via llama-swap) to autonomously research persons in the family tree. It reads person profiles through the existing MCP server, searches the web via SearXNG, and writes findings back as unverified AI-generated facts for human review.

## Architecture

```
research_agent.py
      │
      ├── OpenAI-compat API ──► llama-swap (local model, MODEL_NAME env var)
      │                              │ tool_calls JSON
      │◄─────────────────────────────┘
      │
      ├── MCP SDK client (SSE) ──► ai_research_mcp server (:8765)
      │                                   │ PocketBase admin API
      │                                   ▼ reunion-api.klsll.com
      │
      └── httpx ──► SearXNG (SEARXNG_URL env var)
```

The agent runs the agentic tool loop itself:

1. Call local model with tool schemas + person context
2. Receive `tool_calls` in response
3. Execute each call (MCP server or SearXNG)
4. Append `tool_result` messages
5. Repeat until `finish_reason == "stop"`

The `mcp` Python SDK's SSE client handles transport to the MCP server. The `openai` Python SDK handles the llama-swap API (OpenAI-compatible).

## Tool Set

The model sees four tools during each research session:

| Tool | Source | Purpose |
|---|---|---|
| `get_person(id)` | MCP server | Full research payload — identity, relationships, existing facts |
| `search_persons(query)` | MCP server | Cross-reference other family members by name |
| `add_fact(person_id, fact_type, value, date_text?, place?, description?, source?)` | MCP server | Write a finding (always `ai_generated=true, verified=false`) |
| `web_search(query)` | SearXNG | Search obituaries, Ancestry, Wikipedia, local histories |

`list_persons` is **not** exposed to the model. The orchestrator calls it directly to build the work queue before starting per-person agent sessions.

## Trigger Modes

**CLI — single person:**
```bash
python agent.py --person <id>
```

**CLI — batch (drains needs_research queue):**
```bash
python agent.py --batch              # up to BATCH_SIZE persons
python agent.py --batch --size 20   # override for this run
```

**Cron (Docker):** container runs `python agent.py --batch` on the `CRON_SCHEDULE`. Uses `supercronic` to honour the schedule inside the container.

## Privacy — Living Persons

Living persons (`living=true`) are researched but with restricted fact types. Before executing any `add_fact` call, the agent checks the `fact_type` against a blocklist:

**Blocked for living persons:** `residence`, `address`, `phone`, `email`, `website`, `medical`, `ssn`, `national_id`

Blocked calls are not forwarded to the MCP server. Instead, the agent injects a synthetic `tool_result` error message so the model can try an alternative fact type or move on.

## System Prompt

The system prompt instructs the model to:

- Act as a careful genealogical researcher
- Begin each session by calling `get_person` to read the full profile
- Use `web_search` to find obituaries, census records, newspaper mentions, immigration records, and official documents
- Cross-reference relatives via `search_persons` when relationship details are unclear
- Write one fact at a time with a source URL or description in the `source` field
- Prefer specific, dated facts over vague summaries
- Stop when no new verifiable facts can be found
- Never invent facts — if a search returns nothing, say so and stop

## File Layout

```
tools/ai_research_agent/
├── agent.py          # CLI entry point, batch/single orchestration, per-person session loop
├── tools.py          # OpenAI tool schemas + execution (MCP dispatch + SearXNG)
├── prompts.py        # system prompt string
├── Dockerfile        # python:3.12-slim + supercronic
├── compose.yml       # Unraid deployment
├── requirements.txt  # openai, mcp[cli], httpx
└── test_agent.py     # unit tests with mocked MCP + SearXNG responses
```

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `LLAMA_SWAP_URL` | yes | — | llama-swap base URL (e.g. `http://unraid-ip:8080`) |
| `MODEL_NAME` | yes | — | Model name as configured in llama-swap |
| `MCP_URL` | no | `http://localhost:8765/sse` | MCP server SSE endpoint |
| `SEARXNG_URL` | yes | — | SearXNG base URL (e.g. `http://unraid-ip:8888`) |
| `BATCH_SIZE` | no | `5` | Max persons per cron run |
| `CRON_SCHEDULE` | no | `0 2 * * *` | When to run the batch job (2am daily) |

## Error Handling

| Scenario | Behaviour |
|---|---|
| MCP server unreachable | Log error, exit non-zero (cron will retry next run) |
| SearXNG unreachable | `web_search` tool returns error string; model proceeds without web results |
| Model returns malformed tool call | Log and skip; continue loop |
| `add_fact` rejected by MCP server (invalid fact_type) | Tool result propagated to model as error; model tries alternative |
| `finish_reason == "length"` | Log warning (context exceeded), skip to next person — any facts already written via `add_fact` are retained |

## Testing

`test_agent.py` uses `unittest.mock` to stub both the MCP client and SearXNG responses. Tests cover:

- Single-person mode: agent calls `get_person` then loops until stop
- Batch mode: orchestrator calls `list_persons`, iterates correctly
- Living person privacy: blocked fact types return synthetic error, allowed types pass through
- SearXNG failure: agent continues without web results
- Model `finish_reason == "length"`: handled gracefully

## Out of Scope

- SPA review UI for unverified/AI-generated facts (separate project)
- Per-person research history / deduplication of identical facts
- Streaming token output to the terminal (agent runs silently in cron mode)
- Multiple concurrent research sessions
