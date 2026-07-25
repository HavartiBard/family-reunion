# Lineage Research Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python agent that uses a local LLM (via llama-swap) and SearXNG to research family tree persons and write AI-flagged facts back via the deployed MCP server.

**Architecture:** An async Python script runs an OpenAI-format tool-calling loop against llama-swap. It defines four tools — three that dispatch to the MCP server (`get_person`, `search_persons`, `add_fact`) and one that queries SearXNG (`web_search`). The MCP connection uses the `mcp` Python SDK's SSE client. A CLI supports single-person and batch modes; a Docker container runs batch mode on a cron schedule via supercronic.

**Tech Stack:** Python 3.12, `openai` SDK (pointed at llama-swap), `mcp[cli]` SDK (SSE client to `ai_research_mcp` server), `httpx` (SearXNG), `supercronic` (cron in Docker), `pytest` + `unittest.mock` for tests.

## Global Constraints

- All code in `tools/ai_research_agent/`
- Never hardcode credentials — read from env vars only
- All AI facts written via the MCP server's `add_fact` tool (which enforces `ai_generated=true, verified=false`)
- Living persons (`living=true`): block `add_fact` for `residence`, `address`, `phone`, `email`, `website`, `medical`, `ssn`, `national_id`
- Python test runner: `python3 -m pytest test_agent.py -v` (Unraid host has no bare `python`)
- Follow the patterns in `tools/ai_research_mcp/` (same Dockerfile base, same compose.yml structure)
- The deployed MCP server runs at `http://0.0.0.0:8765/sse` on Unraid — that's what `MCP_URL` points to

---

## File Map

| File | Responsibility |
|---|---|
| `tools/ai_research_agent/requirements.txt` | `openai`, `mcp[cli]`, `httpx`, `pytest` |
| `tools/ai_research_agent/prompts.py` | `SYSTEM_PROMPT` string — genealogical researcher persona + instructions |
| `tools/ai_research_agent/tools.py` | Tool schemas (OpenAI JSON format), SearXNG client, tool executor, living-person privacy filter |
| `tools/ai_research_agent/agent.py` | Per-person agent session loop, batch orchestration, CLI entry point |
| `tools/ai_research_agent/test_agent.py` | All unit tests (mocked OpenAI client, mocked MCP session, mocked httpx) |
| `tools/ai_research_agent/Dockerfile` | `python:3.12-slim` + `supercronic` |
| `tools/ai_research_agent/compose.yml` | Unraid deployment |
| `tools/ai_research_agent/.env.example` | Template for required env vars |

---

## Task 1: Scaffold — requirements, prompts, test skeleton

**Files:**
- Create: `tools/ai_research_agent/requirements.txt`
- Create: `tools/ai_research_agent/prompts.py`
- Create: `tools/ai_research_agent/test_agent.py`

**Interfaces:**
- Produces: `SYSTEM_PROMPT` (str) importable from `prompts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p tools/ai_research_agent
```

- [ ] **Step 2: Write requirements.txt**

```
openai>=1.30.0
mcp[cli]>=1.0.0
httpx>=0.27.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

- [ ] **Step 3: Install dependencies**

```bash
cd tools/ai_research_agent
pip3 install --break-system-packages -r requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 4: Write prompts.py**

```python
SYSTEM_PROMPT = """You are a careful genealogical researcher working on a family history project.

Your job is to research one person at a time and record verifiable facts about their life.

## Process

1. Start every session by calling get_person with the person's ID to read everything already known.
2. Use web_search to look for:
   - Obituaries: search "[full name] obituary [birth year] [place]"
   - Census and immigration records: "[full name] census [year]" or "[full name] immigration record"
   - Newspaper mentions: "[full name] [birth year] [hometown] newspaper"
   - Genealogy databases: FindAGrave, FamilySearch, Ancestry entries
   - Wikipedia or local history articles for historical context
3. Cross-reference relatives using search_persons when relationship details are unclear.
4. Write each finding with add_fact — one fact per call, with a source URL in the source field.
5. Stop when you cannot find any new verifiable facts.

## Rules

- Never invent facts. If a search returns nothing useful, try a different query or stop.
- Prefer specific, dated facts over vague summaries.
- Always include a source URL or document description in the source field when possible.
- For each person, aim to find at minimum: birth details, one occupation or residence fact, and any marriage or death records that exist.
- Do not record sensitive contact information (address, phone, email) for living persons.
"""
```

