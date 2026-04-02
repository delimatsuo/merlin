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


# ---------------------------------------------------------------------------
# Title → Category tag mapping (zero AI cost)
# ---------------------------------------------------------------------------

# Maps common search terms to category tags assigned during extraction.
# User types "Diretor de RH" → maps to tags ["hr", "director"]
# Firestore query: categories array-contains any of those tags → instant match

# Department tags — what area the job belongs to
_TITLE_TO_DEPT: dict[str, list[str]] = {
    # Tech
    "software": ["tech"], "developer": ["tech"], "desenvolvedor": ["tech"],
    "engenheiro de software": ["tech"], "engineer": ["tech"],
    "frontend": ["tech"], "backend": ["tech"], "full stack": ["tech"],
    "fullstack": ["tech"], "devops": ["tech"], "sre": ["tech"],
    "data engineer": ["tech"], "data scientist": ["tech"],
    "programador": ["tech"], "arquiteto de software": ["tech"],
    "tech lead": ["tech"], "mobile": ["tech"],
    "python": ["tech"], "java": ["tech"], "react": ["tech"],
    "node": ["tech"], "cloud": ["tech"], "ios": ["tech"], "android": ["tech"],
    "tecnologia": ["tech"], "informatica": ["tech"],
    "tecnologia da informacao": ["tech"], "de ti": ["tech"],
    "cto": ["tech"], "cio": ["tech"],
    # HR
    "rh": ["hr"], "recursos humanos": ["hr"], "human resources": ["hr"],
    "hr": ["hr"], "people": ["hr"], "recrutador": ["hr"],
    "talent": ["hr"], "departamento pessoal": ["hr"],
    "business partner": ["hr"],
    # Finance
    "financeiro": ["finance"], "finance": ["finance"], "contabil": ["finance"],
    "contador": ["finance"], "controller": ["finance"], "fiscal": ["finance"],
    "tesoureiro": ["finance"], "fp&a": ["finance"], "custos": ["finance"],
    "cfo": ["finance"],
    # Marketing
    "marketing": ["marketing"], "social media": ["marketing"],
    "comunicacao": ["marketing"], "copywriter": ["marketing"],
    "conteudo": ["marketing"], "brand": ["marketing"], "growth": ["marketing"],
    # Sales
    "vendas": ["sales"], "comercial": ["sales"], "sales": ["sales"],
    "sdr": ["sales"], "bdr": ["sales"], "account": ["sales"],
    # Product
    "product manager": ["tech"], "product owner": ["tech"],
    "pm": ["tech"], "produto": ["tech"],
    # Design
    "designer": ["design"], "ux": ["design"], "ui": ["design"],
    # Operations
    "operacoes": ["operations"], "operations": ["operations"],
    "processos": ["operations"], "coo": ["operations"],
    # Admin
    "administrativo": ["admin"], "secretaria": ["admin"],
    "recepcao": ["admin"], "escritorio": ["admin"],
    # Legal
    "juridico": ["legal"], "advogado": ["legal"], "compliance": ["legal"],
    # Engineering
    "engenheiro civil": ["engineering"], "engenheiro mecanico": ["engineering"],
    "engenheiro eletrico": ["engineering"], "engenheiro producao": ["engineering"],
    # Supply chain
    "logistica": ["supply_chain"], "compras": ["supply_chain"],
    "supply chain": ["supply_chain"],
    # Healthcare
    "enfermeiro": ["healthcare"], "farmaceutico": ["healthcare"],
    "nutricionista": ["healthcare"],
}

# Level tags — seniority/level of the role
_TITLE_TO_LEVEL: dict[str, str] = {
    "estagiario": "intern", "jovem aprendiz": "intern", "aprendiz": "intern",
    "trainee": "entry", "junior": "entry",
    "pleno": "mid",
    "senior": "senior", "especialista": "senior",
    "supervisor": "manager", "coordenador": "manager", "gerente": "manager",
    "lider": "lead", "tech lead": "lead",
    "diretor": "director", "head": "director",
    "vp": "executive", "vice presidente": "executive",
    "c-level": "executive", "cto": "executive", "cfo": "executive", "coo": "executive",
    "product manager": "manager",
}

# Which levels are compatible with a given search level.
# Director should see director/executive, not intern.
# No level detected → accept all (no filtering).
_LEVEL_COMPAT: dict[str, set[str]] = {
    "intern":    {"intern"},
    "entry":     {"intern", "entry"},
    "mid":       {"entry", "mid", "senior"},
    "senior":    {"mid", "senior", "lead"},
    "lead":      {"senior", "lead", "manager"},
    "manager":   {"mid", "senior", "lead", "manager"},
    "director":  {"manager", "director", "executive"},
    "executive": {"director", "executive"},
}

