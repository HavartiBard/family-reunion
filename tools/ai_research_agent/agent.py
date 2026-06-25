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
