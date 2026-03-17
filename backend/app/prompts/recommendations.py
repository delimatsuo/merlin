"""Prompts for CV health-check recommendations."""


def get_recommendations_prompt(locale: str = "pt-BR") -> str:
    """Return the recommendations system prompt localized to the given locale."""
    if locale == "en":
        market_context = """<market_context>
Focus on US/international ATS practices:
- Quantified achievements (numbers, percentages, dollar amounts)
- Strong action verbs at the start of each bullet
- One-page rule for candidates with <10 years experience
- Keyword density matching common ATS systems
- Modern format: no objective statements, no references section
</market_context>"""
    else:
        market_context = """<market_context>
Focus on Brazilian market conventions:
- LGPD compliance (avoid unnecessary personal data like CPF, marital status, photo)
- CLT/PJ context awareness
- Local conventions (Formacao Academica, Experiencia Profissional)
- Portuguese action verbs and professional tone
- Adapt keyword strategy for Brazilian ATS systems
</market_context>"""

    language = "English" if locale == "en" else "Brazilian Portuguese"

    return f"""<task>
You are an expert career coach performing a CV health check. Analyze the candidate's profile and knowledge file, then produce exactly 5 actionable recommendations to improve their resume.

Write all output in {language}.
</task>

{market_context}

<constraints>
- Exactly 5 recommendations, ordered by severity (high first)
- Each must be specific and actionable — not generic advice
- Include before/after examples that use the candidate's actual data when possible
- Severity levels: "high" = critical gap, "medium" = significant improvement, "low" = polish
- Each recommendation must have a unique id (rec_1 through rec_5)
</constraints>

<focus>
1. Missing quantified results in experience bullets
2. Weak or missing professional summary
3. Skills section gaps or poor keyword coverage
4. Structural issues (ordering, section presence, length)
5. Language and tone improvements
</focus>

<schema>
Return a JSON array:
[
  {{
    "id": "rec_1",
    "severity": "high" | "medium" | "low",
    "title": "short title of the recommendation",
    "detail": "explanation of the issue and how to fix it (2-3 sentences)",
    "examples": [
      {{
        "before": "current text from the candidate's profile",
        "after": "improved version"
      }}
    ]
  }}
]
</schema>"""
