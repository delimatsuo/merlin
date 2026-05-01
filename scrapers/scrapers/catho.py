"""Scraper for Catho.com.br job listings.

Catho aggressively blocks plain HTTP clients, so every request is routed
through Scrapfly with browser rendering (render_js=True) and anti-scraping
protection (asp=True).

Public entry point:
    scrape_catho(search_terms, scrapfly_api_key, max_pages=2) -> list[RawJob]

Lower-level helpers (useful for unit-testing):
    search_catho(client, keyword, page=1) -> list[RawJob]
    fetch_catho_detail(client, job_id, slug)  -> RawJob | None
"""

import json
import re
import structlog
from typing import Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from scrapers.types import RawJob
from scrapers.scrapfly_client import ScrapflyJobClient

logger = structlog.get_logger()

_SEARCH_URL = "https://www.catho.com.br/vagas/?q={query}&ordenar=mais_recentes&page={page}"
_DETAIL_URL = "https://www.catho.com.br/vagas/{slug}/{job_id}"

# Regex matching the last path segment of a Catho job URL — always numeric.
_JOB_ID_RE = re.compile(r"/vagas/[^/]+/(\d+)/?$")
_BR_STATE_RE = re.compile(
    r"(?:^|[\s,/-])"
    r"(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)"
    r"(?:$|[\s,/-])",
    re.IGNORECASE,
)
_COMMON_LOCATION_TERMS = (
    "remoto",
    "home office",
    "hibrido",
    "híbrido",
    "sao paulo",
    "são paulo",
    "rio de janeiro",
    "belo horizonte",
    "curitiba",
    "porto alegre",
    "brasilia",
    "brasília",
    "campinas",
)


# ---------------------------------------------------------------------------
# HTML parsing helpers
# ---------------------------------------------------------------------------

def _slug_from_href(href: str) -> str:
    """Extract the slug segment from a Catho job href or absolute URL."""
    path = urlparse(href).path
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 3 and parts[0] == "vagas":
        return parts[1]
    return ""


def _card_raw_text(
    *,
    title: str,
    company_hint: str = "",
    location_hint: str = "",
    salary_hint: str = "",
) -> str:
    """Build enough text from a Catho card for extraction and persistence.

    Catho search pages expose useful card metadata, but not the full job
    description. The main scraper intentionally drops rows with empty raw_text,
    so keeping these hints here prevents Catho cards from disappearing before
    they can be matched by title/location/source.
    """
    fields = [
        f"Titulo: {title}",
        f"Empresa: {company_hint or 'Nao informada'}",
        f"Local: {location_hint or 'Nao informado'}",
        f"Salario: {salary_hint or 'Nao informado'}",
        "Fonte: Catho",
    ]
    return ". ".join(fields) + "."


def _looks_like_location(text: str) -> bool:
    if not text:
        return False
    value = " ".join(text.split())
    if len(value) > 80:
        return False
    lower = value.lower()
    if any(term in lower for term in _COMMON_LOCATION_TERMS):
        return True
    return bool(_BR_STATE_RE.search(value))


