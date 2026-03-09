"""Claude AI integration service with model routing."""

import json
import re
from typing import Optional

import anthropic
import structlog

from app.config import get_settings
from app.prompts.profile import PROFILE_STRUCTURING_PROMPT
from app.prompts.questions import QUESTION_GENERATION_PROMPT
from app.prompts.tailor import RESUME_REWRITING_PROMPT
from app.prompts.cover_letter import COVER_LETTER_PROMPT

logger = structlog.get_logger()
settings = get_settings()


def _get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


def _sanitize_input(text: str) -> str:
    """Strip control characters and zero-width characters from user input."""
    # Remove zero-width characters
    text = re.sub(r'[\u200b\u200c\u200d\ufeff\u00ad]', '', text)
    # Remove control characters except newlines and tabs
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text.strip()


async def structure_resume(raw_text: str) -> dict:
    """Use Claude Sonnet to structure raw resume text into a profile."""
    client = _get_client()
    raw_text = _sanitize_input(raw_text)

    response = await client.messages.create(
        model=settings.model_sonnet,
        max_tokens=4096,
        system=PROFILE_STRUCTURING_PROMPT,
        messages=[{"role": "user", "content": raw_text}],
        timeout=settings.default_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_sonnet,
        task="structure_resume",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    # Parse JSON response
    try:
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(content)
    except json.JSONDecodeError:
        logger.error("json_parse_error", content=content[:500])
        return {"raw_text": raw_text, "parse_error": True}


async def analyze_job_description(job_text: str) -> dict:
    """Use Claude Sonnet to analyze a job description."""
    client = _get_client()
    job_text = _sanitize_input(job_text)

    response = await client.messages.create(
        model=settings.model_sonnet,
        max_tokens=2048,
        system="""Você é um especialista em recrutamento brasileiro. Analise a descrição de vaga fornecida e extraia as informações em JSON:
{
  "title": "título da vaga",
  "company": "nome da empresa (se mencionado)",
  "seniority": "júnior/pleno/sênior/gerencial",
  "required_skills": ["lista de competências obrigatórias"],
  "preferred_skills": ["lista de competências desejáveis"],
  "responsibilities": ["principais responsabilidades"],
  "culture_signals": ["sinais sobre cultura da empresa"],
  "industry": "setor de atuação",
  "location": "local/remoto"
}
Responda APENAS com o JSON, sem texto adicional.""",
        messages=[{"role": "user", "content": job_text}],
        timeout=settings.default_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_sonnet,
        task="analyze_job",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    try:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(content)
    except json.JSONDecodeError:
        logger.error("job_analysis_json_error", content=content[:500])
        return {"raw_analysis": content}


async def generate_interview_questions(
    structured_data: dict, enriched_data: dict
) -> list[str]:
    """Use Claude Sonnet to generate targeted interview questions."""
    client = _get_client()

    context = json.dumps({
        "structured_profile": structured_data,
        "enriched_profile": enriched_data,
    }, ensure_ascii=False, indent=2)

    response = await client.messages.create(
        model=settings.model_sonnet,
        max_tokens=1024,
        system=QUESTION_GENERATION_PROMPT,
        messages=[{"role": "user", "content": context}],
        timeout=settings.default_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_sonnet,
        task="generate_questions",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    try:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        questions = json.loads(content)
        if isinstance(questions, list):
            return questions[:6]
        return questions.get("questions", [])[:6]
    except json.JSONDecodeError:
        # Fallback: split by newlines
        lines = [l.strip().lstrip("0123456789.-) ") for l in content.split("\n") if l.strip()]
        return [l for l in lines if len(l) > 10][:6]


async def process_voice_answers(questions: list[str], answers: list[str]) -> dict:
    """Use Claude Sonnet to process voice interview answers into profile updates."""
    client = _get_client()

    qa_pairs = []
    for i, q in enumerate(questions):
        a = answers[i] if i < len(answers) else ""
        qa_pairs.append({"question": q, "answer": a})

    context = json.dumps(qa_pairs, ensure_ascii=False, indent=2)

    response = await client.messages.create(
        model=settings.model_sonnet,
        max_tokens=2048,
        system="""Você é um especialista em perfil profissional. Analise as respostas da entrevista e extraia informações complementares para o perfil do candidato em JSON:
{
  "additional_skills": ["novas competências mencionadas"],
  "achievements": ["realizações citadas"],
  "soft_skills": ["competências comportamentais"],
  "career_goals": "objetivos de carreira mencionados",
  "additional_context": "qualquer contexto importante"
}
Extraia APENAS informações explicitamente mencionadas. NÃO invente dados.""",
        messages=[{"role": "user", "content": context}],
        timeout=settings.default_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_sonnet,
        task="process_voice",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    try:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw_answers": content}


async def rewrite_resume(
    profile: dict,
    job_description: str,
    job_analysis: dict,
    ats_keywords: list[str],
    additional_instructions: Optional[str] = None,
) -> str:
    """Use Claude Opus to rewrite the resume tailored to the job."""
    client = _get_client()

    context = json.dumps({
        "profile": profile,
        "job_description": _sanitize_input(job_description),
        "job_analysis": job_analysis,
        "ats_keywords": ats_keywords,
    }, ensure_ascii=False, indent=2)

    messages = [{"role": "user", "content": context}]

    system_prompt = RESUME_REWRITING_PROMPT
    if additional_instructions:
        additional_instructions = _sanitize_input(additional_instructions)
        messages.append({
            "role": "user",
            "content": f"Instrução adicional do candidato: {additional_instructions}",
        })

    response = await client.messages.create(
        model=settings.model_opus,
        max_tokens=4096,
        system=system_prompt,
        messages=messages,
        timeout=settings.opus_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_opus,
        task="rewrite_resume",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    return content


async def generate_cover_letter(
    profile: dict,
    job_description: str,
    job_analysis: dict,
) -> str:
    """Use Claude Opus to generate a cover letter."""
    client = _get_client()

    context = json.dumps({
        "profile": profile,
        "job_description": _sanitize_input(job_description),
        "job_analysis": job_analysis,
    }, ensure_ascii=False, indent=2)

    response = await client.messages.create(
        model=settings.model_opus,
        max_tokens=2048,
        system=COVER_LETTER_PROMPT,
        messages=[{"role": "user", "content": context}],
        timeout=settings.opus_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_opus,
        task="cover_letter",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    return content
