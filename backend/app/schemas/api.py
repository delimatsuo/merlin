"""Pydantic schemas for API request/response validation."""

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator


# --- Profile ---

class ExperienceItem(BaseModel):
    company: str = ""
    role: str = ""
    start_date: Optional[str] = Field(alias="startDate", default=None)
    end_date: Optional[str] = Field(alias="endDate", default=None)
    description: str = ""

    model_config = {"populate_by_name": True, "extra": "ignore"}


class EducationItem(BaseModel):
    institution: str = ""
    degree: str = ""
    field: str = ""
    start_date: Optional[str] = Field(alias="startDate", default=None)
    end_date: Optional[str] = Field(alias="endDate", default=None)

    model_config = {"populate_by_name": True, "extra": "ignore"}


class LanguageItem(BaseModel):
    language: str = ""
    level: str = ""

    model_config = {"extra": "ignore"}


class ProfileData(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[str] = []
    languages: list[LanguageItem] = []
    certifications: list[str] = []

    model_config = {"extra": "ignore"}

    @field_validator("languages", mode="before")
    @classmethod
    def coerce_languages(cls, v: list) -> list:
        """Handle AI returning plain strings instead of {language, level} objects."""
        if not isinstance(v, list):
            return []
        result = []
        for item in v:
            if isinstance(item, str):
                result.append({"language": item, "level": ""})
            elif isinstance(item, dict):
                result.append(item)
        return result

    @field_validator("experience", mode="before")
    @classmethod
    def coerce_experience(cls, v: list) -> list:
        """Skip non-dict entries in experience list."""
        if not isinstance(v, list):
            return []
        return [item for item in v if isinstance(item, dict)]

    @field_validator("education", mode="before")
    @classmethod
    def coerce_education(cls, v: list) -> list:
        """Skip non-dict entries in education list."""
        if not isinstance(v, list):
            return []
        return [item for item in v if isinstance(item, dict)]

    @field_validator("skills", "certifications", mode="before")
    @classmethod
    def coerce_string_list(cls, v: list) -> list:
        """Ensure list of strings, converting non-string items."""
        if not isinstance(v, list):
            return []
        return [str(item) for item in v if item]


class ProfileResponse(BaseModel):
    profile_id: str = Field(alias="profileId")
    profile: ProfileData
    status: str = "parsed"

    model_config = {"populate_by_name": True}


class ProfileUpdateRequest(BaseModel):
    profile: ProfileData


# --- Job Analysis ---

class JobAnalysisRequest(BaseModel):
    job_description: str = Field(alias="jobDescription", min_length=50, max_length=50000)

    model_config = {"populate_by_name": True}


class SkillMatch(BaseModel):
    skill: str
    status: str  # "has", "likely", "missing"
    evidence: Optional[str] = None


class FollowUpDecision(BaseModel):
    decision: str  # "skip", "text", "voice"
    questions: list[str] = []

    model_config = {"populate_by_name": True}


class JobAnalysisResponse(BaseModel):
    analysis: dict
    skills_matrix: list[SkillMatch] = Field(alias="skillsMatrix", default=[])
    ats_score: Optional[float] = Field(alias="atsScore", default=None)
    application_id: str = Field(alias="applicationId", default="")
    follow_up: Optional[FollowUpDecision] = Field(alias="followUp", default=None)

    model_config = {"populate_by_name": True}


# --- Tailoring ---

class TailorRequest(BaseModel):
    profile_id: str = Field(alias="profileId")
    application_id: str = Field(alias="applicationId")

    model_config = {"populate_by_name": True}


class RegenerateRequest(BaseModel):
    instructions: str = Field(min_length=1, max_length=500)
    application_id: str = Field(alias="applicationId")

    model_config = {"populate_by_name": True}


class ChangelogItem(BaseModel):
    section: str
    what: str
    why: str
    category: Literal["keyword", "ats", "impact", "structure"]


class TailorResponse(BaseModel):
    resume_content: str = Field(alias="resumeContent")
    cover_letter: str = Field(alias="coverLetter")
    ats_score: float = Field(alias="atsScore")
    changelog: list[ChangelogItem] = []
    version: int = 1

    model_config = {"populate_by_name": True}


# --- Voice ---

class VoiceSessionResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    questions: list[str]
    status: str

    model_config = {"populate_by_name": True}


# --- Usage ---

class UsageResponse(BaseModel):
    tailor_count: int = Field(alias="tailorCount")
    daily_limit: int = Field(alias="dailyLimit")
    date: str

    model_config = {"populate_by_name": True}


# --- Recommendations ---

class RecommendationExample(BaseModel):
    before: str
    after: str


class Recommendation(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    title: str
    detail: str
    examples: list[RecommendationExample] = []


class RecommendationsResponse(BaseModel):
    recommendations: list[Recommendation] = []
