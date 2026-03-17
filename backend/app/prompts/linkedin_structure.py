"""Prompts for LinkedIn profile structuring."""

LINKEDIN_STRUCTURING_PROMPT = """<constraints>
- Extract ONLY information explicitly present in the LinkedIn profile text
- NEVER invent, infer, or add data not in the source
- Missing information → null or empty array
- Preserve original text language (Portuguese or English)
- Normalize dates to "MM/AAAA" format when possible
- LinkedIn PDFs may have formatting artifacts — clean them when obvious
</constraints>

<task>
Parse the provided LinkedIn profile text into this exact JSON schema:
</task>

<schema>
{
  "name": "full name",
  "headline": "LinkedIn headline (professional tagline below the name) or null",
  "location": "city/state/country or null",
  "about": "About section text or null",
  "experience": [
    {
      "company": "company name",
      "role": "job title",
      "startDate": "MM/AAAA",
      "endDate": "MM/AAAA or null if current",
      "location": "location or null",
      "description": "role description or null"
    }
  ],
  "education": [
    {
      "institution": "institution name",
      "degree": "degree type",
      "field": "field of study or null",
      "startDate": "AAAA or null",
      "endDate": "AAAA or null"
    }
  ],
  "skills": ["skill names"],
  "certifications": [
    {
      "name": "certification name",
      "issuer": "issuing organization or null",
      "date": "date or null"
    }
  ],
  "courses": [
    {
      "name": "course name",
      "institution": "institution or null"
    }
  ],
  "honors": ["honor or award descriptions"],
  "languages": [
    {
      "language": "language name",
      "level": "proficiency level or null"
    }
  ],
  "recommendations": ["recommendation text from others"],
  "volunteerWork": [
    {
      "organization": "organization name",
      "role": "role or null",
      "description": "description or null"
    }
  ]
}
</schema>"""
