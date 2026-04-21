"""Batch application queue endpoints for the Gupy AutoApply extension."""

import uuid
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.schemas.applications_queue import (
    QueueCreateRequest,
    QueueCreateResponse,
    QueueEntryResponse,
    QueueListResponse,
    QueueUpdateRequest,
    QueueCompleteBatchRequest,
)
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()

RECENT_WINDOW_DAYS = 30
ACTIVE_STATUSES = {"pending", "running", "needs_attention"}


def _to_response(entry: dict) -> QueueEntryResponse:
    return QueueEntryResponse(
        id=entry["id"],
        job_id=entry.get("job_id", ""),
        job_url=entry.get("job_url", ""),
        title=entry.get("title", ""),
        company=entry.get("company", ""),
        status=entry.get("status", "pending"),
        attention_reason=entry.get("attention_reason"),
        error_message=entry.get("error_message"),
        tab_id=entry.get("tab_id"),
        batch_id=entry.get("batch_id", ""),
        created_at=entry.get("created_at", ""),
        started_at=entry.get("started_at"),
        finished_at=entry.get("finished_at"),
    )


@router.post("", response_model=QueueCreateResponse)
async def create_queue(
    body: QueueCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a batch of queue entries from selected jobs.

    Only Gupy jobs are accepted. Non-Gupy jobs are rejected with a reason
    so the UI can explain. All accepted entries share a single batch_id.
    """
    fs = FirestoreService()

    accepted: list[dict] = []
    rejected: list[dict] = []

    for job_id in body.job_ids:
        job = await fs.get_job(job_id)
        if not job:
            rejected.append({"job_id": job_id, "reason": "not_found"})
            continue
        if (job.get("source") or "").lower() != "gupy":
            rejected.append({
                "job_id": job_id,
                "reason": "unsupported_source",
                "source": job.get("source", ""),
            })
            continue
        job_url = job.get("source_url") or job.get("url") or ""
        if not job_url:
            rejected.append({"job_id": job_id, "reason": "no_url"})
            continue
        accepted.append({
            "job_id": job_id,
            "job_url": job_url,
            "title": job.get("title", ""),
            "company": job.get("company", ""),
        })

    if not accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma vaga elegível para aplicação automática (apenas Gupy).",
        )

    batch_id = str(uuid.uuid4())
    await fs.create_queue_entries(user.uid, accepted, batch_id)

    logger.info(
        "queue_batch_created",
        uid=user.uid,
        batch_id=batch_id,
        accepted=len(accepted),
        rejected=len(rejected),
    )

    return QueueCreateResponse(
        batch_id=batch_id,
        count=len(accepted),
        rejected=rejected,
    )


@router.get("", response_model=QueueListResponse)
async def list_queue(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return active + recent queue entries for the user.

    `active` contains everything not in a terminal state, newest first.
    `recent` contains terminal entries from the last 30 days.
    """
    fs = FirestoreService()
    since = datetime.now(timezone.utc) - timedelta(days=RECENT_WINDOW_DAYS)
    entries = await fs.list_queue_entries(user.uid, since=since)

    active: list[QueueEntryResponse] = []
    recent: list[QueueEntryResponse] = []
    active_batch_id: str | None = None

    for entry in entries:
        resp = _to_response(entry)
        if entry.get("status") in ACTIVE_STATUSES:
            active.append(resp)
            if active_batch_id is None:
                active_batch_id = entry.get("batch_id") or None
        else:
            recent.append(resp)

    return QueueListResponse(
        active=active,
        recent=recent,
        active_batch_id=active_batch_id,
    )


@router.patch("/{queue_id}", response_model=QueueEntryResponse)
async def update_queue(
    queue_id: str,
    body: QueueUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update a queue entry's status. Called by the extension service worker.

    The backend validates state transitions — a buggy extension cannot jump
    a 'pending' entry straight to 'applied' without going through 'running'.
    """
    fs = FirestoreService()
    updates = body.model_dump(exclude_none=True)
    updated, error = await fs.update_queue_entry(user.uid, queue_id, updates)
    if error == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entrada da fila não encontrada.",
        )
    if error and error.startswith("invalid_transition"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transição de status inválida: {error}",
        )
    if updated is None:
        # Should be unreachable given the error branches above, but guard
        # explicitly so production with python -O behaves safely.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro desconhecido ao atualizar fila.",
        )
    logger.info(
        "queue_entry_updated",
        uid=user.uid,
        queue_id=queue_id,
        status=body.status,
    )
    return _to_response(updated)


@router.post("/pause")
async def pause_queue(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Cancel all pending entries in the active batch.

    v1 is "pause = cancel pending" — running/needs_attention entries keep
    going. Users who want to stop everything should use /cancel. We drop
    the old 1-day window that used to strand long-paused batches.
    """
    fs = FirestoreService()
    active_batch = await fs.get_active_batch_id(user.uid)
    if not active_batch:
        return {"paused": 0, "batch_id": None}

    count = await fs.update_batch_status(
        user.uid, active_batch, "cancelled", only_from=["pending"]
    )
    return {"paused": count, "batch_id": active_batch}


@router.post("/cancel")
async def cancel_queue(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Cancel all remaining work in the active batch (pending + running + needs_attention)."""
    fs = FirestoreService()
    active_batch = await fs.get_active_batch_id(user.uid)
    if not active_batch:
        return {"cancelled": 0, "batch_id": None}

    count = await fs.update_batch_status(
        user.uid,
        active_batch,
        "cancelled",
        only_from=["pending", "running", "needs_attention"],
    )
    return {"cancelled": count, "batch_id": active_batch}


@router.post("/complete-batch")
async def complete_batch(
    body: QueueCompleteBatchRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Called by the extension service worker when a batch finishes draining.

    Idempotent via a Firestore notification flag — chrome.storage.session
    is wiped on browser restart, so the SW can legitimately call this again
    for a batch that already finished yesterday. We check/set notified_at
    server-side so the user doesn't receive the same digest every time
    they restart Chrome.
    """
    from app.services.email import send_batch_complete_email

    fs = FirestoreService()
    entries = await fs.get_batch_entries(user.uid, body.batch_id)
    if not entries:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lote não encontrado.",
        )

    # Bail if the batch still has active work — prevents race where the SW
    # calls complete-batch prematurely.
    if any(e.get("status") in ACTIVE_STATUSES for e in entries):
        return {"sent": False, "reason": "batch_still_active"}

    # Atomic claim-then-send — if two SWs race this endpoint only one wins
    # the create() and actually sends the email.
    if not await fs.claim_batch_notification(user.uid, body.batch_id):
        return {"sent": False, "reason": "already_notified", "total": len(entries)}

    sent = await send_batch_complete_email(user.uid, body.batch_id, entries)
    logger.info(
        "batch_complete_notified",
        uid=user.uid,
        batch_id=body.batch_id,
        email_sent=sent,
        total=len(entries),
    )
    return {"sent": sent, "total": len(entries)}
