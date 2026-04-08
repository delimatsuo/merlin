"""Resume upload and parsing endpoints."""

import asyncio

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
    """Upload and parse a resume file (PDF or DOCX).

    Returns immediately after text extraction with status="processing".
    AI structuring runs in the background — poll GET /status/{profile_id}.
    """
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

    # Parse resume text (fast, <2s)
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

    # Upload original file to Cloud Storage
    fs = FirestoreService()
    file_url = await fs.upload_resume_file(user.uid, file.filename or "resume", content)

    # Save profile immediately with status="processing" (fast return)
    profile_id = await fs.save_profile(
        uid=user.uid,
        raw_text=raw_text,
        structured_data={},
        file_url=file_url,
        user_email=user.email or "",
        user_name=user.name or "",
        status="processing",
    )

    # Structure in background (AI call, ~30-60s)
    # Note: On Cloud Run, background tasks may be killed if the container scales to
    # zero after the response is sent. The deploy config uses min-instances=1 for
    # staging/prod, keeping at least one container alive. The frontend polling has a
    # 3-minute timeout with a retry-friendly error message as an additional safeguard.
    async def _process_in_background():
        try:
            profile_data = await structure_resume(raw_text)
            await fs.update_profile_structured(user.uid, profile_id, profile_data)
            await fs.increment_global_generation("resume_structuring", uid=user.uid)
            from app.services.knowledge import merge_resume_into_knowledge
            await merge_resume_into_knowledge(user.uid, profile_data, profile_id)
            await fs.log_activity(user.uid, user.email or "", "upload")
            logger.info("resume_bg_structure_complete", uid=user.uid, profile_id=profile_id)
        except Exception as e:
            logger.error("resume_bg_structure_error", uid=user.uid, profile_id=profile_id, error=str(e))
            try:
                await fs.update_profile_status(user.uid, profile_id, "error")
            except Exception as e2:
                logger.error("resume_bg_status_update_failed", uid=user.uid, profile_id=profile_id, error=str(e2))

    asyncio.create_task(_process_in_background())

    logger.info("resume_upload_accepted", uid=user.uid, profile_id=profile_id)

    return ProfileResponse(
        profileId=profile_id,
        profile={},
        status="processing",
    )


@router.get("/status/{profile_id}")
async def get_resume_status(
    profile_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Poll for resume processing status."""
    fs = FirestoreService()
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")

    profile_status = profile.get("status", "parsed")
    if profile_status in ("parsed", "ready"):
        return {"status": "ready", "profile": profile.get("structuredData", {})}
    elif profile_status == "error":
        return {"status": "error"}
    else:
        return {"status": "processing"}