- [ ] **Step 5: Write test skeleton**

```python
"""Tests for the lineage research agent."""
import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch


# ── helpers ──────────────────────────────────────────────────────────────────

def make_mcp_result(data) -> MagicMock:
    """Build a mock MCP tool result with a single TextContent block."""
    block = MagicMock()
    block.text = json.dumps(data)
    result = MagicMock()
    result.content = [block]
    return result


def make_openai_response(finish_reason="stop", content=None, tool_calls=None):
    """Build a mock OpenAI chat completion response."""
    message = MagicMock()
    message.content = content
    message.tool_calls = tool_calls or []
    choice = MagicMock()
    choice.finish_reason = finish_reason
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    return response


def make_tool_call(call_id, name, arguments: dict):
    """Build a mock ChatCompletionMessageToolCall."""
    fn = MagicMock()
    fn.name = name
    fn.arguments = json.dumps(arguments)
    tc = MagicMock()
    tc.id = call_id
    tc.function = fn
    return tc
```

- [ ] **Step 6: Verify test skeleton loads**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -v
```

Expected: `no tests ran` (0 collected), no import errors.

- [ ] **Step 7: Commit**

```bash
git add tools/ai_research_agent/requirements.txt tools/ai_research_agent/prompts.py tools/ai_research_agent/test_agent.py
git commit -m "feat(research-agent): scaffold requirements, system prompt, test helpers"
```

---

## Task 2: SearXNG client

**Files:**
- Create: `tools/ai_research_agent/tools.py`
- Modify: `tools/ai_research_agent/test_agent.py`

**Interfaces:**
- Produces: `searxng_search(query: str, searxng_url: str) -> str` (async)

- [ ] **Step 1: Write the failing test**

Add to `test_agent.py`:

```python
# ── searxng_search ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_searxng_search_returns_formatted_results():
    from tools import searxng_search
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "results": [
            {"title": "John Smith Obituary", "url": "https://example.com/obit", "content": "Passed away 1985."},
            {"title": "John Smith 1920 Census", "url": "https://ancestry.com/census", "content": "Listed as farmer."},
        ]
    }
    with patch("httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__ = AsyncMock(return_value=MockClient.return_value)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value.get = AsyncMock(return_value=mock_response)
        result = await searxng_search("John Smith obituary 1985", "http://searxng:8888")
    assert "John Smith Obituary" in result
    assert "https://example.com/obit" in result
    assert "Passed away 1985." in result


@pytest.mark.asyncio
async def test_searxng_search_no_results():
    from tools import searxng_search
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {"results": []}
    with patch("httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__ = AsyncMock(return_value=MockClient.return_value)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value.get = AsyncMock(return_value=mock_response)
        result = await searxng_search("nobody", "http://searxng:8888")
    assert result == "No results found."


@pytest.mark.asyncio
async def test_searxng_search_http_error():
    from tools import searxng_search
    with patch("httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__ = AsyncMock(return_value=MockClient.return_value)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        MockClient.return_value.get = AsyncMock(side_effect=Exception("connection refused"))
        result = await searxng_search("test", "http://searxng:8888")
    assert "Error" in result
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k searxng -v
```

Expected: `ImportError: cannot import name 'searxng_search' from 'tools'`

- [ ] **Step 3: Implement searxng_search in tools.py**

```python
"""Tool schemas and execution for the lineage research agent."""
import json
import httpx


async def searxng_search(query: str, searxng_url: str) -> str:
    """Search SearXNG and return formatted results as a string."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{searxng_url.rstrip('/')}/search",
                params={"q": query, "format": "json", "categories": "general"},
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        return f"Error contacting SearXNG: {exc}"

    results = data.get("results", [])[:5]
    if not results:
        return "No results found."
    lines = []
    for r in results:
        lines.append(f"**{r.get('title', '')}**\n{r.get('url', '')}\n{r.get('content', '')}")
    return "\n\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k searxng -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/ai_research_agent/tools.py tools/ai_research_agent/test_agent.py
git commit -m "feat(research-agent): add SearXNG search client with tests"
```

---

## Task 3: Tool schemas + executor + living-person privacy filter

**Files:**
- Modify: `tools/ai_research_agent/tools.py`
- Modify: `tools/ai_research_agent/test_agent.py`

**Interfaces:**
- Consumes: `searxng_search(query, searxng_url)` from Task 2; `mcp.ClientSession` (passed in)
- Produces:
  - `TOOL_SCHEMAS: list[dict]` — four OpenAI-format tool schemas
  - `LIVING_PERSON_BLOCKED_FACTS: set[str]`
  - `execute_tool(name: str, args: dict, session: ClientSession, searxng_url: str, is_living_ref: list) -> str` (async)

- [ ] **Step 1: Write the failing tests**

Add to `test_agent.py`:

```python
# ── execute_tool ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_tool_web_search_delegates_to_searxng():
    from tools import execute_tool
    with patch("tools.searxng_search", new=AsyncMock(return_value="search result")) as mock_search:
        result = await execute_tool(
            "web_search", {"query": "John Smith"}, MagicMock(), "http://sx:8888", [None]
        )
    mock_search.assert_called_once_with("John Smith", "http://sx:8888")
    assert result == "search result"


@pytest.mark.asyncio
async def test_execute_tool_get_person_updates_is_living():
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock(return_value=make_mcp_result({"id": "p1", "living": True}))
    is_living_ref = [None]
    await execute_tool("get_person", {"id": "p1"}, session, "http://sx:8888", is_living_ref)
    assert is_living_ref[0] is True


@pytest.mark.asyncio
async def test_execute_tool_blocks_sensitive_fact_for_living_person():
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock()
    result = await execute_tool(
        "add_fact",
        {"person_id": "p1", "fact_type": "address", "value": "123 Main St"},
        session,
        "http://sx:8888",
        [True],  # is_living_ref = True
    )
    session.call_tool.assert_not_called()
    assert "cannot record" in result
    assert "living" in result


@pytest.mark.asyncio
async def test_execute_tool_allows_safe_fact_for_living_person():
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock(return_value=make_mcp_result({"id": "fact1", "status": "created"}))
    result = await execute_tool(
        "add_fact",
        {"person_id": "p1", "fact_type": "occupation", "value": "Farmer"},
        session,
        "http://sx:8888",
        [True],  # living, but occupation is allowed
    )
    session.call_tool.assert_called_once()
    assert "fact1" in result or "created" in result


@pytest.mark.asyncio
async def test_execute_tool_mcp_passthrough_for_deceased():
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock(return_value=make_mcp_result({"id": "fact2", "status": "created"}))
    result = await execute_tool(
        "add_fact",
        {"person_id": "p1", "fact_type": "residence", "value": "Winnipeg"},
        session,
        "http://sx:8888",
        [False],  # deceased — no restrictions
    )
    session.call_tool.assert_called_once()
    assert "fact2" in result or "created" in result
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k execute_tool -v
```

Expected: `ImportError` or `AttributeError` — `execute_tool` doesn't exist yet.

- [ ] **Step 3: Add constants and execute_tool to tools.py**

Append to `tools.py` (after `searxng_search`):

```python
LIVING_PERSON_BLOCKED_FACTS = {
    "residence", "address", "phone", "email", "website",
    "medical", "ssn", "national_id",
}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_person",
            "description": (
                "Get the full research profile for a person: identity, parents, children, "
                "spouses, existing facts, and bio. Always call this first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Person ID from the family tree"}
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_persons",
            "description": "Search for persons in the family tree by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Full or partial name to search"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_fact",
            "description": (
                "Write a research finding as a fact. Always flagged ai_generated=true, verified=false. "
                "Include a source URL or document name in the source field."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "person_id": {"type": "string"},
                    "fact_type": {
                        "type": "string",
                        "description": (
                            "One of: birth, death, burial, cremation, baptism, christening, "
                            "christening_adult, bar_mitzvah, bat_mitzvah, confirmation, "
                            "first_communion, blessing, ordination, adoption, immigration, "
                            "emigration, naturalization, military, graduation, retirement, "
                            "census, will, probate, residence, property, marriage, divorce, "
                            "engagement, annulment, occupation, education, religion, nationality, "
                            "title, physical_description, medical, ssn, national_id, address, "
                            "website, email, phone, note, other"
                        ),
                    },
                    "value": {"type": "string", "description": "The fact value (e.g. 'Farmer', 'Winnipeg, MB')"},
                    "date_text": {"type": "string", "description": "Human-readable date (e.g. '12 Mar 1947')"},
                    "place": {"type": "string", "description": "Location associated with the fact"},
                    "description": {"type": "string", "description": "Additional context or notes"},
                    "source": {"type": "string", "description": "URL or document reference for this fact"},
                },
                "required": ["person_id", "fact_type", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for genealogical information. Use targeted queries: "
                "'[name] obituary [year]', '[name] census [year]', '[name] immigration record'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"}
                },
                "required": ["query"],
            },
        },
    },
]


def _mcp_result_to_str(result) -> str:
    """Extract text from an MCP CallToolResult."""
    texts = [block.text for block in result.content if hasattr(block, "text")]
    return "\n".join(texts) if texts else "Done."


async def execute_tool(
    name: str,
    args: dict,
    session,
    searxng_url: str,
    is_living_ref: list,
) -> str:
    """Execute a tool call and return the result as a string.

    is_living_ref is a one-element list used as a mutable reference.
    It is updated to True/False when get_person is called.
    """
    if name == "web_search":
        return await searxng_search(args["query"], searxng_url)

    if name == "get_person":
        result = await session.call_tool("get_person", args)
        text = _mcp_result_to_str(result)
        try:
            data = json.loads(text)
            is_living_ref[0] = data.get("living", False)
        except Exception:
            pass
        return text

    if name == "add_fact" and is_living_ref[0] is True:
        if args.get("fact_type") in LIVING_PERSON_BLOCKED_FACTS:
            return (
                f"Error: cannot record '{args['fact_type']}' for a living person. "
                f"Choose a non-sensitive fact type instead."
            )

    result = await session.call_tool(name, args)
    return _mcp_result_to_str(result)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k "execute_tool or searxng" -v
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/ai_research_agent/tools.py tools/ai_research_agent/test_agent.py
git commit -m "feat(research-agent): tool schemas, executor, and living-person privacy filter"
```

---

## Task 4: Per-person agent session loop

**Files:**
- Create: `tools/ai_research_agent/agent.py`
- Modify: `tools/ai_research_agent/test_agent.py`

**Interfaces:**
- Consumes: `TOOL_SCHEMAS`, `execute_tool` from `tools`; `SYSTEM_PROMPT` from `prompts`; `mcp.ClientSession`; `openai.AsyncOpenAI`
- Produces: `research_person(person_id: str, openai_client, mcp_session, searxng_url: str, model: str) -> None` (async)

- [ ] **Step 1: Write the failing tests**

Add to `test_agent.py`:

```python
# ── research_person ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_research_person_stops_on_finish_reason_stop():
    """Agent loop exits cleanly when the model returns finish_reason=stop."""
    from agent import research_person

    openai_client = MagicMock()
    openai_client.chat = MagicMock()
    openai_client.chat.completions = MagicMock()
    openai_client.chat.completions.create = AsyncMock(
        return_value=make_openai_response(finish_reason="stop", content="Research complete.")
    )

    mcp_session = MagicMock()
    # Called once for get_person at the start, but in this test the model stops immediately.
    await research_person("p1", openai_client, mcp_session, "http://sx:8888", "llama3")

    openai_client.chat.completions.create.assert_called_once()


@pytest.mark.asyncio
async def test_research_person_executes_tool_calls_and_loops():
    """Agent loop runs tool calls then continues until stop."""
    from agent import research_person

    tool_call = make_tool_call("call_1", "get_person", {"id": "p1"})

    turn1 = make_openai_response(finish_reason="tool_calls", tool_calls=[tool_call])
    turn2 = make_openai_response(finish_reason="stop", content="Done.")

    openai_client = MagicMock()
    openai_client.chat.completions.create = AsyncMock(side_effect=[turn1, turn2])

    mcp_session = MagicMock()
    mcp_session.call_tool = AsyncMock(
        return_value=make_mcp_result({"id": "p1", "display_name": "John Smith", "living": False})
    )

    await research_person("p1", openai_client, mcp_session, "http://sx:8888", "llama3")

    assert openai_client.chat.completions.create.call_count == 2
    mcp_session.call_tool.assert_called_once_with("get_person", {"id": "p1"})


@pytest.mark.asyncio
async def test_research_person_handles_length_gracefully():
    """Agent loop exits without error when context length exceeded."""
    from agent import research_person

    openai_client = MagicMock()
    openai_client.chat.completions.create = AsyncMock(
        return_value=make_openai_response(finish_reason="length", content=None)
    )
    mcp_session = MagicMock()

    # Should not raise
    await research_person("p1", openai_client, mcp_session, "http://sx:8888", "llama3")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k research_person -v
```

Expected: `ModuleNotFoundError: No module named 'agent'`

- [ ] **Step 3: Implement agent.py**

```python
"""Lineage research agent — per-person session loop and CLI entry point."""

import asyncio
import json
import os

from openai import AsyncOpenAI
from mcp.client.sse import sse_client
from mcp import ClientSession

from prompts import SYSTEM_PROMPT
from tools import TOOL_SCHEMAS, execute_tool


async def research_person(
    person_id: str,
    openai_client: AsyncOpenAI,
    mcp_session: ClientSession,
    searxng_url: str,
    model: str,
) -> None:
    """Run a single research session for one person."""
    is_living_ref = [None]

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Please research this person and add any facts you can verify. "
                f"Person ID: {person_id}"
            ),
        },
    ]

    while True:
        response = await openai_client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOL_SCHEMAS,
        )
        choice = response.choices[0]

        # Append assistant message (include tool_calls if present)
        assistant_msg: dict = {"role": "assistant", "content": choice.message.content}
        if choice.message.tool_calls:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in choice.message.tool_calls
            ]
        messages.append(assistant_msg)

        if choice.finish_reason != "tool_calls":
            if choice.finish_reason == "length":
                print(f"  Warning: context length exceeded for {person_id}, stopping early")
            break

        # Execute each tool call and feed results back
        for tc in choice.message.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError as exc:
                print(f"  Warning: malformed tool call arguments from model ({exc}), skipping")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": f"Error: could not parse tool arguments: {exc}",
                })
                continue
            result_str = await execute_tool(
                tc.function.name, args, mcp_session, searxng_url, is_living_ref
            )
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result_str,
            })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k research_person -v
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/ai_research_agent/agent.py tools/ai_research_agent/test_agent.py
git commit -m "feat(research-agent): per-person agent session loop"
```

---

## Task 5: CLI, batch orchestration, and MCP connection

**Files:**
- Modify: `tools/ai_research_agent/agent.py`
- Create: `tools/ai_research_agent/.env.example`
- Modify: `tools/ai_research_agent/test_agent.py`

**Interfaces:**
- Consumes: `research_person` from Task 4; `mcp.client.sse.sse_client`; `mcp.ClientSession`
- Produces:
  - `batch_research(n: int, openai_client, mcp_session, searxng_url: str, model: str) -> None` (async)
  - `main()` — CLI entry point (`--person <id>` or `--batch [--size N]`)

- [ ] **Step 1: Write the failing tests**

Add to `test_agent.py`:

```python
# ── batch_research ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_batch_research_calls_research_person_for_each_queued_item():
    from agent import batch_research

    persons = [
        {"id": "p1", "display_name": "Alice"},
        {"id": "p2", "display_name": "Bob"},
    ]
    mcp_session = MagicMock()
    mcp_session.call_tool = AsyncMock(return_value=make_mcp_result(persons))

    openai_client = MagicMock()

    with patch("agent.research_person", new=AsyncMock()) as mock_research:
        await batch_research(5, openai_client, mcp_session, "http://sx:8888", "llama3")

    assert mock_research.call_count == 2
    calls = [c.args[0] for c in mock_research.call_args_list]
    assert "p1" in calls
    assert "p2" in calls


@pytest.mark.asyncio
async def test_batch_research_respects_size_limit():
    """list_persons is called with the requested batch size."""
    from agent import batch_research

    mcp_session = MagicMock()
    mcp_session.call_tool = AsyncMock(return_value=make_mcp_result([]))

    with patch("agent.research_person", new=AsyncMock()):
        await batch_research(3, MagicMock(), mcp_session, "http://sx:8888", "llama3")

    mcp_session.call_tool.assert_called_once_with(
        "list_persons", {"needs_research": True, "per_page": 3}
    )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -k batch_research -v
```

Expected: `ImportError` — `batch_research` doesn't exist yet.

- [ ] **Step 3: Add batch_research and main() to agent.py**

Append to `agent.py`:

```python

async def batch_research(
    n: int,
    openai_client: AsyncOpenAI,
    mcp_session: ClientSession,
    searxng_url: str,
    model: str,
) -> None:
    """Pull up to n unresearched persons from the MCP server and research each."""
    result = await mcp_session.call_tool(
        "list_persons", {"needs_research": True, "per_page": n}
    )
    texts = [block.text for block in result.content if hasattr(block, "text")]
    items = json.loads("\n".join(texts)) if texts else []
    if not items:
        print("No persons in the research queue.")
        return
    print(f"Researching {len(items)} person(s)...")
    for item in items:
        print(f"  → {item.get('display_name', item['id'])} ({item['id']})")
        await research_person(item["id"], openai_client, mcp_session, searxng_url, model)


async def _run() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Family tree lineage research agent")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--person", metavar="ID", help="Research a specific person by ID")
    group.add_argument("--batch", action="store_true", help="Drain the needs-research queue")
    parser.add_argument(
        "--size",
        type=int,
        default=int(os.getenv("BATCH_SIZE", "5")),
        help="Max persons to research in batch mode (default: BATCH_SIZE env or 5)",
    )
    args = parser.parse_args()

    llama_swap_url = os.environ["LLAMA_SWAP_URL"]
    model = os.environ["MODEL_NAME"]
    mcp_url = os.getenv("MCP_URL", "http://localhost:8765/sse")
    searxng_url = os.environ["SEARXNG_URL"]

    openai_client = AsyncOpenAI(base_url=llama_swap_url, api_key="not-needed")

    async with sse_client(mcp_url) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            if args.person:
                print(f"Researching person {args.person}...")
                await research_person(args.person, openai_client, session, searxng_url, model)
            else:
                await batch_research(args.size, openai_client, session, searxng_url, model)


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Write .env.example**

```
# llama-swap base URL (OpenAI-compatible)
LLAMA_SWAP_URL=http://unraid-ip:8080

# Model name as configured in llama-swap (e.g. "llama3.1:8b", "qwen2.5:32b")
MODEL_NAME=llama3.1:8b

# MCP server SSE endpoint (ai_research_mcp container)
MCP_URL=http://unraid-ip:8765/sse

# SearXNG base URL
SEARXNG_URL=http://unraid-ip:8888

# Max persons per cron run
BATCH_SIZE=5

# Cron schedule for batch runs (default: 2am daily)
CRON_SCHEDULE=0 2 * * *
```

- [ ] **Step 5: Run all tests**

```bash
cd tools/ai_research_agent
python3 -m pytest test_agent.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tools/ai_research_agent/agent.py tools/ai_research_agent/.env.example tools/ai_research_agent/test_agent.py
git commit -m "feat(research-agent): CLI, batch orchestration, MCP connection"
```

---

## Task 6: Docker — Dockerfile and compose.yml

**Files:**
- Create: `tools/ai_research_agent/Dockerfile`
- Create: `tools/ai_research_agent/compose.yml`

**Interfaces:**
- Consumes: all files from Tasks 1–5
- Produces: buildable Docker image; Unraid-deployable compose service

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM python:3.12-slim

# supercronic for cron scheduling inside the container
ARG SUPERCRONIC_VERSION=0.2.29
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates && \
    wget -q "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
         -O /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic && \
    apt-get purge -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Default: run batch mode on cron schedule.
# Override CMD to run one-off: docker run ... python agent.py --person <id>
CMD ["sh", "-c", \
     "echo \"${CRON_SCHEDULE:-0 2 * * *} cd /app && python agent.py --batch >> /proc/1/fd/1 2>&1\" \
      > /tmp/crontab && supercronic /tmp/crontab"]
```

- [ ] **Step 2: Write compose.yml**

```yaml
# Run one-off: docker compose run --rm ai-research-agent python agent.py --person <id>
# Logs: docker compose logs -f ai-research-agent

services:
  ai-research-agent:
    build: .
    env_file: .env
    network_mode: host
    restart: unless-stopped
```

Note: `network_mode: host` lets the container reach the MCP server (`localhost:8765`) and SearXNG on host ports without extra networking config. Set `MCP_URL` and `SEARXNG_URL` to `http://localhost:PORT` in `.env`.

- [ ] **Step 3: Build the image**

```bash
cd tools/ai_research_agent
cp .env.example .env
# Edit .env to fill in real values, or just build to verify the image builds
docker build -t ai-research-agent .
```

Expected: image builds successfully, no errors.

- [ ] **Step 4: Verify entry point works (dry run)**

```bash
docker run --rm ai-research-agent python agent.py --help
```

Expected:
```
usage: agent.py [-h] (--person ID | --batch) [--size SIZE]
...
```

- [ ] **Step 5: Commit**

```bash
git add tools/ai_research_agent/Dockerfile tools/ai_research_agent/compose.yml
git commit -m "feat(research-agent): Dockerfile and Unraid compose deployment"
```

- [ ] **Step 6: Push and open PR**

```bash
git push
gh pr create \
  --title "feat: lineage research agent using local LLM + SearXNG" \
  --body "$(cat <<'EOF'
## Summary

- Adds `tools/ai_research_agent/` — a Python agent that researches family tree persons using llama-swap (local LLM) and SearXNG
- Defines four tools: `get_person`, `search_persons`, `add_fact` (via MCP server), `web_search` (via SearXNG)
- Living-person privacy filter blocks sensitive fact types (`address`, `phone`, `email`, `medical`, `ssn`, `national_id`, `residence`, `website`) before they reach the MCP server
- CLI supports `--person <id>` (single) and `--batch [--size N]` (drain needs-research queue)
- Docker container runs batch mode on a configurable cron schedule via supercronic

## Test plan

- [ ] `python3 -m pytest test_agent.py -v` passes in `tools/ai_research_agent/`
- [ ] `docker build -t ai-research-agent tools/ai_research_agent/` succeeds
- [ ] `docker run --rm ai-research-agent python agent.py --help` prints usage
- [ ] Manual run: `python agent.py --person <real-id>` with `.env` filled in, verify facts appear in PocketBase with `ai_generated=true, verified=false`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