# Combined mapping for backward compatibility (batch tag filter uses flat tags)
_TITLE_TO_TAGS: dict[str, list[str]] = {
    **{k: v for k, v in _TITLE_TO_DEPT.items()},
    # Level keywords as tags too (for Firestore category field)
    "estagiario": ["intern"], "jovem aprendiz": ["intern"],
    "trainee": ["entry"], "aprendiz": ["intern"],
    "junior": ["entry"], "pleno": ["mid"], "senior": ["senior"],
    "gerente": ["manager"], "coordenador": ["manager"],
    "diretor": ["director"], "head": ["director"],
    "supervisor": ["manager"], "lider": ["lead"],
    "vp": ["executive"], "vice presidente": ["executive"],
    "c-level": ["executive"], "cto": ["executive", "tech"],
    "cfo": ["executive", "finance"], "coo": ["executive", "operations"],
}


def _keyword_in(keyword: str, text: str) -> bool:
    """Check if keyword appears in text. Uses word boundaries for short keywords
    (<=4 chars) to avoid false positives like 'coo' matching 'coordenador'."""
    if len(keyword) <= 4:
        return bool(re.search(rf"\b{re.escape(keyword)}\b", text))
    return keyword in text


def _titles_to_tags(desired_titles: list[str]) -> set[str]:
    """Convert user's desired titles to category tags. Zero AI cost."""
    tags = set()
    for title in desired_titles:
        normalized = _normalize(title)
        # Check each keyword mapping
        for keyword, keyword_tags in _TITLE_TO_TAGS.items():
            if _keyword_in(keyword, normalized):
                tags.update(keyword_tags)
    return tags


def _titles_to_dept_and_level(desired_titles: list[str]) -> tuple[set[str], set[str]]:
    """Extract department tags and level tags separately from desired titles.

    Returns (dept_tags, level_tags). Level tags are used for seniority filtering.
    """
    dept_tags = set()
    level_tags = set()
    for title in desired_titles:
        normalized = _normalize(title)
        for keyword, tags in _TITLE_TO_DEPT.items():
            if _keyword_in(keyword, normalized):
                dept_tags.update(tags)
        for keyword, level in _TITLE_TO_LEVEL.items():
            if _keyword_in(keyword, normalized):
                level_tags.add(level)
    return dept_tags, level_tags


