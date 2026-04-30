"""Vagas.com.br job board scraper — plain httpx, no browser needed."""

import asyncio
import json
import re
import unicodedata
from typing import Optional

import httpx
import structlog
from bs4 import BeautifulSoup

from scrapers.types import RawJob

logger = structlog.get_logger()

_BASE = "https://www.vagas.com.br"
_HEADERS = {
    "User-Agent": "MerlinCV-JobAggregator/1.0 (+https://merlincv.com)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "pt-BR,pt;q=0.9",
}
_TIMEOUT = 20.0
_CONCURRENCY = 5


def _keyword_slug(keyword: str) -> str:
    nfkd = unicodedata.normalize("NFD", keyword.lower())
    ascii_str = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", "-", ascii_str.strip())


def _parse_search_ids(html: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    results = []
    for a in soup.select("a.link-detalhes-vaga[data-id-vaga]"):
        job_id = a.get("data-id-vaga", "")
        href = a.get("href", "")
        slug = href.rstrip("/").split("/")[-1] if href else ""
        if job_id and slug:
            results.append((job_id, slug))
    return results


def _parse_ldjson(html: str) -> Optional[dict]:
    soup = BeautifulSoup(html, "lxml")
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                data = next((d for d in data if d.get("@type") == "JobPosting"), None)
            if data and data.get("@type") == "JobPosting":
                return data
        except (json.JSONDecodeError, AttributeError):
            continue
    return None


def _location_str(ldjson: dict) -> str:
    loc = ldjson.get("jobLocation") or {}  # guard against None
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    addr = loc.get("address", {})
    city = addr.get("addressLocality", "")
    state = addr.get("addressRegion", "")
    return ", ".join(p for p in (city, state) if p)


async def _fetch_detail(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    job_id: str,
    slug: str,
) -> Optional[RawJob]:
    url = f"{_BASE}/vagas/v{job_id}/{slug}"
    async with semaphore:
        try:
            resp = await client.get(url)
        except httpx.RequestError as e:
            logger.warning("vagas_detail_request_error", job_id=job_id, error=str(e))
            return None

    if resp.status_code != 200:
        return None

    data = _parse_ldjson(resp.text)
    if not data:
        return None

    org = data.get("hiringOrganization", {})
    company = org.get("name") if isinstance(org, dict) else None

    # Build required fields first
    result: RawJob = {
        "source": "vagas",
        "source_id": job_id,
        "source_url": url,
        "raw_text": data.get("description") or "",
        "title_hint": data.get("title") or "",
    }

    # Only set optional fields when truthy
    if company:
        result["company_hint"] = company
    location = _location_str(data)
    if location:
        result["location_hint"] = location
    result["work_mode_hint"] = "onsite"
    date = (data.get("datePosted") or "")[:10]
    if date:
        result["posted_date_hint"] = date
    return result


async def scrape_vagas(
    search_terms: list[str],
    max_pages: int = 2,
) -> list[RawJob]:
    """Scrape Vagas.com.br for the given search terms."""
    all_ids: dict[str, str] = {}
    semaphore = asyncio.Semaphore(_CONCURRENCY)

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
        for term in search_terms:
            slug = _keyword_slug(term)
            for page in range(1, max_pages + 1):
                url = f"{_BASE}/vagas-de-{slug}?ordenar_por=mais_recentes&pagina={page}"
                try:
                    resp = await client.get(url)
                except httpx.RequestError as e:
                    logger.warning("vagas_search_request_error", term=term, page=page, error=str(e))
                    break

                if resp.status_code != 200:
                    break

                ids = _parse_search_ids(resp.text)
                if not ids:
                    break

                for job_id, job_slug in ids:
                    all_ids[job_id] = job_slug

        results = await asyncio.gather(
            *[_fetch_detail(client, semaphore, jid, jslug) for jid, jslug in all_ids.items()],
            return_exceptions=True,
        )

    out = [r for r in results if isinstance(r, dict)]
    logger.info("vagas_complete", terms=len(search_terms), unique=len(out))
    return out
