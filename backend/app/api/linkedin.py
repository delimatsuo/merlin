"""LinkedIn profile optimization endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from pydantic import ValidationError
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, get_current_user
from app.config import get_settings
from app.services.admin_settings import AdminSettingsService
from app.schemas.api import (
    LinkedInAnalyzeRequest,
    LinkedInAnalyzeResponse,
    LinkedInPasteRequest,
    LinkedInStructured,
    LinkedInUploadResponse,
)
from app.services.firestore import FirestoreService
from app.services.gemini_ai import analyze_linkedin_profile, structure_linkedin_profile, _sanitize_input
from app.services.parser import parse_resume

logger = structlog.get_logger()
router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)

PDF_MAGIC = b"%PDF"
MAX_FILE_SIZE = settings.max_file_size_mb * 1024 * 1024
MAX_PDF_PAGES = 10

# LinkedIn section markers for quality gate (both EN and PT-BR)
LINKEDIN_MARKERS = [
    "experience", "experiência", "experiencia",
    "education", "educação", "educacao", "formação", "formacao",
    "skills", "competências", "competencias",
    "about", "sobre",
]


def _check_pdf_quality(text: str) -> bool:
    """Heuristic quality gate: check if extracted text looks like a LinkedIn profile."""
    if len(text.split()) < 30:
        return False
    text_lower = text.lower()
    marker_count = sum(1 for m in LINKEDIN_MARKERS if m in text_lower)
    return marker_count >= 2


@router.post("/upload", response_model=LinkedInUploadResponse)
@limiter.limit("5/minute")
async def upload_linkedin_pdf(
    request: Request,
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Upload and parse a LinkedIn PDF export."""
    logger.info("linkedin_upload_start", uid=user.uid, filename=file.filename)

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato não suportado. Envie um arquivo PDF exportado do LinkedIn.",
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Arquivo muito grande. O tamanho máximo é {settings.max_file_size_mb}MB.",
        )

    if not content[:4].startswith(PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo PDF inválido.",
        )

    # Check page count
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        if len(reader.pages) > MAX_PDF_PAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PDF muito longo ({len(reader.pages)} páginas). O máximo é {MAX_PDF_PAGES} páginas.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # If we can't count pages, continue with parsing

    # Parse PDF text
    try:
        raw_text = await parse_resume(content, "application/pdf")
    except Exception as e:
        logger.error("linkedin_parse_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não conseguimos ler o PDF. Tente colar o texto do perfil manualmente.",
        )

    # Quality gate
    if not raw_text or not _check_pdf_quality(raw_text):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O PDF parece estar corrompido ou com formatação ilegível. Tente colar o texto do perfil manualmente.",
        )

    raw_text = raw_text[:settings.max_resume_chars]

    # Structure with Flash-Lite
    try:
        structured_data = await structure_linkedin_profile(raw_text)
    except Exception as e:
        logger.error("linkedin_structure_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar o perfil LinkedIn. Tente novamente em alguns minutos.",
        )

    # Validate structured data
    if structured_data.get("parse_error"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não conseguimos interpretar o perfil. Tente colar o texto manualmente.",
        )
    try:
        structured = LinkedInStructured(**structured_data)
    except ValidationError as e:
        logger.error("linkedin_validation_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Erro ao validar os dados do perfil. Tente novamente.",
        )

    # Save to Firestore
    fs = FirestoreService()
    await fs.save_linkedin_profile(
        uid=user.uid,
        raw_text=raw_text,
        structured=structured.model_dump(by_alias=True),
        source="pdf",
    )

    logger.info("linkedin_upload_complete", uid=user.uid)

    return LinkedInUploadResponse(structured=structured, status="parsed")


@router.post("/paste", response_model=LinkedInUploadResponse)
@limiter.limit("5/minute")
async def paste_linkedin_text(
    request: Request,
    body: LinkedInPasteRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Parse pasted LinkedIn profile text."""
    logger.info("linkedin_paste_start", uid=user.uid, text_length=len(body.text))

    # Sanitize control characters (RA-4 — XSS handled by React's default text rendering)
    sanitized_text = _sanitize_input(body.text)

    # Structure with Flash-Lite
    try:
        structured_data = await structure_linkedin_profile(sanitized_text)
    except Exception as e:
        logger.error("linkedin_structure_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar o perfil LinkedIn. Tente novamente em alguns minutos.",
        )

    if structured_data.get("parse_error"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não conseguimos interpretar o perfil. Tente novamente com mais texto.",
        )
    try:
        structured = LinkedInStructured(**structured_data)
    except ValidationError as e:
        logger.error("linkedin_validation_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Erro ao validar os dados do perfil. Tente novamente.",
        )

    # Save to Firestore
    fs = FirestoreService()
    await fs.save_linkedin_profile(
        uid=user.uid,
        raw_text=sanitized_text,
        structured=structured.model_dump(by_alias=True),
        source="text",
    )

    logger.info("linkedin_paste_complete", uid=user.uid)

    return LinkedInUploadResponse(structured=structured, status="parsed")


@router.get("/current")
async def get_linkedin_profile(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get the stored LinkedIn profile."""
    fs = FirestoreService()
    profile = await fs.get_linkedin_profile(user.uid)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum perfil LinkedIn encontrado.")
    return profile


@router.post("/analyze", response_model=LinkedInAnalyzeResponse)
@limiter.limit("3/minute")
async def analyze_linkedin(
    request: Request,
    body: LinkedInAnalyzeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate AI improvement suggestions for the LinkedIn profile."""
    logger.info("linkedin_analyze_start", uid=user.uid, locale=body.locale)

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

    # Guard: profile must exist (RA-6)
    profile = await fs.get_linkedin_profile(user.uid)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Envie seu perfil LinkedIn primeiro.",
        )

    # Cache check (skip if force=true for re-analysis)
    cached = await fs.get_linkedin_suggestions(user.uid)
    if not body.force and cached and cached.get("locale") == body.locale:
        logger.info("linkedin_analyze_cache_hit", uid=user.uid)
        return LinkedInAnalyzeResponse(
            suggestions=cached["suggestions"],
            crossRef=cached.get("crossRef", []),
        )

    # Load knowledge file (optional cross-reference)
    knowledge = await fs.get_candidate_knowledge(user.uid)

    # Call Sonnet for analysis
    try:
        suggestions, cross_ref = await analyze_linkedin_profile(
            structured=profile.get("structured", {}),
            knowledge=knowledge,
            locale=body.locale,
        )
    except Exception as e:
        logger.error("linkedin_analyze_error", uid=user.uid, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao analisar o perfil LinkedIn. Tente novamente em alguns minutos.",
        )

    # Save suggestions + increment global counter
    await fs.save_linkedin_suggestions(user.uid, suggestions, cross_ref, body.locale)
    await fs.increment_global_generation()

    logger.info("linkedin_analyze_complete", uid=user.uid, suggestion_count=len(suggestions))

    return LinkedInAnalyzeResponse(suggestions=suggestions, crossRef=cross_ref)
