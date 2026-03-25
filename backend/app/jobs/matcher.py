"""Job matching pipeline — matches scraped jobs against user profiles."""

import asyncio
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import structlog

from app.config import get_settings
from app.services.firestore import FirestoreService
from app.services.gemini_ai import semantic_skill_match
from app.services.email import send_job_digest

logger = structlog.get_logger()

_BRT = ZoneInfo("America/Sao_Paulo")
_CHUNK_SIZE = 10
_AI_SEMAPHORE = asyncio.Semaphore(5)


# ---------------------------------------------------------------------------
# Text normalization for fuzzy title/location matching
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase, strip accents and extra whitespace for fuzzy matching."""
    text = text.lower().strip()
    # Remove accents
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    return text


# ---------------------------------------------------------------------------
# Title synonym groups — maps related job titles for broader matching
# ---------------------------------------------------------------------------

# Each group is a set of normalized terms that should match each other.
# If the user searches for any term in a group, jobs with any other term
# in that group should also match.
_SYNONYM_GROUPS: list[set[str]] = [
    {"software engineer", "engenheiro de software", "developer", "desenvolvedor", "dev", "programador", "software developer", "full stack", "fullstack", "backend developer", "frontend developer"},
    {"data engineer", "engenheiro de dados", "data developer"},
    {"data scientist", "cientista de dados", "data science"},
    {"data analyst", "analista de dados", "data analytics", "bi analyst", "analista de bi"},
    {"product manager", "gerente de produto", "product owner", "pm", "po"},
    {"project manager", "gerente de projetos", "gerente de projeto", "coordenador de projetos"},
    {"designer", "ux designer", "ui designer", "product designer", "ux/ui", "web designer"},
    {"devops", "sre", "site reliability", "platform engineer", "engenheiro de plataforma", "infrastructure engineer"},
    {"qa", "quality assurance", "test engineer", "analista de qualidade", "analista de testes", "qe"},
    {"scrum master", "agile coach", "agilista"},
    {"tech lead", "lider tecnico", "engineering manager", "gerente de engenharia"},
    {"marketing", "analista de marketing", "marketing analyst", "growth", "marketing digital"},
    {"hr", "rh", "recursos humanos", "human resources", "people", "analista de rh", "gerente de rh", "diretor de rh"},
    {"sales", "vendas", "executivo de vendas", "account executive", "sdr", "bdr"},
    {"finance", "financeiro", "analista financeiro", "gerente financeiro", "controller", "fp&a"},
    {"operations", "operacoes", "analista de operacoes", "gerente de operacoes"},
    {"cto", "vp engineering", "vp de engenharia", "diretor de tecnologia"},
    {"cfo", "diretor financeiro", "vp finance"},
    {"coo", "diretor de operacoes", "vp operations"},
]


def _expand_with_synonyms(titles: list[str]) -> set[str]:
    """Expand a list of normalized titles with synonyms from known groups."""
    expanded = set(titles)
    for title in titles:
        for group in _SYNONYM_GROUPS:
            # Check if any term in the group matches (substring in either direction)
            if any(title in term or term in title for term in group):
                expanded.update(group)
    return expanded


# ---------------------------------------------------------------------------
# Deterministic filter (Phase A — zero AI cost)
# ---------------------------------------------------------------------------

def filter_by_preferences(jobs: list[dict], preferences: dict) -> list[dict]:
    """Filter jobs by user preferences using deterministic matching.

    Uses synonym expansion so "software engineer" also matches "desenvolvedor",
    "developer", "dev full stack", etc.
    """
    raw_titles = [_normalize(t) for t in preferences.get("desired_titles", [])]
    pref_locations = [_normalize(loc) for loc in preferences.get("locations", [])]
    pref_work_modes = set(preferences.get("work_mode", []))

    if not raw_titles:
        return []

    # Expand titles with synonyms
    expanded_titles = _expand_with_synonyms(raw_titles)

    filtered = []
    for job in jobs:
        job_title = _normalize(job.get("title", ""))
        if not job_title:
            continue

        # Title match: any expanded title keyword appears as substring (either direction)
        title_match = any(
            dt in job_title or job_title in dt
            for dt in expanded_titles
        )
        if not title_match:
            # Also try word-level: check if significant words overlap
            job_words = set(job_title.split())
            title_words = set()
            for dt in expanded_titles:
                title_words.update(dt.split())
            # Remove common stop words
            stop = {"de", "da", "do", "e", "em", "para", "the", "and", "of", "in", "a", "o"}
            job_significant = job_words - stop
            title_significant = title_words - stop
            if not (job_significant & title_significant):
                continue

        # Work mode filter (if specified)
        if pref_work_modes:
            job_work_mode = job.get("work_mode", "onsite")
            has_remote_location = any("remoto" in loc for loc in pref_locations)
            if job_work_mode not in pref_work_modes and not (has_remote_location and job_work_mode == "remote"):
                continue

        # Location filter (if specified and not remote-only)
        if pref_locations:
            job_location = _normalize(job.get("location", ""))
            job_work_mode = job.get("work_mode", "onsite")
            if job_work_mode != "remote":
                location_match = any(loc in job_location or job_location in loc for loc in pref_locations)
                if not location_match:
                    continue

        filtered.append(job)

    return filtered


# ---------------------------------------------------------------------------
# AI skill match (Phase B — cheap Flash-Lite calls)
# ---------------------------------------------------------------------------

async def _match_single_job(
    job: dict,
    candidate_skills: list[str],
    candidate_experience: list[dict],
) -> dict | None:
    """Run semantic skill match for a single job. Returns match result or None."""
    required_skills = job.get("required_skills", [])
    if not required_skills:
        return None

    async with _AI_SEMAPHORE:
        try:
            result = await semantic_skill_match(
                candidate_skills=candidate_skills,
                required_skills=required_skills,
                candidate_experience=candidate_experience,
            )
        except Exception as e:
            logger.warning("match_ai_error", job_id=job.get("id", ""), error=str(e))
            return None

    score = result.get("score", 0)
    matched = [item.get("skill", "") for item in result.get("matched", [])]
    missing = result.get("missing", [])
    # Normalize missing — can be strings or dicts
    missing_skills = []
    for m in missing:
        if isinstance(m, str):
            missing_skills.append(m)
        elif isinstance(m, dict):
            missing_skills.append(m.get("skill", ""))

    return {
        "job_id": job.get("id", ""),
        "title": job.get("title", ""),
        "company": job.get("company", ""),
        "ats_score": score,
        "matched_skills": matched[:10],
        "missing_skills": missing_skills[:10],
        "source": job.get("source", ""),
        "source_url": job.get("source_url", ""),
        "posted_date": job.get("posted_date"),
        "work_mode": job.get("work_mode", "onsite"),
        "location": job.get("location", ""),
    }


# ---------------------------------------------------------------------------
# Per-user matching
# ---------------------------------------------------------------------------

async def match_user_jobs(
    uid: str,
    knowledge: dict,
    preferences: dict,
    all_jobs: list[dict],
    ai_call_counter: dict,
) -> list[dict]:
    """Match jobs for a single user. Returns sorted list of matched jobs."""
    settings = get_settings()

    # Extract candidate data from knowledge file
    candidate_skills = knowledge.get("skills", [])
    candidate_experience = knowledge.get("experience", [])

    if not candidate_skills:
        logger.info("match_skip_no_skills", uid_hash=uid[:8])
        return []

    # Phase A: Deterministic filter
    filtered = filter_by_preferences(all_jobs, preferences)

    # Fallback: if title filter is too strict and returns nothing,
    # send all jobs to AI matching (the skill match will filter by relevance)
    if not filtered and len(all_jobs) <= 200:
        logger.info("match_title_filter_fallback", uid_hash=uid[:8], all_jobs=len(all_jobs))
        filtered = all_jobs

    # Cap per-user to avoid excessive AI calls
    filtered = filtered[:settings.max_jobs_per_digest]

    if not filtered:
        return []

    # Phase B: AI skill match (with circuit breaker check)
    tasks = []
    for job in filtered:
        # Circuit breaker: check global AI call budget
        if ai_call_counter["count"] >= settings.job_match_max_ai_calls:
            logger.warning("match_circuit_breaker", uid_hash=uid[:8], calls=ai_call_counter["count"])
            break
        ai_call_counter["count"] += 1
        tasks.append(_match_single_job(job, candidate_skills, candidate_experience))

    results = await asyncio.gather(*tasks)

    # Filter out None results and low scores
    min_score = preferences.get("min_score", settings.job_match_min_score)
    matches = [r for r in results if r is not None and r["ats_score"] >= min_score]

    # Sort by ATS score descending
    matches.sort(key=lambda x: x["ats_score"], reverse=True)

    return matches[:settings.max_jobs_per_digest]


# ---------------------------------------------------------------------------
# Checkpoint management
# ---------------------------------------------------------------------------

async def _get_checkpoint(fs: FirestoreService, date: str) -> dict | None:
    """Get the batch run checkpoint for today."""
    doc = await fs.db.collection("batchRuns").document(date).get()
    if doc.exists:
        return doc.to_dict()
    return None


async def _save_checkpoint(fs: FirestoreService, date: str, data: dict) -> None:
    """Update the batch run checkpoint."""
    await fs.db.collection("batchRuns").document(date).set(data, merge=True)


# ---------------------------------------------------------------------------
# Main matching pipeline
# ---------------------------------------------------------------------------

async def run_matching_pipeline() -> dict:
    """Run the full matching pipeline for all users with preferences.

    Features:
    - Checkpoint/resume: tracks last_processed_uid, resumes on crash
    - Circuit breaker: halts if AI call budget exceeded
    - Chunked processing: processes users in groups of 10
    - Email idempotency: checks email_sent_at before sending
    """
    fs = FirestoreService()
    settings = get_settings()
    today = datetime.now(_BRT).strftime("%Y-%m-%d")

    # Check for existing checkpoint (resume support)
    checkpoint = await _get_checkpoint(fs, today)
    resume_from_uid = None

    if checkpoint and checkpoint.get("status") == "running":
        resume_from_uid = checkpoint.get("last_processed_uid")
        logger.info("match_resuming", from_uid=resume_from_uid[:8] if resume_from_uid else None)

    # Load all active jobs once (shared across all users)
    all_jobs = await fs.get_active_jobs(limit=1000)
    if not all_jobs:
        logger.warning("match_no_active_jobs")
        await _save_checkpoint(fs, today, {
            "status": "completed",
            "completed_at": datetime.now(_BRT).isoformat(),
            "users_processed": 0,
            "users_total": 0,
            "ai_calls_total": 0,
            "emails_sent": 0,
            "error": "no_active_jobs",
        })
        return {"users_processed": 0, "total_matches": 0, "ai_calls": 0, "emails_sent": 0}

    # Load all users with preferences
    users = await fs.get_all_users_with_preferences()
    if not users:
        logger.info("match_no_users")
        return {"users_processed": 0, "total_matches": 0, "ai_calls": 0, "emails_sent": 0}

    # If resuming, skip already-processed users
    if resume_from_uid:
        skip = True
        filtered_users = []
        for u in users:
            if skip and u["uid"] == resume_from_uid:
                skip = False
                continue  # Skip this one too — it was the last processed
            if not skip:
                filtered_users.append(u)
        users = filtered_users
        logger.info("match_resume_skipped", remaining=len(users))

    # Initialize checkpoint
    ai_call_counter = {"count": checkpoint.get("ai_calls_total", 0) if checkpoint else 0}
    total_users_processed = checkpoint.get("users_processed", 0) if checkpoint else 0
    total_matches = 0
    emails_sent = checkpoint.get("emails_sent", 0) if checkpoint else 0

    await _save_checkpoint(fs, today, {
        "status": "running",
        "started_at": checkpoint.get("started_at") or datetime.now(_BRT).isoformat(),
        "users_total": total_users_processed + len(users),
    })

    logger.info("match_start", users=len(users), jobs=len(all_jobs))

    # Process users in chunks
    for i in range(0, len(users), _CHUNK_SIZE):
        chunk = users[i : i + _CHUNK_SIZE]

        # Check circuit breaker before each chunk
        if ai_call_counter["count"] >= settings.job_match_max_ai_calls:
            logger.error("match_circuit_breaker_halt", calls=ai_call_counter["count"])
            break

        for user_data in chunk:
            uid = user_data["uid"]
            knowledge = user_data.get("knowledge") or {}
            preferences = user_data.get("preferences", {})

            try:
                matches = await match_user_jobs(
                    uid=uid,
                    knowledge=knowledge,
                    preferences=preferences,
                    all_jobs=all_jobs,
                    ai_call_counter=ai_call_counter,
                )

                # Save matched jobs
                if matches:
                    await fs.save_matched_jobs(uid, today, matches, len(matches))
                    total_matches += len(matches)

                    # Send email digest (idempotent — checks email_sent_at)
                    if preferences.get("email_digest", True):
                        existing = await fs.get_matched_jobs(uid, today)
                        if existing and not existing.get("email_sent_at"):
                            email = user_data.get("email", "")
                            name = user_data.get("name", "")
                            if email:
                                sent = await send_job_digest(
                                    email=email, name=name, uid=uid,
                                    matches=matches, date=today,
                                )
                                if sent:
                                    # Mark as sent (idempotency gate)
                                    doc_ref = (
                                        fs.db.collection("users").document(uid)
                                        .collection("matchedJobs").document(today)
                                    )
                                    await doc_ref.update({"email_sent_at": datetime.now(_BRT).isoformat()})
                                    emails_sent += 1

                total_users_processed += 1

                logger.info(
                    "match_user_done",
                    uid_hash=uid[:8],
                    matched=len(matches),
                    top_score=matches[0]["ats_score"] if matches else 0,
                )

            except Exception as e:
                logger.error("match_user_error", uid_hash=uid[:8], error=str(e))
                total_users_processed += 1

        # Update checkpoint after each chunk
        last_uid = chunk[-1]["uid"] if chunk else None
        await _save_checkpoint(fs, today, {
            "last_processed_uid": last_uid,
            "users_processed": total_users_processed,
            "ai_calls_total": ai_call_counter["count"],
            "emails_sent": emails_sent,
        })

    # Mark complete
    await _save_checkpoint(fs, today, {
        "status": "completed",
        "completed_at": datetime.now(_BRT).isoformat(),
        "users_processed": total_users_processed,
        "ai_calls_total": ai_call_counter["count"],
        "total_matches": total_matches,
        "emails_sent": emails_sent,
    })

    stats = {
        "users_processed": total_users_processed,
        "total_matches": total_matches,
        "ai_calls": ai_call_counter["count"],
        "emails_sent": emails_sent,
    }

    logger.info("match_complete", **stats)
    return stats
