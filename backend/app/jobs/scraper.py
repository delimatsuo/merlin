"""Job scraping pipeline — scrapes job boards, extracts structured data, stores in Firestore."""

import asyncio
import hashlib
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import structlog
from firebase_admin import firestore as fb_firestore

from app.config import get_settings
from app.jobs.capping import cap_new_jobs_by_source, count_jobs_by_source
from app.services.gemini_ai import extract_job_data_batch
from scrapers import scrape_gupy, scrape_catho, scrape_vagas, scrape_programathor

logger = structlog.get_logger()

_BRT = ZoneInfo("America/Sao_Paulo")


def _validate_url(url: str) -> str:
    """Strip non-http/https URLs to prevent stored XSS via javascript: URIs."""
    if not url:
        return ""
    return url if urlparse(url.strip()).scheme in ("http", "https") else ""


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


# ---------------------------------------------------------------------------
# Broad search terms — each covers an entire department/area.
# The Brazil Jobs actor returns ~100 results per call across
# LinkedIn, InfoJobs, Vagas, Indeed. Each call costs $0.20.
# 15 terms × $0.20 = $3.00/day + Gupy ~$2 = ~$5/day total.
# ---------------------------------------------------------------------------

# Non-Brazilian location patterns — filter these out after scraping.
# Keep these as country/city/region names, not bare two-letter state codes:
# substring checks for codes such as "ca", "pa", and "ma" incorrectly drop
# Brazilian locations and Catho badges that merely contain those letters.
_NON_BRAZIL_PATTERNS = {
    # US states/cities
    "nyc", "new york", "brooklyn", "manhattan", "midtown",
    "california", "san francisco", "los angeles", "silicon valley",
    "texas", "austin", "houston", "dallas",
    "chicago", "seattle", "boston",
    "miami", "atlanta", "philadelphia",
    "denver", "charlotte", "phoenix",
    "united states", "usa", "u.s.",
    # Other countries
    "united kingdom", "uk", "london", "england",
    "canada", "toronto", "vancouver",
    "germany", "berlin", "munich",
    "france", "paris",
    "india", "bangalore", "mumbai",
    "australia", "sydney", "melbourne",
    "singapore", "japan", "tokyo",
}


def _is_brazilian_job(location: str) -> bool:
    """Check if a job location is likely in Brazil."""
    if not location:
        return True  # No location info → keep (defensive)
    loc = location.lower().strip()
    # Check for explicit Brazil signals (use word boundary for short terms)
    _brazil_signals = (
        "brasil", "brazil", "são paulo", "sao paulo", "rio de janeiro",
        "belo horizonte", "curitiba", "porto alegre", "brasilia", "brasília",
        "recife", "salvador", "fortaleza", "campinas", "remoto", "goiânia",
        "goiania", "florianópolis", "florianopolis", "manaus", "belém", "belem",
    )
    if any(br in loc for br in _brazil_signals):
        return True
    # Check for ", br" or "- br" suffix (country code)
    if loc.endswith(", br") or loc.endswith("- br") or loc.endswith(" br"):
        return True
    # Check for non-Brazil patterns
    if any(pattern in loc for pattern in _NON_BRAZIL_PATTERNS):
        return False
    # Unknown location → keep (could be a smaller Brazilian city)
    return True


# Search terms for Gupy's free candidate-portal API. Because Gupy is now
# our only source and we want a broad inventory, we cast a wide net here —
# each term costs nothing (free API, just HTTP) so there's no reason to
# stay narrow. Dedup is by Gupy's native job ID so overlapping terms don't
# inflate the final count.
BRAZILIAN_JOB_CATEGORIES = [
    # Cross-functional "headword" roles — broadest coverage
    "analista",
    "assistente",
    "auxiliar",
    "especialista",
    "coordenador",
    "supervisor",
    "gerente",
    "diretor",
    "consultor",
    "administrador",
    # Tech
    "desenvolvedor",
    "programador",
    "engenheiro",
    "arquiteto",
    "tecnico",
    # Commercial / ops
    "vendedor",
    "representante",
    "operador",
    # Creative / product
    "designer",
    "produto",
    # Data / AI (growing categories in BR)
    "dados",
]


