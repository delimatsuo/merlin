"""Company research and profile enrichment endpoints."""

import json
from datetime import datetime, timezone, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.services.search import research_companies
from app.services.gemini_ai import infer_skills_from_research
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()


async def _enrich_profile_background(uid: str, profile_id: str):
    """Background task: research companies and infer skills."""
    fs = FirestoreService()
    profile = await fs.get_profile(uid, profile_id)
    if not profile:
        logger.warning("enrich_profile_not_found", uid=uid, profile_id=profile_id)
        return

    structured = profile.get("structuredData", {})
    experience = structured.get("experience", [])

    # Extract unique company names
    companies = list({exp.get("company", "").strip() for exp in experience if exp.get("company", "").strip()})[:5]

    if not companies:
        logger.info("enrich_no_companies", uid=uid)
        return

    # Check cache first
    cached = {}
    for company in companies:
        cache_key = company.lower().replace(" ", "_")
        cache_doc = await fs.get_company_cache(cache_key)
        if cache_doc and not _is_expired(cache_doc):
            cached[company] = cache_doc.get("researchData", {})

    # Research uncached companies
    uncached = [c for c in companies if c not in cached]
    if uncached:
        research_results = await research_companies(uncached)
        for result in research_results:
            company_name = result.get("company_name", "")
            cached[company_name] = result
            # Save to cache
            cache_key = company_name.lower().replace(" ", "_")
            await fs.save_company_cache(cache_key, result)

    # Use Gemini to infer skills from company research
    if cached:
        try:
            enrichment = await infer_skills_from_research(experience, cached)

            # Merge enrichment into profile
            existing_enriched = profile.get("enrichedProfile") or {}
            existing_enriched["companyResearch"] = enrichment

            await fs.update_profile_enrichment(uid, profile_id, existing_enriched)
            logger.info("enrich_complete", uid=uid, profile_id=profile_id, companies=len(companies))

        except Exception as e:
            logger.error("enrich_gemini_error", uid=uid, error=str(e))


def _is_expired(cache_doc: dict) -> bool:
    """Check if a cache document is expired (30-day TTL)."""
    expires_at = cache_doc.get("expiresAt", "")
    if not expires_at:
        return True
    try:
        expiry = datetime.fromisoformat(expires_at)
        return datetime.now(timezone.utc) > expiry
    except (ValueError, TypeError):
        return True


@router.post("/enrich/{profile_id}")
async def enrich_profile(
    profile_id: str,
    background_tasks: BackgroundTasks,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Trigger background company research and profile enrichment."""
    fs = FirestoreService()
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    background_tasks.add_task(_enrich_profile_background, user.uid, profile_id)

    logger.info("enrich_started", uid=user.uid, profile_id=profile_id)
    return {"status": "processing", "message": "Pesquisa de empresas iniciada."}


@router.get("/status/{profile_id}")
async def get_enrichment_status(
    profile_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Check enrichment status for a profile."""
    fs = FirestoreService()
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    enriched = profile.get("enrichedProfile")
    has_research = enriched and enriched.get("companyResearch")

    return {
        "profileId": profile_id,
        "status": "enriched" if has_research else "pending",
        "enrichedProfile": enriched,
    }
