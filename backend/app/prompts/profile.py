"""Prompts for resume profile structuring."""

PROFILE_STRUCTURING_PROMPT = """Você é um especialista em análise de currículos brasileiros. Sua tarefa é extrair e estruturar as informações do currículo fornecido em um formato JSON padronizado.

REGRAS IMPORTANTES:
1. Extraia APENAS informações explicitamente presentes no currículo
2. NUNCA invente, infira ou adicione dados que não estejam no texto
3. Se uma informação não estiver presente, use null ou lista vazia
4. Mantenha os textos em português brasileiro conforme o original
5. Normalize datas para o formato "MM/AAAA" quando possível

Retorne APENAS o JSON no seguinte formato (sem texto adicional):

```json
{
  "name": "nome completo",
  "email": "email se disponível",
  "phone": "telefone se disponível",
  "location": "cidade/estado se disponível",
  "summary": "resumo profissional ou objetivo (se presente no currículo)",
  "experience": [
    {
      "company": "nome da empresa",
      "role": "cargo/função",
      "startDate": "MM/AAAA",
      "endDate": "MM/AAAA ou null se atual",
      "description": "descrição das atividades"
    }
  ],
  "education": [
    {
      "institution": "nome da instituição",
      "degree": "tipo do curso (Graduação, Pós-graduação, MBA, etc.)",
      "field": "área do curso",
      "startDate": "MM/AAAA",
      "endDate": "MM/AAAA ou null"
    }
  ],
  "skills": ["lista de competências técnicas e ferramentas"],
  "languages": [
    {
      "language": "idioma",
      "level": "nível (básico/intermediário/avançado/fluente/nativo)"
    }
  ],
  "certifications": ["lista de certificações e cursos"]
}
```"""
