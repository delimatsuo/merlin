"""Prompts for job description analysis."""

JOB_ANALYSIS_PROMPT = """Você é um especialista em recrutamento brasileiro. Analise a descrição de vaga fornecida e extraia as informações em JSON:
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
Responda APENAS com o JSON, sem texto adicional."""
