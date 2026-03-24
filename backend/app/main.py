"""FastAPI application entry point."""

import os
import uuid

import firebase_admin
import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings, load_secrets_from_gcp, validate_secrets
from app.services.gemini_ai import AIProviderOverloadedError

# Load secrets from GCP Secret Manager if in production
load_secrets_from_gcp()

settings = get_settings()

# Initialize Sentry for error tracking (before app creation)
if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment="production" if os.getenv("K_SERVICE") else "development",
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    firebase_admin.initialize_app(options={
        "storageBucket": settings.firebase_storage_bucket,
    })

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer() if os.getenv("K_SERVICE") else structlog.dev.ConsoleRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Rate limiter — keyed by IP, with per-user override via auth token
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    storage_uri="memory://",
)

app = FastAPI(
    title="Merlin API",
    description="API para personalização de currículos com IA",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(AIProviderOverloadedError)
async def ai_overloaded_handler(request: Request, exc: AIProviderOverloadedError):
    """Return 503 when the AI provider is temporarily overloaded."""
    logger.warning("ai_provider_overloaded", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=503,
        content={"detail": "O serviço de IA está temporariamente sobrecarregado. Tente novamente em alguns minutos."},
        headers={"Retry-After": "30"},
    )

# CORS — explicit methods and headers
origins = settings.allowed_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Correlation-ID"],
    expose_headers=["Content-Disposition", "X-Correlation-ID"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    return response


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Add correlation ID to all requests for tracing."""
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(correlation_id=correlation_id)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response


# Health check
@app.get("/health")
@limiter.limit("10/minute")
async def health_check(request: Request):
    """Health check endpoint for Cloud Run."""
    return {"status": "healthy"}


# Import and include routers
from app.api.resume import router as resume_router
from app.api.voice import router as voice_router
from app.api.job import router as job_router
from app.api.tailor import router as tailor_router
from app.api.export import router as export_router
from app.api.profile import router as profile_router
from app.api.research import router as research_router
from app.api.applications import router as applications_router
from app.api.admin import router as admin_router
from app.api.linkedin import router as linkedin_router
from app.api.feedback import router as feedback_router
from app.api.jobs import router as jobs_router

app.include_router(resume_router, prefix="/api/resume", tags=["resume"])
app.include_router(voice_router, prefix="/api/voice", tags=["voice"])
app.include_router(job_router, prefix="/api/job", tags=["job"])
app.include_router(tailor_router, prefix="/api/tailor", tags=["tailor"])
app.include_router(export_router, prefix="/api/export", tags=["export"])
app.include_router(profile_router, prefix="/api/profile", tags=["profile"])
app.include_router(research_router, prefix="/api/research", tags=["research"])
app.include_router(applications_router, prefix="/api/applications", tags=["applications"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(linkedin_router, prefix="/api/linkedin", tags=["linkedin"])
app.include_router(feedback_router, prefix="/api/feedback", tags=["feedback"])
app.include_router(jobs_router, prefix="/api/jobs", tags=["jobs"])


@app.on_event("startup")
async def startup_event():
    validate_secrets()
    logger.info("merlin_api_started", version="0.1.0")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("merlin_api_stopped")
