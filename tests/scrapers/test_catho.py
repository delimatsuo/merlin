import json
import pytest
from unittest.mock import AsyncMock, patch

from scrapers.catho import search_catho, fetch_catho_detail
from scrapers.scrapfly_client import ScrapflyJobClient


SEARCH_HTML = """
<html><body>
<ul>
  <li>
    <h2><a href="/vagas/desenvolvedor-backend/36001" data-offer-id="36001">Desenvolvedor Backend</a></h2>
    <p>Empresa Acme</p>
    <p><span>São Paulo</span></p>
    <p><strong>R$ 8.000</strong></p>
    <p>Publicada Hoje</p>
  </li>
  <li>
    <h2><a href="/vagas/engenheiro-software/36002" data-offer-id="36002">Engenheiro de Software</a></h2>
    <p>Empresa Confidencial</p>
    <p><span>Remoto</span></p>
    <p><strong>A Combinar</strong></p>
    <p>Publicada Hoje</p>
  </li>
</ul>
</body></html>
"""

DETAIL_HTML = """
<html><head>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Desenvolvedor Backend",
  "description": "We need a Python expert with 3+ years experience.",
  "datePosted": "2026-04-30",
  "employmentType": "CLT (Efetivo)",
  "hiringOrganization": {"@type": "Organization", "name": "Acme Corp"},
  "jobLocation": [{"@type": "Place", "address": {"addressLocality": "São Paulo", "addressRegion": "SP"}}],
  "baseSalary": {"@type": "MonetaryAmount", "currency": "BRL", "value": {"minValue": 7000, "maxValue": 10000, "unitText": "MONTH"}}
}
</script>
</head><body></body></html>
"""


@pytest.fixture
def scrapfly():
    client = AsyncMock(spec=ScrapflyJobClient)
    return client


@pytest.mark.asyncio
async def test_search_catho_extracts_job_ids_and_card_data(scrapfly):
    scrapfly.fetch.return_value = SEARCH_HTML

    results = await search_catho(scrapfly, keyword="desenvolvedor backend", page=1)

    assert len(results) == 2
    assert results[0]["source"] == "catho"
    assert results[0]["source_id"] == "36001"
    assert results[0]["title_hint"] == "Desenvolvedor Backend"
    assert results[0]["company_hint"] == "Empresa Acme"
    assert results[0]["salary_hint"] == "R$ 8.000"
    assert results[1]["source_id"] == "36002"


@pytest.mark.asyncio
async def test_search_catho_returns_empty_on_no_results(scrapfly):
    scrapfly.fetch.return_value = "<html><body><ul></ul></body></html>"
    results = await search_catho(scrapfly, keyword="xyznonexistent", page=1)
    assert results == []


@pytest.mark.asyncio
async def test_fetch_catho_detail_parses_ldjson(scrapfly):
    scrapfly.fetch.return_value = DETAIL_HTML

    job = await fetch_catho_detail(scrapfly, job_id="36001", slug="desenvolvedor-backend")

    assert job["source"] == "catho"
    assert job["source_id"] == "36001"
    assert job["title_hint"] == "Desenvolvedor Backend"
    assert job["company_hint"] == "Acme Corp"
    assert job["location_hint"] == "São Paulo, SP"
    assert job["salary_hint"] == "BRL 7.000 – 10.000/mês"
    assert job["work_mode_hint"] == "onsite"
    assert "Python expert" in job["raw_text"]


@pytest.mark.asyncio
async def test_fetch_catho_detail_returns_none_on_missing_ldjson(scrapfly):
    scrapfly.fetch.return_value = "<html><body>No JSON here</body></html>"
    job = await fetch_catho_detail(scrapfly, job_id="36001", slug="dev")
    assert job is None


@pytest.mark.asyncio
async def test_scrape_catho_deduplicates_across_terms():
    from scrapers.catho import scrape_catho
    with patch("scrapers.catho.ScrapflyJobClient") as MockClient:
        instance = AsyncMock()
        instance.fetch.side_effect = [SEARCH_HTML, "", SEARCH_HTML, ""]
        MockClient.return_value = instance
        jobs = await scrape_catho(["desenvolvedor", "backend"], scrapfly_api_key="test")
    assert len(jobs) == 2  # deduped by source_id
