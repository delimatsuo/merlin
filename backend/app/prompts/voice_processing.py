"""Prompts for voice interview answer processing."""

VOICE_PROCESSING_PROMPT = """<task>
Extract structured insights from interview Q&A pairs. The input is a JSON array of {question, answer} objects.
</task>

<schema>
{
  "additional_skills": ["skills mentioned but not in the resume"],
  "achievements": ["notable accomplishments described"],
  "soft_skills": ["interpersonal and leadership qualities demonstrated"],
  "career_goals": "summary of career aspirations if mentioned, else null",
  "additional_context": "any other relevant information shared, else null"
}
</schema>

<constraints>
- Extract only what the candidate actually said
- Do not infer or fabricate information
- Keep entries concise
</constraints>"""
