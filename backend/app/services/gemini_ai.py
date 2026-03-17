"""Tiered AI service — Claude Sonnet 4.6 for writing/reasoning, Gemini Flash-Lite for extraction."""

import json
import re
from typing import Optional

import anthropic
import structlog
from google import genai
from google.genai import types

from app.config import get_settings
from app.prompts.profile import PROFILE_STRUCTURING_PROMPT
from app.prompts.questions import QUESTION_GENERATION_PROMPT, get_question_prompt
from app.prompts.tailor import RESUME_REWRITING_PROMPT
from app.prompts.cover_letter import COVER_LETTER_PROMPT
from app.prompts.job_analysis import JOB_ANALYSIS_PROMPT
from app.prompts.voice_processing import VOICE_PROCESSING_PROMPT
from app.prompts.enrichment import ENRICHMENT_PROMPT
from app.prompts.recommendations import get_recommendations_prompt
from app.prompts.linkedin_structure import LINKEDIN_STRUCTURING_PROMPT
from app.prompts.linkedin_analysis import get_linkedin_analysis_prompt

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Clients (lazy singletons)
# ---------------------------------------------------------------------------

_gemini_client: genai.Client | None = None
_anthropic_client: anthropic.AsyncAnthropic | None = None


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        settings = get_settings()
        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


def _get_anthropic_client() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        settings = get_settings()
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize_input(text: str) -> str:
    """Strip control characters and zero-width characters from user input."""
    text = re.sub(r'[\u200b\u200c\u200d\ufeff\u00ad]', '', text)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text.strip()


def _parse_json_response(content: str) -> dict | list | None:
    """Parse JSON from model response, handling markdown code blocks."""
    try:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(content)
    except json.JSONDecodeError:
        return None


async def _call_sonnet(
    system: str,
    user_content: str,
    task: str,
    max_tokens: int = 4096,
    temperature: float = 1.0,
) -> str:
    """Call Claude Sonnet 4.6 and return the text response."""
    client = _get_anthropic_client()
    settings = get_settings()

    user_content = _sanitize_input(user_content)

    response = await client.messages.create(
        model=settings.model_sonnet,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": f"<user_input>\n{user_content}\n</user_input>"}],
        temperature=temperature,
    )

    content = response.content[0].text
    logger.info(
        "ai_usage",
        model=settings.model_sonnet,
        tier="writing_reasoning",
        task=task,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )
    return content


async def _call_flash_lite(
    system: str,
    user_content: str,
    task: str,
    temperature: float = 0.2,
    response_mime_type: str = "application/json",
) -> str:
    """Call Gemini 3.1 Flash-Lite and return the text response."""
    client = _get_gemini_client()
    settings = get_settings()

    user_content = _sanitize_input(user_content)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini_flash_lite,
        contents=f"<user_input>\n{user_content}\n</user_input>",
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type=response_mime_type,
            temperature=temperature,
        ),
    )

    content = response.text
    logger.info(
        "ai_usage",
        model=settings.model_gemini_flash_lite,
        tier="extraction",
        task=task,
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )
    return content


# ===========================================================================
# EXTRACTION TIER — Gemini 3.1 Flash-Lite
# ===========================================================================

