"""Admin dashboard endpoints."""

import asyncio
import time
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

# In-memory cache for expensive admin queries (5-min TTL)
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 300  # 5 minutes


async def _cached(key: str, fn):
    """Return cached result or compute and cache."""
    now = time.monotonic()
    if key in _cache:
        ts, data = _cache[key]
        if now - ts < _CACHE_TTL:
            return data
    result = await fn()
    _cache[key] = (now, result)
    return result


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


@router.get("/retention")
@limiter.limit("20/minute")
async def get_retention(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Retention metrics: headline numbers + retention curve. Cached 5 min."""
    async def _compute():
        fs = FirestoreService()
        return await fs.get_retention_stats()
    return await _cached("retention", _compute)


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

    # Unit costs per call (USD) — based on actual token usage from production logs
    # Claude Sonnet 4.6: $3/M input, $15/M output
    # Gemini 3 Flash Preview: $0.50/M input, $3.00/M output
    # Gemini 3.1 Flash-Lite Preview: $0.25/M input, $1.50/M output
    unit_costs = {
        # --- Sonnet tier (writing/reasoning) ---
        "resume_rewrite": 0.064,
        "cover_letter": 0.021,
        "job_analysis": 0.011,
        "interview_questions": 0.012,
        "voice_processing": 0.007,
        "followup_questions": 0.013,
        "cv_recommendations": 0.045,
        "linkedin_analysis": 0.071,
        # --- Gemini 3 Flash tier (structuring) ---
        "resume_structuring": 0.005,
        "linkedin_structuring": 0.007,
        # --- Gemini 3.1 Flash-Lite tier (extraction) ---
        "ats_keywords": 0.0004,
        "skill_matching": 0.0006,
        "company_enrichment": 0.002,
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


@router.get("/email-stats")
@limiter.limit("20/minute")
async def get_email_stats(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Email digest stats: subscribers, emails sent per day, unsubscribes. Cached 5 min."""
    async def _compute():
        from app.services.firestore import _brazil_today, _brazil_now
        from datetime import timedelta

        fs = FirestoreService()
        now = _brazil_now()

        # Count subscribers from users who have preferences
        users_with_prefs = await fs.get_all_users_with_preferences()
        total_with_prefs = len(users_with_prefs)
        subscribers = sum(
            1 for u in users_with_prefs
            if u.get("preferences", {}).get("email_frequency", "daily") != "off"
        )

        # Daily email stats for last 14 days (from batchRuns + platformStats)
        daily_stats = []
        for i in range(14):
            date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            batch_doc = await fs.db.collection("batchRuns").document(date).get()
            stats_doc = await fs.db.collection("platformStats").document(date).get()

            emails = 0
            unsubs = 0
            if batch_doc.exists:
                emails = batch_doc.to_dict().get("emails_sent", 0)
            if stats_doc.exists:
                unsubs = stats_doc.to_dict().get("unsubscribeCount", 0)

            daily_stats.append({"date": date, "emails_sent": emails, "unsubscribes": unsubs})

        daily_stats.reverse()  # oldest first for chart

        return {
            "subscribers": subscribers,
            "totalWithPrefs": total_with_prefs,
            "dailyStats": daily_stats,
        }
    return await _cached("email_stats", _compute)


@router.get("/preview-email")
async def preview_email(
    request: Request,
    template: str = Query(default="announcement", description="announcement or digest"),
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Preview email HTML template. Admin-only."""
    from fastapi.responses import HTMLResponse
    from app.services.email import _generate_unsubscribe_token, _esc

    dashboard_url = "https://merlincv.com/dashboard/vagas"
    unsubscribe_url = f"https://merlincv.com/api/jobs/unsubscribe?token=PREVIEW_TOKEN"
    greeting = _esc(admin.email.split("@")[0])

    if template == "digest":
        # Sample job data for preview
        sample_matches = [
            {"title": "Diretor de Recursos Humanos", "company": "Empresa ABC", "location": "São Paulo, SP", "work_mode": "hybrid", "ats_score": 92},
            {"title": "VP of People Operations", "company": "TechCorp Brasil", "location": "Remoto", "work_mode": "remote", "ats_score": 85},
            {"title": "Gerente de RH", "company": "Grupo XYZ", "location": "Rio de Janeiro, RJ", "work_mode": "onsite", "ats_score": 78},
            {"title": "Head de People & Culture", "company": "StartupCo", "location": "São Paulo, SP", "work_mode": "hybrid", "ats_score": 65},
            {"title": "Coordenador de RH", "company": "Indústria Nacional", "location": "Campinas, SP", "work_mode": "onsite", "ats_score": 45},
        ]

        count = len(sample_matches)
        freq_text = "diariamente"
        job_cards = ""
        for m in sample_matches:
            title = _esc(m["title"])
            company = _esc(m["company"])
            location = _esc(m["location"])
            work_mode = m["work_mode"]
            score = m["ats_score"]
            score_color = "#16a34a" if score >= 80 else "#ca8a04" if score >= 60 else "#dc2626"
            score_bg = "#f0fdf4" if score >= 80 else "#fefce8" if score >= 60 else "#fef2f2"
            meta_parts = [p for p in [company, location] if p]
            if work_mode == "remote": meta_parts.append("Remoto")
            elif work_mode == "hybrid": meta_parts.append("Híbrido")
            meta_str = " · ".join(meta_parts)
            job_cards += f"""
            <tr><td style="padding:0 0 8px 0">
                <a href="{dashboard_url}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="vertical-align:top">
                            <span style="font-size:15px;font-weight:600;color:#111827;line-height:1.4">{title}</span>
                            <br><span style="font-size:13px;color:#6b7280;line-height:1.6">{meta_str}</span>
                        </td>
                        <td width="52" style="vertical-align:top;text-align:right;padding-left:12px">
                            <span style="display:inline-block;background:{score_bg};color:{score_color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">{score}%</span>
                        </td>
                    </tr></table>
                </a>
            </td></tr>"""

        html = f"""<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="text-align:center;padding:16px 0 24px"><span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Merlin</span></div>
    <div style="background:#111827;border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:20px">
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3">{count} vagas encontradas</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#9ca3af">Olá {greeting}, encontramos vagas que combinam com seu perfil</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">{job_cards}</table>
    <div style="text-align:center;padding:16px 0 24px">
        <a href="{dashboard_url}" style="display:inline-block;background:#111827;color:#ffffff;padding:14px 36px;border-radius:28px;text-decoration:none;font-weight:600;font-size:14px">Ver todas as vagas</a>
    </div>
    <div style="text-align:center;padding:20px 0;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 8px;font-size:12px;color:#9ca3af">Você recebe este email {freq_text} · <a href="{unsubscribe_url}" style="color:#9ca3af;text-decoration:underline">Cancelar inscrição</a></p>
        <p style="margin:0;font-size:11px;color:#d1d5db">Ella Executive Search Ltda · merlincv.com</p>
    </div>
</div></body></html>"""
        return HTMLResponse(content=html)

    # Announcement template
    html = f"""<!DOCTYPE html><html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="text-align:center;padding:16px 0 24px"><span style="font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.5px">Merlin</span></div>
    <div style="background:#111827;border-radius:16px;padding:40px 32px;text-align:center;margin-bottom:24px">
        <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3">Merlin agora busca vagas para você</h1>
        <p style="margin:12px 0 0;font-size:15px;color:#9ca3af;line-height:1.5">Olá {greeting}, uma nova funcionalidade está disponível</p>
    </div>
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:28px 24px;margin-bottom:24px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:0 0 20px 0"><table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="width:36px;vertical-align:top"><div style="width:28px;height:28px;background:#f0fdf4;border-radius:8px;text-align:center;line-height:28px;font-size:14px">&#128269;</div></td>
                <td style="vertical-align:top"><strong style="font-size:14px;color:#111827">Busca diária automática</strong><br><span style="font-size:13px;color:#6b7280">Vagas de LinkedIn, Gupy e outras plataformas, todos os dias</span></td>
            </tr></table></td></tr>
            <tr><td style="padding:0 0 20px 0"><table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="width:36px;vertical-align:top"><div style="width:28px;height:28px;background:#eff6ff;border-radius:8px;text-align:center;line-height:28px;font-size:14px">&#129504;</div></td>
                <td style="vertical-align:top"><strong style="font-size:14px;color:#111827">Matching inteligente</strong><br><span style="font-size:13px;color:#6b7280">IA compara cada vaga com suas competências e experiência</span></td>
            </tr></table></td></tr>
            <tr><td style="padding:0"><table cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="width:36px;vertical-align:top"><div style="width:28px;height:28px;background:#fef3c7;border-radius:8px;text-align:center;line-height:28px;font-size:14px">&#128232;</div></td>
                <td style="vertical-align:top"><strong style="font-size:14px;color:#111827">Notificação por email</strong><br><span style="font-size:13px;color:#6b7280">Receba as melhores vagas diretamente no seu inbox</span></td>
            </tr></table></td></tr>
        </table>
    </div>
    <div style="text-align:center;padding:8px 0 32px">
        <a href="{dashboard_url}" style="display:inline-block;background:#111827;color:#ffffff;padding:16px 40px;border-radius:28px;text-decoration:none;font-weight:600;font-size:15px">Configurar minhas preferências</a>
    </div>
    <div style="text-align:center;padding:20px 0;border-top:1px solid #e5e7eb">
        <p style="margin:0 0 8px;font-size:12px;color:#9ca3af"><a href="{unsubscribe_url}" style="color:#9ca3af;text-decoration:underline">Não desejo receber comunicações</a></p>
        <p style="margin:0;font-size:11px;color:#d1d5db">Ella Executive Search Ltda · merlincv.com</p>
    </div>
</div></body></html>"""
    return HTMLResponse(content=html)


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
