import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from scrapers.scrapfly_client import ScrapflyJobClient


@pytest.fixture
def client():
    return ScrapflyJobClient(api_key="test_key")


@pytest.mark.asyncio
async def test_fetch_html_returns_content(client):
    mock_result = MagicMock()
    mock_result.scrape_result = {"content": "<html>Hello</html>"}

    with patch.object(client._client, "async_scrape", new=AsyncMock(return_value=mock_result)):
        html = await client.fetch(
            "https://www.catho.com.br/vagas/?q=dev",
            use_browser=True,
            asp=True,
        )

    assert html == "<html>Hello</html>"


@pytest.mark.asyncio
async def test_fetch_raises_on_empty_content(client):
    mock_result = MagicMock()
    mock_result.scrape_result = {"content": ""}

    with patch.object(client._client, "async_scrape", new=AsyncMock(return_value=mock_result)):
        with pytest.raises(ValueError, match="empty"):
            await client.fetch("https://www.catho.com.br/vagas/?q=dev")
