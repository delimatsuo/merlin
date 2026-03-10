"""Knowledge file builder — persistent candidate profile across applications."""

import structlog

from app.services.firestore import FirestoreService

logger = structlog.get_logger()

# Limits
MAX_SKILLS = 200
MAX_INSIGHTS = 100
MAX_EXPERIENCE = 50


def _normalize_skill(skill: str) -> str:
    """Normalize skill name for deduplication."""
    return skill.strip().lower()


def _deduplicate_skills(existing: list[str], new_skills: list[str]) -> list[str]:
    """Case-insensitive skill deduplication, preserving original casing."""
    seen = {_normalize_skill(s) for s in existing}
    result = list(existing)
    for skill in new_skills:
        normalized = _normalize_skill(skill)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(skill.strip())
    return result[:MAX_SKILLS]


def _deduplicate_experience(existing: list[dict], new_entries: list[dict]) -> list[dict]:
    """Deduplicate experience entries by company+role overlap."""
    def _key(entry: dict) -> str:
        company = (entry.get("company") or "").strip().lower()
        role = (entry.get("role") or "").strip().lower()
        return f"{company}|{role}"

    seen = {_key(e) for e in existing}
    result = list(existing)
    for entry in new_entries:
        key = _key(entry)
        if key and key not in seen:
            seen.add(key)
            result.append(entry)
    return result[:MAX_EXPERIENCE]


def _deduplicate_insights(existing: list[dict], new_insights: list[dict]) -> list[dict]:
    """Deduplicate insights by topic+detail similarity."""
    def _key(insight: dict) -> str:
        topic = (insight.get("topic") or "").strip().lower()
        detail = (insight.get("detail") or "").strip().lower()[:80]
        return f"{topic}|{detail}"

    seen = {_key(i) for i in existing}
    result = list(existing)
    for insight in new_insights:
        key = _key(insight)
        if key and key not in seen:
            seen.add(key)
            result.append(insight)
    return result[:MAX_INSIGHTS]


async def merge_resume_into_knowledge(uid: str, profile_data: dict, profile_id: str) -> None:
    """Merge structured resume data into the knowledge file. Fire-and-forget."""
    try:
        fs = FirestoreService()
        knowledge = await fs.get_candidate_knowledge(uid) or _empty_knowledge()

        # Merge skills
        new_skills = profile_data.get("skills", [])
        knowledge["skills"] = _deduplicate_skills(knowledge.get("skills", []), new_skills)

        # Merge experience
        new_experience = profile_data.get("experience", [])
        knowledge["experience"] = _deduplicate_experience(
            knowledge.get("experience", []), new_experience
        )

        # Merge education
        new_education = profile_data.get("education", [])
        existing_edu = knowledge.get("education", [])
        edu_keys = {(e.get("institution", "").lower(), e.get("degree", "").lower()) for e in existing_edu}
        for edu in new_education:
            key = (edu.get("institution", "").lower(), edu.get("degree", "").lower())
            if key not in edu_keys:
                edu_keys.add(key)
                existing_edu.append(edu)
        knowledge["education"] = existing_edu

        # Merge languages
        new_languages = profile_data.get("languages", [])
        existing_langs = knowledge.get("languages", [])
        lang_keys = {l.get("language", "").lower() for l in existing_langs}
        for lang in new_languages:
            if lang.get("language", "").lower() not in lang_keys:
                lang_keys.add(lang.get("language", "").lower())
                existing_langs.append(lang)
        knowledge["languages"] = existing_langs

        # Merge certifications
        new_certs = profile_data.get("certifications", [])
        existing_certs = knowledge.get("certifications", [])
        cert_keys = {c.lower() for c in existing_certs}
        for cert in new_certs:
            if cert.lower() not in cert_keys:
                cert_keys.add(cert.lower())
                existing_certs.append(cert)
        knowledge["certifications"] = existing_certs

        # Track resume ID
        resume_ids = knowledge.get("resumeIds", [])
        if profile_id not in resume_ids:
            resume_ids.append(profile_id)
        knowledge["resumeIds"] = resume_ids

        await fs.save_candidate_knowledge(uid, knowledge)
        logger.info("knowledge_resume_merged", uid=uid, profile_id=profile_id)

    except Exception as e:
        logger.error("knowledge_resume_merge_error", uid=uid, error=str(e))


