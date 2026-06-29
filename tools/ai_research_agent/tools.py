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

    try:
        result = await session.call_tool(name, args)
        return _mcp_result_to_str(result)
    except Exception as exc:
        return f"Error calling MCP tool '{name}': {exc}"
