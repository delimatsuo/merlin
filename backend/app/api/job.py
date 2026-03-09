"""Job description analysis endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.schemas.api import JobAnalysisRequest, JobAnalysisResponse
from app.services.claude import analyze_job_description
from app.services.ats import extract_ats_keywords
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()


@router.post("/analyze", response_model=JobAnalysisResponse)
async def analyze_job(
    body: JobAnalysisRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Analyze a job description and extract requirements."""
    logger.info("job_analysis_start", uid=user.uid)

    job_text = body.job_description[: settings.max_job_description_chars]

    try:
        # Analyze with Claude Sonnet
        analysis = await analyze_job_description(job_text)
    except Exception as e:
        logger.error("job_analysis_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao analisar a vaga. Tente novamente em alguns minutos.",
        )

    # Extract ATS keywords with Haiku
    try:
        ats_keywords = await extract_ats_keywords(job_text)
    except Exception as e:
        logger.warning("ats_extraction_error", uid=user.uid, error=str(e))
        ats_keywords = []

    # Get user's profile for skills matching
    fs = FirestoreService()
    profile = await fs.get_latest_profile(user.uid)

    skills_matrix = []
    ats_score = None

    if profile:
        user_skills = set(s.lower() for s in profile.get("structuredData", {}).get("skills", []))
        required_skills = analysis.get("required_skills", [])

        for skill in required_skills:
            skill_lower = skill.lower()
            if skill_lower in user_skills:
                skills_matrix.append({"skill": skill, "status": "has", "evidence": None})
            else:
                skills_matrix.append({"skill": skill, "status": "missing", "evidence": None})

        if required_skills:
            has_count = sum(1 for s in skills_matrix if s["status"] == "has")
            ats_score = round((has_count / len(required_skills)) * 100, 1)

    # Save application to Firestore
    application_id = await fs.save_application(
        uid=user.uid,
        profile_id=profile.get("id", "") if profile else "",
        job_description=job_text,
        analysis=analysis,
        skills_matrix=skills_matrix,
        ats_score=ats_score,
        ats_keywords=ats_keywords,
    )

    logger.info("job_analysis_complete", uid=user.uid, application_id=application_id)

    return JobAnalysisResponse(
        analysis=analysis,
        skillsMatrix=skills_matrix,
        atsScore=ats_score,
    )
