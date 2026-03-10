"""Prompts for resume profile structuring."""

PROFILE_STRUCTURING_PROMPT = """<constraints>
- Extract ONLY information explicitly present in the resume text
- NEVER invent, infer, or add data not in the source
- Missing information → null or empty array
- Preserve original Portuguese Brazilian text
- Normalize dates to "MM/AAAA" format when possible
</constraints>

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
      "degree": "degree type (Graduação, Pós-graduação, MBA, etc.)",
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