def _get_daily_search_terms() -> list[str]:
    """Return broad category terms for daily scraping."""
    logger.info("scrape_terms_selected", terms=len(BRAZILIAN_JOB_CATEGORIES))
    return list(BRAZILIAN_JOB_CATEGORIES)


async def run_scraping_pipeline() -> dict:
    """Main scraping pipeline. Returns stats dict."""
    settings = get_settings()

    # Check kill switch
    from app.services.firestore import FirestoreService
    fs = FirestoreService()

    # Use static job categories with daily rotation (not user preferences)
    search_terms = _get_daily_search_terms()
    logger.info("scrape_start", search_terms=len(search_terms))

    # Scrape all sources (failures are per-source, not fatal)
    all_raw_jobs: list[dict] = []
    sources_ok = 0
    sources_failed = 0

    # Run all sources concurrently. Catho requires a Scrapfly key and is
    # skipped silently when not configured. Gupy/Vagas/ProgramaThor are free.
    catho_key = settings.scrapfly_api_key
    if not catho_key:
        logger.warning("catho_skipped_no_scrapfly_key")

    source_coros = {
        "gupy": scrape_gupy(search_terms),
        "vagas": scrape_vagas(search_terms, max_pages=2),
        "programathor": scrape_programathor(search_terms, max_pages=3),
    }
    if catho_key:
        source_coros["catho"] = scrape_catho(search_terms, scrapfly_api_key=catho_key)

    source_names = list(source_coros.keys())
    source_results = await asyncio.gather(*source_coros.values(), return_exceptions=True)

    for source_name, result in zip(source_names, source_results):
        if isinstance(result, BaseException):
            logger.error("scrape_source_failed", source=source_name, error=str(result))
            sources_failed += 1
        elif result:
            all_raw_jobs.extend(result)
            sources_ok += 1
            logger.info("scrape_source_ok", source=source_name, count=len(result))
        else:
            logger.warning("scrape_source_empty", source=source_name)
            sources_failed += 1

    if not all_raw_jobs:
        logger.error("scrape_zero_jobs", sources_ok=sources_ok, sources_failed=sources_failed)
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                "scrape_zero_jobs: all sources returned no jobs",
                level="error",
            )
        except Exception:
            pass
        return {"jobs_new": 0, "jobs_total": 0, "sources_ok": sources_ok, "sources_failed": sources_failed}

    # Phase 1: Dedup — batch-read existing jobs from Firestore.
    # Serial per-job reads were hitting the 30-min task timeout at ~20k scraped
    # jobs. Chunked get_all() cuts dedup from ~30min to a few seconds.
    candidates: list[dict] = []
    seen_ids: set[str] = set()

    for raw_job in all_raw_jobs:
        source = raw_job.get("source", "unknown")
        source_id = raw_job.get("source_id", "")
        raw_text = raw_job.get("raw_text", "")

        if not raw_text or len(raw_text) < 50:
            continue

        job_id = _make_job_id(source, source_id)
        if job_id in seen_ids:
            continue
        seen_ids.add(job_id)

        clean_text = _strip_html(raw_text)
        if not clean_text or len(clean_text) < 30:
            continue

        raw_job["_job_id"] = job_id
        raw_job["_clean_text"] = clean_text
        candidates.append(raw_job)

    DEDUP_BATCH_SIZE = 500
    existing_ids: set[str] = set()
    jobs_col = fs.db.collection("jobs")
    for i in range(0, len(candidates), DEDUP_BATCH_SIZE):
        chunk = candidates[i:i + DEDUP_BATCH_SIZE]
        refs = [jobs_col.document(j["_job_id"]) for j in chunk]
        async for snap in fs.db.get_all(refs):
            if snap.exists:
                existing_ids.add(snap.id)

    new_raw_jobs = [j for j in candidates if j["_job_id"] not in existing_ids]
    jobs_duplicate = len(candidates) - len(new_raw_jobs)

    logger.info("scrape_dedup_done", new=len(new_raw_jobs), duplicates=jobs_duplicate)

    # Mark-and-sweep: stamp last_seen_at on every existing job we re-scraped
    # today. Cleanup later deletes jobs not seen in N days (i.e., removed
    # from Gupy). Batched to avoid the serial-write hotspot we already fixed
    # for the write path.
    now_utc_iso = datetime.now(timezone.utc).isoformat()
    if existing_ids:
        TOUCH_BATCH_SIZE = 500
        existing_list = list(existing_ids)
        jobs_touched = 0
        for i in range(0, len(existing_list), TOUCH_BATCH_SIZE):
            chunk = existing_list[i:i + TOUCH_BATCH_SIZE]
            wb = fs.db.batch()
            for job_id in chunk:
                wb.update(jobs_col.document(job_id), {"last_seen_at": now_utc_iso})
            try:
                await wb.commit()
                jobs_touched += len(chunk)
            except Exception as e:
                logger.error("jobs_touch_error", count=len(chunk), error=str(e))
        logger.info("scrape_touched_existing", count=jobs_touched)

    # Cap new jobs per run so extraction + writes fit inside the task-timeout
    # budget. Leftover jobs dedupe naturally on the next run — they'll appear
    # as existing on subsequent scrapes and be skipped until they expire.
    MAX_NEW_JOBS_PER_RUN = 2500
    if len(new_raw_jobs) > MAX_NEW_JOBS_PER_RUN:
        source_counts_before = count_jobs_by_source(new_raw_jobs)
        logger.info("scrape_cap_applied",
                    cap=MAX_NEW_JOBS_PER_RUN,
                    available=len(new_raw_jobs),
                    source_counts_before=source_counts_before)
        new_raw_jobs = cap_new_jobs_by_source(new_raw_jobs, MAX_NEW_JOBS_PER_RUN)
        logger.info("scrape_cap_allocated",
                    cap=MAX_NEW_JOBS_PER_RUN,
                    source_counts_after=count_jobs_by_source(new_raw_jobs))

    # Phase 2: Batch extract — 10 jobs per Flash-Lite call, 5 calls in parallel
    BATCH_SIZE = 10
    PARALLEL_BATCHES = 5
    jobs_new = 0
    jobs_new_by_source: Counter[str] = Counter()
    now_iso = datetime.now(_BRT).isoformat()

    batches = [new_raw_jobs[i:i + BATCH_SIZE] for i in range(0, len(new_raw_jobs), BATCH_SIZE)]
    logger.info("scrape_extraction_start", jobs=len(new_raw_jobs), batches=len(batches))

    FIRESTORE_BATCH_SIZE = 500  # Firestore commit limit per write batch

    # Process batches in parallel groups of 5, then commit each group's writes
    # in a single Firestore WriteBatch (vs ~50 serial awaits previously).
    for group_start in range(0, len(batches), PARALLEL_BATCHES):
        group = batches[group_start:group_start + PARALLEL_BATCHES]

        async def _extract_batch(batch: list[dict]) -> list[tuple[dict, dict]]:
            texts = [job["_clean_text"] for job in batch]
            try:
                results = await extract_job_data_batch(texts)
            except Exception as e:
                logger.warning("batch_extraction_failed", count=len(batch), error=str(e))
                return []
            return list(zip(batch, results))

        group_results = await asyncio.gather(*[_extract_batch(b) for b in group])

        # Materialize job docs for this group
        group_writes: list[tuple[str, dict]] = []
        for pairs in group_results:
            for raw_job, extracted in pairs:
                job_id = raw_job["_job_id"]
                clean_text = raw_job["_clean_text"]

                # Always prefer scraper metadata (title, company, date) over AI extraction.
                # AI batch extraction can return results in wrong order, causing
                # title/URL mismatches. Scraper data is always correctly paired.
                title = _sanitize_field(raw_job.get("title_hint", "")) or extracted.get("title", "")
                company = _sanitize_field(raw_job.get("company_hint", "")) or extracted.get("company")
                posted_date = raw_job.get("posted_date_hint") or extracted.get("posted_date")

                if not title:
                    continue

                try:
                    if posted_date:
                        posted_dt = datetime.fromisoformat(posted_date.replace("Z", "+00:00"))
                        if posted_dt.tzinfo is None:
                            posted_dt = posted_dt.replace(tzinfo=timezone.utc)
                    else:
                        posted_dt = datetime.now(timezone.utc)
                    expires_at = posted_dt + timedelta(days=14)
                except (ValueError, TypeError, AttributeError):
                    posted_dt = datetime.now(timezone.utc)
                    expires_at = posted_dt + timedelta(days=14)
                    posted_date = posted_dt.strftime("%Y-%m-%d")

                if (datetime.now(timezone.utc) - posted_dt).days > 30:
                    continue

                job_location = (
                    _sanitize_field(raw_job.get("location_hint", ""))
                    or _sanitize_field(extracted.get("location", ""))
                )
                job_work_mode = (
                    raw_job.get("work_mode_hint", "")
                    or extracted.get("work_mode", "onsite")
                )
                job_salary = (
                    raw_job.get("salary_hint", "")
                    or extracted.get("salary_range")
                )

                if not _is_brazilian_job(job_location):
                    continue

                job_doc = {
                    "title": _sanitize_field(title),
                    "company": _sanitize_field(company) if company else None,
                    "required_skills": [_sanitize_field(s, 100) for s in extracted.get("required_skills", [])],
                    "preferred_skills": [_sanitize_field(s, 100) for s in extracted.get("preferred_skills", [])],
                    "location": job_location,
                    "seniority": extracted.get("seniority", "mid"),
                    "salary_range": job_salary,
                    "work_mode": job_work_mode,
                    "posted_date": posted_date,
                    "categories": extracted.get("categories", []),
                    "source": raw_job.get("source", "unknown"),
                    "source_url": _validate_url(raw_job.get("source_url", "")),
                    "raw_text": clean_text[:10000],
                    "extracted_at": now_iso,
                    "expires_at": expires_at,
                    "last_seen_at": now_utc_iso,
                }
                group_writes.append((job_id, job_doc))

        # Commit this group in a single WriteBatch (or chunks of 500 if ever larger).
        # Committing per group means a timeout mid-way preserves prior groups' work.
        for i in range(0, len(group_writes), FIRESTORE_BATCH_SIZE):
            chunk = group_writes[i:i + FIRESTORE_BATCH_SIZE]
            wb = fs.db.batch()
            for job_id, job_doc in chunk:
                wb.set(jobs_col.document(job_id), job_doc)
            try:
                await wb.commit()
                jobs_new += len(chunk)
                jobs_new_by_source.update(job_doc.get("source", "unknown") for _, job_doc in chunk)
            except Exception as e:
                logger.error("jobs_batch_write_error", count=len(chunk), error=str(e))

        group_idx = group_start // PARALLEL_BATCHES
        groups_total = (len(batches) + PARALLEL_BATCHES - 1) // PARALLEL_BATCHES
        # Log every 5 groups and always on the final group
        if group_idx % 5 == 0 or group_idx == groups_total - 1:
            logger.info("scrape_progress", groups_done=group_idx + 1,
                        groups_total=groups_total, jobs_written=jobs_new,
                        jobs_written_by_source=dict(jobs_new_by_source))

    # cleanup_expired_jobs is owned by entrypoint.py phase 4; don't run it
    # here. It previously ran twice per pipeline and its serial per-doc
    # delete loop hung long enough to trigger a 504 Deadline Exceeded.

    stats = {
        "jobs_new": jobs_new,
        "jobs_duplicate": jobs_duplicate,
        "jobs_total": len(all_raw_jobs),
        "jobs_scraped_unique": len(candidates),
        "jobs_new_by_source": dict(jobs_new_by_source),
        "sources_ok": sources_ok,
        "sources_failed": sources_failed,
    }

    logger.info("scrape_complete", **stats)
    return stats
