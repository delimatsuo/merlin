import re

import pytest
import httpx
from pytest_httpx import HTTPXMock

from scrapers.gupy import scrape_gupy

_GUPY_URL = re.compile(r".*employability-portal\.gupy\.io.*")


SAMPLE_RESPONSE = {
    "data": [
        {
            "id": 99001,
            "name": "Desenvolvedor Backend",
            "description": "We need a backend developer with Python skills.",
            "careerPageName": "Nubank",
            "jobUrl": "https://nubank.gupy.io/jobs/99001",
            "city": "São Paulo",
            "state": "SP",
            "country": "Brasil",
            "publishedDate": "2026-04-30T10:00:00Z",
            "isRemoteWork": False,
            "workplaceType": "onsite",
        }
    ]
}

EMPTY_RESPONSE = {"data": []}


@pytest.mark.asyncio
async def test_scrape_gupy_returns_normalized_jobs(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=_GUPY_URL,
        json=SAMPLE_RESPONSE,
    )
    # Optional: scraper exits early when page < PAGE_SIZE, so this may not be hit
    httpx_mock.add_response(
        url=_GUPY_URL,
        json=EMPTY_RESPONSE,
        is_optional=True,
    )

    jobs = await scrape_gupy(["desenvolvedor"])
    assert len(jobs) == 1
    job = jobs[0]
    assert job["source"] == "gupy"
    assert job["source_id"] == "99001"
    assert job["title_hint"] == "Desenvolvedor Backend"
    assert job["company_hint"] == "Nubank"
    assert job["location_hint"] == "São Paulo, SP, Brasil"
    assert job["work_mode_hint"] == "onsite"


@pytest.mark.asyncio
async def test_scrape_gupy_deduplicates_across_terms(httpx_mock: HTTPXMock):
    # Same job returned for two different search terms.
    # Use a reusable mock so each term gets SAMPLE_RESPONSE on its first page.
    # Scraper exits early (1 result < PAGE_SIZE=100) without fetching page 2.
    httpx_mock.add_response(
        url=_GUPY_URL,
        json=SAMPLE_RESPONSE,
        is_reusable=True,
    )

    jobs = await scrape_gupy(["desenvolvedor", "backend"])
    assert len(jobs) == 1  # deduped by ID


@pytest.mark.asyncio
async def test_scrape_gupy_returns_empty_on_api_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=_GUPY_URL,
        status_code=500,
    )
    jobs = await scrape_gupy(["desenvolvedor"])
    assert jobs == []
