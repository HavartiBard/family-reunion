# ai_research_agent — Local LLM lineage researcher

Autonomously researches persons in the family tree using a local LLM (via [llama-swap](https://github.com/mostlygeek/llama-swap)) and [SearXNG](https://searxng.github.io/searxng/). Finds life milestones, immigration records, obituaries, and other genealogical facts, then writes them back via the `ai_research_mcp` server as unverified AI facts for human review.

**Requires:** `tools/ai_research_mcp/` deployed and running (the MCP server that bridges this agent to PocketBase).

## How it works

```
agent.py
  ├── llama-swap (local LLM, OpenAI-compatible API)
  │     └── tool calls: get_person, search_persons, add_fact, web_search
  ├── ai_research_mcp server (:8765) → PocketBase
  └── SearXNG → web results
```

For each person, the agent:
1. Calls `get_person` to read their full profile (identity, relationships, existing facts)
2. Searches the web via SearXNG for obituaries, census records, immigration papers, newspaper mentions
3. Writes findings with `add_fact` — always flagged `ai_generated=true, verified=false`
4. Stops when no new verifiable facts can be found

Facts written for **living persons** are restricted: `address`, `phone`, `email`, `residence`, `website`, `medical`, `ssn`, and `national_id` are blocked before they reach the MCP server.

## Prerequisites

| Service | Notes |
|---|---|
| **llama-swap** | Running on Unraid with at least one model that supports tool calling (Llama 3.1/3.2, Qwen 2.5, Mistral, etc.) |
| **SearXNG** | Self-hosted on Unraid. Needs `format: json` enabled in SearXNG settings |
| **ai_research_mcp** | The companion MCP server in `tools/ai_research_mcp/` — must be deployed first |

### Enable SearXNG JSON format

In your SearXNG `settings.yml`, confirm `search.formats` includes `json`:

```yaml
search:
  formats:
    - html
    - json
```

Restart SearXNG after changing this.

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
$EDITOR .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLAMA_SWAP_URL` | yes | — | llama-swap base URL, e.g. `http://192.168.1.10:8080` |
| `MODEL_NAME` | yes | — | Model name as configured in llama-swap, e.g. `qwen2.5:32b` |
| `MCP_URL` | no | `http://localhost:8765/sse` | MCP server SSE endpoint |
| `SEARXNG_URL` | yes | — | SearXNG base URL, e.g. `http://192.168.1.10:8888` |
| `BATCH_SIZE` | no | `5` | Max persons per cron run |
| `CRON_SCHEDULE` | no | `0 2 * * *` | When to run the batch job (2am daily) |

**Model choice:** Pick a model with strong tool-calling support. Recommended options in llama-swap:
- `qwen2.5:32b` — best reasoning and tool use
- `llama3.1:70b` — strong, widely tested
- `llama3.1:8b` — fast, lower VRAM, slightly less reliable tool calls

## Deployment on Unraid

```bash
cd tools/ai_research_agent
cp .env.example .env
# Edit .env with your Unraid IP and model name
docker compose up -d
```

The container runs `python agent.py --batch` nightly on the configured `CRON_SCHEDULE`, pulling up to `BATCH_SIZE` unresearched persons from the queue each run.

Check logs:

```bash
docker compose logs -f ai-research-agent
```

## One-off runs

Research a specific person by ID (find the ID in the PocketBase admin or from the SPA URL):

```bash
# From outside Docker (needs .env loaded):
export $(cat .env | grep -v '#' | xargs)
python3 agent.py --person <person-id>

# Or via Docker:
docker compose run --rm ai-research-agent python agent.py --person <person-id>
```

Research the full unresearched queue right now, up to 20 persons:

```bash
docker compose run --rm ai-research-agent python agent.py --batch --size 20
```

## Reviewing AI-generated facts

All facts written by the agent are flagged `ai_generated=true, verified=false` in the `person_facts` collection. A human must verify them before they appear publicly in the SPA. The review UI is a planned follow-on — for now, use the PocketBase admin at `https://reunion-api.klsll.com/_/` to inspect and approve facts.

Filter unverified AI facts in PocketBase admin:
- Collection: `person_facts`
- Filter: `ai_generated=true && verified=false`

Set `verified=true` on facts you've confirmed, or delete ones that are incorrect.

## Local development / tests

```bash
pip3 install --break-system-packages -r requirements.txt
python3 -m pytest test_agent.py -v
```

Expected: 13 tests pass.

To run against the live MCP server locally (not in Docker):

```bash
export LLAMA_SWAP_URL=http://unraid-ip:8080
export MODEL_NAME=qwen2.5:32b
export SEARXNG_URL=http://unraid-ip:8888
export MCP_URL=http://unraid-ip:8765/sse
python3 agent.py --person <id>
```
