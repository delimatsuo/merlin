"""Profile CRUD endpoints."""

import html
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_current_user
from app.schemas.api import ProfileUpdateRequest, RecommendationsResponse
from app.services.audit import log_data_access
from app.services.firestore import FirestoreService
from app.services.gemini_ai import generate_recommendations
from app.services.knowledge import build_knowledge_from_profile, merge_comment_into_knowledge, rebuild_knowledge

logger = structlog.get_logger()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class MergeInsightsRequest(BaseModel):
    insights: list[str] = Field(max_length=5)
    applicationContext: str = ""


@router.get("/status")
async def get_workflow_status(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get user's workflow completion status for dashboard."""
    fs = FirestoreService()

    # Check profile
    profile = await fs.get_latest_profile(user.uid)
    has_profile = profile is not None
    profile_id = profile.get("id", "") if profile else ""

    # Check enrichment
    has_enrichment = bool(profile and profile.get("enrichedProfile"))

    # Check voice interview
    has_voice = bool(profile and profile.get("voiceAnswers"))

    # Check applications
    has_application = False
    has_tailored = False
    application_id = ""

    if has_profile:
        apps = await fs.get_user_applications(user.uid)
        if apps:
            has_application = True
            application_id = apps[0].get("id", "")
            # Check if any resume was generated
            if application_id:
                resume = await fs.get_latest_resume(user.uid, application_id)
                has_tailored = resume is not None

    return {
        "profileId": profile_id,
        "applicationId": application_id,
        "steps": {
            "upload": has_profile,
            "interview": has_voice,
            "job": has_application,
            "analysis": has_application,
            "result": has_tailored,
        },
    }


@router.get("/current")
async def get_current_profile(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get the user's current profile."""
    fs = FirestoreService()
    profile = await fs.get_latest_profile(user.uid)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum perfil encontrado. Envie seu currículo primeiro.",
        )

    return profile


@router.get("/all")
async def list_all_profiles(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """List all uploaded resumes for a user."""
    fs = FirestoreService()
    profiles = await fs.list_all_profiles(user.uid)
    return {"profiles": profiles}


@router.get("/knowledge")
async def get_knowledge(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get the candidate's knowledge file. Auto-builds from profile if not exists."""
    fs = FirestoreService()
    knowledge = await fs.get_candidate_knowledge(user.uid)

    if knowledge is None:
        # Auto-build from latest profile (migration for existing users)
        knowledge = await build_knowledge_from_profile(user.uid)

    log_data_access(user.uid, "read_knowledge", "knowledge")
    return {"knowledge": knowledge}


@router.post("/knowledge/merge")
async def merge_knowledge_insights(
    body: MergeInsightsRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Manually add insights to the knowledge file (comment box)."""
    insights = body.insights
    application_context = body.applicationContext

    if not insights:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum insight fornecido.",
        )

    if len(insights) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo 5 insights por chamada.",
        )

    # Rate limit: check daily merge count
    fs = FirestoreService()
    knowledge = await fs.get_candidate_knowledge(user.uid)
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if knowledge:
        merge_meta = knowledge.get("_mergeMeta", {})
        if merge_meta.get("date") == today and merge_meta.get("count", 0) >= 20:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Limite diário de 20 merges atingido.",
            )

    for insight in insights:
        if not isinstance(insight, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cada insight deve ser uma string.",
            )
        if len(insight) > 500:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo 500 caracteres por insight.",
            )

    # Sanitize HTML
    sanitized = [html.escape(i.strip()) for i in insights if i.strip()]

    for comment in sanitized:
        await merge_comment_into_knowledge(user.uid, comment, application_context)

    return {"status": "merged", "count": len(sanitized)}


@router.put("/{profile_id}")
async def update_profile(
    profile_id: str,
    body: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update a profile's structured data."""
    fs = FirestoreService()

    # Verify ownership
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    await fs.update_profile(user.uid, profile_id, body.profile.model_dump())

    logger.info("profile_updated", uid=user.uid, profile_id=profile_id)
    return {"status": "updated", "profileId": profile_id}


@router.delete("/{profile_id}")
async def delete_profile(
    profile_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a profile, its Cloud Storage file, and rebuild the knowledge file."""
    fs = FirestoreService()

    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    # Delete original file from Cloud Storage
    file_url = profile.get("fileUrl")
    if file_url and file_url.startswith(f"uploads/{user.uid}/"):
        try:
            from firebase_admin import storage
            bucket = storage.bucket()
            blob = bucket.blob(file_url)
            blob.delete()
        except Exception as e:
            logger.warning("storage_file_delete_error", uid=user.uid, error=str(e))

    # Delete Firestore document
    await fs.delete_profile(user.uid, profile_id)

    # Rebuild knowledge file from remaining profiles (awaited for data integrity)
    await rebuild_knowledge(user.uid)

    log_data_access(user.uid, "delete_profile", "profile", resource_id=profile_id)
    logger.info("profile_deleted", uid=user.uid, profile_id=profile_id)
    return {"status": "deleted"}


class RecommendationsRequest(BaseModel):
    locale: Literal["pt-BR", "en"] = "pt-BR"


@router.post("/{profile_id}/recommendations", response_model=RecommendationsResponse)
@limiter.limit("5/minute")
async def get_profile_recommendations(
    profile_id: str,
    request: Request,
    body: RecommendationsRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate CV health-check recommendations for a profile."""
    fs = FirestoreService()

    # Verify ownership
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    # Check cache — hit if recommendations exist and locale matches
    cached = await fs.get_recommendations(user.uid, profile_id)
    if cached and cached.get("locale") == body.locale:
        return RecommendationsResponse(recommendations=cached["recommendations"])

    # Generate fresh recommendations
    structured_data = profile.get("structuredData", {})
    knowledge = await fs.get_candidate_knowledge(user.uid)

    try:
        recommendations = await generate_recommendations(
            profile=structured_data,
            knowledge=knowledge,
            locale=body.locale,
        )
    except Exception as e:
        logger.error("recommendations_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar recomendações. Tente novamente.",
        )

    # Track successful LLM call
    await fs.increment_global_generation("cv_recommendations", uid=user.uid)

    # Save to profile doc cache
    await fs.save_recommendations(user.uid, profile_id, recommendations, body.locale)

    return RecommendationsResponse(recommendations=recommendations)


@router.get("/data-export")
async def export_user_data(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Export all user data as JSON (LGPD right to access)."""
    fs = FirestoreService()
    data = await fs.export_user_data(user.uid)
    log_data_access(user.uid, "export_data", "user_data")
    return data


@router.delete("/account/delete")
async def delete_account(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete user account and all associated data (LGPD right to deletion)."""
    from firebase_admin import auth as firebase_auth

    fs = FirestoreService()

    # Delete all Firestore data
    await fs.delete_all_user_data(user.uid)

    # Delete Firebase Auth account
    try:
        firebase_auth.delete_user(user.uid)
    except Exception as e:
        logger.error("account_delete_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao excluir conta. Tente novamente.",
        )

    log_data_access(user.uid, "delete_account", "account")
    logger.info("account_deleted", uid=user.uid)
    return {"status": "deleted", "message": "Conta e todos os dados foram excluídos."}
