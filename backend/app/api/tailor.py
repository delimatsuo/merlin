"""Resume tailoring endpoints."""

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.schemas.api import TailorRequest, TailorResponse, RegenerateRequest
from app.services.admin_settings import AdminSettingsService
from app.services.audit import log_data_access
from app.services.gemini_ai import rewrite_resume, generate_cover_letter
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


@router.post("/generate")
@limiter.limit("10/minute")
async def generate_tailored_resume(
    request: Request,
    body: TailorRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate a tailored resume and cover letter.

    Returns immediately with status="generating". AI work runs in background.
    Frontend polls GET /versions/{application_id} to detect completion.
    """
    logger.info("tailor_start", uid=user.uid)

    fs = FirestoreService()

    # Check global generation limit
    global_count = await fs.get_global_generation_count()
    global_settings = await AdminSettingsService.get()
    global_limit = getattr(global_settings, "global_generation_limit", 10000)
    if global_count >= global_limit:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="O Merlin atingiu o limite de gerações disponíveis. Obrigado por participar!",
        )

    # Check daily usage limit (dynamic from admin settings)
    daily_limit = await AdminSettingsService.get_daily_limit()
    usage = await fs.get_daily_usage(user.uid)
    if usage >= daily_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Você atingiu o limite diário de {daily_limit} personalizações. Tente novamente amanhã.",
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

    # Increment counters optimistically (before AI call)
    await fs.increment_daily_usage(user.uid)
    await fs.increment_global_generation("resume_rewrite", uid=user.uid)

    # Capture data for background task
    structured_data = profile.get("structuredData", {})
    enrichment = profile.get("enrichedProfile") or {}
    job_analysis = application.get("jobAnalysis", {})
    job_description = application.get("jobDescriptionText", "")
    ats_keywords = application.get("atsKeywords", [])
    ats_score = application.get("atsScore", 0) or 0

    title = job_analysis.get("title", "")
    company = job_analysis.get("company", "")
    version_name = f"{company} — {title}" if company and title else title or company or ""

    knowledge = await fs.get_candidate_knowledge(user.uid)

    # Generate in background
    async def _generate_in_background():
        try:
            async def _rewrite():
                return await rewrite_resume(
                    profile=structured_data,
                    job_description=job_description,
                    job_analysis=job_analysis,
                    ats_keywords=ats_keywords,
                    knowledge=knowledge,
                    enrichment=enrichment,
                )

            async def _cover_letter():
                try:
                    return await generate_cover_letter(
                        profile=structured_data,
                        job_description=job_description,
                        job_analysis=job_analysis,
                    )
                except Exception as e:
                    logger.error("tailor_cover_letter_error", uid=user.uid, error=str(e))
                    return ""

            (resume_content, changelog), cover_letter = await asyncio.gather(
                _rewrite(), _cover_letter()
            )

            await fs.save_tailored_resume(
                uid=user.uid,
                application_id=body.application_id,
                resume_content=resume_content,
                cover_letter=cover_letter,
                ats_score=ats_score,
                version_name=version_name,
                changelog=changelog,
            )

            await fs.log_generation(user.uid, user.email or "", company)
            log_data_access(user.uid, "ai_generate_resume", "application", resource_id=body.application_id)
            logger.info("tailor_complete", uid=user.uid)

        except Exception as e:
            logger.error("tailor_bg_error", uid=user.uid, error=str(e))
            # Decrement counters on failure (optimistic rollback)
            try:
                await fs.decrement_daily_usage(user.uid)
            except Exception:
                pass

    asyncio.create_task(_generate_in_background())

    logger.info("tailor_accepted", uid=user.uid, application_id=body.application_id)
    return {"status": "generating", "applicationId": body.application_id}


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
        "coverLetter": result.get("coverLetterText", ""),
        "atsScore": result.get("atsScore", 0),
    }


@router.post("/regenerate")
@limiter.limit("10/minute")
async def regenerate_resume(
    request: Request,
    body: RegenerateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Regenerate resume with additional instructions."""
    logger.info("regenerate_start", uid=user.uid, application_id=body.application_id)

    fs = FirestoreService()

    # Check global generation limit
    global_count = await fs.get_global_generation_count()
    global_settings = await AdminSettingsService.get()
    global_limit = getattr(global_settings, "global_generation_limit", 10000)
    if global_count >= global_limit:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="O Merlin atingiu o limite de gerações disponíveis. Obrigado por participar!",
        )

    # Check daily usage limit (dynamic from admin settings)
    daily_limit = await AdminSettingsService.get_daily_limit()
    usage = await fs.get_daily_usage(user.uid)
    if usage >= daily_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Você atingiu o limite diário de {daily_limit} personalizações. Tente novamente amanhã.",
        )

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

    structured_data = profile.get("structuredData", {})
    enrichment = profile.get("enrichedProfile") or {}
    job_analysis = application.get("jobAnalysis", {})
    job_description = application.get("jobDescriptionText", "")
    ats_keywords = application.get("atsKeywords", [])

    # Fetch knowledge file for richer context
    knowledge = await fs.get_candidate_knowledge(user.uid)

    try:
        resume_content, changelog = await rewrite_resume(
            profile=structured_data,
            job_description=job_description,
            job_analysis=job_analysis,
            ats_keywords=ats_keywords,
            additional_instructions=body.instructions,
            knowledge=knowledge,
            enrichment=enrichment,
        )
    except TimeoutError:
        logger.warning("regenerate_timeout", uid=user.uid)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="A geração demorou mais que o esperado. Tente novamente.",
        )
    except Exception as e:
        error_type = type(e).__name__
        logger.error("regenerate_error", uid=user.uid, error_type=error_type, error=str(e)[:200])
        if "overload" in str(e).lower() or "529" in str(e):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="O serviço de IA está temporariamente sobrecarregado. Tente novamente em alguns minutos.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao regenerar. Tente novamente.",
        )

    # Preserve cover letter from the latest existing version
    latest_version = await fs.get_latest_resume(user.uid, body.application_id)
    existing_cover_letter = latest_version.get("coverLetterText", "") if latest_version else ""

    await fs.save_tailored_resume(
        uid=user.uid,
        application_id=body.application_id,
        resume_content=resume_content,
        cover_letter=existing_cover_letter,
        ats_score=application.get("atsScore", 0) or 0,
        changelog=changelog,
    )

    # Increment counters (global + daily + per-user) + log generation
    await fs.increment_daily_usage(user.uid)
    await fs.increment_global_generation("resume_rewrite", uid=user.uid)
    company = application.get("jobAnalysis", {}).get("company", "")
    await fs.log_generation(user.uid, user.email or "", company)

    log_data_access(user.uid, "ai_regenerate_resume", "application", resource_id=body.application_id)
    return {"status": "regenerated", "resumeContent": resume_content, "changelog": changelog}


