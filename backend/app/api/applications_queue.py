"""Batch application queue endpoints for the Gupy AutoApply extension."""

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from fastapi import Request
from app.auth import AuthenticatedUser, get_admin_user, get_current_user
from app.config import get_settings


async def _get_dev_seed_user(request: Request) -> AuthenticatedUser:
    """Allow admins OR any @merlincv.dev test-domain account to dev-seed.

    The endpoint only writes fake queue entries under the caller's own uid —
    it can't touch other users — so widening the gate to our internal test
    domain is safe, and it unblocks CI/Playwright smoke tests that sign in
    as throwaway accounts.
    """
    user = await get_current_user(request)
    email = (user.email or "").lower()
    admin_emails = {e.strip().lower() for e in get_settings().admin_emails.split(",") if e.strip()}
    if email in admin_emails or email.endswith("@merlincv.dev"):
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Acesso restrito a administradores ou contas de teste.",
    )
from app.schemas.applications_queue import (
    QueueCreateRequest,
    QueueCreateResponse,
    QueueEntryResponse,
    QueueListResponse,
    QueueUpdateRequest,
    QueueCompleteBatchRequest,
)
from app.services.firestore import FirestoreService


class _DevSeedJob(BaseModel):
    title: str = Field(max_length=300)
    company: str = Field(max_length=200)
    job_url: str = Field(max_length=500)


class DevSeedRequest(BaseModel):
    jobs: list[_DevSeedJob] = Field(min_length=1, max_length=20)

logger = structlog.get_logger()
router = APIRouter()

RECENT_WINDOW_DAYS = 30
ACTIVE_STATUSES = {"pending", "running", "needs_attention"}
SUPPORTED_AUTOAPPLY_SOURCES = {"gupy", "catho"}


def _hostname(job_url: str) -> str:
    try:
        return (urlparse(job_url).hostname or "").lower()
    except Exception:
        return ""


def _autoapply_rejection_reason(source: str, job_url: str) -> str | None:
    source_key = (source or "").lower()
    if source_key not in SUPPORTED_AUTOAPPLY_SOURCES:
        return "unsupported_source"

    host = _hostname(job_url)
    if source_key == "gupy":
        return None if host == "gupy.io" or host.endswith(".gupy.io") else "unsupported_apply_method"
    if source_key == "catho":
        return None if host == "catho.com.br" or host.endswith(".catho.com.br") else "unsupported_apply_method"

    return "unsupported_source"


def _should_skip_active_queue_entry(entry: dict) -> bool:
    if entry.get("status") not in ACTIVE_STATUSES:
        return False
    reason = _autoapply_rejection_reason(
        str(entry.get("source") or ""),
        str(entry.get("job_url") or ""),
    )
    return reason == "unsupported_apply_method"


def _to_response(entry: dict) -> QueueEntryResponse:
    # Use `or ""` for every required string — dict.get(key, default) only
    # returns the default when the key is MISSING, not when the stored value
    # is None. Real Gupy jobs sometimes have title/company/location as null,
    # which used to leak into the queue and crash Pydantic validation (see
    # Sentry MERLIN-BACKEND-M / MERLIN-BACKEND-K).
    return QueueEntryResponse(
        id=entry["id"],
        job_id=entry.get("job_id") or "",
        job_url=entry.get("job_url") or "",
        source=entry.get("source") or "",
        title=entry.get("title") or "",
        company=entry.get("company") or "",
        status=entry.get("status") or "pending",
        attention_reason=entry.get("attention_reason"),
        error_message=entry.get("error_message"),
        tab_id=entry.get("tab_id"),
        batch_id=entry.get("batch_id") or "",
        created_at=entry.get("created_at") or "",
        started_at=entry.get("started_at"),
        finished_at=entry.get("finished_at"),
    )


