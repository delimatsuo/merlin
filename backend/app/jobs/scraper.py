"""Job scraping pipeline — scrapes job boards, extracts structured data, stores in Firestore."""

import asyncio
import hashlib
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import structlog
from firebase_admin import firestore as fb_firestore

from app.config import get_settings
from app.jobs.apify_client import scrape_gupy, scrape_linkedin, scrape_vagas
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
# Top 100 Brazilian job categories — rotated in 3-day batches
# ---------------------------------------------------------------------------

BRAZILIAN_JOB_CATEGORIES = [
    # Tech (1-15)
    "desenvolvedor", "engenheiro de software", "analista de sistemas",
    "devops", "data engineer", "cientista de dados", "analista de dados",
    "product manager", "ux designer", "qa", "frontend", "backend",
    "full stack", "tech lead", "scrum master",
    # Admin/Operations (16-25)
    "assistente administrativo", "auxiliar administrativo", "recepcionista",
    "analista administrativo", "coordenador administrativo",
    "gerente administrativo", "secretária", "auxiliar de escritório",
    "analista de processos", "gerente de operações",
    # HR/People (26-35)
    "analista de rh", "gerente de rh", "recrutador", "business partner",
    "diretor de rh", "coordenador de rh", "analista de departamento pessoal",
    "gerente de people", "talent acquisition", "treinamento e desenvolvimento",
    # Finance/Accounting (36-47)
    "analista financeiro", "controller", "analista contábil", "tesoureiro",
    "gerente financeiro", "auditor", "analista fiscal", "contador",
    "coordenador financeiro", "diretor financeiro", "fp&a", "analista de custos",
    # Marketing/Communications (48-57)
    "analista de marketing", "gerente de marketing", "social media",
    "analista de comunicação", "designer gráfico", "copywriter",
    "marketing digital", "growth", "brand manager", "analista de conteúdo",
    # Sales/Commercial (58-67)
    "executivo de vendas", "sdr", "analista comercial", "gerente comercial",
    "representante comercial", "key account", "inside sales",
    "diretor comercial", "coordenador de vendas", "bdr",
    # Engineering (68-77)
    "engenheiro civil", "engenheiro mecânico", "engenheiro elétrico",
    "engenheiro de produção", "engenheiro químico", "engenheiro ambiental",
    "técnico de segurança", "técnico de manutenção", "projetista",
    "coordenador de obras",
    # Legal (78-82)
    "advogado", "analista jurídico", "paralegal", "compliance",
    "gerente jurídico",
    # Supply Chain/Logistics (83-88)
    "analista de logística", "coordenador de supply chain",
    "gerente de logística", "comprador", "analista de compras",
    "planejamento de demanda",
    # Healthcare (89-93)
    "enfermeiro", "farmacêutico", "nutricionista", "fisioterapeuta",
    "médico do trabalho",
    # Entry Level (94-97)
    "estagiário", "jovem aprendiz", "trainee", "aprendiz",
    # Management/Executive (98-102)
    "coordenador", "gerente", "diretor", "supervisor", "head",
]


def _get_daily_search_terms() -> list[str]:
    """Return ~33 search terms for today based on 3-day rotation."""
    from datetime import datetime
    day_of_year = datetime.now().timetuple().tm_yday
    batch_index = day_of_year % 3  # 0, 1, or 2

    total = len(BRAZILIAN_JOB_CATEGORIES)
    batch_size = (total + 2) // 3  # ceiling division
    start = batch_index * batch_size
    end = min(start + batch_size, total)

    terms = BRAZILIAN_JOB_CATEGORIES[start:end]
    logger.info("scrape_batch_selected", batch=batch_index, terms=len(terms), range=f"{start}-{end}")
    return terms


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

                title = extracted.get("title") or _sanitize_field(raw_job.get("title_hint", ""))
                company = extracted.get("company") or _sanitize_field(raw_job.get("company_hint", ""))
                posted_date = extracted.get("posted_date") or raw_job.get("posted_date_hint")

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
