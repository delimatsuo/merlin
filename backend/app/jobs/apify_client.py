"""Apify API client for scraping Brazilian job boards."""

import structlog
import httpx

from app.config import get_settings

logger = structlog.get_logger()

# Apify actor IDs — pin versions for stability
ACTORS = {
    "gupy": "zen-studio/gupy-jobs-scraper",
    "linkedin": "viralanalyzer/brazil-jobs-scraper",
    "vagas": "viralanalyzer/brazil-jobs-scraper",
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
            logger.warning("apify_unexpected_response", actor=actor_id, type=type(items).__name__)
            return []

        return items


async def scrape_gupy(search_terms: list[str], locations: list[str] | None = None) -> list[dict]:
    """Scrape job listings from Gupy."""
    results = []
    for term in search_terms[:102]:  # All categories daily
        try:
            items = await _run_actor(
                ACTORS["gupy"],
                run_input={
                    "searchQuery": term,
                    "maxItems": 30,  # 30 per term for better coverage
                },
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
        except Exception as e:
            logger.error("gupy_scrape_error", term=term, error=str(e))

    logger.info("gupy_scrape_complete", terms=len(search_terms), results=len(results))
    return results


async def scrape_linkedin(search_terms: list[str], locations: list[str] | None = None) -> list[dict]:
    """Scrape job listings from LinkedIn Jobs (Brazil)."""
    results = []
    for term in search_terms[:10]:
        try:
            items = await _run_actor(
                ACTORS["linkedin"],
                run_input={
                    "searchQuery": term,
                    "country": "Brazil",
                    "source": "linkedin",
                    "maxItems": 30,
                },
            )
            for item in items:
                results.append({
                    "source": "linkedin",
                    "source_id": item.get("id") or item.get("jobId", ""),
                    "raw_text": item.get("description", "") or item.get("jobDescription", ""),
                    "source_url": item.get("url") or item.get("jobUrl", ""),
                    "title_hint": item.get("title") or item.get("jobTitle", ""),
                    "company_hint": item.get("company") or item.get("companyName", ""),
                    "posted_date_hint": item.get("publishedDate") or item.get("postedAt"),
                })
        except Exception as e:
            logger.error("linkedin_scrape_error", term=term, error=str(e))

    logger.info("linkedin_scrape_complete", terms=len(search_terms), results=len(results))
    return results


async def scrape_vagas(search_terms: list[str], locations: list[str] | None = None) -> list[dict]:
    """Scrape job listings from Vagas.com.br."""
    results = []
    for term in search_terms[:10]:
        try:
            items = await _run_actor(
                ACTORS["vagas"],
                run_input={
                    "searchQuery": term,
                    "country": "Brazil",
                    "source": "vagas",
                    "maxItems": 30,
                },
            )
            for item in items:
                results.append({
                    "source": "vagas",
                    "source_id": item.get("id") or item.get("jobId", ""),
                    "raw_text": item.get("description", "") or item.get("jobDescription", ""),
                    "source_url": item.get("url") or item.get("jobUrl", ""),
                    "title_hint": item.get("title") or item.get("jobTitle", ""),
                    "company_hint": item.get("company") or item.get("companyName", ""),
                    "posted_date_hint": item.get("publishedDate") or item.get("postedAt"),
                })
        except Exception as e:
            logger.error("vagas_scrape_error", term=term, error=str(e))

    logger.info("vagas_scrape_complete", terms=len(search_terms), results=len(results))
    return results
