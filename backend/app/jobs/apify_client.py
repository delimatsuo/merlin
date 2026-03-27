"""Apify API client for scraping Brazilian job boards."""

import asyncio
import structlog
import httpx

from app.config import get_settings

_BRAZIL_SEMAPHORE = asyncio.Semaphore(5)  # Max 5 concurrent Apify calls

logger = structlog.get_logger()

# Apify actor IDs — pin versions for stability
ACTORS = {
    "gupy": "zen-studio/gupy-jobs-scraper",
    "brazil": "viralanalyzer/brazil-jobs-scraper",
}

APIFY_BASE_URL = "https://api.apify.com/v2"


async def _run_actor(
    actor_id: str,
    run_input: dict,
    timeout: int = 300,
) -> list[dict]:
    """Run an Apify actor and return the dataset items."""
    settings = get_settings()
    if not settings.apify_api_key:
        logger.warning("apify_key_missing", actor=actor_id)
        return []

    headers = {"Authorization": f"Bearer {settings.apify_api_key}"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        # Start actor run and wait for it to finish
        # Apify uses ~ instead of / for username/actor-name in URLs
        safe_actor_id = actor_id.replace("/", "~")
        url = f"{APIFY_BASE_URL}/acts/{safe_actor_id}/run-sync-get-dataset-items"
        response = await client.post(
            url,
            headers=headers,
            json=run_input,
            params={"timeout": timeout},
        )

        if response.status_code != 200 and response.status_code != 201:
            logger.error(
                "apify_actor_error",
                actor=actor_id,
                status=response.status_code,
                body=response.text[:500],
            )
            return []

        items = response.json()
        if not isinstance(items, list):
            # Check for error messages
            if isinstance(items, dict) and "error" in items:
                logger.error(
                    "apify_api_error",
                    actor=actor_id,
                    error_type=items["error"].get("type", ""),
                    message=items["error"].get("message", ""),
                )
            else:
                logger.warning("apify_unexpected_response", actor=actor_id, type=type(items).__name__)
            return []

        return items


async def scrape_gupy(search_terms: list[str], locations: list[str] | None = None) -> list[dict]:
    """Scrape job listings from Gupy.

    Runs the actor ONCE with a broad search to minimize cost.
    One run = $0.25 start + $0.0025/job. Much cheaper than per-term runs.
    """
    results = []

    # Run once with broad search (newest jobs across all categories)
    # This is 10-50x cheaper than running per search term
    try:
        items = await _run_actor(
            ACTORS["gupy"],
            run_input={
                "searchQuery": "",  # Empty = all jobs
                "maxResults": 1000,  # Broad sample, ~$2.75/run
                "sortBy": "newest",
            },
            timeout=600,  # Allow 10 minutes for large scrape
        )
        for item in items:
            results.append({
                "source": "gupy",
                "source_id": item.get("id") or item.get("jobId", ""),
                "raw_text": item.get("description", "") or item.get("jobDescription", ""),
                "source_url": item.get("url") or item.get("jobUrl", ""),
                "title_hint": item.get("title") or item.get("jobTitle", ""),
                "company_hint": item.get("company") or item.get("companyName", ""),
                "posted_date_hint": item.get("publishedDate") or item.get("createdAt"),
            })
        logger.info("gupy_scrape_complete", results=len(results))
    except Exception as e:
        logger.error("gupy_scrape_error", error=str(e))

    return results


async def scrape_brazil_jobs(search_terms: list[str], locations: list[str] | None = None) -> list[dict]:
    """Scrape job listings from multiple Brazilian boards (LinkedIn, InfoJobs, Vagas, etc.).

    Uses viralanalyzer/brazil-jobs-scraper which aggregates multiple sources.
    The actor returns a `source` field per item (e.g., "LinkedIn", "InfoJobs").

    Input field: `keyword` (not `searchQuery`).
    Output fields: id, title, company, description, url, datePosted, source, scrapedAt.
    """
    async def _scrape_term(term: str) -> list[dict]:
        async with _BRAZIL_SEMAPHORE:
            try:
                items = await _run_actor(
                    ACTORS["brazil"],
                    run_input={
                        "keyword": term,
                        "country": "Brazil",
                        "maxItems": 30,
                    },
                )
                term_results = []
                for item in items:
                    item_source = (item.get("source") or "unknown").lower().replace(" ", "")
                    term_results.append({
                        "source": item_source,
                        "source_id": item.get("id", ""),
                        "raw_text": item.get("description", ""),
                        "source_url": item.get("url", ""),
                        "title_hint": item.get("title", ""),
                        "company_hint": item.get("company", ""),
                        "posted_date_hint": item.get("datePosted"),
                    })
                return term_results
            except Exception as e:
                logger.error("brazil_scrape_error", term=term, error=str(e))
                return []

    # Run all terms in parallel (semaphore limits concurrency to 5)
    all_results = await asyncio.gather(*[_scrape_term(t) for t in search_terms])
    results = [item for batch in all_results for item in batch]

    logger.info("brazil_scrape_complete", terms=len(search_terms), results=len(results))
    return results