def _parse_search_cards(html: str) -> list[RawJob]:
    """Extract job cards from a Catho search-results page.

    Each card has an anchor whose href matches ``/vagas/<slug>/<numeric-id>``.
    We collect the job_id from the path and pull a few hint fields from the
    surrounding card markup.
    """
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    jobs: list[RawJob] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        match = _JOB_ID_RE.search(href)
        if not match:
            continue
        job_id = match.group(1)
        if job_id in seen:
            continue
        seen.add(job_id)

        title = anchor.get_text(strip=True)
        if not title:
            continue

        # Walk up to the nearest list-item or container to harvest sibling hints.
        card = anchor.find_parent("li") or anchor.find_parent("div")

        company_hint = ""
        salary_hint = ""
        location_hint = ""

        if card:
            # Company: first <p> that is NOT the title anchor's parent.
            paras = card.find_all("p")
            if paras:
                company_hint = paras[0].get_text(strip=True)
            # Location: first span that looks like a real Brazilian location.
            # Catho cards can include badges such as "Candidatura rapida" before
            # the actual location; treating those as locations makes the backend
            # country filter discard otherwise valid rows.
            for span in card.find_all("span"):
                span_text = span.get_text(" ", strip=True)
                if _looks_like_location(span_text):
                    location_hint = span_text
                    break
            # Salary: first <strong> inside the card.
            strong = card.find("strong")
            if strong:
                salary_hint = strong.get_text(strip=True)

        job: RawJob = {
            "source": "catho",
            "source_id": job_id,
            "source_url": _DETAIL_URL.format(
                slug=_slug_from_href(href),
                job_id=job_id,
            ),
            "raw_text": _card_raw_text(
                title=title,
                company_hint=company_hint,
                location_hint=location_hint,
                salary_hint=salary_hint,
            ),
            "title_hint": title,
        }
        if company_hint:
            job["company_hint"] = company_hint
        if location_hint:
            job["location_hint"] = location_hint
        if salary_hint:
            job["salary_hint"] = salary_hint

        jobs.append(job)

    return jobs


def _parse_detail_ldjson(html: str) -> Optional[dict]:
    """Return the first ``@type: JobPosting`` ld+json block found in *html*."""
    if not html:
        return None

    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        # Handle both a single object and an array of objects.
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and item.get("@type") == "JobPosting":
                    return item
        elif isinstance(data, dict) and data.get("@type") == "JobPosting":
            return data

    return None


def _format_salary(ldjson: dict) -> Optional[str]:
    """Build a human-readable salary string from a baseSalary ld+json block.

    Example output: ``"BRL 7.000 – 10.000/mês"``
    """
    base = ldjson.get("baseSalary")
    if not base:
        return None

    currency = base.get("currency", "")
    value = base.get("value") or {}

    if isinstance(value, dict):
        min_val = value.get("minValue")
        max_val = value.get("maxValue")
        unit = (value.get("unitText") or "").upper()
        unit_label = {"MONTH": "mês", "YEAR": "ano", "HOUR": "hora"}.get(unit, unit.lower())

        def _fmt(v) -> str:
            try:
                return f"{int(v):,.0f}".replace(",", ".")
            except (TypeError, ValueError):
                return str(v)

        if min_val and max_val:
            return f"{currency} {_fmt(min_val)} – {_fmt(max_val)}/{unit_label}"
        elif max_val:
            return f"{currency} até {_fmt(max_val)}/{unit_label}"
        elif min_val:
            return f"{currency} {_fmt(min_val)}/{unit_label}"

    return None


def _location_str(ldjson: dict) -> str:
    """Extract ``"City, State"`` from jobLocation ld+json."""
    locations = ldjson.get("jobLocation") or []
    if isinstance(locations, dict):
        locations = [locations]

    parts: list[str] = []
    for loc in locations:
        addr = loc.get("address") or {}
        city = addr.get("addressLocality", "").strip()
        region = addr.get("addressRegion", "").strip()
        if city and region:
            parts.append(f"{city}, {region}")
        elif city:
            parts.append(city)
        elif region:
            parts.append(region)

    return " | ".join(parts)


def _work_mode(ldjson: dict) -> str:
    """Detect work mode from jobLocation address.

    Returns ``"remote"`` if any location locality contains "remot" (case-insensitive),
    otherwise ``"onsite"``.
    """
    locations = ldjson.get("jobLocation") or []
    if isinstance(locations, dict):
        locations = [locations]

    for loc in locations:
        addr = loc.get("address") or {}
        city = (addr.get("addressLocality") or "").lower()
        if "remot" in city:
            return "remote"

    # Also check applicantLocationRequirements if present.
    remote_req = ldjson.get("applicantLocationRequirements")
    if remote_req:
        return "remote"

    job_type = (ldjson.get("jobLocationType") or "").upper()
    if job_type == "TELECOMMUTE":
        return "remote"

    return "onsite"


# ---------------------------------------------------------------------------
# Async search / detail fetchers
# ---------------------------------------------------------------------------

