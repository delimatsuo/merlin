"""Cloud Run Job entrypoint for daily job scraping + matching pipeline."""

import asyncio
import sys

import structlog

from app.config import load_secrets_from_gcp, get_settings


def _setup():
    """Initialize Firebase, logging, and secrets."""
    import os
    import firebase_admin

    load_secrets_from_gcp()

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

    # Initialize Firebase Admin SDK
    if not firebase_admin._apps:
        settings = get_settings()
        firebase_admin.initialize_app(options={
            "storageBucket": settings.firebase_storage_bucket,
        })


async def main():
    """Run the full daily pipeline: scrape → match → email."""
    logger = structlog.get_logger()
    logger.info("job_pipeline_start")

    try:
        # Phase 1: Scrape job boards
        from app.jobs.scraper import run_scraping_pipeline
        scrape_stats = await run_scraping_pipeline()
        logger.info("job_pipeline_scrape_done", **scrape_stats)

        # Phase 2: Match against users
        from app.jobs.matcher import run_matching_pipeline
        match_stats = await run_matching_pipeline()
        logger.info("job_pipeline_match_done", **match_stats)

        logger.info("job_pipeline_complete")

    except Exception as e:
        logger.error("job_pipeline_fatal", error=str(e), error_type=type(e).__name__)
        # TODO: Fire Sentry alert
        sys.exit(1)


if __name__ == "__main__":
    _setup()
    asyncio.run(main())
