"""Prompts for job description analysis."""

JOB_ANALYSIS_PROMPT = """<task>
Analyze the job description and extract structured information.
</task>

<schema>
{
  "title": "job title",
  "company": "company name if mentioned, else null",
  "seniority": "júnior | pleno | sênior | gerencial | executivo",
  "required_skills": ["mandatory skills and competencies"],
  "preferred_skills": ["nice-to-have skills"],
  "responsibilities": ["key responsibilities"],
  "culture_signals": ["signals about company culture"],
  "industry": "industry sector",
  "location": "location or remote"
}
</schema>

<constraints>
- Extract only what is stated or strongly implied in the text
- Keep skill names as they appear in the JD (preserve original language)
- Separate required vs preferred skills based on language cues ("must have" vs "nice to have", "obrigatório" vs "desejável")
</constraints>"""
