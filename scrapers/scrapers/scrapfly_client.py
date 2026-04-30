import structlog
from scrapfly import ScrapflyClient, ScrapeConfig

logger = structlog.get_logger()


class ScrapflyJobClient:
    """Thin async wrapper around scrapfly-sdk for job board scraping."""

    def __init__(self, api_key: str) -> None:
        self._client = ScrapflyClient(key=api_key)

    async def fetch(
        self,
        url: str,
        use_browser: bool = False,
        asp: bool = False,
        country: str = "BR",
    ) -> str:
        """Fetch a URL and return the HTML body as a string.

        Raises ValueError if the response has empty content.
        """
        config = ScrapeConfig(
            url=url,
            render_js=use_browser,
            asp=asp,
            country=country,
        )
        result = await self._client.async_scrape(config)
        html = result.scrape_result.get("content", "")
        if not html:
            raise ValueError(f"Scrapfly returned empty content for {url}")
        logger.debug("scrapfly_fetch_ok", url=url, bytes=len(html))
        return html
