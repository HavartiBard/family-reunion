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
    try:
        items = json.loads("\n".join(texts)) if texts else []
    except json.JSONDecodeError as exc:
        print(f"Error parsing list_persons response: {exc}")
        return
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
