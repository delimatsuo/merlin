"""Voice interview WebSocket endpoints."""

import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status

from app.auth import AuthenticatedUser, verify_ws_token, get_current_user
from app.services.claude import generate_interview_questions, process_voice_answers
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/questions")
async def get_interview_questions(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate interview questions based on profile gaps."""
    fs = FirestoreService()
    profile = await fs.get_latest_profile(user.uid)

    if not profile:
        return {"questions": [], "error": "Perfil não encontrado."}

    structured_data = profile.get("structuredData", {})
    enriched_data = profile.get("enrichedProfile", {})

    questions = await generate_interview_questions(structured_data, enriched_data)

    # Create voice session
    session_id = await fs.create_voice_session(
        uid=user.uid,
        profile_id=profile.get("id", ""),
        questions=questions,
    )

    return {"sessionId": session_id, "questions": questions, "status": "pending"}


@router.websocket("/session")
async def voice_session(websocket: WebSocket):
    """WebSocket endpoint for voice interview session."""
    await websocket.accept()

    # Authenticate
    user = await verify_ws_token(websocket)
    if not user:
        return

    logger.info("voice_session_start", uid=user.uid)

    fs = FirestoreService()
    session_id = websocket.query_params.get("sessionId", "")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type")

            if msg_type == "answer":
                # Save transcript checkpoint
                question_index = message.get("questionIndex", 0)
                answer_text = message.get("text", "")

                await fs.save_voice_answer(
                    session_id=session_id,
                    question_index=question_index,
                    answer=answer_text,
                )

                await websocket.send_json({
                    "type": "answer_saved",
                    "questionIndex": question_index,
                })

            elif msg_type == "end":
                # Process all answers and update profile
                session = await fs.get_voice_session(session_id)
                if session:
                    answers = session.get("answers", [])
                    questions = session.get("questions", [])

                    profile_update = await process_voice_answers(questions, answers)

                    profile_id = session.get("profileId", "")
                    if profile_id:
                        await fs.update_enriched_profile(
                            uid=user.uid,
                            profile_id=profile_id,
                            voice_data=profile_update,
                        )

                    await fs.update_voice_session_status(session_id, "completed")

                await websocket.send_json({"type": "session_complete"})
                break

    except WebSocketDisconnect:
        logger.info("voice_session_disconnected", uid=user.uid, session_id=session_id)
        await fs.update_voice_session_status(session_id, "disconnected")
    except Exception as e:
        logger.error("voice_session_error", uid=user.uid, error=str(e))
        try:
            await websocket.send_json({"type": "error", "message": "Erro na sessão de voz."})
        except Exception:
            pass


@router.post("/text-answer")
async def submit_text_answer(
    body: dict,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Submit a text answer to an interview question (fallback for voice)."""
    session_id = body.get("sessionId", "")
    question_index = body.get("questionIndex", 0)
    answer_text = body.get("answer", "")

    if not session_id or not answer_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dados incompletos.",
        )

    fs = FirestoreService()
    session = await fs.get_voice_session(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão não encontrada.",
        )

    if session.get("userId") != user.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado.",
        )

    # Save answer
    await fs.save_voice_answer(session_id, question_index, answer_text)

    return {"status": "saved", "questionIndex": question_index}


@router.post("/complete/{session_id}")
async def complete_interview(
    session_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Complete an interview session and process all answers."""
    fs = FirestoreService()
    session = await fs.get_voice_session(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão não encontrada.",
        )

    if session.get("userId") != user.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado.",
        )

    questions = session.get("questions", [])
    answers = session.get("answers", [])

    # Process answers with Claude
    profile_update = await process_voice_answers(questions, answers)

    profile_id = session.get("profileId", "")
    if profile_id:
        await fs.update_enriched_profile(
            uid=user.uid,
            profile_id=profile_id,
            voice_data=profile_update,
        )

    await fs.update_voice_session_status(session_id, "completed")

    return {"status": "completed", "profileUpdate": profile_update}