async def structure_resume(raw_text: str) -> dict:
    """Structure raw resume text into a profile."""
    content = await _call_flash_lite(
        system=PROFILE_STRUCTURING_PROMPT,
        user_content=raw_text,
        task="structure_resume",
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.error("json_parse_error", content=content[:500])
        return {"raw_text": raw_text, "parse_error": True}


async def extract_ats_keywords(job_description: str) -> list[str]:
    """Extract ATS-relevant keywords from job description."""
    content = await _call_flash_lite(
        system="""<task>
Extract the most important ATS (Applicant Tracking System) keywords from the provided job description.
</task>

<focus>
Technical skills, tools, certifications, methodologies, and industry-specific terms.
</focus>

<constraints>
- Max 20 keywords, ordered by importance
- Return a JSON array of strings
- Keep keywords as they appear in the JD (preserve language)
</constraints>""",
        user_content=job_description,
        task="ats_keywords",
    )

    result = _parse_json_response(content)
    if result and isinstance(result, list):
        return result[:20]

    try:
        keywords = json.loads(content)
        if isinstance(keywords, list):
            return keywords[:20]
        return []
    except json.JSONDecodeError:
        keywords = [k.strip().strip('"\'') for k in re.split(r'[,\n]', content) if k.strip()]
        return keywords[:20]


async def infer_skills_from_research(experience: list, company_research: dict) -> dict:
    """Infer additional skills from company research."""
    context = json.dumps({
        "candidate_experience": experience,
        "company_research": company_research,
    }, ensure_ascii=False, indent=2)

    content = await _call_flash_lite(
        system=ENRICHMENT_PROMPT,
        user_content=context,
        task="company_enrichment",
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw": content}


async def semantic_skill_match(
    candidate_skills: list[str],
    required_skills: list[str],
    candidate_experience: list[dict] | None = None,
) -> dict:
    """Semantic skill matching."""
    context = json.dumps({
        "candidate_skills": candidate_skills,
        "required_skills": required_skills,
        "candidate_experience": candidate_experience or [],
    }, ensure_ascii=False, indent=2)

    content = await _call_flash_lite(
        system="""<task>
Semantically match candidate skills against job requirements. The input contains candidate_skills, required_skills, and candidate_experience.
</task>

<matching_rules>
- Match synonyms and variations (e.g., "JS" = "JavaScript", "gestão de projetos" = "project management")
- Consider skills implied by work experience
- Consider related skills (e.g., React implies JavaScript)
</matching_rules>

<schema>
{
  "matched": [{"skill": "required skill name", "evidence": "candidate skill or experience that matches"}],
  "likely": [{"skill": "required skill name", "evidence": "why it's probable"}],
  "missing": ["skills truly absent from candidate profile"],
  "score": 0-100
}
</schema>""",
        user_content=context,
        task="semantic_skill_match",
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"matched": [], "likely": [], "missing": required_skills, "score": 0}


# ===========================================================================
# WRITING + REASONING TIER — Claude Sonnet 4.6
# ===========================================================================

async def analyze_job_description(job_text: str) -> dict:
    """Analyze a job description."""
    content = await _call_sonnet(
        system=JOB_ANALYSIS_PROMPT,
        user_content=job_text,
        task="analyze_job",
        max_tokens=2048,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.error("job_analysis_json_error", content=content[:500])
        return {"raw_analysis": content}


async def generate_interview_questions(
    structured_data: dict, enriched_data: dict, locale: str = "pt-BR"
) -> list[str]:
    """Generate targeted interview questions."""
    context = json.dumps({
        "structured_profile": structured_data,
        "enriched_profile": enriched_data,
    }, ensure_ascii=False, indent=2)

    content = await _call_sonnet(
        system=get_question_prompt(locale),
        user_content=context,
        task="generate_questions",
        max_tokens=1024,
    )

    result = _parse_json_response(content)
    if result:
        if isinstance(result, list):
            return result[:6]
        if isinstance(result, dict):
            return result.get("questions", [])[:6]

    try:
        questions = json.loads(content)
        if isinstance(questions, list):
            return questions[:6]
        return questions.get("questions", [])[:6]
    except json.JSONDecodeError:
        lines = [l.strip().lstrip("0123456789.-) ") for l in content.split("\n") if l.strip()]
        return [l for l in lines if len(l) > 10][:6]


async def process_voice_answers(questions: list[str], answers: list[str]) -> dict:
    """Process voice interview answers into profile updates."""
    qa_pairs = []
    for i, q in enumerate(questions):
        a = answers[i] if i < len(answers) else ""
        qa_pairs.append({"question": q, "answer": a})

    context = json.dumps(qa_pairs, ensure_ascii=False, indent=2)

    content = await _call_sonnet(
        system=VOICE_PROCESSING_PROMPT,
        user_content=context,
        task="process_voice",
        max_tokens=2048,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw_answers": content}


def _parse_xml_tagged_response(content: str) -> tuple[str, list[dict]]:
    """Parse XML-tagged response with <resume> and <changelog> sections."""
    resume_match = re.search(r'<resume>(.*?)</resume>', content, re.DOTALL)
    changelog_match = re.search(r'<changelog>(.*?)</changelog>', content, re.DOTALL)

    if resume_match:
        resume_content = resume_match.group(1).strip()
    else:
        # Strip any <changelog> block from fallback to avoid showing raw JSON to the user
        resume_content = re.sub(r'<changelog>.*?</changelog>', '', content, flags=re.DOTALL).strip()
    changelog: list[dict] = []

    if changelog_match:
        try:
            raw = changelog_match.group(1).strip()
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                valid_categories = {"keyword", "ats", "impact", "structure"}
                changelog = [
                    item for item in parsed[:10]
                    if isinstance(item, dict)
                    and all(k in item for k in ("section", "what", "why", "category"))
                    and item.get("category") in valid_categories
                ]
        except (json.JSONDecodeError, TypeError):
            logger.warning("changelog_parse_error", raw=changelog_match.group(1)[:200])

    return resume_content, changelog


async def rewrite_resume(
    profile: dict,
    job_description: str,
    job_analysis: dict,
    ats_keywords: list[str],
    additional_instructions: Optional[str] = None,
    knowledge: Optional[dict] = None,
    enrichment: Optional[dict] = None,
) -> tuple[str, list[dict]]:
    """Rewrite the resume tailored to the job. Returns (resume_content, changelog)."""
    # Build comprehensive candidate data
    candidate_data = {"structured_resume": profile}
    if knowledge:
        extra = {}
        if knowledge.get("achievements"):
            extra["achievements"] = knowledge["achievements"]
        if knowledge.get("insights"):
            extra["insights"] = knowledge["insights"]
        if len(knowledge.get("skills", [])) > len(profile.get("skills", [])):
            extra["additional_skills"] = knowledge["skills"]
        if extra:
            candidate_data["knowledge_supplements"] = extra
    if enrichment and isinstance(enrichment, dict):
        inferred = enrichment.get("inferred_technical_skills", [])
        if inferred:
            candidate_data.setdefault("knowledge_supplements", {})["inferred_skills"] = inferred

    context = json.dumps({
        "candidate": candidate_data,
        "job_description": job_description,
        "job_analysis": job_analysis,
        "ats_keywords": ats_keywords,
    }, ensure_ascii=False, indent=2)

    user_content = context
    if additional_instructions:
        user_content += f"\n\nInstrução adicional do candidato: {additional_instructions}"

    content = await _call_sonnet(
        system=RESUME_REWRITING_PROMPT,
        user_content=user_content,
        task="rewrite_resume",
        max_tokens=8192,
    )

    return _parse_xml_tagged_response(content)


async def generate_cover_letter(
    profile: dict,
    job_description: str,
    job_analysis: dict,
) -> str:
    """Generate a cover letter."""
    context = json.dumps({
        "profile": profile,
        "job_description": job_description,
        "job_analysis": job_analysis,
    }, ensure_ascii=False, indent=2)

    content = await _call_sonnet(
        system=COVER_LETTER_PROMPT,
        user_content=context,
        task="cover_letter",
        max_tokens=4096,
    )

    return content


async def generate_followup_questions(
    knowledge: dict, job_analysis: dict, missing_skills: list[str]
) -> list[str]:
    """Generate targeted follow-up questions based on knowledge gaps."""
    context = json.dumps({
        "candidate_knowledge": knowledge,
        "job_analysis": job_analysis,
        "missing_skills": missing_skills,
    }, ensure_ascii=False, indent=2)

    content = await _call_sonnet(
        system="""<task>
Generate targeted follow-up questions to fill gaps between the candidate's profile and the job requirements. The input contains the candidate's knowledge file, job analysis, and list of missing skills.
</task>

<constraints>
- Max 5 questions
- Each question targets a specific skill gap
- Questions should be answerable in 1-2 sentences
- Write in the language specified by job_analysis.language ("en" for English, "pt-BR" for Brazilian Portuguese). If missing, default to Brazilian Portuguese.
</constraints>

<focus>
1. Practical experience with the missing competencies
2. Projects or situations using similar skills
3. Willingness to learn what's missing
</focus>

Return a JSON array of strings.""",
        user_content=context,
        task="followup_questions",
        max_tokens=1024,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, list):
        return result[:5]

    try:
        questions = json.loads(content)
        if isinstance(questions, list):
            return questions[:5]
        return []
    except json.JSONDecodeError:
        return []


async def generate_recommendations(
    profile: dict,
    knowledge: Optional[dict],
    locale: str = "pt-BR",
) -> list[dict]:
    """Generate CV health-check recommendations."""
    context = json.dumps({
        "profile": profile,
        "knowledge": knowledge or {},
    }, ensure_ascii=False, indent=2)

    content = await _call_sonnet(
        system=get_recommendations_prompt(locale),
        user_content=context,
        task="recommendations",
        max_tokens=4096,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, list):
        return result[:5]

    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed[:5]
        return []
    except json.JSONDecodeError:
        logger.error("recommendations_parse_error", content=content[:500])
        return []


# ===========================================================================
# LINKEDIN PROFILE — Extraction + Analysis
# ===========================================================================

async def structure_linkedin_profile(raw_text: str) -> dict:
    """Structure raw LinkedIn profile text into structured JSON."""
    content = await _call_flash_lite(
        system=LINKEDIN_STRUCTURING_PROMPT,
        user_content=raw_text,
        task="structure_linkedin",
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.error("linkedin_structure_parse_error", content=content[:500])
        return {"raw_text": raw_text, "parse_error": True}


async def analyze_linkedin_profile(
    structured: dict,
    knowledge: Optional[dict] = None,
    locale: str = "pt-BR",
) -> tuple[list[dict], list[dict]]:
    """Analyze a LinkedIn profile and return improvement suggestions + cross-references."""
    context_data: dict = {"linkedin_profile": structured}
    if knowledge:
        context_data["candidate_knowledge"] = knowledge

    context = json.dumps(context_data, ensure_ascii=False, indent=2)

    content = await _call_sonnet(
        system=get_linkedin_analysis_prompt(locale),
        user_content=context,
        task="linkedin_analysis",
        max_tokens=6144,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        suggestions = result.get("suggestions", [])
        cross_ref = result.get("crossRef", [])
        return suggestions[:8], cross_ref

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed.get("suggestions", [])[:8], parsed.get("crossRef", [])
        return [], []
    except json.JSONDecodeError:
        logger.error("linkedin_analysis_parse_error", content=content[:500])
        return [], []
