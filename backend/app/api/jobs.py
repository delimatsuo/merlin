"""Job matching and preferences endpoints."""

from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_current_user
from app.schemas.jobs import (
    JobFeedResponse,
    JobPreferencesRequest,
    JobPreferencesResponse,
    MatchedJob,
)
from app.services.email import verify_unsubscribe_token
from app.services.firestore import FirestoreService, _brazil_today

logger = structlog.get_logger()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/preferences", response_model=JobPreferencesResponse | None)
async def get_preferences(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return user's job matching preferences or null."""
    fs = FirestoreService()
    prefs = await fs.get_job_preferences(user.uid)
    if not prefs:
        return None
    return JobPreferencesResponse(**prefs)


@router.put("/preferences", response_model=JobPreferencesResponse)
@limiter.limit("10/minute")
async def save_preferences(
    request: Request,
    body: JobPreferencesRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Save job matching preferences."""
    fs = FirestoreService()
    prefs_data = body.model_dump()
    prefs_data["last_updated"] = datetime.now().astimezone().isoformat()

    await fs.save_job_preferences(user.uid, prefs_data)
    logger.info("preferences_saved", uid=user.uid)

    saved = await fs.get_job_preferences(user.uid)
    return JobPreferencesResponse(**saved)


@router.delete("/preferences", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preferences(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Withdraw LGPD consent. Deletes preferences and all matched jobs."""
    fs = FirestoreService()
    await fs.delete_job_preferences(user.uid)
    logger.info("preferences_deleted_lgpd", uid=user.uid)


@router.get("/feed", response_model=JobFeedResponse)
@limiter.limit("60/minute")
async def get_feed(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return today's matched jobs. Falls back to yesterday if today not found."""
    fs = FirestoreService()

    today = _brazil_today()
    result = await fs.get_matched_jobs(user.uid, today)

    if not result:
        # Fall back to yesterday
        yesterday = (
            datetime.strptime(today, "%Y-%m-%d") - timedelta(days=1)
        ).strftime("%Y-%m-%d")
        result = await fs.get_matched_jobs(user.uid, yesterday)
        if result:
            today = yesterday

    if not result:
        return JobFeedResponse(date=today, matches=[], total_matches=0)

    return JobFeedResponse(
        date=today,
        matches=[MatchedJob(**m) for m in result.get("matches", [])],
        total_matches=result.get("total_matches", 0),
        generated_at=result.get("generated_at"),
    )


@router.get("/feed/{date}", response_model=JobFeedResponse)
@limiter.limit("60/minute")
async def get_feed_by_date(
    request: Request,
    date: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return matched jobs for a specific date."""
    # Validate date format
    try:
        parsed_date = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de data inválido. Use YYYY-MM-DD.",
        )

    # Reject dates older than 30 days
    today = datetime.strptime(_brazil_today(), "%Y-%m-%d")
    if (today - parsed_date).days > 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível consultar vagas com mais de 30 dias.",
        )

    fs = FirestoreService()
    result = await fs.get_matched_jobs(user.uid, date)

    if not result:
        return JobFeedResponse(date=date, matches=[], total_matches=0)

    return JobFeedResponse(
        date=date,
        matches=[MatchedJob(**m) for m in result.get("matches", [])],
        total_matches=result.get("total_matches", 0),
        generated_at=result.get("generated_at"),
    )


@router.get("/unsubscribe")
async def unsubscribe_digest(token: str):
    """Unsubscribe from email digest via signed HMAC token (no auth required)."""
    uid = verify_unsubscribe_token(token)
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link inválido ou expirado.",
        )

    fs = FirestoreService()
    prefs = await fs.get_job_preferences(uid)
    if prefs:
        prefs["email_digest"] = False
        await fs.save_job_preferences(uid, prefs)
        logger.info("email_digest_unsubscribed", uid_hash=uid[:8])

    return {"message": "Você não receberá mais e-mails de vagas."}


@router.get("/{job_id}")
@limiter.limit("30/minute")
async def get_job(
    request: Request,
    job_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return a single job from the global jobs collection."""
    fs = FirestoreService()
    job = await fs.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vaga não encontrada.",
        )
    return job
