"""Google Gemini Live voice integration service (placeholder)."""

import structlog

logger = structlog.get_logger()


class GeminiLiveService:
    """Handles Gemini Live voice sessions.

    This is a placeholder for Phase 4 implementation.
    The actual integration requires:
    1. Google Gemini Live API WebSocket connection
    2. Audio streaming (browser -> Cloud Run -> Gemini)
    3. System instruction injection with interview questions
    4. Real-time transcription handling
    """

    def __init__(self):
        self.active_sessions: dict[str, dict] = {}

    async def create_session(
        self,
        user_id: str,
        questions: list[str],
        language: str = "pt-BR",
    ) -> str:
        """Create a new Gemini Live voice session."""
        logger.info("gemini_session_placeholder", uid=user_id)
        # Phase 4: Implement actual Gemini Live session creation
        raise NotImplementedError("Gemini Live integration pending Phase 4")

    async def close_session(self, session_id: str) -> None:
        """Close an active voice session."""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
