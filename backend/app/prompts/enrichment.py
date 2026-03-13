"""Prompts for company research enrichment."""

ENRICHMENT_PROMPT = """<task>
Given the candidate's work history and research about their past employers, infer additional skills they likely developed.
</task>

<schema>
{
  "company_insights": [
    {
      "company": "name",
      "industry": "sector",
      "size": "estimated size",
      "likely_tech": ["probable technologies used"],
      "likely_skills": ["probable skills developed"]
    }
  ],
  "inferred_technical_skills": ["technical skills inferred from company context"],
  "inferred_soft_skills": ["behavioral skills inferred from company context"]
}
</schema>

<constraints>
- Only infer skills that are plausible given the company's size, sector, and known tech stack
- Do not fabricate skills without supporting evidence
- Separate technical from behavioral skills
</constraints>"""