async def search_catho(
    client,
    keyword: str,
    page: int = 1,
) -> list[RawJob]:
    """Fetch one search-results page from Catho and parse job cards.

    Parameters
    ----------
    client:
        A ``ScrapflyJobClient`` (or compatible mock).
    keyword:
        Search keyword(s), e.g. ``"desenvolvedor backend"``.
    page:
        1-based page number.

    Returns
    -------
    list[RawJob]
        Parsed job cards (may be empty if the page is empty or fetch fails).
    """
    url = _SEARCH_URL.format(
        query=keyword.replace(" ", "+"),
        page=page,
    )
    try:
        html = await client.fetch(url, use_browser=True, asp=True)
    except Exception as exc:
        logger.warning("catho_search_failed", url=url, error=str(exc))
        return []

    jobs = _parse_search_cards(html)
    logger.debug("catho_search_done", keyword=keyword, page=page, count=len(jobs))
    return jobs


async def fetch_catho_detail(
    client,
    job_id: str,
    slug: str,
) -> Optional[RawJob]:
    """Fetch a Catho job-detail page and parse it via ld+json.

    Returns ``None`` (instead of raising) when no ``JobPosting`` ld+json is found.
    """
    url = _DETAIL_URL.format(slug=slug, job_id=job_id)
    try:
        html = await client.fetch(url, use_browser=True, asp=True)
    except Exception as exc:
        logger.warning("catho_detail_failed", url=url, job_id=job_id, error=str(exc))
        return None

    ldjson = _parse_detail_ldjson(html)
    if ldjson is None:
        logger.debug("catho_no_ldjson", url=url, job_id=job_id)
        return None

    title = ldjson.get("title") or ""
    org = ldjson.get("hiringOrganization") or {}
    company = org.get("name", "") if isinstance(org, dict) else ""
    description = ldjson.get("description") or ""
    date_posted = (ldjson.get("datePosted") or "")[:10] or None
    location = _location_str(ldjson)
    mode = _work_mode(ldjson)
    salary = _format_salary(ldjson)

    job: RawJob = {
        "source": "catho",
        "source_id": job_id,
        "source_url": url,
        "raw_text": description,
        "title_hint": title,
    }
    if company:
        job["company_hint"] = company
    if location:
        job["location_hint"] = location
    if mode:
        job["work_mode_hint"] = mode
    if salary:
        job["salary_hint"] = salary
    if date_posted:
        job["posted_date_hint"] = date_posted

    return job


# ---------------------------------------------------------------------------
# High-level entry point
# ---------------------------------------------------------------------------

async def scrape_catho(
    search_terms: list[str],
    scrapfly_api_key: str,
    max_pages: int = 2,
) -> list[RawJob]:
    """Scrape Catho for all given *search_terms*.

    Creates a ``ScrapflyJobClient`` internally so callers only need to supply
    the API key. Results are deduplicated by ``source_id`` across all terms and
    pages.

    Parameters
    ----------
    search_terms:
        List of keyword strings to search, e.g. ``["desenvolvedor", "backend"]``.
    scrapfly_api_key:
        Scrapfly API key (stored in GCP Secret Manager in production).
    max_pages:
        Number of search-result pages to fetch per term (default 2).

    Returns
    -------
    list[RawJob]
        Deduplicated list of jobs scraped from Catho.
    """
    if not search_terms:
        return []

    client = ScrapflyJobClient(api_key=scrapfly_api_key)

    seen_ids: set[str] = set()
    deduped: list[RawJob] = []

    for term in search_terms:
        for page in range(1, max_pages + 1):
            cards = await search_catho(client, keyword=term, page=page)
            if not cards:
                break  # No results on this page — stop paginating this term.

            new_cards = [c for c in cards if c["source_id"] not in seen_ids]
            if not new_cards:
                break  # All cards already seen — stop paginating.

            for card in new_cards:
                seen_ids.add(card["source_id"])
                deduped.append(card)

    logger.info(
        "catho_complete",
        terms=len(search_terms),
        unique=len(deduped),
    )
    return deduped
