"""Pydantic schemas for the batch application queue."""

from typing import Literal

from pydantic import BaseModel, Field


QueueStatus = Literal[
    "pending", "running", "applied", "needs_attention",
    "failed", "skipped", "cancelled",
]
AttentionReason = Literal["confirmation", "unknown_answer"]


class QueueCreateRequest(BaseModel):
    job_ids: list[str] = Field(min_length=1, max_length=100)


class QueueCreateResponse(BaseModel):
    batch_id: str
    count: int
    rejected: list[dict] = Field(default_factory=list)


class QueueEntryResponse(BaseModel):
    id: str
    job_id: str
    job_url: str
    title: str
    company: str
    status: QueueStatus
    attention_reason: AttentionReason | None = None
    error_message: str | None = None
    tab_id: int | None = None
    batch_id: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None


class QueueListResponse(BaseModel):
    active: list[QueueEntryResponse]
    recent: list[QueueEntryResponse]
    active_batch_id: str | None = None


class QueueUpdateRequest(BaseModel):
    status: QueueStatus
    attention_reason: AttentionReason | None = None
    error_message: str | None = Field(default=None, max_length=1000)
    tab_id: int | None = None


class QueueCompleteBatchRequest(BaseModel):
    batch_id: str
