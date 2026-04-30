from scrapers.types import RawJob
from scrapers.gupy import scrape_gupy
from scrapers.catho import scrape_catho
from scrapers.vagas import scrape_vagas

# Scrapers added in subsequent tasks:
# from scrapers.programathor import scrape_programathor

__all__ = [
    "RawJob",
    "scrape_gupy",
    "scrape_catho",
    "scrape_vagas",
]