# --- Version CRUD (Phase 4) ---


@router.get("/versions/{application_id}")
async def list_versions(
    application_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """List all versions for an application."""
    fs = FirestoreService()
    versions = await fs.list_resume_versions(user.uid, application_id)
    return {"versions": versions}


class UpdateContentRequest(BaseModel):
    content: str = Field(max_length=20000)


@router.put("/version/{application_id}/{version_id}")
async def update_version_content(
    application_id: str,
    version_id: str,
    body: UpdateContentRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update a version's resume content."""
    fs = FirestoreService()

    version = await fs.get_resume_version(user.uid, application_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")

    await fs.update_resume_content(user.uid, application_id, version_id, body.content)
    return {"status": "updated"}


@router.post("/version/{application_id}/{version_id}/copy")
async def copy_version(
    application_id: str,
    version_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Duplicate a version with '(cópia)' suffix."""
    fs = FirestoreService()

    try:
        new_id = await fs.copy_resume_version(user.uid, application_id, version_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")

    return {"status": "copied", "versionId": new_id}


class RenameRequest(BaseModel):
    name: str = Field(max_length=100, min_length=1)


@router.patch("/version/{application_id}/{version_id}/rename")
async def rename_version(
    application_id: str,
    version_id: str,
    body: RenameRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Rename a version."""
    fs = FirestoreService()

    version = await fs.get_resume_version(user.uid, application_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")

    await fs.rename_resume_version(user.uid, application_id, version_id, body.name)
    return {"status": "renamed"}


@router.delete("/version/{application_id}/{version_id}")
async def delete_version(
    application_id: str,
    version_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a version and its Cloud Storage file."""
    fs = FirestoreService()

    version = await fs.get_resume_version(user.uid, application_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")

    await fs.delete_resume_version(user.uid, application_id, version_id)
    return {"status": "deleted"}
