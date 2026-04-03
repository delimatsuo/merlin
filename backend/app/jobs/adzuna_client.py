"""Adzuna API client for scraping Brazilian job listings.

Free API — no per-job cost. 25 requests/minute rate limit.
Endpoint: https://api.adzuna.com/v1/api/jobs/br/search/{page}
"""

import asyncio
import structlog
import httpx

from app.config import get_settings

logger = structlog.get_logger()

ADZUNA_BASE_URL = "https://api.adzuna.com/v1/api/jobs/br/search"

# Broad search terms that cover the Brazilian job market
SEARCH_TERMS = [
    "analista",         # 86K+ jobs — finance, HR, data, QA, marketing, etc.
    "engenheiro",       # 8K+ — engineering, software, civil, mechanical
    "gerente",          # 39K+ — management across all areas
    "desenvolvedor",    # 9K+ — software development
    "assistente",       # 82K+ — entry-level, admin, support
]


async def scrape_adzuna(
    search_terms: list[str] | None = None,
    max_days_old: int = 3,
    results_per_term: int = 100,
) -> list[dict]:
    """Fetch Brazilian jobs from Adzuna API.

    Args:
        search_terms: Keywords to search. Defaults to SEARCH_TERMS.
        max_days_old: Only return jobs posted in the last N days (dedup built-in).
        results_per_term: Max results per search term (paginated at 50/page).

    Returns:
        List of normalized job dicts ready for the scraper pipeline.
    """
    settings = get_settings()
    app_id = settings.adzuna_app_id
    app_key = settings.adzuna_app_key

    if not app_id or not app_key:
        logger.warning("adzuna_credentials_missing")
        return []

    terms = search_terms or SEARCH_TERMS
    all_results: list[dict] = []
    seen_ids: set[str] = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for term in terms:
            term_count = 0
            pages_needed = (results_per_term + 49) // 50  # 50 per page max

            for page in range(1, pages_needed + 1):
                try:
                    resp = await client.get(
                        f"{ADZUNA_BASE_URL}/{page}",
                        params={
                            "app_id": app_id,
                            "app_key": app_key,
                            "what": term,
                            "results_per_page": 50,
                            "max_days_old": max_days_old,
                            "sort_by": "date",
                            "content-type": "application/json",
                        },
                    )

                    if resp.status_code == 429:
                        logger.warning("adzuna_rate_limit", term=term, page=page)
                        await asyncio.sleep(5)
                        continue

                    if resp.status_code != 200:
                        logger.error("adzuna_api_error", status=resp.status_code, term=term)
                        break

                    data = resp.json()
                    results = data.get("results", [])

                    if not results:
                        break

                    for job in results:
                        job_id = str(job.get("id", ""))
                        if not job_id or job_id in seen_ids:
                            continue
                        seen_ids.add(job_id)

                        # Build location from area hierarchy
                        location_parts = job.get("location", {}).get("area", [])
                        # area = ["Brasil", "Sudeste", "Estado de São Paulo", "São Paulo", ...]
                        # We want city + state: skip "Brasil" and region
                        display_location = job.get("location", {}).get("display_name", "")
                        if not display_location and len(location_parts) >= 3:
                            display_location = ", ".join(location_parts[2:])

                        all_results.append({
                            "source": "adzuna",
                            "source_id": job_id,
                            "raw_text": job.get("description", ""),
                            "source_url": job.get("redirect_url", ""),
                            "title_hint": job.get("title", ""),
                            "company_hint": job.get("company", {}).get("display_name", ""),
                            "posted_date_hint": job.get("created"),
                            "location_hint": display_location,
                            "work_mode_hint": "",  # Adzuna doesn't provide this
                            "salary_hint": "",
                        })
                        term_count += 1

                except Exception as e:
                    logger.error("adzuna_fetch_error", term=term, page=page, error=str(e))
                    break

            logger.info("adzuna_term_done", term=term, results=term_count)

    logger.info("adzuna_scrape_complete", terms=len(terms), results=len(all_results))
    return all_results
