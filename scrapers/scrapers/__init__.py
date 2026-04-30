from scrapers.types import RawJob
from scrapers.gupy import scrape_gupy

# Scrapers added in subsequent tasks:
# from scrapers.catho import scrape_catho
# from scrapers.vagas import scrape_vagas
# from scrapers.programathor import scrape_programathor

__all__ = [
    "RawJob",
    "scrape_gupy",
]
