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
