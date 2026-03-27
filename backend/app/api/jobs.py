"""Job matching and preferences endpoints."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_current_user
from app.jobs.matcher import match_user_jobs
from app.schemas.jobs import (
    JobFeedResponse,
    JobPreferencesRequest,
    JobPreferencesResponse,
    MatchedJob,
)
from app.services.email import verify_unsubscribe_token
from app.services.firestore import FirestoreService, _brazil_today, _brazil_now

_BRT = ZoneInfo("America/Sao_Paulo")

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
    days: int = Query(default=1, ge=1, le=14),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return matched jobs for the last N days (default 1). Deduplicates across days.

    If preferences were updated after the last match, re-matches inline.
    """
    if days not in (1, 3, 7, 14):
        days = 1

    fs = FirestoreService()
    today = _brazil_today()

    # Check if we need on-demand re-matching (preferences changed after last match)
    prefs = await fs.get_job_preferences(user.uid)
    if prefs:
        today_result = await fs.get_matched_jobs(user.uid, today)
        prefs_updated = prefs.get("last_updated", "")
        matches_generated = today_result.get("generated_at", "") if today_result else ""

        if not today_result or (prefs_updated and prefs_updated > matches_generated):
            # Re-match via Firestore tag query (no all_jobs needed)
            logger.info("feed_on_demand_rematch", uid=user.uid)
            knowledge = await fs.get_candidate_knowledge(user.uid)
            if knowledge:
                ai_counter = {"count": 0}
                fresh_matches = await match_user_jobs(
                    uid=user.uid,
                    knowledge=knowledge,
                    preferences=prefs,
                    ai_call_counter=ai_counter,
                )
                await fs.save_matched_jobs(user.uid, today, fresh_matches, len(fresh_matches))

                # Clear stale cached results from previous days so only
                # fresh matches (from updated algorithm/preferences) show
                now = _brazil_now()
                for i in range(1, 15):  # Clear up to 14 days back
                    old_date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
                    old_result = await fs.get_matched_jobs(user.uid, old_date)
                    if old_result:
                        doc_ref = (
                            fs.db.collection("users").document(user.uid)
                            .collection("matchedJobs").document(old_date)
                        )
                        await doc_ref.delete()
                        logger.info("feed_cleared_stale", uid=user.uid, date=old_date)

    # Read matched jobs for the last N days, deduplicated
    now = _brazil_now()
    all_matches = []
    seen_job_ids: set[str] = set()

    for i in range(days):
        date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        result = await fs.get_matched_jobs(user.uid, date)
        if not result:
            continue
        for m in result.get("matches", []):
            job_id = m.get("job_id", "")
            if job_id and job_id not in seen_job_ids:
                seen_job_ids.add(job_id)
                try:
                    all_matches.append(MatchedJob(**m))
                except (ValueError, TypeError, KeyError):
                    pass  # Skip malformed matches silently

    # Sort by ATS score descending
    all_matches.sort(key=lambda x: x.ats_score, reverse=True)

    return JobFeedResponse(
        date=today,
        matches=all_matches,
        total_matches=len(all_matches),
    )


@router.get("/unsubscribe")
@limiter.limit("10/minute")
async def unsubscribe_digest(request: Request, token: str):
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
        prefs["email_frequency"] = "off"
        await fs.save_job_preferences(uid, prefs)
    else:
        # User has no preferences doc — create one to persist the opt-out
        await fs.save_job_preferences(uid, {
            "email_digest": False,
            "email_frequency": "off",
            "desired_titles": [],
            "locations": [],
            "work_mode": [],
        })
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
