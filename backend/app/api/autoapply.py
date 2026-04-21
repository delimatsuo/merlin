"""AutoApply Chrome Extension API endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import AuthenticatedUser, get_current_user
from app.schemas.autoapply import (
    AnswerFieldsRequest,
    AnswerFieldsResponse,
    AnswerQuestionRequest,
    AnswerQuestionResponse,
    ApplicationLogRequest,
    ProfileResponse,
    SaveAnswersRequest,
    SaveAnswersResponse,
)
from app.services.firestore import FirestoreService
from app.services.gemini_ai import (
    AIProviderOverloadedError,
    match_form_fields,
    answer_custom_question,
)

logger = structlog.get_logger()
router = APIRouter()

DAILY_LLM_LIMIT = 500


@router.get("")
async def get_profile(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return candidate profile and daily LLM budget for the extension."""
    fs = FirestoreService()

    knowledge = await fs.get_candidate_knowledge(user.uid)
    current_count, _within = await fs.check_daily_llm_budget(user.uid, limit=DAILY_LLM_LIMIT)

    return ProfileResponse(
        knowledge=knowledge or {},
        daily_llm_calls=current_count,
        daily_llm_limit=DAILY_LLM_LIMIT,
    )


@router.post("/answer-fields")
async def answer_fields(
    request: Request,
    body: AnswerFieldsRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Batch-answer form fields using the candidate's knowledge profile."""
    fs = FirestoreService()

    # Check daily LLM budget
    current_count, within_budget = await fs.check_daily_llm_budget(user.uid, limit=DAILY_LLM_LIMIT)
    if not within_budget:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite diário de {DAILY_LLM_LIMIT} chamadas LLM atingido. Tente novamente amanhã.",
        )

    # Load knowledge file
    knowledge = await fs.get_candidate_knowledge(user.uid)
    if not knowledge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil profissional não encontrado. Complete o onboarding no Merlin primeiro.",
        )

    try:
        fields_as_dicts = [f.model_dump() for f in body.fields]
        result = await match_form_fields(fields_as_dicts, knowledge)
    except AIProviderOverloadedError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de IA temporariamente sobrecarregado. Tente novamente em alguns minutos.",
            headers={"Retry-After": "30"},
        )

    # Increment usage
    await fs.increment_llm_usage(user.uid)

    # Separate answered vs needs-human
    answers = {}
    needs_human = []
    for label, value in result.items():
        if value == "NEEDS_HUMAN":
            needs_human.append(label)
        else:
            answers[label] = value

    logger.info(
        "autoapply_fields_answered",
        uid=user.uid,
        total=len(body.fields),
        answered=len(answers),
        needs_human=len(needs_human),
    )

    return AnswerFieldsResponse(answers=answers, needs_human=needs_human)


@router.post("/answer-question")
async def answer_question(
    request: Request,
    body: AnswerQuestionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Answer a single custom application question."""
    fs = FirestoreService()

    # Check daily LLM budget
    current_count, within_budget = await fs.check_daily_llm_budget(user.uid, limit=DAILY_LLM_LIMIT)
    if not within_budget:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Limite diário de {DAILY_LLM_LIMIT} chamadas LLM atingido. Tente novamente amanhã.",
        )

    # Load knowledge file
    knowledge = await fs.get_candidate_knowledge(user.uid)
    if not knowledge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil profissional não encontrado. Complete o onboarding no Merlin primeiro.",
        )

    job_context = {
        "company_name": body.company_name,
        "job_title": body.job_title,
        "job_url": body.job_url,
    }

    try:
        answer, needs_human, model_used = await answer_custom_question(
            question=body.question,
            field_type=body.field_type,
            options=body.options,
            job_context=job_context,
            profile=knowledge,
        )
    except AIProviderOverloadedError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de IA temporariamente sobrecarregado. Tente novamente em alguns minutos.",
            headers={"Retry-After": "30"},
        )

    # Increment usage
    await fs.increment_llm_usage(user.uid)

    logger.info(
        "autoapply_question_answered",
        uid=user.uid,
        needs_human=needs_human,
        model=model_used,
    )

    return AnswerQuestionResponse(
        answer=answer,
        needs_human=needs_human,
        model_used=model_used,
    )


@router.post("/save-answers")
async def save_answers(
    request: Request,
    body: SaveAnswersRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Save user-provided answers to the knowledge file for future use."""
    fs = FirestoreService()

    # Verify knowledge file exists
    knowledge = await fs.get_candidate_knowledge(user.uid)
    if not knowledge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil profissional não encontrado. Complete o onboarding no Merlin primeiro.",
        )

    await fs.save_autoapply_answers(user.uid, body.answers)

    logger.info(
        "autoapply_answers_saved_endpoint",
        uid=user.uid,
        count=len(body.answers),
    )

    return SaveAnswersResponse(saved=len(body.answers))


@router.get("/logs")
async def get_application_logs(
    request: Request,
    limit: int = 10,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get recent autoapply application logs."""
    if limit > 50:
        limit = 50

    fs = FirestoreService()
    logs = await fs.get_autoapply_logs(user.uid, limit=limit)
    return {"logs": logs}


@router.post("/log")
async def log_application(
    request: Request,
    body: ApplicationLogRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Log an autoapply application attempt."""
    fs = FirestoreService()

    log_data = body.model_dump()
    log_id = await fs.log_autoapply_attempt(user.uid, log_data)

    logger.info(
        "autoapply_logged",
        uid=user.uid,
        log_id=log_id,
        status=body.status,
    )

    return {"status": "logged", "id": log_id}