@router.post("", response_model=QueueCreateResponse)
async def create_queue(
    body: QueueCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a batch of queue entries from selected jobs.

    Only supported auto-apply boards are accepted. Other jobs are rejected with a reason
    so the UI can explain. All accepted entries share a single batch_id.
    """
    fs = FirestoreService()

    # Dedup: if the user already has an ACTIVE entry for the same job_id
    # (pending / running / needs_attention), don't create a duplicate. This
    # fixes the failure mode where a browser sees a CORS error, retries the
    # POST, and each retry silently creates another copy of the same job in
    # Firestore.
    active_entries = await fs.list_queue_entries(user.uid, since=None)
    active_job_ids = {
        e.get("job_id")
        for e in active_entries
        if e.get("status") in {"pending", "running", "needs_attention"}
    }

    accepted: list[dict] = []
    rejected: list[dict] = []
    seen_in_this_request: set[str] = set()

    for job_id in body.job_ids:
        if job_id in seen_in_this_request:
            # Caller sent the same id twice in one body — count once.
            rejected.append({"job_id": job_id, "reason": "duplicate_in_request"})
            continue
        seen_in_this_request.add(job_id)

        if job_id in active_job_ids:
            rejected.append({"job_id": job_id, "reason": "already_queued"})
            continue

        job = await fs.get_job(job_id)
        if not job:
            rejected.append({"job_id": job_id, "reason": "not_found"})
            continue
        source = (job.get("source") or "").lower()
        job_url = job.get("source_url") or job.get("url") or ""
        if not job_url:
            rejected.append({"job_id": job_id, "reason": "no_url"})
            continue
        rejection_reason = _autoapply_rejection_reason(source, job_url)
        if rejection_reason:
            rejected.append({
                "job_id": job_id,
                "reason": rejection_reason,
                "source": source,
            })
            continue
        accepted.append({
            "job_id": job_id,
            "job_url": job_url,
            "source": source,
            # Coerce null/None from scraped Gupy data to empty string so
            # stored entries always satisfy the QueueEntryResponse contract.
            "title": job.get("title") or "",
            "company": job.get("company") or "",
        })

    if not accepted:
        # Pick the most useful error message for the user based on WHY all
        # the jobs were rejected. Distinguishes "already queued" (actionable:
        # cancel the current batch first) from "no Gupy jobs" (actionable:
        # pick different jobs).
        reasons = {r.get("reason") for r in rejected}
        if reasons == {"already_queued"}:
            detail = "Essas vagas já estão no lote atual. Abra /dashboard/candidaturas e clique em 'Cancelar restantes' antes de aplicar novamente."
        elif reasons == {"duplicate_in_request"}:
            detail = "Vagas duplicadas na seleção."
        elif "already_queued" in reasons:
            detail = "Uma ou mais vagas selecionadas já estão no lote atual; as demais não são automatizáveis."
        elif reasons == {"unsupported_apply_method"}:
            detail = "Uma ou mais vagas selecionadas usam um fluxo de candidatura que ainda não é automatizável pelo Merlin."
        else:
            detail = "Nenhuma vaga elegível para aplicação automática (Gupy e Catho)."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

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

    # Catch any unexpected failure in the Firestore read / response mapping
    # and log + re-raise as a proper HTTPException so CORS middleware adds
    # the right headers. Without this wrapping, a raw exception from the
    # Firestore client can bubble past the middleware and leave the browser
    # seeing net::ERR_FAILED 500 with no CORS headers.
    try:
        entries = await fs.list_queue_entries(user.uid, since=since)
    except Exception as e:
        logger.exception("queue_list_firestore_failed", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firestore read failed: {type(e).__name__}: {str(e)[:200]}",
        )

    normalized_entries: list[dict] = []
    for entry in entries:
        if _should_skip_active_queue_entry(entry):
            updated, err = await fs.update_queue_entry(
                user.uid,
                entry["id"],
                {
                    "status": "skipped",
                    "error_message": "Fluxo de candidatura manual/WhatsApp não é automatizável pelo Merlin.",
                },
            )
            if updated:
                entry = updated
            else:
                logger.warning(
                    "queue_auto_skip_unsupported_apply_method_failed",
                    uid=user.uid,
                    entry_id=entry.get("id"),
                    error=err,
                )
        normalized_entries.append(entry)

    active: list[QueueEntryResponse] = []
    recent: list[QueueEntryResponse] = []
    active_batch_id: str | None = None

    for entry in normalized_entries:
        try:
            resp = _to_response(entry)
        except Exception as e:
            logger.exception(
                "queue_list_entry_mapping_failed",
                uid=user.uid,
                entry_id=entry.get("id"),
                entry_keys=list(entry.keys()),
                entry_status=entry.get("status"),
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Entry {entry.get('id')} failed to map: {type(e).__name__}: {str(e)[:200]}",
            )
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
    """Cancel all pending entries across all batches for the user.

    v1 is "pause = cancel pending" — running/needs_attention entries keep
    going. Users who want to stop everything should use /cancel. Works
    across all accumulated batches, not just the newest one.
    """
    fs = FirestoreService()
    count = await fs.cancel_all_active_entries(user.uid, only_from=["pending"])
    return {"paused": count}


@router.post("/cancel")
async def cancel_queue(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Cancel ALL active entries across ALL batches for the user.

    "Cancel remaining" in the UI means "clear the pipeline". Works across
    accumulated batches — a user who somehow ended up with 5 overlapping
    batches clears everything in one click instead of N.
    """
    fs = FirestoreService()
    count = await fs.cancel_all_active_entries(
        user.uid,
        only_from=["pending", "running", "needs_attention"],
    )
    return {"cancelled": count}


@router.post("/dev-seed", response_model=QueueCreateResponse)
async def dev_seed_queue(
    body: DevSeedRequest,
    admin: AuthenticatedUser = Depends(_get_dev_seed_user),
):
    """Admin-only: seed a fake batch for UI smoke testing on staging.

    Bypasses the `jobs` collection lookup so we don't need real matched
    Gupy jobs to test the Pipeline dashboard. The extension will NOT be
    able to drive these entries (the URLs aren't real Gupy pages) —
    they'll sit in `pending` until manually marked via PATCH. That's
    sufficient to verify the frontend pipeline rendering, pause/cancel,
    and the needs_attention flow.
    """
    fs = FirestoreService()
    batch_id = f"devseed-{uuid.uuid4().hex[:8]}"
    entries = [
        {
            "job_id": f"devseed-{uuid.uuid4().hex[:10]}",
            "job_url": job.job_url,
            "source": "devseed",
            "title": job.title,
            "company": job.company,
        }
        for job in body.jobs
    ]
    await fs.create_queue_entries(admin.uid, entries, batch_id)

    logger.info(
        "queue_dev_seed",
        uid=admin.uid,
        batch_id=batch_id,
        count=len(entries),
    )
    return QueueCreateResponse(
        batch_id=batch_id,
        count=len(entries),
        rejected=[],
    )


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
