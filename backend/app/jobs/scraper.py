"""Job scraping pipeline — scrapes job boards, extracts structured data, stores in Firestore."""

import asyncio
import hashlib
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import structlog
from firebase_admin import firestore as fb_firestore

from app.config import get_settings
from app.jobs.apify_client import scrape_gupy, scrape_brazil_jobs
from app.services.gemini_ai import extract_job_data_batch

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


# ---------------------------------------------------------------------------
# Broad search terms — each covers an entire department/area.
# The Brazil Jobs actor returns ~100 results per call across
# LinkedIn, InfoJobs, Vagas, Indeed. Each call costs $0.20.
# 15 terms × $0.20 = $3.00/day + Gupy ~$2 = ~$5/day total.
# ---------------------------------------------------------------------------

# Non-Brazilian location patterns — filter these out after scraping
_NON_BRAZIL_PATTERNS = {
    # US states/cities
    "ny", "nyc", "new york", "brooklyn", "manhattan", "midtown",
    "ca", "california", "san francisco", "los angeles", "silicon valley",
    "tx", "texas", "austin", "houston", "dallas",
    "il", "chicago", "wa", "seattle", "ma", "boston",
    "fl", "miami", "ga", "atlanta", "pa", "philadelphia",
    "co", "denver", "nc", "charlotte", "az", "phoenix",
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


BRAZILIAN_JOB_CATEGORIES = [
    "tecnologia",           # dev, devops, data, cloud, QA, etc.
    "recursos humanos",     # RH, recrutador, business partner, DP
    "financeiro",           # controller, fiscal, contábil, FP&A
    "marketing",            # digital, social media, conteúdo, growth
    "comercial",            # vendas, SDR, key account, inside sales
    "engenharia",           # civil, mecânico, elétrico, produção
    "administrativo",       # assistente, auxiliar, recepção
    "jurídico",             # advogado, compliance, paralegal
    "logística",            # supply chain, compras, planejamento
    "saúde",                # enfermeiro, farmacêutico, nutricionista
    "design",               # UX, UI, product designer, gráfico
    "dados",                # data engineer, cientista, analista de dados
    "produto",              # product manager, product owner, agile
    "estagiário",           # estágio, jovem aprendiz, trainee
    "diretor",              # executive/C-level across all areas
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

    for scraper_fn, source_name in [
        (scrape_gupy, "gupy"),
        (scrape_brazil_jobs, "brazil_jobs"),
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

    # Phase 1: Dedup — filter out jobs already in Firestore (cheap Firestore reads)
    new_raw_jobs = []
    jobs_duplicate = 0

    for raw_job in all_raw_jobs:
        source = raw_job.get("source", "unknown")
        source_id = raw_job.get("source_id", "")
        raw_text = raw_job.get("raw_text", "")

        if not raw_text or len(raw_text) < 50:
            continue

        job_id = _make_job_id(source, source_id)
        existing = await fs.get_job(job_id)
        if existing:
            jobs_duplicate += 1
            continue

        clean_text = _strip_html(raw_text)
        if not clean_text or len(clean_text) < 30:
            continue

        raw_job["_job_id"] = job_id
        raw_job["_clean_text"] = clean_text
        new_raw_jobs.append(raw_job)

    logger.info("scrape_dedup_done", new=len(new_raw_jobs), duplicates=jobs_duplicate)

    # Phase 2: Batch extract — 10 jobs per Flash-Lite call, 5 calls in parallel
    BATCH_SIZE = 10
    PARALLEL_BATCHES = 5
    jobs_new = 0
    now_iso = datetime.now(_BRT).isoformat()

    # Split into batches of 10
    batches = [new_raw_jobs[i:i + BATCH_SIZE] for i in range(0, len(new_raw_jobs), BATCH_SIZE)]
    logger.info("scrape_extraction_start", jobs=len(new_raw_jobs), batches=len(batches))

    # Process batches in parallel groups of 5
    for group_start in range(0, len(batches), PARALLEL_BATCHES):
        group = batches[group_start:group_start + PARALLEL_BATCHES]

        async def _extract_batch(batch: list[dict]) -> list[tuple[dict, dict]]:
            """Extract a batch and return (raw_job, extracted) pairs."""
            texts = [job["_clean_text"] for job in batch]
            try:
                results = await extract_job_data_batch(texts)
            except Exception as e:
                logger.warning("batch_extraction_failed", count=len(batch), error=str(e))
                return []
            return list(zip(batch, results))

        # Run up to 5 batches in parallel
        group_results = await asyncio.gather(*[_extract_batch(b) for b in group])

        # Store results
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
                    else:
                        posted_dt = datetime.now(timezone.utc)
                    expires_at = posted_dt + timedelta(days=14)
                except (ValueError, TypeError):
                    posted_dt = datetime.now(timezone.utc)
                    expires_at = posted_dt + timedelta(days=14)
                    posted_date = posted_dt.strftime("%Y-%m-%d")

                # Prefer scraper hints for location/work_mode (more reliable than AI)
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

                # Filter out non-Brazilian jobs
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
                    "source_url": raw_job.get("source_url", ""),
                    "raw_text": clean_text[:10000],
                    "extracted_at": now_iso,
                    "expires_at": expires_at,
                }

                try:
                    await fs.db.collection("jobs").document(job_id).set(job_doc)
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
