"""Prompts for resume rewriting/tailoring."""

RESUME_REWRITING_PROMPT = """<constraints>
- NEVER invent data: no fabricated experiences, skills, certifications, companies, or dates
- Use ONLY information from the candidate's structured_resume data
- If a required skill is NOT in the candidate data, do NOT add it
- All dates, company names, and job titles must come EXACTLY from candidate.structured_resume.experience and candidate.structured_resume.education
- If a date field is null or missing, simply omit the date — write only the company name and role. NEVER write placeholder text like "[Mês/Ano]", "[Data]", "[Período]", "[Month/Year]", or similar brackets
- If education, languages, or certifications arrays are empty or missing from the candidate data, do NOT include those sections at all
- Do NOT add sections that have no data in the candidate profile
</constraints>

<task>
Rewrite the candidate's resume tailored to the target job.

The input JSON has this structure:
- candidate.structured_resume: the parsed resume with name, email, phone, location, summary, experience[], education[], skills[], languages[], certifications[]
- candidate.structured_resume.experience[]: each entry has company, role, startDate (MM/AAAA format), endDate (MM/AAAA or null if current position), description
- candidate.structured_resume.education[]: each entry has institution, degree, field, startDate, endDate
- candidate.knowledge_supplements (optional): achievements, insights, additional_skills from other sources — use these to enrich bullet points but do NOT fabricate new experience entries from them
- job_description: the target job posting text
- job_analysis: parsed job requirements
- ats_keywords: important keywords to incorporate naturally
</task>

<language>
CRITICAL: Write the resume in the SAME LANGUAGE as the job_description.
- If the job posting is in English, write the entire resume in English (section headers, bullet points, summary — everything)
- If the job posting is in Portuguese, write in Portuguese Brazilian
- If the job posting is in another language, match that language
The candidate's profile data may be in a different language than the job posting — translate the content to match the job posting language.
</language>

<guidelines>
- Match tone and language to the job's seniority level
- Prioritize experiences and skills most relevant to the target job
- Rewrite experience descriptions using past-tense action verbs (e.g., led, implemented, developed, optimized — or liderou, implementou, desenvolveu, otimizou — depending on the target language)
- Include quantifiable metrics when they exist in the original data (numbers, percentages, team sizes)
- Naturally incorporate ATS keywords from the list where the candidate genuinely has that skill or experience
- Keep to 1-2 pages of content
</guidelines>

<format>
Output the resume in clean markdown following this exact structure (adapt section headers to the target language):

# [Candidate full name from structured_resume.name]

[email] | [phone] | [location] — only include fields that exist in the data

## Professional Summary (or "Resumo Profissional" in Portuguese)

2-3 sentences connecting the candidate's strongest experience to the target job requirements.

## Professional Experience (or "Experiência Profissional")

### [role] — [company]
[startDate] – [endDate or "Present"/"Atual"]

- Bullet point describing an achievement or responsibility, rewritten to highlight relevance to the target job
- Another bullet point with metrics if available

(Repeat for each experience entry, in reverse chronological order)

## Education (or "Formação Acadêmica")

### [degree] in [field] — [institution]
[startDate] – [endDate]

(Only include this section if education array is non-empty)

## Skills (or "Competências")

List of skills relevant to the target job, separated by " · "

## Languages (or "Idiomas")

- [language]: [level]

(Only include this section if languages array is non-empty)

## Certifications (or "Certificações")

- [certification name]

(Only include this section if certifications array is non-empty)

Use "- " for bullet lists. Use ### for sub-entries within sections. Keep markdown simple: headers, bold, bullets only. No tables, no horizontal rules.
</format>"""
