from typing import Literal, TypedDict

Source = Literal["gupy", "catho", "vagas", "programathor"]


class _RawJobRequired(TypedDict):
    source: Source
    source_id: str        # board-native job ID
    source_url: str       # canonical URL
    raw_text: str         # full job description (HTML stripped by caller)
    title_hint: str       # job title as scraped (before AI enrichment)


class RawJob(_RawJobRequired, total=False):
    # Optional — populated when available from the board
    company_hint: str
    location_hint: str
    work_mode_hint: str   # "remote" | "hybrid" | "onsite"
    salary_hint: str      # free-form string e.g. "Até R$12.000"
    posted_date_hint: str # ISO date string "YYYY-MM-DD"
