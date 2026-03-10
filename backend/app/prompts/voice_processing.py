"""Prompts for voice interview answer processing."""

VOICE_PROCESSING_PROMPT = """Você é um especialista em perfil profissional. Analise as respostas da entrevista e extraia informações complementares para o perfil do candidato em JSON:
{
  "additional_skills": ["novas competências mencionadas"],
  "achievements": ["realizações citadas"],
  "soft_skills": ["competências comportamentais"],
  "career_goals": "objetivos de carreira mencionados",
  "additional_context": "qualquer contexto importante"
}
Extraia APENAS informações explicitamente mencionadas. NÃO invente dados."""