def _is_level_compatible(job_categories: set[str], desired_levels: set[str]) -> bool:
    """Check if a job's level is compatible with the desired search level.

    If no desired level is detected (user just typed 'rh'), accept all.
    If the job has no level tag, accept it (benefit of the doubt).
    """
    if not desired_levels:
        return True  # No level preference → accept all

    # Build the set of acceptable levels from all desired levels
    acceptable = set()
    for level in desired_levels:
        acceptable.update(_LEVEL_COMPAT.get(level, {level}))

    # All known level tag values
    all_levels = {"intern", "entry", "mid", "senior", "lead", "manager", "director", "executive"}
    job_levels = job_categories & all_levels

    if not job_levels:
        return True  # Job has no level tag → accept (benefit of the doubt)

    # At least one job level must be in the acceptable set
    return bool(job_levels & acceptable)

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
            # Word-level fallback: require at least 2 significant words overlap,
            # or 1 word that is specific to a department (not a generic level word).
            job_words = set(job_title.split())
            title_words = set()
            for dt in expanded_titles:
                title_words.update(dt.split())
            stop = {"de", "da", "do", "e", "em", "para", "the", "and", "of", "in", "a", "o"}
            # Level words are too generic to match alone (e.g., "diretor" appears in many titles)
            level_words = {"diretor", "gerente", "coordenador", "supervisor", "analista",
                           "estagiario", "senior", "junior", "pleno", "lider", "head",
                           "auxiliar", "assistente", "trainee", "especialista", "vp"}
            job_significant = job_words - stop
            title_significant = title_words - stop
            overlap = job_significant & title_significant
            # Require either 2+ words overlap, or 1 department-specific word
            dept_overlap = overlap - level_words
            if len(overlap) < 2 and not dept_overlap:
                continue

        # Work mode filter (if specified)
        if pref_work_modes:
            job_work_mode = job.get("work_mode", "onsite")
            has_remote_location = any("remoto" in loc for loc in pref_locations)
            if job_work_mode not in pref_work_modes and not (has_remote_location and job_work_mode == "remote"):
                continue

        # Location filter (if specified and not remote-only)
        # Jobs with empty/unknown location are NOT filtered out
        if pref_locations:
            job_location = _normalize(job.get("location", ""))
            job_work_mode = job.get("work_mode", "onsite")
            if job_location and job_work_mode != "remote":
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
    desired_titles: list[str] | None = None,
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
                desired_titles=desired_titles,
                job_title=job.get("title", ""),
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
    ai_call_counter: dict,
    all_jobs: list[dict] | None = None,
) -> list[dict]:
    """Match jobs for a single user. Returns sorted list of matched jobs.

    If all_jobs is provided (batch pipeline), filters from that list.
    If all_jobs is None (on-demand), queries Firestore directly by tags.
    """
    settings = get_settings()

    # Extract candidate data from knowledge file
    candidate_skills = knowledge.get("skills", [])
    candidate_experience = knowledge.get("experience", [])

    if not candidate_skills:
        logger.info("match_skip_no_skills", uid_hash=uid[:8])
        return []

    desired_titles = preferences.get("desired_titles", [])
    user_tags = _titles_to_tags(desired_titles)
    pref_work_modes = list(preferences.get("work_mode", []))
    # Seniority filter: use user's explicit selection (empty = show all levels)
    pref_seniority = set(preferences.get("seniority", []))

    if all_jobs is None:
        # On-demand: query Firestore with all tags (broad pool), filter post-query
        fs = FirestoreService()
        raw_jobs = await fs.query_jobs_by_tags(
            tags=list(user_tags),
            work_modes=pref_work_modes if pref_work_modes else None,
            limit=settings.max_jobs_per_digest * 3,
        )
        logger.info(
            "match_query_firestore",
            uid_hash=uid[:8],
            user_tags=list(user_tags),
            raw_results=len(raw_jobs),
        )

        # Apply deterministic title/synonym filter first (most selective)
        title_filtered = filter_by_preferences(raw_jobs, preferences)
        logger.info(
            "match_title_filter",
            uid_hash=uid[:8],
            before=len(raw_jobs),
            after=len(title_filtered),
        )

        # Apply seniority filter (only if user explicitly selected levels)
        if pref_seniority:
            relevant_jobs = [
                job for job in title_filtered
                if _is_level_compatible(set(job.get("categories", [])), pref_seniority)
            ]
            logger.info(
                "match_level_filter",
                uid_hash=uid[:8],
                before=len(title_filtered),
                after=len(relevant_jobs),
                seniority=list(pref_seniority),
            )
        else:
            # No seniority preference → show all levels
            relevant_jobs = title_filtered
    else:
        # Batch pipeline: filter from pre-loaded job list
        pref_locations = [_normalize(loc) for loc in preferences.get("locations", [])]
        pref_work_modes_set = set(pref_work_modes)

        pre_filtered = []
        for job in all_jobs:
            job_categories = set(job.get("categories", []))
            if user_tags and job_categories:
                if not (user_tags & job_categories):
                    continue
            elif user_tags and not job_categories:
                continue  # Skip untagged jobs in batch mode

            if pref_work_modes_set:
                job_work_mode = job.get("work_mode", "onsite")
                has_remote = any("remoto" in loc for loc in pref_locations)
                if job_work_mode not in pref_work_modes_set and not (has_remote and job_work_mode == "remote"):
                    continue

            if pref_locations:
                job_location = _normalize(job.get("location", ""))
                if job_location and job.get("work_mode") != "remote":
                    if not any(loc in job_location or job_location in loc for loc in pref_locations):
                        continue

            pre_filtered.append(job)

        # Apply deterministic title filter
        title_filtered = filter_by_preferences(pre_filtered, preferences)

        # Apply seniority filter (only if user selected levels)
        if pref_seniority:
            relevant_jobs = [
                j for j in title_filtered
                if _is_level_compatible(set(j.get("categories", [])), pref_seniority)
            ]
        else:
            relevant_jobs = title_filtered

        logger.info(
            "match_tag_filter",
            uid_hash=uid[:8],
            user_tags=list(user_tags),
            pref_seniority=list(pref_seniority),
            total_jobs=len(all_jobs),
            relevant=len(relevant_jobs),
        )

    if not relevant_jobs:
        return []

    relevant_jobs = relevant_jobs[:settings.max_jobs_per_digest]

    # Phase B: AI skill match (with circuit breaker check)
    tasks = []
    for job in relevant_jobs:
        # Circuit breaker: check global AI call budget
        if ai_call_counter["count"] >= settings.job_match_max_ai_calls:
            logger.warning("match_circuit_breaker", uid_hash=uid[:8], calls=ai_call_counter["count"])
            break
        ai_call_counter["count"] += 1
        tasks.append(_match_single_job(
            job, candidate_skills, candidate_experience,
            desired_titles=desired_titles,
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Include all matched results, skip exceptions and None
    matches = [r for r in results if r is not None and not isinstance(r, Exception)]

    # Filter out low-quality matches (below 50%)
    matches = [m for m in matches if m["ats_score"] >= 50]

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
        "started_at": (checkpoint.get("started_at") if checkpoint else None) or datetime.now(_BRT).isoformat(),
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

                    # Send email digest based on frequency preference
                    # Backward compat: old email_digest=True → "daily"
                    freq = preferences.get("email_frequency", "")
                    if not freq:
                        freq = "daily" if preferences.get("email_digest", True) else "off"

                    should_send = False
                    if freq == "daily":
                        should_send = True
                    elif freq == "weekly":
                        # Send on Mondays only
                        should_send = datetime.now(_BRT).weekday() == 0

                    if should_send:
                        existing = await fs.get_matched_jobs(uid, today)
                        if existing and not existing.get("email_sent_at"):
                            email = user_data.get("email", "")
                            name = user_data.get("name", "")
                            if email:
                                sent = await send_job_digest(
                                    email=email, name=name, uid=uid,
                                    matches=matches, date=today,
                                    frequency=freq,
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
