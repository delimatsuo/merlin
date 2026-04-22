"""Direct scraper for Gupy's public candidate-portal API.

This is the same endpoint that powers https://portal.gupy.io for all
visitors. It is unauthenticated and free. Replaces the paid Apify actor
(zen-studio/gupy-jobs-scraper) with a 10-50× cheaper path that also
supports keyword search (the Apify actor ignored it).

Endpoint: https://employability-portal.gupy.io/api/v1/jobs
Params:
    limit        — up to 100 per page
    offset       — pagination cursor (tested to 5000+)
    jobName      — keyword search (matched against job title)
    workplaceType — remote | hybrid | onsite (optional)

Returned fields per job:
    id, name, description, companyId, careerPageName, careerPageUrl,
    jobUrl, city, state, country, publishedDate, isRemoteWork,
    workplaceType, applicationDeadline, type, skills, badges
"""

import asyncio
from typing import Optional

import httpx
import structlog

logger = structlog.get_logger()

_API_URL = "https://employability-portal.gupy.io/api/v1/jobs"
_PAGE_SIZE = 100  # Gupy's hard max per page
_USER_AGENT = "MerlinCV-JobAggregator/1.0 (+https://merlincv.com; contact@merlincv.com)"
_CONCURRENCY = 3  # Be polite — 3 concurrent requests max
_REQUEST_TIMEOUT = 20.0
_SEMAPHORE = asyncio.Semaphore(_CONCURRENCY)


async def _fetch_page(
    client: httpx.AsyncClient,
    job_name: str,
    offset: int,
    workplace_type: Optional[str] = None,
) -> list[dict]:
    """Fetch one page of results. Returns [] on any error."""
    params: dict = {
        "limit": _PAGE_SIZE,
        "offset": offset,
        "jobName": job_name,
    }
    if workplace_type:
        params["workplaceType"] = workplace_type

    async with _SEMAPHORE:
        try:
            resp = await client.get(_API_URL, params=params)
        except httpx.RequestError as e:
            logger.warning("gupy_direct_request_error", term=job_name, offset=offset, error=str(e))
            return []

    if resp.status_code != 200:
        # A 400 when offset is too deep ends pagination; anything else is noise.
        if resp.status_code != 400:
            logger.warning(
                "gupy_direct_http_error",
                term=job_name,
                offset=offset,
                status=resp.status_code,
                body=resp.text[:200],
            )
        return []

    try:
        payload = resp.json()
    except ValueError:
        logger.warning("gupy_direct_bad_json", term=job_name, offset=offset)
        return []

    return payload.get("data") or []


async def _scrape_term(
    client: httpx.AsyncClient,
    term: str,
    max_results: int,
) -> list[dict]:
    """Paginate a single keyword search up to max_results."""
    collected: list[dict] = []
    offset = 0
    while len(collected) < max_results:
        batch = await _fetch_page(client, term, offset)
        if not batch:
            break
        collected.extend(batch)
        if len(batch) < _PAGE_SIZE:
            # Gupy returned a short page → we've reached the end for this term.
            break
        offset += _PAGE_SIZE

    logger.info("gupy_direct_term_done", term=term, count=len(collected))
    return collected


def _normalize_job(job: dict) -> dict:
    """Convert Gupy API shape into our canonical scraped-job dict."""
    city = (job.get("city") or "").strip()
    state = (job.get("state") or "").strip()
    country = (job.get("country") or "").strip()
    location_parts = [p for p in (city, state, country) if p]
    location = ", ".join(location_parts)

    remote = bool(job.get("isRemoteWork"))
    workplace = (job.get("workplaceType") or "").lower()
    if workplace in ("remote", "hybrid", "onsite"):
        work_mode = workplace
    elif remote:
        work_mode = "remote"
    else:
        work_mode = "onsite"

    return {
        "source": "gupy",
        "source_id": str(job.get("id") or ""),
        "raw_text": job.get("description") or "",
        "source_url": job.get("jobUrl") or "",
        "title_hint": job.get("name") or "",
        "company_hint": job.get("careerPageName") or "",
        "posted_date_hint": job.get("publishedDate"),
        "location_hint": location,
        "work_mode_hint": work_mode,
    }


async def scrape_gupy_direct(
    search_terms: list[str],
    max_per_term: int = 1500,
) -> list[dict]:
    """Scrape Gupy via the public candidate-portal API.

    Returns a deduplicated list of job dicts in the same shape as the
    existing scrape_gupy (Apify-based) function.
    """
    if not search_terms:
        return []

    headers = {
        "Accept": "application/json",
        "User-Agent": _USER_AGENT,
    }

    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT, headers=headers) as client:
        tasks = [_scrape_term(client, term, max_per_term) for term in search_terms]
        results_per_term = await asyncio.gather(*tasks, return_exceptions=True)

    # Flatten + dedupe by job id.
    seen_ids: set[str] = set()
    deduped: list[dict] = []
    raw_total = 0
    for term_results in results_per_term:
        if isinstance(term_results, BaseException):
            logger.error("gupy_direct_term_failed", error=str(term_results))
            continue
        raw_total += len(term_results)
        for job in term_results:
            jid = str(job.get("id") or "")
            if not jid or jid in seen_ids:
                continue
            seen_ids.add(jid)
            deduped.append(_normalize_job(job))

    logger.info(
        "gupy_direct_complete",
        terms=len(search_terms),
        raw_total=raw_total,
        unique=len(deduped),
    )
    return deduped
