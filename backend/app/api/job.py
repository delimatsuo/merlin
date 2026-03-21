"""Job description analysis endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.schemas.api import JobAnalysisRequest, JobAnalysisResponse, FollowUpDecision
from app.services.gemini_ai import (
    AIProviderOverloadedError,
    analyze_job_description,
    extract_ats_keywords,
    semantic_skill_match,
    generate_followup_questions,
)
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
        # Analyze with Gemini
        analysis = await analyze_job_description(job_text)
    except AIProviderOverloadedError as e:
        logger.warning("job_analysis_overloaded", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="O serviço de IA está temporariamente sobrecarregado. Tente novamente em alguns minutos.",
        )
    except Exception as e:
        logger.error("job_analysis_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao analisar a vaga. Tente novamente em alguns minutos.",
        )

    # Track successful LLM call
    fs = FirestoreService()
    await fs.increment_global_generation("job_analysis")

    # Extract ATS keywords
    try:
        ats_keywords = await extract_ats_keywords(job_text)
    except Exception as e:
        logger.warning("ats_extraction_error", uid=user.uid, error=str(e))
        ats_keywords = []

    # Get user's profile and knowledge for skills matching
    profile = await fs.get_latest_profile(user.uid)
    knowledge = await fs.get_candidate_knowledge(user.uid)

    skills_matrix = []
    ats_score = None
    follow_up = None

    # Collect candidate skills from profile + knowledge
    candidate_skills = []
    candidate_experience = []
    if profile:
        candidate_skills.extend(profile.get("structuredData", {}).get("skills", []))
        candidate_experience = profile.get("structuredData", {}).get("experience", [])
    if knowledge:
        candidate_skills.extend(knowledge.get("skills", []))
        # Deduplicate
        seen = set()
        deduped = []
        for s in candidate_skills:
            if s.lower() not in seen:
                seen.add(s.lower())
                deduped.append(s)
        candidate_skills = deduped

    required_skills = analysis.get("required_skills", [])

    if required_skills and candidate_skills:
        try:
            # Semantic skill matching via Gemini
            match_result = await semantic_skill_match(
                candidate_skills, required_skills, candidate_experience
            )

            for item in match_result.get("matched", []):
                skills_matrix.append({
                    "skill": item.get("skill", ""),
                    "status": "has",
                    "evidence": item.get("evidence"),
                })
            for item in match_result.get("likely", []):
                skills_matrix.append({
                    "skill": item.get("skill", ""),
                    "status": "likely",
                    "evidence": item.get("evidence"),
                })
            for skill in match_result.get("missing", []):
                skills_matrix.append({
                    "skill": skill if isinstance(skill, str) else skill.get("skill", ""),
                    "status": "missing",
                    "evidence": None,
                })

            ats_score = match_result.get("score", 0)

        except Exception as e:
            logger.warning("semantic_match_fallback", uid=user.uid, error=str(e))
            # Fallback to exact matching
            user_skills_lower = {s.lower() for s in candidate_skills}
            for skill in required_skills:
                if skill.lower() in user_skills_lower:
                    skills_matrix.append({"skill": skill, "status": "has", "evidence": None})
                else:
                    skills_matrix.append({"skill": skill, "status": "missing", "evidence": None})
            if required_skills:
                has_count = sum(1 for s in skills_matrix if s["status"] == "has")
                ats_score = round((has_count / len(required_skills)) * 100, 1)
    elif required_skills:
        # No candidate skills available
        for skill in required_skills:
            skills_matrix.append({"skill": skill, "status": "missing", "evidence": None})
        ats_score = 0

    # Always generate follow-up questions — even high-match candidates
    # may have context about specific JD requirements not in their resume
    if ats_score is not None:
        missing_skills = [s["skill"] for s in skills_matrix if s["status"] == "missing"]
        gap_skills = missing_skills

        max_questions = 3 if ats_score >= 80 else 5
        try:
            questions = await generate_followup_questions(
                knowledge or {}, analysis, gap_skills
            )
            await fs.increment_global_generation("followup_questions")
            follow_up = FollowUpDecision(decision="text", questions=questions[:max_questions])
        except Exception as e:
            logger.warning("followup_generation_error", error=str(e))
            follow_up = FollowUpDecision(decision="text", questions=[])

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

    company = analysis.get("company", "")
    await fs.log_activity(user.uid, user.email or "", "job_analysis", company=company)
    logger.info("job_analysis_complete", uid=user.uid, application_id=application_id, ats_score=ats_score)

    return JobAnalysisResponse(
        analysis=analysis,
        skillsMatrix=skills_matrix,
        atsScore=ats_score,
        applicationId=application_id,
        followUp=follow_up,
    )
