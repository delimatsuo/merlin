"""Gemini 3.1 Pro AI service — replaces Claude for all AI tasks."""

import json
import re
from typing import Optional

import structlog
from google import genai
from google.genai import types

from app.config import get_settings
from app.prompts.profile import PROFILE_STRUCTURING_PROMPT
from app.prompts.questions import QUESTION_GENERATION_PROMPT
from app.prompts.tailor import RESUME_REWRITING_PROMPT
from app.prompts.cover_letter import COVER_LETTER_PROMPT
from app.prompts.job_analysis import JOB_ANALYSIS_PROMPT
from app.prompts.voice_processing import VOICE_PROCESSING_PROMPT
from app.prompts.enrichment import ENRICHMENT_PROMPT

logger = structlog.get_logger()

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        settings = get_settings()
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


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


async def structure_resume(raw_text: str) -> dict:
    """Structure raw resume text into a profile using Gemini."""
    client = _get_client()
    settings = get_settings()
    raw_text = _sanitize_input(raw_text)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=raw_text,
        config=types.GenerateContentConfig(
            system_instruction=PROFILE_STRUCTURING_PROMPT,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="structure_resume",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        logger.error("json_parse_error", content=content[:500])
        return {"raw_text": raw_text, "parse_error": True}


async def analyze_job_description(job_text: str) -> dict:
    """Analyze a job description using Gemini."""
    client = _get_client()
    settings = get_settings()
    job_text = _sanitize_input(job_text)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=job_text,
        config=types.GenerateContentConfig(
            system_instruction=JOB_ANALYSIS_PROMPT,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="analyze_job",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
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
    structured_data: dict, enriched_data: dict
) -> list[str]:
    """Generate targeted interview questions using Gemini."""
    client = _get_client()
    settings = get_settings()

    context = json.dumps({
        "structured_profile": structured_data,
        "enriched_profile": enriched_data,
    }, ensure_ascii=False, indent=2)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction=QUESTION_GENERATION_PROMPT,
            response_mime_type="application/json",
            temperature=0.7,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="generate_questions",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
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
    """Process voice interview answers into profile updates using Gemini."""
    client = _get_client()
    settings = get_settings()

    qa_pairs = []
    for i, q in enumerate(questions):
        a = answers[i] if i < len(answers) else ""
        qa_pairs.append({"question": q, "answer": a})

    context = json.dumps(qa_pairs, ensure_ascii=False, indent=2)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction=VOICE_PROCESSING_PROMPT,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="process_voice",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw_answers": content}


async def rewrite_resume(
    profile: dict,
    job_description: str,
    job_analysis: dict,
    ats_keywords: list[str],
    additional_instructions: Optional[str] = None,
    knowledge: Optional[dict] = None,
    enrichment: Optional[dict] = None,
) -> str:
    """Rewrite the resume tailored to the job using Gemini."""
    client = _get_client()
    settings = get_settings()

    # Build comprehensive candidate data
    candidate_data = {"structured_resume": profile}
    if knowledge:
        # Include achievements and insights from knowledge file
        extra = {}
        if knowledge.get("achievements"):
            extra["achievements"] = knowledge["achievements"]
        if knowledge.get("insights"):
            extra["insights"] = knowledge["insights"]
        # Supplement skills from knowledge if richer
        if len(knowledge.get("skills", [])) > len(profile.get("skills", [])):
            extra["additional_skills"] = knowledge["skills"]
        if extra:
            candidate_data["knowledge_supplements"] = extra
    if enrichment and isinstance(enrichment, dict):
        # Include inferred skills from company research
        inferred = enrichment.get("inferred_technical_skills", [])
        if inferred:
            candidate_data.setdefault("knowledge_supplements", {})["inferred_skills"] = inferred

    context = json.dumps({
        "candidate": candidate_data,
        "job_description": _sanitize_input(job_description),
        "job_analysis": job_analysis,
        "ats_keywords": ats_keywords,
    }, ensure_ascii=False, indent=2)

    user_content = context
    if additional_instructions:
        additional_instructions = _sanitize_input(additional_instructions)
        user_content += f"\n\nInstrução adicional do candidato: {additional_instructions}"

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=RESUME_REWRITING_PROMPT,
            temperature=0.85,
            max_output_tokens=8192,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="rewrite_resume",
        prompt_version="v2",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )

    return content


async def generate_cover_letter(
    profile: dict,
    job_description: str,
    job_analysis: dict,
) -> str:
    """Generate a cover letter using Gemini."""
    client = _get_client()
    settings = get_settings()

    context = json.dumps({
        "profile": profile,
        "job_description": _sanitize_input(job_description),
        "job_analysis": job_analysis,
    }, ensure_ascii=False, indent=2)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction=COVER_LETTER_PROMPT,
            temperature=0.85,
            max_output_tokens=4096,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="cover_letter",
        prompt_version="v2",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )

    return content


async def extract_ats_keywords(job_description: str) -> list[str]:
    """Extract ATS-relevant keywords from job description using Gemini."""
    client = _get_client()
    settings = get_settings()

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=job_description,
        config=types.GenerateContentConfig(
            system_instruction="""<task>
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
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="ats_keywords",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
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
    """Infer additional skills from company research using Gemini."""
    client = _get_client()
    settings = get_settings()

    context = json.dumps({
        "candidate_experience": experience,
        "company_research": company_research,
    }, ensure_ascii=False, indent=2)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction=ENRICHMENT_PROMPT,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="company_enrichment",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw": content}


async def generate_followup_questions(
    knowledge: dict, job_analysis: dict, missing_skills: list[str]
) -> list[str]:
    """Generate targeted follow-up questions based on knowledge gaps."""
    client = _get_client()
    settings = get_settings()

    context = json.dumps({
        "candidate_knowledge": knowledge,
        "job_analysis": job_analysis,
        "missing_skills": missing_skills,
    }, ensure_ascii=False, indent=2)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction="""<task>
Generate targeted follow-up questions to fill gaps between the candidate's profile and the job requirements. The input contains the candidate's knowledge file, job analysis, and list of missing skills.
</task>

<constraints>
- Max 5 questions
- Each question targets a specific skill gap
- Questions should be answerable in 1-2 sentences
- Write in informal professional Brazilian Portuguese
</constraints>

<focus>
1. Practical experience with the missing competencies
2. Projects or situations using similar skills
3. Willingness to learn what's missing
</focus>

Return a JSON array of strings.""",
            response_mime_type="application/json",
            temperature=0.7,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="followup_questions",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
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


async def semantic_skill_match(
    candidate_skills: list[str],
    required_skills: list[str],
    candidate_experience: list[dict] | None = None,
) -> dict:
    """Use Gemini for semantic skill matching instead of exact string comparison."""
    client = _get_client()
    settings = get_settings()

    context = json.dumps({
        "candidate_skills": candidate_skills,
        "required_skills": required_skills,
        "candidate_experience": candidate_experience or [],
    }, ensure_ascii=False, indent=2)

    response = await client.aio.models.generate_content(
        model=settings.model_gemini,
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction="""<task>
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
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )

    content = response.text
    logger.info(
        "gemini_usage",
        model=settings.model_gemini,
        task="semantic_skill_match",
        input_tokens=response.usage_metadata.prompt_token_count,
        output_tokens=response.usage_metadata.candidates_token_count,
    )

    result = _parse_json_response(content)
    if result and isinstance(result, dict):
        return result

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"matched": [], "likely": [], "missing": required_skills, "score": 0}
