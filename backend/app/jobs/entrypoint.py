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

    settings = get_settings()
    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment="production" if os.getenv("K_SERVICE") else "development",
            traces_sample_rate=0.0,
            send_default_pii=False,
        )


async def main():
    """Run the full daily pipeline: scrape → match → email."""
    logger = structlog.get_logger()
    logger.info("job_pipeline_start")

    try:
        # Kill switch check
        from app.services.admin_settings import AdminSettingsService
        admin_settings = await AdminSettingsService.get()
        if not admin_settings.job_matching_enabled:
            logger.info("job_pipeline_disabled_by_admin")
            return

        # Phase 1: Scrape job boards
        from app.jobs.scraper import run_scraping_pipeline
        scrape_stats = await run_scraping_pipeline()
        logger.info("job_pipeline_scrape_done", **scrape_stats)

        # Phase 2: Match against users
        from app.jobs.matcher import run_matching_pipeline
        match_stats = await run_matching_pipeline()
        logger.info("job_pipeline_match_done", **match_stats)

        # Phase 3: One-time digest for inferred-preference users
        from app.jobs.one_time_digest import send_one_time_digests
        one_time_stats = await send_one_time_digests()
        logger.info("job_pipeline_one_time_done", **one_time_stats)

        # Phase 4: Cleanup expired jobs (14-day TTL)
        from app.services.firestore import FirestoreService
        fs = FirestoreService()
        expired = await fs.cleanup_expired_jobs()
        logger.info("job_pipeline_cleanup_done", expired_jobs=expired)

        # Phase 5: Mark-and-sweep for jobs removed from Gupy.
        # Gate on a healthy scrape count — a partial Gupy outage would
        # otherwise delete live jobs because they weren't re-seen today.
        SCRAPE_MIN_FOR_SWEEP = 5000
        scraped_unique = scrape_stats.get("jobs_scraped_unique", 0)
        if scraped_unique >= SCRAPE_MIN_FOR_SWEEP:
            stale_stats = await fs.cleanup_stale_jobs(grace_days=3)
            logger.info("job_pipeline_stale_sweep_done", **stale_stats)
        else:
            logger.warning("job_pipeline_stale_sweep_skipped",
                          reason="scrape_too_small",
                          scraped_unique=scraped_unique,
                          threshold=SCRAPE_MIN_FOR_SWEEP)

        logger.info("job_pipeline_complete")

    except Exception as e:
        logger.error("job_pipeline_fatal", error=str(e), error_type=type(e).__name__)
        try:
            import sentry_sdk
            sentry_sdk.capture_exception(e)
            sentry_sdk.flush(timeout=5)
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    _setup()
    if "--backfill" in sys.argv:
        async def run_backfill():
            logger = structlog.get_logger()
            logger.info("backfill_start")
            from app.jobs.backfill_tags import backfill_job_tags
            stats = await backfill_job_tags()
            logger.info("backfill_done", **stats)
        asyncio.run(run_backfill())
    elif "--backfill-active-days" in sys.argv:
        async def run_backfill_active_days():
            logger = structlog.get_logger()
            logger.info("backfill_active_days_start")
            from app.jobs.backfill_active_days import backfill_active_days
            stats = await backfill_active_days()
            logger.info("backfill_active_days_done", **stats)
        asyncio.run(run_backfill_active_days())
    elif "--infer-preferences" in sys.argv:
        dry_run = "--apply" not in sys.argv
        async def run_infer():
            logger = structlog.get_logger()
            logger.info("infer_preferences_start", dry_run=dry_run)
            from app.jobs.infer_preferences import infer_and_create_preferences
            stats = await infer_and_create_preferences(dry_run=dry_run)
            logger.info("infer_preferences_done", **stats)
        asyncio.run(run_infer())
    else:
        asyncio.run(main())
