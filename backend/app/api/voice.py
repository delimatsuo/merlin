"""Voice interview WebSocket endpoints."""

import asyncio
import io
import json
import wave

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.auth import AuthenticatedUser, verify_ws_token, get_current_user
from app.config import get_settings
from app.services.audit import log_data_access
from app.services.gemini_ai import generate_interview_questions, process_voice_answers
from app.services.firestore import FirestoreService

logger = structlog.get_logger()
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

_genai_client: genai.Client | None = None


def _get_genai_client() -> genai.Client:
    global _genai_client
    if _genai_client is None:
        settings = get_settings()
        _genai_client = genai.Client(api_key=settings.gemini_api_key)
    return _genai_client


class TTSRequest(BaseModel):
    text: str
    locale: str = "pt-BR"


class QuestionsRequest(BaseModel):
    locale: str = "pt-BR"


@router.post("/tts")
@limiter.limit("30/minute")
async def text_to_speech(
    request: Request,
    body: TTSRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Convert text to natural speech using Gemini 2.5 Flash TTS."""
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vazio.")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Texto muito longo (max 2000 chars).")

    # Select voice based on locale: Orus for Portuguese, Kore for English
    voice_name = "Kore" if body.locale == "en" else "Orus"

    client = _get_genai_client()

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice_name,
                        )
                    )
                ),
            ),
        )
    except Exception as e:
        logger.warning("tts_ai_error", error_type=type(e).__name__, error=str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de áudio temporariamente indisponível. Tente novamente.",
        )

    if not response.candidates or not response.candidates[0].content.parts:
        raise HTTPException(status_code=502, detail="Erro na geração de áudio.")
    part = response.candidates[0].content.parts[0]
    if not hasattr(part, "inline_data") or not part.inline_data or not part.inline_data.data:
        raise HTTPException(status_code=502, detail="Resposta de áudio vazia.")
    audio_data = part.inline_data.data

    # Wrap raw PCM in WAV container for browser playback
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(audio_data)

    return Response(
        content=buf.getvalue(),
        media_type="audio/wav",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/transcribe")
@limiter.limit("20/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Transcribe audio using Gemini 2.5 Flash."""
    audio_content = await audio.read()
    if len(audio_content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio muito grande (max 25MB).")
    if len(audio_content) < 100:
        raise HTTPException(status_code=400, detail="Audio vazio.")

    content_type = audio.content_type or "audio/webm"

    # Gemini doesn't support webm audio — convert to ogg (same opus codec, supported container)
    if content_type.startswith("audio/webm"):
        try:
            audio_content = await asyncio.to_thread(_convert_webm_to_ogg, audio_content)
        except Exception as e:
            logger.error("webm_to_ogg_failed", error=str(e))
            raise HTTPException(status_code=502, detail="Erro ao processar audio. Tente novamente.")
        content_type = "audio/ogg"

    client = _get_genai_client()

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Content(parts=[
                    types.Part.from_bytes(data=audio_content, mime_type=content_type),
                    types.Part.from_text(
                        text="Transcreva este áudio fielmente, palavra por palavra. "
                        "Retorne APENAS a transcrição, sem comentários ou formatação."
                    ),
                ]),
            ],
        )
    except Exception as e:
        logger.error("transcription_failed", error=str(e))
        raise HTTPException(status_code=502, detail="Erro na transcrição. Tente novamente.")

    transcript = response.text.strip() if response.text else ""
    return {"transcript": transcript}


def _convert_webm_to_ogg(audio_data: bytes) -> bytes:
    """Convert webm/opus audio to ogg/opus using ffmpeg."""
    import subprocess
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as inp:
        inp.write(audio_data)
        inp_path = inp.name

    out_path = inp_path + ".ogg"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", inp_path, "-c:a", "copy", out_path],
            capture_output=True, check=True, timeout=30,
        )
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in (inp_path, out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


@router.post("/questions")
async def get_interview_questions(
    body: QuestionsRequest = QuestionsRequest(),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Generate interview questions based on profile gaps."""
    fs = FirestoreService()
    profile = await fs.get_latest_profile(user.uid)

    if not profile:
        return {"questions": [], "error": "Perfil não encontrado."}

    structured_data = profile.get("structuredData", {})
    enriched_data = profile.get("enrichedProfile", {})

    try:
        questions = await generate_interview_questions(structured_data, enriched_data, locale=body.locale)
    except Exception as e:
        logger.warning("questions_ai_error", uid=user.uid, error_type=type(e).__name__, error=str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de IA temporariamente indisponível. Tente novamente.",
        )
    await fs.increment_global_generation("interview_questions")

    # Create voice session
    session_id = await fs.create_voice_session(
        uid=user.uid,
        profile_id=profile.get("id", ""),
        questions=questions,
    )

    await fs.log_activity(user.uid, user.email or "", "interview")
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

    # Validate session ownership
    if session_id:
        session = await fs.get_voice_session(session_id)
        if not session:
            await websocket.close(code=4003, reason="Sessão não encontrada.")
            return
        if session.get("userId") != user.uid:
            await websocket.close(code=4003, reason="Acesso negado.")
            return

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
                    await fs.increment_global_generation("voice_processing")

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


class TextAnswerRequest(BaseModel):
    sessionId: str
    questionIndex: int
    answer: str


@router.post("/text-answer")
async def submit_text_answer(
    body: TextAnswerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Submit a text answer to an interview question (fallback for voice)."""
    session_id = body.sessionId
    question_index = body.questionIndex
    answer_text = body.answer

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
    await fs.increment_global_generation("voice_processing")

    profile_id = session.get("profileId", "")
    if profile_id:
        await fs.update_enriched_profile(
            uid=user.uid,
            profile_id=profile_id,
            voice_data=profile_update,
        )

    await fs.update_voice_session_status(session_id, "completed")

    # Merge into knowledge file (fire-and-forget)
    try:
        from app.services.knowledge import merge_voice_into_knowledge
        import asyncio
        asyncio.create_task(merge_voice_into_knowledge(user.uid, profile_update))
    except Exception as e:
        logger.warning("knowledge_voice_merge_skipped", uid=user.uid, error=str(e))

    log_data_access(user.uid, "complete_interview", "voice_session", resource_id=session_id)
    return {"status": "completed", "profileUpdate": profile_update}
