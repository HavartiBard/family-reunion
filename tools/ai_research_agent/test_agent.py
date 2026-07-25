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


# ── execute_tool ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_tool_web_search_delegates_to_searxng():
    from tools import execute_tool
    with patch("tools.searxng_search", new=AsyncMock(return_value="search result")) as mock_search:
        result = await execute_tool(
            "web_search", {"query": "John Smith"}, MagicMock(), "http://sx:8888", {}
        )
    mock_search.assert_called_once_with("John Smith", "http://sx:8888")
    assert result == "search result"


@pytest.mark.asyncio
async def test_execute_tool_web_search_missing_query_does_not_raise():
    from tools import execute_tool
    result = await execute_tool("web_search", {}, MagicMock(), "http://sx:8888", {})
    assert "Error" in result


@pytest.mark.asyncio
async def test_execute_tool_get_person_records_living_by_id():
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock(return_value=make_mcp_result({"id": "p1", "living": True}))
    known_living: dict = {}
    await execute_tool("get_person", {"id": "p1"}, session, "http://sx:8888", known_living)
    assert known_living == {"p1": True}


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
        {"p1": True},
    )
    session.call_tool.assert_not_called()
    assert "cannot record" in result


@pytest.mark.asyncio
async def test_execute_tool_blocks_sensitive_fact_when_living_status_unknown():
    """Fail closed: if get_person was never called (or didn't parse) for this
    person, sensitive fact types must still be blocked rather than assumed safe."""
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock()
    result = await execute_tool(
        "add_fact",
        {"person_id": "p1", "fact_type": "phone", "value": "555-1234"},
        session,
        "http://sx:8888",
        {},  # nothing known about p1 yet
    )
    session.call_tool.assert_not_called()
    assert "cannot record" in result


@pytest.mark.asyncio
async def test_execute_tool_blocks_sensitive_fact_after_unrelated_person_lookup():
    """Cross-referencing a different (living) person must not make it look like
    the original subject's living status was ever confirmed."""
    from tools import execute_tool
    session = MagicMock()
    session.call_tool = AsyncMock()
    # Only ever looked up p2 (a spouse), never p1.
    known_living = {"p2": True}
    result = await execute_tool(
        "add_fact",
        {"person_id": "p1", "fact_type": "address", "value": "123 Main St"},
        session,
        "http://sx:8888",
        known_living,
    )
    session.call_tool.assert_not_called()
    assert "cannot record" in result


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
        {"p1": True},  # living, but occupation is allowed
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
        {"p1": False},  # confirmed deceased — no restrictions
    )
    session.call_tool.assert_called_once()
    assert "fact2" in result or "created" in result


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
async def test_research_person_survives_tool_call_raising():
    """A tool call that raises (e.g. a malformed/unhandled args shape) must not
    crash the whole research session — it should be fed back as an error and
    the loop should continue."""
    from agent import research_person

    tool_call = make_tool_call("call_1", "get_person", {"id": "p1"})
    turn1 = make_openai_response(finish_reason="tool_calls", tool_calls=[tool_call])
    turn2 = make_openai_response(finish_reason="stop", content="Done.")

    openai_client = MagicMock()
    openai_client.chat.completions.create = AsyncMock(side_effect=[turn1, turn2])

    mcp_session = MagicMock()
    mcp_session.call_tool = AsyncMock(side_effect=RuntimeError("boom"))

    # Should not raise.
    await research_person("p1", openai_client, mcp_session, "http://sx:8888", "llama3")

    assert openai_client.chat.completions.create.call_count == 2


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
async def test_batch_research_continues_after_one_person_fails():
    """One person's research blowing up must not abort the rest of the queue —
    otherwise a single bad session strands every remaining person in a
    nightly batch run."""
    from agent import batch_research

    persons = [
        {"id": "p1", "display_name": "Alice"},
        {"id": "p2", "display_name": "Bob"},
    ]
    mcp_session = MagicMock()
    mcp_session.call_tool = AsyncMock(return_value=make_mcp_result(persons))

    async def flaky_research(person_id, *_args, **_kwargs):
        if person_id == "p1":
            raise RuntimeError("boom")

    with patch("agent.research_person", new=AsyncMock(side_effect=flaky_research)) as mock_research:
        await batch_research(5, MagicMock(), mcp_session, "http://sx:8888", "llama3")

    assert mock_research.call_count == 2
    calls = [c.args[0] for c in mock_research.call_args_list]
    assert calls == ["p1", "p2"]


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
