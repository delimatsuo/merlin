"""Dynamic admin settings with Firestore-backed TTL cache."""

import time
from typing import Optional

import structlog
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.firestore import FirestoreService

logger = structlog.get_logger()

_cache: Optional[dict] = None
_cache_ts: float = 0
_CACHE_TTL = 60  # seconds


class AdminSettings(BaseModel):
    daily_limit: int = Field(default=5, ge=1, le=50)
    global_generation_limit: int = Field(default=10000, ge=1)
    tts_enabled: bool = True
    interview_enabled: bool = True
    cover_letter_enabled: bool = True


class AdminSettingsService:
    """Reads admin settings from Firestore with a 60-second TTL cache."""

    @staticmethod
    def _defaults() -> AdminSettings:
        settings = get_settings()
        return AdminSettings(daily_limit=settings.max_daily_tailor_count)

    @staticmethod
    async def get() -> AdminSettings:
        global _cache, _cache_ts

        now = time.monotonic()
        if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
            return AdminSettings(**_cache)

        try:
            fs = FirestoreService()
            doc_ref = fs.db.collection("admin").document("settings")
            doc = await doc_ref.get()
            if doc.exists:
                data = doc.to_dict()
                result = AdminSettings(**{k: v for k, v in data.items() if k in AdminSettings.model_fields})
                _cache = result.model_dump()
                _cache_ts = now
                return result
        except Exception as e:
            logger.warning("admin_settings_read_error", error=str(e))

        defaults = AdminSettingsService._defaults()
        _cache = defaults.model_dump()
        _cache_ts = now
        return defaults

    @staticmethod
    async def update(new_settings: AdminSettings) -> AdminSettings:
        global _cache, _cache_ts

        fs = FirestoreService()
        doc_ref = fs.db.collection("admin").document("settings")
        await doc_ref.set(new_settings.model_dump())

        _cache = new_settings.model_dump()
        _cache_ts = time.monotonic()
        return new_settings

    @staticmethod
    async def get_daily_limit() -> int:
        s = await AdminSettingsService.get()
        return s.daily_limit
