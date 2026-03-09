"""Brave Search API integration for company research."""

from typing import Optional

import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


async def search_company(company_name: str) -> Optional[dict]:
    """Search for company information using Brave Search API."""
    if not settings.brave_search_api_key:
        logger.warning("brave_search_no_api_key")
        return None

    query = f"{company_name} empresa Brasil sobre"

    try:
        async with httpx.AsyncClient(timeout=settings.default_timeout) as client:
            response = await client.get(
                BRAVE_SEARCH_URL,
                params={
                    "q": query,
                    "count": 5,
                    "search_lang": "pt-br",
                    "country": "BR",
                },
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": settings.brave_search_api_key,
                },
            )
            response.raise_for_status()

            data = response.json()
            results = data.get("web", {}).get("results", [])

            if not results:
                return None

            return {
                "company_name": company_name,
                "search_results": [
                    {
                        "title": r.get("title", ""),
                        "description": r.get("description", ""),
                        "url": r.get("url", ""),
                    }
                    for r in results[:5]
                ],
            }

    except httpx.TimeoutException:
        logger.warning("brave_search_timeout", company=company_name)
        return None
    except httpx.HTTPStatusError as e:
        logger.error("brave_search_error", company=company_name, status=e.response.status_code)
        return None
    except Exception as e:
        logger.error("brave_search_unexpected", company=company_name, error=str(e))
        return None


async def research_companies(companies: list[str]) -> list[dict]:
    """Research multiple companies (max 5)."""
    results = []
    for company in companies[:5]:
        result = await search_company(company)
        if result:
            results.append(result)
    return results
