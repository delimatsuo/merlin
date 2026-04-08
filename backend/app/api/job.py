"""Job description analysis endpoints."""

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.schemas.api import JobAnalysisRequest, JobAnalysisResponse, FollowUpDecision
from app.services.gemini_ai import (
    analyze_job_description,
    extract_ats_keywords,
    semantic_skill_match,
    generate_followup_questions,
)
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


@router.post("/analyze")
async def analyze_job(
    body: JobAnalysisRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Analyze a job description.

    Returns immediately with applicationId + status="analyzing".
    AI processing runs in the background — poll GET /status/{application_id}.
    """
    logger.info("job_analysis_start", uid=user.uid)

    job_text = body.job_description[: settings.max_job_description_chars]

    fs = FirestoreService()

    # Save application immediately with status="analyzing"
    application_id = await fs.save_application_pending(
        uid=user.uid,
        job_description=job_text,
    )

    # Extract scalars from request-scoped objects for background closure
    uid = user.uid
    user_email = user.email or ""

    # Process in background (fresh FirestoreService to avoid request-scope issues)
    async def _analyze_in_background():
        bg_fs = FirestoreService()
        try:
            # Phase 1: Parallel — job analysis + ATS keywords (independent)
            async def _analyze():
                return await analyze_job_description(job_text)

            async def _extract_keywords():
                try:
                    return await extract_ats_keywords(job_text)
                except Exception as e:
                    logger.warning("ats_extraction_error", uid=uid, error=str(e))
                    return []

            analysis, ats_keywords = await asyncio.gather(_analyze(), _extract_keywords())
            await bg_fs.increment_global_generation("job_analysis", uid=uid)

            # Phase 2: Sequential — depends on analysis results
            profile = await bg_fs.get_latest_profile(uid)
            knowledge = await bg_fs.get_candidate_knowledge(uid)

            skills_matrix = []
            ats_score = None
            follow_up = None

            candidate_skills = []
            candidate_experience = []
            if profile:
                candidate_skills.extend(profile.get("structuredData", {}).get("skills", []))
                candidate_experience = profile.get("structuredData", {}).get("experience", [])
            if knowledge:
                candidate_skills.extend(knowledge.get("skills", []))
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
                    logger.warning("semantic_match_fallback", uid=uid, error=str(e))
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
                for skill in required_skills:
                    skills_matrix.append({"skill": skill, "status": "missing", "evidence": None})
                ats_score = 0

            if ats_score is not None:
                missing_skills = [s["skill"] for s in skills_matrix if s["status"] == "missing"]
                max_questions = 3 if ats_score >= 80 else 5
                try:
                    questions = await generate_followup_questions(
                        knowledge or {}, analysis, missing_skills
                    )
                    await bg_fs.increment_global_generation("followup_questions", uid=uid)
                    follow_up = {"decision": "text", "questions": questions[:max_questions]}
                except Exception as e:
                    logger.warning("followup_generation_error", error=str(e))
                    follow_up = {"decision": "text", "questions": []}

            # Update application with full results
            profile_id = profile.get("id", "") if profile else ""
            await bg_fs.update_application_analyzed(
                uid=uid,
                application_id=application_id,
                profile_id=profile_id,
                analysis=analysis,
                skills_matrix=skills_matrix,
                ats_score=ats_score,
                ats_keywords=ats_keywords,
                follow_up=follow_up,
            )

            company = analysis.get("company", "")
            await bg_fs.log_activity(uid, user_email, "job_analysis", company=company)
            logger.info("job_analysis_complete", uid=uid, application_id=application_id, ats_score=ats_score)

        except Exception as e:
            logger.error("job_analysis_bg_error", uid=uid, application_id=application_id, error=str(e))
            try:
                await bg_fs.update_application_status(uid, application_id, "error")
            except Exception as e2:
                logger.error("job_analysis_status_update_failed", uid=uid, error=str(e2))

    asyncio.create_task(_analyze_in_background())

    logger.info("job_analysis_accepted", uid=uid, application_id=application_id)
    return {"applicationId": application_id, "status": "analyzing"}


@router.get("/status/{application_id}")
@limiter.limit("30/minute")
async def get_job_status(
    request: Request,
    application_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Poll for job analysis status."""
    fs = FirestoreService()
    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Vaga não encontrada.")

    app_status = application.get("status", "analyzed")
    if app_status == "analyzed":
        follow_up = application.get("followUp")
        return {
            "status": "analyzed",
            "analysis": application.get("jobAnalysis", {}),
            "skillsMatrix": application.get("skillsMatrix", []),
            "atsScore": application.get("atsScore"),
            "atsKeywords": application.get("atsKeywords", []),
            "followUp": follow_up,
        }
    elif app_status == "error":
        return {"status": "error"}
    else:
        return {"status": "analyzing"}
