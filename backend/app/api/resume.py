"""Resume upload and parsing endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.schemas.api import ProfileResponse
from app.services.parser import parse_resume
from app.services.gemini_ai import structure_resume
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()

# Magic bytes for file validation
PDF_MAGIC = b"%PDF"
DOCX_MAGIC = b"PK\x03\x04"

MAX_FILE_SIZE = settings.max_file_size_mb * 1024 * 1024


@router.post("/upload", response_model=ProfileResponse)
async def upload_resume(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Upload and parse a resume file (PDF or DOCX)."""
    logger.info("resume_upload_start", uid=user.uid, filename=file.filename)

    # Validate content type
    if file.content_type not in [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato não suportado. Envie um arquivo PDF ou DOCX.",
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Arquivo muito grande. O tamanho máximo é {settings.max_file_size_mb}MB.",
        )

    # Validate magic bytes
    if file.content_type == "application/pdf" and not content[:4].startswith(PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo PDF inválido.",
        )
    if (
        file.content_type
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        and not content[:4] == DOCX_MAGIC
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo DOCX inválido.",
        )

    # Parse resume text
    try:
        raw_text = await parse_resume(content, file.content_type)
    except Exception as e:
        logger.error("resume_parse_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não conseguimos ler seu currículo. Tente outro formato.",
        )

    if not raw_text or len(raw_text.strip()) < 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não conseguimos extrair texto suficiente do currículo. Tente outro arquivo.",
        )

    # Truncate to max length
    raw_text = raw_text[: settings.max_resume_chars]

    # Structure with Claude Sonnet
    try:
        profile_data = await structure_resume(raw_text)
    except Exception as e:
        logger.error("resume_structure_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar o currículo. Tente novamente em alguns minutos.",
        )

    # Upload original file to Cloud Storage
    fs = FirestoreService()
    file_url = await fs.upload_resume_file(user.uid, file.filename or "resume", content)

    # Save to Firestore
    profile_id = await fs.save_profile(
        uid=user.uid,
        raw_text=raw_text,
        structured_data=profile_data,
        file_url=file_url,
        user_email=user.email or "",
        user_name=user.name or "",
    )

    # Merge into knowledge file (fire-and-forget)
    try:
        from app.services.knowledge import merge_resume_into_knowledge
        import asyncio
        asyncio.create_task(merge_resume_into_knowledge(user.uid, profile_data, profile_id))
    except Exception as e:
        logger.warning("knowledge_merge_skipped", uid=user.uid, error=str(e))

    logger.info("resume_upload_complete", uid=user.uid, profile_id=profile_id)

    return ProfileResponse(
        profileId=profile_id,
        profile=profile_data,
        status="parsed",
    )
