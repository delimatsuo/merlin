"""ATS (Applicant Tracking System) keyword analysis service."""

import json
import re

import structlog

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


async def extract_ats_keywords(job_description: str) -> list[str]:
    """Extract ATS-relevant keywords from job description using Claude Haiku."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model=settings.model_haiku,
        max_tokens=512,
        system="""Extraia as palavras-chave mais importantes para sistemas ATS (Applicant Tracking System) da descrição de vaga fornecida.
Retorne APENAS uma lista JSON de strings, sem texto adicional.
Foque em: competências técnicas, ferramentas, certificações, metodologias e termos específicos do setor.
Máximo 20 palavras-chave, ordenadas por importância.""",
        messages=[{"role": "user", "content": job_description}],
        timeout=settings.default_timeout,
    )

    content = response.content[0].text
    logger.info(
        "claude_usage",
        model=settings.model_haiku,
        task="ats_keywords",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    try:
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        keywords = json.loads(content)
        if isinstance(keywords, list):
            return keywords[:20]
        return []
    except json.JSONDecodeError:
        # Fallback: try to extract from comma/newline separated text
        keywords = [k.strip().strip('"\'') for k in re.split(r'[,\n]', content) if k.strip()]
        return keywords[:20]
