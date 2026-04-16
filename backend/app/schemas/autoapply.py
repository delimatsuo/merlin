"""Pydantic schemas for autoapply (Chrome Extension) endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


# --- Form Field Answering (batch) ---

class FormField(BaseModel):
    label: str = Field(max_length=500)
    type: Literal["text", "select", "radio", "checkbox", "textarea"]
    options: list[str] | None = Field(default=None, max_length=50)
    required: bool = False


class AnswerFieldsRequest(BaseModel):
    fields: list[FormField] = Field(max_length=30)
    job_url: str = Field(max_length=500)
    company_name: str = Field(max_length=200)


class AnswerFieldsResponse(BaseModel):
    answers: dict[str, str]  # {field_label: answer_value}
    needs_human: list[str]  # field labels that couldn't be answered


# --- Single Question Answering ---

class AnswerQuestionRequest(BaseModel):
    question: str = Field(max_length=2000)
    field_type: Literal["text", "select", "radio", "checkbox", "textarea"]
    options: list[str] | None = Field(default=None, max_length=50)
    job_url: str = Field(max_length=500)
    company_name: str = Field(max_length=200)
    job_title: str = Field(max_length=200)


class AnswerQuestionResponse(BaseModel):
    answer: str | None
    needs_human: bool
    model_used: str  # Which model answered (flash-lite, flash, sonnet)


# --- Application Logging ---

class ApplicationLogRequest(BaseModel):
    job_url: str = Field(max_length=500)
    company: str = Field(max_length=200)
    job_title: str = Field(max_length=200)
    status: Literal["success", "failed", "dry-run"]
    fields_answered: int = Field(ge=0, le=200)
    questions_answered: int = Field(ge=0, le=50)
    llm_calls: int = Field(ge=0, le=100)
    errors: list[str] = Field(default_factory=list, max_length=20)
    duration_seconds: int = Field(ge=0)


# --- Save Answers to Knowledge ---

class SaveAnswersRequest(BaseModel):
    answers: dict[str, str] = Field(max_length=20)


class SaveAnswersResponse(BaseModel):
    saved: int


# --- Profile for Extension ---

class ProfileResponse(BaseModel):
    """Professional profile returned to the extension (no PII)."""

    knowledge: dict  # The knowledge file content
    daily_llm_calls: int  # Current usage count
    daily_llm_limit: int  # Max allowed (50)
