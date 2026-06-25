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
