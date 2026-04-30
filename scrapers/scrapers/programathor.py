"""ProgramaThor job board scraper — plain httpx, SSR.

HTML structure observed 2026-04-30:
  - Cards:   div.cell-list > a[href="/jobs/{id}-{slug}"]
  - Title:   h3 inside .cell-list-content
  - Meta:    spans inside .cell-list-content-icon, identified by Font Awesome icon class:
               fa-briefcase       → company name
               fa-map-marker-alt  → location
               fa-money-bill-alt  → salary hint
  - ID:      leading integer in the slug  /jobs/33470-some-title → "33470"
"""

import re
from typing import Optional

import httpx
import structlog
from bs4 import BeautifulSoup, Tag

from scrapers.types import RawJob

logger = structlog.get_logger()

_BASE = "https://programathor.com.br"
_HEADERS = {
    "User-Agent": "MerlinCV-JobAggregator/1.0 (+https://merlincv.com)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "pt-BR,pt;q=0.9",
}
_TIMEOUT = 20.0

# Matches the leading numeric ID in ProgramaThor slugs: /jobs/33470-some-title
_ID_RE = re.compile(r"^/jobs/(\d+)-")


def _extract_id(href: str) -> Optional[str]:
    """'/jobs/33470-some-title' → '33470'"""
    m = _ID_RE.match(href)
    return m.group(1) if m else None


def _icon_sibling_text(span: Tag, icon_class: str) -> str:
    """Return stripped text of a span whose <i> has the given FA icon class."""
    icon = span.find("i", class_=icon_class)
    if not icon:
        return ""
    # Text is the NavigableString sibling after the <i>
    text = icon.next_sibling
    if text is None:
        return ""
    return str(text).strip()


def _parse_cards(html: str) -> list[RawJob]:
    soup = BeautifulSoup(html, "lxml")
    jobs: list[RawJob] = []

    for card in soup.select("div.cell-list"):
        link = card.find("a", href=_ID_RE)
        if not link or not isinstance(link, Tag):
            continue

        href: str = link["href"]  # type: ignore[assignment]
        source_id = _extract_id(href)
        if not source_id:
            continue

        source_url = f"{_BASE}{href}"

        # Title — strip any inner <span> text (e.g. "NOVA" badge)
        h3 = card.select_one("h3")
        if not h3:
            continue
        for badge in h3.find_all("span"):
            badge.decompose()
        title = h3.get_text(strip=True)

        # Meta icons
        company = location = salary = ""
        content_icon = card.select_one(".cell-list-content-icon")
        if content_icon:
            for span in content_icon.find_all("span"):
                if not company:
                    company = _icon_sibling_text(span, "fa-briefcase")
                if not location:
                    location = _icon_sibling_text(span, "fa-map-marker-alt")
                if not salary:
                    salary = _icon_sibling_text(span, "fa-money-bill-alt")

        job: RawJob = {
            "source": "programathor",
            "source_id": source_id,
            "source_url": source_url,
            "title_hint": title,
            "raw_text": title,  # listing page only; no separate detail fetch
        }
        if company:
            job["company_hint"] = company
        if location:
            job["location_hint"] = location
        if salary:
            job["salary_hint"] = salary

        jobs.append(job)

    return jobs


async def scrape_programathor(
    search_terms: list[str],
    max_pages: int = 3,
) -> list[RawJob]:
    """Scrape ProgramaThor for the given search terms.

    Iterates over each term and paginated pages.  Stops a term's pagination
    early when a page returns no cards.  Deduplicates by source_id across all
    terms.
    """
    seen: set[str] = set()
    out: list[RawJob] = []

    async with httpx.AsyncClient(
        timeout=_TIMEOUT,
        headers=_HEADERS,
        follow_redirects=True,
    ) as client:
        for term in search_terms:
            encoded = term.replace(" ", "+")
            for page in range(1, max_pages + 1):
                url = f"{_BASE}/jobs?search={encoded}&page={page}"
                try:
                    resp = await client.get(url)
                except httpx.RequestError as exc:
                    logger.warning(
                        "programathor_request_error",
                        term=term,
                        page=page,
                        error=str(exc),
                    )
                    break

                if resp.status_code != 200:
                    logger.warning(
                        "programathor_bad_status",
                        term=term,
                        page=page,
                        status=resp.status_code,
                    )
                    break

                cards = _parse_cards(resp.text)
                if not cards:
                    break  # no more results for this term

                for job in cards:
                    sid = job["source_id"]
                    if sid not in seen:
                        seen.add(sid)
                        out.append(job)

    logger.info("programathor_complete", unique=len(out))
    return out
