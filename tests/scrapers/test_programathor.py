import pytest
from pytest_httpx import HTTPXMock

from scrapers.programathor import scrape_programathor


# Based on actual ProgramaThor HTML observed 2026-04-30:
# - Cards: div.cell-list containing <a href="/jobs/{id}-{slug}">
# - Title: h3 inside .cell-list-content
# - Meta spans inside .cell-list-content-icon:
#     fa-briefcase  → company
#     fa-map-marker → location
#     fa-money-bill → salary
# - ID is the leading number in the slug: /jobs/33470-...
LISTING_HTML = """
<html><body>
  <div class="cell-list">
    <a href="/jobs/33470-desenvolvedor-backend-pleno">
      <div class="row">
        <div class="col-sm-9">
          <div class="cell-list-content">
            <h3 class="text-24 line-height-30">Desenvolvedor Backend Pleno</h3>
            <div class="cell-list-content-icon">
              <span><i class="fa fa-briefcase"></i> Startup ABC</span>
              <span><i class="fas fa-map-marker-alt"></i> São Paulo - SP</span>
              <span><i class="fa fa-building"></i> Startup</span>
              <span><i class="far fa-money-bill-alt"></i> Até R$10.000</span>
            </div>
          </div>
        </div>
      </div>
    </a>
  </div>
</body></html>
"""

EMPTY_HTML = "<html><body></body></html>"


@pytest.mark.asyncio
async def test_scrape_programathor_parses_cards(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://programathor.com.br/jobs?search=backend&page=1",
        text=LISTING_HTML,
        headers={"Content-Type": "text/html"},
    )
    # page 2 returns empty — stops pagination
    httpx_mock.add_response(
        url="https://programathor.com.br/jobs?search=backend&page=2",
        text=EMPTY_HTML,
        headers={"Content-Type": "text/html"},
    )

    jobs = await scrape_programathor(["backend"], max_pages=3)

    assert len(jobs) == 1
    job = jobs[0]
    assert job["source"] == "programathor"
    assert job["source_id"] == "33470"
    assert job["source_url"] == "https://programathor.com.br/jobs/33470-desenvolvedor-backend-pleno"
    assert job["title_hint"] == "Desenvolvedor Backend Pleno"
    assert job["company_hint"] == "Startup ABC"
    assert job["location_hint"] == "São Paulo - SP"
    assert job["salary_hint"] == "Até R$10.000"
    assert job["raw_text"] == "Desenvolvedor Backend Pleno"


@pytest.mark.asyncio
async def test_scrape_programathor_deduplicates(httpx_mock: HTTPXMock):
    """Same card appearing under two different search terms is returned only once."""
    # First term: page 1 has the card, page 2 empty
    httpx_mock.add_response(
        url="https://programathor.com.br/jobs?search=backend&page=1",
        text=LISTING_HTML,
        headers={"Content-Type": "text/html"},
    )
    httpx_mock.add_response(
        url="https://programathor.com.br/jobs?search=backend&page=2",
        text=EMPTY_HTML,
        headers={"Content-Type": "text/html"},
    )
    # Second term: same card again, page 2 empty
    httpx_mock.add_response(
        url="https://programathor.com.br/jobs?search=python&page=1",
        text=LISTING_HTML,
        headers={"Content-Type": "text/html"},
    )
    httpx_mock.add_response(
        url="https://programathor.com.br/jobs?search=python&page=2",
        text=EMPTY_HTML,
        headers={"Content-Type": "text/html"},
    )

    jobs = await scrape_programathor(["backend", "python"], max_pages=3)

    assert len(jobs) == 1
    assert jobs[0]["source_id"] == "33470"
