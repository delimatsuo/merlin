"""Pydantic schemas for job matching feature."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# --- Job Preferences ---

WorkMode = Literal["remote", "hybrid", "onsite"]
Seniority = Literal["junior", "mid", "senior", "lead"]
EmailFrequency = Literal["daily", "weekly", "off"]


class JobPreferencesRequest(BaseModel):
    desired_titles: list[str] = Field(
        ..., min_length=1, max_length=10,
        description="Job titles to match against (max 10)",
    )
    locations: list[str] = Field(
        default=[], max_length=10,
        description="Preferred locations (empty = any)",
    )
    work_mode: list[WorkMode] = Field(
        default=[], max_length=3,
        description="Preferred work modes",
    )
    seniority: list[Seniority] = Field(
        default=[], max_length=4,
        description="Preferred seniority levels",
    )
    min_score: int = Field(
        default=50, ge=0, le=100,
        description="Minimum ATS match score to include",
    )
    email_digest: bool = Field(
        default=True,
        description="Deprecated — use email_frequency instead",
    )
    email_frequency: EmailFrequency = Field(
        default="daily",
        description="Email digest frequency: daily, weekly, or off",
    )
    @field_validator("desired_titles")
    @classmethod
    def validate_titles(cls, v: list[str]) -> list[str]:
        validated = []
        for title in v:
            title = title.strip()
            if not title:
                continue
            if len(title) > 100:
                title = title[:100]
            validated.append(title)
        if not validated:
            raise ValueError("At least one desired title is required")
        return validated

    @field_validator("locations")
    @classmethod
    def validate_locations(cls, v: list[str]) -> list[str]:
        return [loc.strip()[:100] for loc in v if loc.strip()]


class JobPreferencesResponse(BaseModel):
    desired_titles: list[str] = []
    locations: list[str] = []
    work_mode: list[str] = []
    seniority: list[str] = []
    min_score: int = 50
    email_digest: bool = True
    email_frequency: str = "daily"
    last_updated: Optional[str] = None


# --- Extracted Job (from scraping pipeline) ---

class ExtractedJob(BaseModel):
    title: str = ""
    company: str = ""
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    location: str = ""
    seniority: str = ""
    salary_range: Optional[str] = None
    work_mode: str = "onsite"
    posted_date: Optional[str] = None

    model_config = {"extra": "ignore"}


# --- Matched Job (in user's daily feed) ---

class MatchedJob(BaseModel):
    job_id: str = ""
    title: str = ""
    company: str = ""
    ats_score: float = 0
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    source: str = ""
    source_url: str = ""
    posted_date: Optional[str] = None
    work_mode: str = "onsite"
    location: str = ""

    model_config = {"extra": "ignore"}

    @field_validator("company", mode="before")
    @classmethod
    def coerce_company(cls, v: object) -> str:
        return str(v) if v else ""


class JobFeedResponse(BaseModel):
    date: str
    matches: list[MatchedJob] = []
    total_matches: int = 0
    generated_at: Optional[str] = None
