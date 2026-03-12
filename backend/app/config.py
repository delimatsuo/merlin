"""Application configuration with GCP Secret Manager support."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # GCP
    gcp_project_id: str = "merlin-489714"

    # CORS
    allowed_origins: str = "http://localhost:3000,https://merlincv.com,https://www.merlincv.com,https://staging.merlincv.com,https://merlin-489714.web.app,https://merlin-489714.firebaseapp.com,https://merlin-489714-staging.web.app"

    # API Keys (loaded from Secret Manager in production, env vars locally)
    anthropic_api_key: str = ""
    brave_search_api_key: str = ""
    gemini_api_key: str = ""

    # Firebase
    firebase_storage_bucket: str = "merlin-489714.firebasestorage.app"

    # Limits
    max_file_size_mb: int = 10
    max_resume_chars: int = 15000
    max_job_description_chars: int = 5000
    max_daily_tailor_count: int = int(os.environ.get("TAILOR_DAILY_LIMIT", "10"))

    # Timeouts (seconds)
    default_timeout: int = 30
    opus_timeout: int = 60
    generation_timeout: int = 60

    # AI backend switch: "gemini" or "claude"
    ai_backend: str = "gemini"

    # Model configuration — Claude (fallback)
    model_opus: str = "claude-opus-4-6"
    model_sonnet: str = "claude-sonnet-4-6"
    model_haiku: str = "claude-haiku-4-5-20251001"

    # Model configuration — Gemini
    model_gemini: str = "gemini-3.1-pro-preview"
    model_gemini_flash_lite: str = "gemini-3.1-flash-lite-preview"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def load_secrets_from_gcp() -> None:
    """Load secrets from GCP Secret Manager (production only)."""
    if os.getenv("K_SERVICE"):  # Running on Cloud Run
        try:
            from google.cloud import secretmanager

            client = secretmanager.SecretManagerServiceClient()
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "merlin-489714")

            secrets = {
                "ANTHROPIC_API_KEY": "anthropic_api_key",
                "BRAVE_SEARCH_API_KEY": "brave_search_api_key",
                "GEMINI_API_KEY": "gemini_api_key",
            }

            for secret_name, env_name in secrets.items():
                try:
                    name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
                    response = client.access_secret_version(request={"name": name})
                    os.environ[env_name.upper()] = response.payload.data.decode("UTF-8")
                except Exception as e:
                    print(f"WARNING: Failed to load secret {secret_name}: {e}")
        except ImportError:
            pass


def validate_secrets():
    """Call on startup to verify critical secrets are present."""
    settings = get_settings()
    missing = []
    if not settings.gemini_api_key:
        missing.append("GEMINI_API_KEY")
    if not settings.anthropic_api_key:
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        import structlog
        structlog.get_logger().error("missing_secrets", secrets=missing)
