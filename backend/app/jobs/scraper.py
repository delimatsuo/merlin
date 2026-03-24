"""Job scraping pipeline — scrapes job boards, extracts structured data, stores in Firestore."""

import hashlib
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import structlog
from firebase_admin import firestore as fb_firestore

from app.config import get_settings
from app.jobs.apify_client import scrape_gupy, scrape_linkedin, scrape_vagas
from app.services.gemini_ai import extract_job_data

logger = structlog.get_logger()

_BRT = ZoneInfo("America/Sao_Paulo")


def _strip_html(text: str) -> str:
    """Remove all HTML tags from text. Lightweight alternative to bleach/nh3."""
    if not text:
        return ""
    # Remove HTML tags
    clean = re.sub(r"<[^>]+>", " ", text)
    # Collapse whitespace
    clean = re.sub(r"\s+", " ", clean)
    # Decode common HTML entities
    clean = clean.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    clean = clean.replace("&nbsp;", " ").replace("&quot;", '"').replace("&#39;", "'")
    return clean.strip()


def _sanitize_field(value: str, max_length: int = 200) -> str:
    """Sanitize a text field: strip HTML, limit length, remove control chars."""
    if not value:
        return ""
    value = _strip_html(value)
    # Remove control characters
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return value[:max_length].strip()


def _make_job_id(source: str, source_id: str) -> str:
    """Create a stable Firestore document ID from source + source_id."""
    if source_id:
        # Use source + native ID for stable dedup
        safe_id = re.sub(r"[/\.]", "_", str(source_id))
        return f"{source}_{safe_id}"
    # Fallback: random UUID if no source_id available (no dedup possible)
    import uuid
    return f"{source}_{uuid.uuid4().hex[:16]}"


async def run_scraping_pipeline() -> dict:
    """Main scraping pipeline. Returns stats dict."""
    settings = get_settings()

    # Check kill switch
    from app.services.firestore import FirestoreService
    fs = FirestoreService()

    # Get aggregated search terms from all users with preferences
    users_with_prefs = await fs.get_all_users_with_preferences()
    if not users_with_prefs:
        logger.warning("scrape_no_users_with_preferences")
        return {"jobs_new": 0, "jobs_total": 0, "sources_ok": 0, "sources_failed": 0}

    # Aggregate and deduplicate desired titles across all users
    all_titles: set[str] = set()
    for user_data in users_with_prefs:
        prefs = user_data.get("preferences", {})
        for title in prefs.get("desired_titles", []):
            all_titles.add(title.strip().lower())

    search_terms = list(all_titles)[:20]  # Cap total search terms
    logger.info("scrape_start", search_terms=len(search_terms), users=len(users_with_prefs))

    # Scrape all sources (failures are per-source, not fatal)
    all_raw_jobs: list[dict] = []
    sources_ok = 0
    sources_failed = 0

    for scraper_fn, source_name in [
        (scrape_gupy, "gupy"),
        (scrape_linkedin, "linkedin"),
        (scrape_vagas, "vagas"),
    ]:
        try:
            jobs = await scraper_fn(search_terms)
            if jobs:
                all_raw_jobs.extend(jobs)
                sources_ok += 1
                logger.info("scrape_source_ok", source=source_name, count=len(jobs))
            else:
                logger.warning("scrape_source_empty", source=source_name)
                sources_failed += 1
        except Exception as e:
            logger.error("scrape_source_failed", source=source_name, error=str(e))
            sources_failed += 1

    if not all_raw_jobs:
        logger.error("scrape_zero_jobs", sources_ok=sources_ok, sources_failed=sources_failed)
        # TODO: Fire Sentry alert
        return {"jobs_new": 0, "jobs_total": 0, "sources_ok": sources_ok, "sources_failed": sources_failed}

    # Process and store jobs
    jobs_new = 0
    jobs_duplicate = 0
    now_iso = datetime.now(_BRT).isoformat()

    for raw_job in all_raw_jobs:
        source = raw_job.get("source", "unknown")
        source_id = raw_job.get("source_id", "")
        raw_text = raw_job.get("raw_text", "")

        if not raw_text or len(raw_text) < 50:
            continue

        job_id = _make_job_id(source, source_id)

        # Check if already exists
        existing = await fs.get_job(job_id)
        if existing:
            jobs_duplicate += 1
            continue

        # Sanitize raw text (strip HTML)
        clean_text = _strip_html(raw_text)
        if not clean_text or len(clean_text) < 30:
            continue

        # Extract structured data via Flash-Lite
        try:
            extracted = await extract_job_data(clean_text)
        except Exception as e:
            logger.warning("job_extraction_failed", job_id=job_id, error=str(e))
            continue

        # Use hints from scraper if extraction missed fields
        title = extracted.get("title") or _sanitize_field(raw_job.get("title_hint", ""))
        company = extracted.get("company") or _sanitize_field(raw_job.get("company_hint", ""))
        posted_date = extracted.get("posted_date") or raw_job.get("posted_date_hint")

        if not title:
            continue  # Skip jobs we can't identify

        # Calculate expiry (14 days from posted date or now)
        # Store as native datetime for Firestore queries (not ISO string)
        try:
            if posted_date:
                posted_dt = datetime.fromisoformat(posted_date.replace("Z", "+00:00"))
            else:
                posted_dt = datetime.now(timezone.utc)
            expires_at = posted_dt + timedelta(days=14)
        except (ValueError, TypeError):
            posted_dt = datetime.now(timezone.utc)
            expires_at = posted_dt + timedelta(days=14)
            posted_date = posted_dt.strftime("%Y-%m-%d")

        # Store in Firestore
        job_doc = {
            "title": _sanitize_field(title),
            "company": _sanitize_field(company) if company else None,
            "required_skills": [_sanitize_field(s, 100) for s in extracted.get("required_skills", [])],
            "preferred_skills": [_sanitize_field(s, 100) for s in extracted.get("preferred_skills", [])],
            "location": _sanitize_field(extracted.get("location", "")),
            "seniority": extracted.get("seniority", "mid"),
            "salary_range": extracted.get("salary_range"),
            "work_mode": extracted.get("work_mode", "onsite"),
            "posted_date": posted_date,
            "source": source,
            "source_url": raw_job.get("source_url", ""),
            "raw_text": clean_text[:10000],  # Cap stored text
            "extracted_at": now_iso,
            "expires_at": expires_at,
        }

        try:
            db = fs.db
            await db.collection("jobs").document(job_id).set(job_doc)
            jobs_new += 1
        except Exception as e:
            logger.error("job_store_error", job_id=job_id, error=str(e))

    # Cleanup expired jobs
    expired_count = await fs.cleanup_expired_jobs()

    stats = {
        "jobs_new": jobs_new,
        "jobs_duplicate": jobs_duplicate,
        "jobs_total": len(all_raw_jobs),
        "jobs_expired_cleaned": expired_count,
        "sources_ok": sources_ok,
        "sources_failed": sources_failed,
    }

    logger.info("scrape_complete", **stats)
    return stats
