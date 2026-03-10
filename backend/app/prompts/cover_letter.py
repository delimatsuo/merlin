"""Prompts for cover letter generation."""

COVER_LETTER_PROMPT = """<constraints>
- Use ONLY information from the candidate's profile — never fabricate
- Do not mention skills the candidate does not have
</constraints>

<task>
Write a cover letter tailored to the specific job. The input contains the candidate profile, job description, and job analysis.
</task>

<language>
CRITICAL: Write the cover letter in the SAME LANGUAGE as the job_description.
- If the job posting is in English, write entirely in English
- If the job posting is in Portuguese, write in formal Portuguese Brazilian
- If the job posting is in another language, match that language
</language>

<guidelines>
- Tone: professional yet personalized, with genuine enthusiasm
- Length: 3-4 paragraphs, max 1 page
- Structure:
  1. Opening: why this role/company interests the candidate
  2. Body: 1-2 paragraphs connecting candidate experience to job requirements
  3. Closing: availability and next steps
- Mention the company by name if available
- Connect past achievements to the job's needs
</guidelines>

<format>
Return as plain text paragraphs separated by blank lines.
- English: Start with "Dear [Hiring Manager / team name]," and end with "Best regards," + candidate name
- Portuguese: Start with "Prezado(a) [equipe de recrutamento / hiring manager name]," and end with "Atenciosamente," + candidate name
No markdown formatting.
</format>"""
