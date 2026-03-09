"""Document export endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.schemas.api import ExportResponse
from app.services.docx_gen import generate_resume_docx, generate_cover_letter_docx
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()


@router.get("/resume", response_model=ExportResponse)
async def export_resume(
    application_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate and return a signed URL for the tailored resume DOCX."""
    fs = FirestoreService()

    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aplicação não encontrada.",
        )

    # Get latest resume version
    resume = await fs.get_latest_resume(user.uid, application_id)
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currículo personalizado não encontrado. Gere um primeiro.",
        )

    resume_content = resume.get("resumeContent", "")

    try:
        docx_bytes = await generate_resume_docx(resume_content)
    except Exception as e:
        logger.error("docx_generation_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar o documento. Tente novamente.",
        )

    # Upload to Cloud Storage and get signed URL
    signed_url, expires_at = await fs.upload_and_sign(
        uid=user.uid,
        filename=f"curriculo_{application_id}.docx",
        content=docx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    return ExportResponse(url=signed_url, expiresAt=expires_at)


@router.get("/cover-letter", response_model=ExportResponse)
async def export_cover_letter(
    application_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate and return a signed URL for the cover letter DOCX."""
    fs = FirestoreService()

    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aplicação não encontrada.",
        )

    resume = await fs.get_latest_resume(user.uid, application_id)
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Carta de apresentação não encontrada. Gere uma primeiro.",
        )

    cover_letter_text = resume.get("coverLetterText", "")

    try:
        docx_bytes = await generate_cover_letter_docx(cover_letter_text)
    except Exception as e:
        logger.error("cover_letter_docx_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar o documento. Tente novamente.",
        )

    signed_url, expires_at = await fs.upload_and_sign(
        uid=user.uid,
        filename=f"carta_{application_id}.docx",
        content=docx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    return ExportResponse(url=signed_url, expiresAt=expires_at)
