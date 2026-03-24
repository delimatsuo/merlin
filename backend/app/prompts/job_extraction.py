"""Prompt for cheap job data extraction via Flash-Lite."""

JOB_EXTRACTION_PROMPT = """<task>
Extract structured fields from the job posting text below.
This is a fast extraction task — extract only the requested fields, do not analyze or reason.
</task>

<schema>
{
  "title": "exact job title",
  "company": "company name if mentioned, else null",
  "required_skills": ["mandatory skills/competencies — max 15"],
  "preferred_skills": ["nice-to-have skills — max 10"],
  "location": "city/state or 'Remoto'",
  "seniority": "junior | mid | senior | lead",
  "salary_range": "salary range if mentioned, else null",
  "work_mode": "remote | hybrid | onsite",
  "posted_date": "ISO date if detectable, else null"
}
</schema>

<constraints>
- Extract only what is explicitly stated in the text
- Keep skill names in their original language (do not translate)
- For seniority, map: júnior/trainee → junior, pleno/mid-level → mid, sênior/senior → senior, gerente/coordenador/líder/head → lead
- For work_mode, map: remoto/home office → remote, híbrido → hybrid, presencial → onsite. Default to onsite if not specified.
- Return valid JSON only
</constraints>"""
