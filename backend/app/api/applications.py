"""Application management endpoints."""

import html
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthenticatedUser, get_current_user
from app.services.audit import log_data_access
from app.services.firestore import FirestoreService
from app.services.knowledge import merge_comment_into_knowledge

logger = structlog.get_logger()
router = APIRouter()


class CommentRequest(BaseModel):
    comment: str = Field(min_length=1, max_length=1000)


@router.get("")
async def list_applications(
    limit: int = 20,
    cursor: str = "",
    user: AuthenticatedUser = Depends(get_current_user),
):
    """List all user applications with pagination."""
    if limit > 50:
        limit = 50

    fs = FirestoreService()
    applications = await fs.get_user_applications(user.uid, limit=limit, start_after=cursor)

    # Build summaries
    summaries = []
    for app in applications:
        analysis = app.get("jobAnalysis", {})
        summaries.append({
            "id": app.get("id", ""),
            "title": analysis.get("title", "Vaga sem título"),
            "company": analysis.get("company", ""),
            "atsScore": app.get("atsScore"),
            "status": app.get("status", "analyzed"),
            "versionCount": app.get("versionCount", 0),
            "createdAt": app.get("createdAt", ""),
        })

    next_cursor = summaries[-1]["id"] if summaries else ""

    return {
        "applications": summaries,
        "nextCursor": next_cursor,
        "hasMore": len(summaries) == limit,
    }


@router.delete("/{application_id}")
async def delete_application(
    application_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete an application with cascade (resumes + storage)."""
    fs = FirestoreService()

    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidatura não encontrada.",
        )

    await fs.delete_application(user.uid, application_id)

    log_data_access(user.uid, "delete_application", "application", resource_id=application_id)
    logger.info("application_deleted", uid=user.uid, application_id=application_id)
    return {"status": "deleted"}


@router.post("/{application_id}/comment")
async def add_application_comment(
    application_id: str,
    body: CommentRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Save a user comment and merge into knowledge file."""
    comment = body.comment.strip()

    # Verify application exists and belongs to user
    fs = FirestoreService()
    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidatura não encontrada.",
        )

    # Sanitize and merge
    sanitized = html.escape(comment)
    await merge_comment_into_knowledge(user.uid, sanitized, application_id)

    logger.info("comment_added", uid=user.uid, application_id=application_id)
    return {"status": "saved"}