async def merge_voice_into_knowledge(uid: str, voice_insights: dict) -> None:
    """Merge voice interview insights into knowledge file. Fire-and-forget."""
    try:
        fs = FirestoreService()
        knowledge = await fs.get_candidate_knowledge(uid) or _empty_knowledge()

        # Merge additional skills from voice
        new_skills = voice_insights.get("additional_skills", [])
        knowledge["skills"] = _deduplicate_skills(knowledge.get("skills", []), new_skills)

        # Merge soft skills as insights
        soft_skills = voice_insights.get("soft_skills", [])
        new_insights = [
            {"topic": "soft_skill", "detail": skill, "source": "voice_interview"}
            for skill in soft_skills
        ]

        # Merge achievements
        achievements = voice_insights.get("achievements", [])
        existing_achievements = knowledge.get("achievements", [])
        achievement_keys = {a.lower() for a in existing_achievements}
        for achievement in achievements:
            if achievement.lower() not in achievement_keys:
                achievement_keys.add(achievement.lower())
                existing_achievements.append(achievement)
        knowledge["achievements"] = existing_achievements

        # Merge career goals as insight
        career_goals = voice_insights.get("career_goals")
        if career_goals:
            new_insights.append({
                "topic": "career_goals",
                "detail": career_goals,
                "source": "voice_interview",
            })

        # Additional context as insight
        additional_context = voice_insights.get("additional_context")
        if additional_context:
            new_insights.append({
                "topic": "context",
                "detail": additional_context,
                "source": "voice_interview",
            })

        knowledge["insights"] = _deduplicate_insights(
            knowledge.get("insights", []), new_insights
        )

        await fs.save_candidate_knowledge(uid, knowledge)
        logger.info("knowledge_voice_merged", uid=uid)

    except Exception as e:
        logger.error("knowledge_voice_merge_error", uid=uid, error=str(e))


async def merge_comment_into_knowledge(uid: str, comment: str, application_context: str = "") -> None:
    """Merge a user comment into the knowledge file. Fire-and-forget."""
    try:
        fs = FirestoreService()
        knowledge = await fs.get_candidate_knowledge(uid) or _empty_knowledge()

        new_insight = {
            "topic": "user_comment",
            "detail": comment.strip()[:500],
            "source": f"comment:{application_context}" if application_context else "comment",
        }

        knowledge["insights"] = _deduplicate_insights(
            knowledge.get("insights", []), [new_insight]
        )

        await fs.save_candidate_knowledge(uid, knowledge)
        logger.info("knowledge_comment_merged", uid=uid)

    except Exception as e:
        logger.error("knowledge_comment_merge_error", uid=uid, error=str(e))


async def build_knowledge_from_profile(uid: str) -> dict | None:
    """Auto-build knowledge from latest profile (migration for existing users)."""
    try:
        fs = FirestoreService()
        profile = await fs.get_latest_profile(uid)
        if not profile:
            return None

        structured = profile.get("structuredData", {})
        enriched = profile.get("enrichedProfile") or {}
        voice = profile.get("voiceAnswers") or {}

        knowledge = _empty_knowledge()

        # From structured data
        knowledge["skills"] = list(structured.get("skills", []))[:MAX_SKILLS]
        knowledge["experience"] = list(structured.get("experience", []))[:MAX_EXPERIENCE]
        knowledge["education"] = list(structured.get("education", []))
        knowledge["languages"] = list(structured.get("languages", []))
        knowledge["certifications"] = list(structured.get("certifications", []))
        knowledge["resumeIds"] = [profile.get("id", "")]

        # From enriched profile
        if enriched.get("companyResearch"):
            research = enriched["companyResearch"]
            inferred_tech = research.get("inferred_technical_skills", [])
            knowledge["skills"] = _deduplicate_skills(knowledge["skills"], inferred_tech)

        # From voice answers
        if voice:
            additional_skills = voice.get("additional_skills", [])
            knowledge["skills"] = _deduplicate_skills(knowledge["skills"], additional_skills)
            achievements = voice.get("achievements", [])
            knowledge["achievements"] = achievements

        await fs.save_candidate_knowledge(uid, knowledge)
        logger.info("knowledge_auto_built", uid=uid)
        return knowledge

    except Exception as e:
        logger.error("knowledge_auto_build_error", uid=uid, error=str(e))
        return None


def _empty_knowledge() -> dict:
    """Return an empty knowledge file structure."""
    return {
        "skills": [],
        "experience": [],
        "education": [],
        "insights": [],
        "achievements": [],
        "languages": [],
        "certifications": [],
        "resumeIds": [],
        "version": 1,
    }
