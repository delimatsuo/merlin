import pytest
from pytest_httpx import HTTPXMock

from scrapers.vagas import scrape_vagas


SEARCH_HTML = """
<html><body><ul>
  <li class="vaga odd">
    <h2 class="cargo">
      <a class="link-detalhes-vaga"
         data-id-vaga="2811001"
         href="/vagas/v2811001/desenvolvedor-backend-pleno"
         title="Desenvolvedor Backend Pleno">
        Desenvolvedor Backend Pleno
      </a>
    </h2>
    <span class="emprVaga">Nubank</span>
    <div class="vaga-local">São Paulo / SP</div>
    <span class="data-publicacao">Hoje</span>
  </li>
</ul></body></html>
"""

DETAIL_HTML = """
<html><head>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Desenvolvedor Backend Pleno",
  "description": "Precisamos de dev Python com experiência em APIs REST.",
  "datePosted": "2026-04-30",
  "hiringOrganization": {"name": "Nubank"},
  "jobLocation": {"@type": "Place", "address": {"addressLocality": "São Paulo", "addressRegion": "SP", "addressCountry": "Brasil"}}
}
</script>
</head><body></body></html>
"""

EMPTY_HTML = "<html><body><ul></ul></body></html>"


@pytest.mark.asyncio
async def test_scrape_vagas_parses_search_and_detail(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://www.vagas.com.br/vagas-de-desenvolvedor?ordenar_por=mais_recentes&pagina=1",
        text=SEARCH_HTML,
        headers={"Content-Type": "text/html"},
    )
    httpx_mock.add_response(
        url="https://www.vagas.com.br/vagas/v2811001/desenvolvedor-backend-pleno",
        text=DETAIL_HTML,
        headers={"Content-Type": "text/html"},
    )

    jobs = await scrape_vagas(["desenvolvedor"], max_pages=1)
    assert len(jobs) == 1
    job = jobs[0]
    assert job["source"] == "vagas"
    assert job["source_id"] == "2811001"
    assert job["title_hint"] == "Desenvolvedor Backend Pleno"
    assert job["company_hint"] == "Nubank"
    assert job["location_hint"] == "São Paulo, SP"
    assert "APIs REST" in job["raw_text"]


@pytest.mark.asyncio
async def test_scrape_vagas_stops_on_empty_page(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        text=EMPTY_HTML,
        headers={"Content-Type": "text/html"},
    )
    jobs = await scrape_vagas(["dev"], max_pages=5)
    assert jobs == []
    assert len(httpx_mock.get_requests()) == 1


@pytest.mark.asyncio
async def test_scrape_vagas_detail_failures_dont_cancel_batch(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="https://www.vagas.com.br/vagas-de-desenvolvedor?ordenar_por=mais_recentes&pagina=1",
        text=SEARCH_HTML,
        headers={"Content-Type": "text/html"},
    )
    httpx_mock.add_response(
        url="https://www.vagas.com.br/vagas/v2811001/desenvolvedor-backend-pleno",
        status_code=503,
    )
    jobs = await scrape_vagas(["desenvolvedor"], max_pages=1)
    assert jobs == []  # detail failed but no exception raised
