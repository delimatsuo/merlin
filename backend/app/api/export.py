"""Document export endpoints."""

import re
import unicodedata
from typing import Optional
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.auth import AuthenticatedUser, get_current_user
from app.services.docx_gen import generate_resume_docx, generate_cover_letter_docx
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _safe_filename(name: str) -> str:
    """Convert a version name to an ASCII-safe filename for HTTP headers."""
    # Normalize unicode (e.g., decompose accents)
    name = unicodedata.normalize("NFKD", name)
    # Replace em/en dashes and other separators with hyphen
    name = re.sub(r'[\u2014\u2013\u2012\u2015]', '-', name)
    # Keep only ASCII letters, digits, hyphens, underscores, spaces
    name = name.encode("ascii", "ignore").decode("ascii")
    # Strip quotes to prevent Content-Disposition header injection
    name = name.replace('"', '').replace("'", '')
    # Replace spaces with underscores, collapse multiple separators
    name = re.sub(r'[\s]+', '_', name.strip())
    name = re.sub(r'[-_]{2,}', '-', name)
    return name or "documento"


@router.get("/resume")
async def export_resume(
    application_id: str,
    version_id: Optional[str] = None,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate and return a resume DOCX file directly."""
    fs = FirestoreService()

    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aplicação não encontrada.",
        )

    if version_id:
        resume = await fs.get_resume_version(user.uid, application_id, version_id)
    else:
        resume = await fs.get_latest_resume(user.uid, application_id)

    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currículo personalizado não encontrado. Gere um primeiro.",
        )

    resume_content = resume.get("resumeContent", "")
    if not resume_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conteúdo do currículo vazio.",
        )

    try:
        docx_bytes = await generate_resume_docx(resume_content)
    except Exception as e:
        logger.error("docx_generation_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar o documento. Tente novamente.",
        )

    filename = _safe_filename(resume.get("name", "curriculo")) + ".docx"

    return Response(
        content=docx_bytes,
        media_type=DOCX_CONTENT_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/cover-letter")
async def export_cover_letter(
    application_id: str,
    version_id: Optional[str] = None,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate and return a cover letter DOCX file directly."""
    fs = FirestoreService()

    application = await fs.get_application(user.uid, application_id)
    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aplicação não encontrada.",
        )

    if version_id:
        resume = await fs.get_resume_version(user.uid, application_id, version_id)
    else:
        resume = await fs.get_latest_resume(user.uid, application_id)

    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Carta de apresentação não encontrada. Gere uma primeiro.",
        )

    cover_letter_text = resume.get("coverLetterText", "")
    if not cover_letter_text:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conteúdo da carta vazio.",
        )

    try:
        docx_bytes = await generate_cover_letter_docx(cover_letter_text)
    except Exception as e:
        logger.error("cover_letter_docx_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao gerar o documento. Tente novamente.",
        )

    filename = "carta_" + _safe_filename(resume.get("name", "carta")) + ".docx"

    return Response(
        content=docx_bytes,
        media_type=DOCX_CONTENT_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
