"""Profile CRUD endpoints."""

import html
import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.schemas.api import ProfileUpdateRequest
from app.services.firestore import FirestoreService
from app.services.knowledge import build_knowledge_from_profile, merge_comment_into_knowledge

logger = structlog.get_logger()
router = APIRouter()


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

    return {"knowledge": knowledge}


@router.post("/knowledge/merge")
async def merge_knowledge_insights(
    body: dict,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Manually add insights to the knowledge file (comment box)."""
    insights = body.get("insights", [])
    application_context = body.get("applicationContext", "")

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
    today_key = f"knowledge_merge_count"
    knowledge = await fs.get_candidate_knowledge(user.uid)
    # Simple rate limiting via knowledge doc metadata
    if knowledge:
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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
    """Delete a profile and associated data."""
    fs = FirestoreService()

    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    await fs.delete_profile(user.uid, profile_id)

    logger.info("profile_deleted", uid=user.uid, profile_id=profile_id)
    return {"status": "deleted"}


@router.get("/data-export")
async def export_user_data(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Export all user data as JSON (LGPD right to access)."""
    fs = FirestoreService()
    data = await fs.export_user_data(user.uid)
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

    logger.info("account_deleted", uid=user.uid)
    return {"status": "deleted", "message": "Conta e todos os dados foram excluídos."}
