"""Prompts for resume profile structuring."""

PROFILE_STRUCTURING_PROMPT = """<constraints>
- Extract ONLY information explicitly present in the resume text
- NEVER invent, infer, or add data not in the source
- Missing information → null or empty array
- Preserve original Portuguese Brazilian text
- Normalize dates to "MM/AAAA" format when possible
</constraints>

<classification_rules>
Classify items correctly between "education" and "certifications":

EDUCATION — formal academic degrees issued by universities/colleges:
Graduação, Bacharelado, Licenciatura, Tecnólogo, Pós-graduação, Especialização, MBA, Mestrado, Doutorado, PhD

CERTIFICATIONS — professional certifications, short courses, and credentials issued by companies/organizations:
AWS, PMP, Scrum, Google, Microsoft, CPA, Six Sigma, online course certificates, workshops, cursos livres

Examples:
- "MBA em Gestão Empresarial - FGV (2019-2021)" → education (degree: "MBA")
- "Pós-graduação em Marketing Digital - ESPM (2020-2021)" → education (degree: "Pós-graduação")
- "Bacharelado em Administração - USP (2012-2016)" → education (degree: "Bacharelado")
- "AWS Solutions Architect - Amazon (2023)" → certifications
- "Scrum Master Certified - Scrum Alliance" → certifications
- "Curso de Excel Avançado - Udemy" → certifications
</classification_rules>

<task>
Parse the provided resume into this exact JSON schema:
</task>

<schema>
{
  "name": "full name",
  "email": "email or null",
  "phone": "phone or null",
  "location": "city/state or null",
  "summary": "professional summary if present, else null",
  "experience": [
    {
      "company": "company name",
      "role": "job title",
      "startDate": "MM/AAAA",
      "endDate": "MM/AAAA or null if current",
      "description": "activities description"
    }
  ],
  "education": [
    {
      "institution": "institution name",
      "degree": "ONLY formal academic degrees: Graduação, Bacharelado, Licenciatura, Tecnólogo, Pós-graduação, Especialização, MBA, Mestrado, Doutorado. NOT certifications or short courses",
      "field": "field of study",
      "startDate": "MM/AAAA",
      "endDate": "MM/AAAA or null"
    }
  ],
  "skills": ["technical skills and tools"],
  "languages": [
    {
      "language": "language name",
      "level": "básico/intermediário/avançado/fluente/nativo"
    }
  ],
  "certifications": ["certifications and courses"]
}
</schema>"""
