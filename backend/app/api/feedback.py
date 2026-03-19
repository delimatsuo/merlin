"""User feedback endpoints."""

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_admin_user, get_current_user
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

MAX_MESSAGE_LENGTH = 2000


class FeedbackRequest(BaseModel):
    type: str = Field(pattern="^(bug|suggestion)$")
    message: str = Field(min_length=5, max_length=MAX_MESSAGE_LENGTH)
    page: str = ""


@router.post("")
@limiter.limit("5/minute")
async def submit_feedback(
    request: Request,
    body: FeedbackRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Submit user feedback (bug report or suggestion)."""
    fs = FirestoreService()
    doc_id = str(uuid.uuid4())
    await fs.db.collection("feedback").document(doc_id).set({
        "uid": user.uid,
        "userEmail": user.email or "",
        "type": body.type,
        "message": body.message,
        "page": body.page,
        "status": "new",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("feedback_submitted", uid=user.uid, type=body.type)
    return {"status": "ok"}


@router.get("")
@limiter.limit("20/minute")
async def list_feedback(
    request: Request,
    limit: int = 50,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Admin: list all feedback entries."""
    from google.cloud.firestore_v1.base_query import FieldFilter

    fs = FirestoreService()
    query = (
        fs.db.collection("feedback")
        .order_by("createdAt", direction="DESCENDING")
        .limit(min(limit, 100))
    )
    results = []
    async for doc in query.stream():
        data = doc.to_dict()
        data["id"] = doc.id
        results.append(data)
    return {"feedback": results}


@router.patch("/{feedback_id}/status")
@limiter.limit("20/minute")
async def update_feedback_status(
    request: Request,
    feedback_id: str,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Admin: cycle feedback status (new → seen → resolved → new)."""
    fs = FirestoreService()
    doc_ref = fs.db.collection("feedback").document(feedback_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feedback não encontrado.")

    cycle = {"new": "seen", "seen": "resolved", "resolved": "new"}
    current = doc.to_dict().get("status", "new")
    next_status = cycle.get(current, "seen")
    await doc_ref.update({"status": next_status})
    return {"status": next_status}
