"""Prompts for job data extraction via Flash-Lite."""

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


JOB_BATCH_EXTRACTION_PROMPT = """<task>
Extract structured fields from MULTIPLE job postings below.
Each job is separated by "---JOB---". Return a JSON ARRAY with one object per job, in order.
This is a fast extraction task — extract only the requested fields, do not analyze or reason.
</task>

<schema_per_job>
{
  "title": "exact job title",
  "company": "company name if mentioned, else null",
  "required_skills": ["mandatory skills — max 10"],
  "preferred_skills": ["nice-to-have — max 5"],
  "location": "city/state or 'Remoto'",
  "seniority": "junior | mid | senior | lead",
  "salary_range": "salary range if mentioned, else null",
  "work_mode": "remote | hybrid | onsite",
  "posted_date": "ISO date if detectable, else null",
  "categories": ["1-3 tags from the allowed list below"]
}
</schema_per_job>

<allowed_categories>
FUNCTION: tech, hr, finance, marketing, sales, operations, legal, engineering, healthcare, supply_chain, admin, customer_service, education, design
LEVEL: intern, entry, mid, senior, lead, manager, director, executive
</allowed_categories>

<constraints>
- Return a JSON ARRAY of objects, one per job, in the same order as input
- Extract only what is explicitly stated
- Keep skill names in original language
- Seniority: júnior/trainee → junior, pleno → mid, sênior → senior, gerente/coordenador/head → lead
- Work mode: remoto → remote, híbrido → hybrid, presencial → onsite. Default onsite.
- Categories: pick 1 FUNCTION tag + 1 LEVEL tag. Add a 3rd only if clearly applicable.
- Return valid JSON only — no markdown, no explanation
</constraints>"""
