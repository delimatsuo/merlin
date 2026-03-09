"""Resume tailoring endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.schemas.api import TailorRequest, TailorResponse, RegenerateRequest
from app.services.claude import rewrite_resume, generate_cover_letter
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()


@router.post("/generate", response_model=TailorResponse)
async def generate_tailored_resume(
    body: TailorRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate a tailored resume and cover letter using Claude Opus."""
    logger.info("tailor_start", uid=user.uid)

    fs = FirestoreService()

    # Check daily usage limit
    usage = await fs.get_daily_usage(user.uid)
    if usage >= settings.max_daily_tailor_count:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Você atingiu o limite diário de {settings.max_daily_tailor_count} personalizações. Tente novamente amanhã.",
        )

    # Get profile and application
    profile = await fs.get_profile(user.uid, body.profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    application = await fs.get_application(user.uid, body.application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vaga não encontrada.",
        )

    enriched_profile = profile.get("enrichedProfile") or profile.get("structuredData", {})
    job_analysis = application.get("jobAnalysis", {})
    job_description = application.get("jobDescriptionText", "")
    ats_keywords = application.get("atsKeywords", [])

    # Rewrite resume with Opus
    try:
        resume_content = await rewrite_resume(
            profile=enriched_profile,
            job_description=job_description,
            job_analysis=job_analysis,
            ats_keywords=ats_keywords,
        )
    except Exception as e:
        logger.error("tailor_resume_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao personalizar o currículo. Tente novamente em alguns minutos.",
        )

    # Generate cover letter with Opus
    try:
        cover_letter = await generate_cover_letter(
            profile=enriched_profile,
            job_description=job_description,
            job_analysis=job_analysis,
        )
    except Exception as e:
        logger.error("tailor_cover_letter_error", uid=user.uid, error=str(e))
        cover_letter = ""

    # Calculate updated ATS score
    ats_score = application.get("atsScore", 0) or 0

    # Save result
    await fs.save_tailored_resume(
        uid=user.uid,
        application_id=body.application_id,
        resume_content=resume_content,
        cover_letter=cover_letter,
        ats_score=ats_score,
    )

    # Increment daily usage
    await fs.increment_daily_usage(user.uid)

    logger.info("tailor_complete", uid=user.uid)

    return TailorResponse(
        resumeContent=resume_content,
        coverLetter=cover_letter,
        atsScore=ats_score,
    )


@router.get("/result/{application_id}")
async def get_tailored_result(
    application_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get the latest tailored resume and cover letter for an application."""
    fs = FirestoreService()

    result = await fs.get_latest_resume(user.uid, application_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resultado não encontrado. Gere o currículo primeiro.",
        )

    return {
        "resume": result.get("resumeContent", ""),
        "coverLetter": result.get("coverLetter", ""),
        "atsScore": result.get("atsScore", 0),
    }


@router.post("/regenerate")
async def regenerate_resume(
    body: RegenerateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Regenerate resume with additional instructions."""
    logger.info("regenerate_start", uid=user.uid, application_id=body.application_id)

    fs = FirestoreService()

    application = await fs.get_application(user.uid, body.application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vaga não encontrada.",
        )

    profile_id = application.get("profileId", "")
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil não encontrado.",
        )

    enriched_profile = profile.get("enrichedProfile") or profile.get("structuredData", {})
    job_analysis = application.get("jobAnalysis", {})
    job_description = application.get("jobDescriptionText", "")
    ats_keywords = application.get("atsKeywords", [])

    try:
        resume_content = await rewrite_resume(
            profile=enriched_profile,
            job_description=job_description,
            job_analysis=job_analysis,
            ats_keywords=ats_keywords,
            additional_instructions=body.instructions,
        )
    except Exception as e:
        logger.error("regenerate_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao regenerar. Tente novamente.",
        )

    await fs.save_tailored_resume(
        uid=user.uid,
        application_id=body.application_id,
        resume_content=resume_content,
        cover_letter=application.get("coverLetter", ""),
        ats_score=application.get("atsScore", 0) or 0,
    )

    return {"status": "regenerated", "resumeContent": resume_content}
