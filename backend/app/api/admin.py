"""Admin dashboard endpoints."""

import asyncio
import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_admin_user, get_current_user
from app.services.admin_settings import AdminSettings, AdminSettingsService
from app.services.audit import log_admin_action
from app.services.email import send_feature_announcement
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/service-status")
async def get_service_status():
    """Check if service is active. No auth required."""
    fs = FirestoreService()
    count = await fs.get_global_generation_count()
    settings = await AdminSettingsService.get()
    limit = getattr(settings, "global_generation_limit", 10000)
    return {
        "active": count < limit,
        "totalGenerations": count,
        "limit": limit,
    }


@router.get("/generation-count")
@limiter.limit("20/minute")
async def get_generation_count(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Admin-only: get current global generation count."""
    fs = FirestoreService()
    count = await fs.get_global_generation_count()
    settings = await AdminSettingsService.get()
    limit = getattr(settings, "global_generation_limit", 10000)
    return {"totalGenerations": count, "limit": limit}


@router.get("/check")
@limiter.limit("30/minute")
async def check_admin(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Lightweight admin check — returns 200 if admin, 403 if not."""
    return {"isAdmin": True}


@router.get("/stats")
@limiter.limit("20/minute")
async def get_stats(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Platform stats + daily chart data (30 days)."""
    fs = FirestoreService()
    stats = await fs.get_platform_stats()
    daily = await fs.get_daily_generation_stats(30)
    recent = await fs.get_recent_generations(20)
    global_count = await fs.get_global_generation_count()
    admin_settings = await AdminSettingsService.get()
    global_limit = getattr(admin_settings, "global_generation_limit", 10000)
    ai_quality = await fs.get_ai_quality_stats()
    feature_counts = await fs.get_feature_counts()
    return {
        "stats": stats,
        "dailyChart": daily,
        "recentGenerations": recent,
        "globalGenerations": global_count,
        "globalLimit": global_limit,
        "aiQuality": ai_quality,
        "featureCounts": feature_counts,
    }


@router.get("/users")
@limiter.limit("20/minute")
async def list_users(
    request: Request,
    limit: int = 50,
    cursor: str = "",
    search: str = "",
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Paginated user list with denormalized counts."""
    if limit > 100:
        limit = 100

    fs = FirestoreService()
    if search:
        users = await fs.search_users_by_email(search.lower(), limit=limit)
    else:
        users = await fs.get_all_users(limit=limit, cursor=cursor)

    next_cursor = users[-1]["uid"] if users else ""
    return {
        "users": users,
        "nextCursor": next_cursor,
        "hasMore": len(users) == limit,
    }


@router.get("/users/{uid}")
@limiter.limit("20/minute")
async def get_user_detail(
    request: Request,
    uid: str,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """User detail with profiles + applications."""
    fs = FirestoreService()
    detail = await fs.get_user_detail(uid)
    if not detail:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return detail


@router.post("/users/{uid}/disable")
@limiter.limit("20/minute")
async def disable_user(
    request: Request,
    uid: str,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Disable user + revoke tokens."""
    fs = FirestoreService()
    try:
        await fs.disable_user(uid)
    except Exception as e:
        logger.error("disable_user_error", uid=uid, error=str(e))
        raise HTTPException(status_code=400, detail="Erro ao desabilitar usuário.")

    await log_admin_action(admin.uid, "disable_user", target_uid=uid)
    return {"status": "disabled"}


@router.post("/users/{uid}/enable")
@limiter.limit("20/minute")
async def enable_user(
    request: Request,
    uid: str,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Re-enable user."""
    fs = FirestoreService()
    try:
        await fs.enable_user(uid)
    except Exception as e:
        logger.error("enable_user_error", uid=uid, error=str(e))
        raise HTTPException(status_code=400, detail="Erro ao reabilitar usuário.")

    await log_admin_action(admin.uid, "enable_user", target_uid=uid)
    return {"status": "enabled"}


@router.get("/costs")
@limiter.limit("20/minute")
async def get_costs(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Cost projections from generation counts."""
    fs = FirestoreService()
    stats = await fs.get_platform_stats()
    daily = await fs.get_daily_generation_stats(30)

    # Unit costs per call (USD) — grouped by model tier
    # Sonnet (writing/reasoning): ~$3/M input, $15/M output
    # Flash-Lite (extraction): ~$0.075/M input, $0.30/M output
    unit_costs = {
        # --- Sonnet tier (writing/reasoning) ---
        "resume_rewrite": 0.020,
        "cover_letter": 0.012,
        "job_analysis": 0.006,
        "interview_questions": 0.004,
        "voice_processing": 0.006,
        "followup_questions": 0.004,
        "cv_recommendations": 0.012,
        "linkedin_analysis": 0.015,
        # --- Flash-Lite tier (extraction) ---
        "resume_structuring": 0.001,
        "ats_keywords": 0.001,
        "skill_matching": 0.001,
        "company_enrichment": 0.001,
        "linkedin_structuring": 0.001,
        # --- Other AI services ---
        "tts": 0.005,
        "transcription": 0.002,
    }

    gen_today = stats.get("generationsToday", 0)
    gen_month = stats.get("generationsMonth", 0)
    gen_all_time = stats.get("generationsAllTime", 0)

    # Each generation pipeline: rewrite + cover letter + analysis + ATS + skill match
    cost_per_generation = (
        unit_costs["resume_rewrite"]
        + unit_costs["cover_letter"]
        + unit_costs["job_analysis"]
        + unit_costs["ats_keywords"]
        + unit_costs["skill_matching"]
    )

    return {
        "unitCosts": unit_costs,
        "generationsToday": gen_today,
        "generationsMonth": gen_month,
        "generationsAllTime": gen_all_time,
        "estimatedCostToday": round(gen_today * cost_per_generation, 4),
        "estimatedCostMonth": round(gen_month * cost_per_generation, 4),
        "estimatedCostAllTime": round(gen_all_time * cost_per_generation, 4),
        "costPerGeneration": round(cost_per_generation, 4),
        "dailyChart": daily,
    }


@router.get("/settings")
@limiter.limit("20/minute")
async def get_settings_endpoint(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Current admin settings."""
    settings = await AdminSettingsService.get()
    return settings.model_dump()


@router.put("/settings")
@limiter.limit("20/minute")
async def update_settings(
    request: Request,
    body: AdminSettings,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Update admin settings."""
    updated = await AdminSettingsService.update(body)
    await log_admin_action(
        admin.uid, "update_settings", details=str(updated.model_dump())
    )
    return updated.model_dump()


@router.post("/backfill-stats")
@limiter.limit("5/minute")
async def backfill_stats(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """One-time backfill of user stats from subcollections."""
    fs = FirestoreService()
    count = await fs.backfill_user_stats()
    await log_admin_action(admin.uid, "backfill_stats", details=f"Backfilled {count} users")
    return {"status": "done", "usersProcessed": count}


@router.get("/jobs/stats")
@limiter.limit("20/minute")
async def get_jobs_stats(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Job matching pipeline stats for admin dashboard."""
    from app.services.firestore import _brazil_today

    fs = FirestoreService()
    today = _brazil_today()

    # Count active jobs by source
    active_jobs = await fs.get_active_jobs(limit=2000)
    by_source: dict[str, int] = {}
    for job in active_jobs:
        source = job.get("source", "unknown")
        by_source[source] = by_source.get(source, 0) + 1

    # Today's batch run status
    batch_doc = await fs.db.collection("batchRuns").document(today).get()
    batch_status = batch_doc.to_dict() if batch_doc.exists else None

    # Count users with preferences
    users_with_prefs = await fs.get_all_users_with_preferences()

    # Today's matches count
    total_matches_today = 0
    for user_data in users_with_prefs:
        uid = user_data["uid"]
        match_doc = await fs.get_matched_jobs(uid, today)
        if match_doc:
            total_matches_today += match_doc.get("total_matches", 0)

    return {
        "activeJobs": len(active_jobs),
        "jobsBySource": by_source,
        "usersWithPreferences": len(users_with_prefs),
        "matchesToday": total_matches_today,
        "batchStatus": batch_status,
    }


@router.post("/send-announcement")
@limiter.limit("2/hour")
async def send_announcement(
    request: Request,
    campaign_id: str = Query(..., description="Unique campaign ID for idempotency"),
    execute: bool = Query(default=False, description="Set to true to actually send emails"),
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Send feature announcement to onboarded users without job preferences.

    Dry-run by default (execute=false). Returns recipient list without sending.
    Requires campaign_id for idempotency — same ID cannot be used twice.
    """
    fs = FirestoreService()

    # Check campaign idempotency
    existing = await fs.get_campaign(campaign_id)
    if existing:
        return {
            "status": "already_exists",
            "campaign_id": campaign_id,
            "sent_count": existing.get("sent_count", 0),
            "message": "Esta campanha já foi executada.",
        }

    # Get target users
    targets = await fs.get_users_for_announcement()

    if not execute:
        # Dry-run: return target list without sending
        return {
            "status": "dry_run",
            "campaign_id": campaign_id,
            "target_count": len(targets),
            "sample": [
                {"email": t["email"][:5] + "***", "name": t["name"]}
                for t in targets[:10]
            ],
            "message": f"Enviar para {len(targets)} usuários. Use execute=true para confirmar.",
        }

    # Create campaign record
    await fs.create_campaign(campaign_id, {
        "type": "feature_announcement",
        "status": "sending",
        "target_count": len(targets),
        "sent_count": 0,
        "failed_count": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "started_by": admin.uid,
    })

    await log_admin_action(admin.uid, "send_announcement", campaign_id=campaign_id, targets=len(targets))

    # Send emails with rate limiting (200ms between sends)
    sent = 0
    failed = 0
    for target in targets:
        # Per-recipient idempotency
        if await fs.was_email_sent(campaign_id, target["uid"]):
            continue

        try:
            success = await send_feature_announcement(
                email=target["email"],
                name=target["name"],
                uid=target["uid"],
            )
            if success:
                await fs.mark_email_sent(campaign_id, target["uid"])
                sent += 1
            else:
                failed += 1
        except Exception as e:
            logger.error("announcement_send_error", uid_hash=target["uid"][:8], error=str(e))
            failed += 1

        # Rate limit: 200ms between sends
        await asyncio.sleep(0.2)

    # Update campaign status
    await fs.update_campaign(campaign_id, {
        "status": "completed",
        "sent_count": sent,
        "failed_count": failed,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("announcement_complete", campaign_id=campaign_id, sent=sent, failed=failed)

    return {
        "status": "completed",
        "campaign_id": campaign_id,
        "sent_count": sent,
        "failed_count": failed,
    }
