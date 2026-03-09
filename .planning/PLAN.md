# Merlin — AI Resume Tailoring Platform for Brazilian Candidates

## Context

Brazilian job candidates face a highly competitive market where submitting a generic resume significantly reduces their chances of getting interviews. Tailoring a resume for each job opening is time-consuming and most candidates lack the skills to do it well. This project creates a web application where candidates upload their resume, interact with an AI via voice to enrich their profile, then submit a job description to receive a professionally tailored resume and cover letter optimized for ATS systems — all in Brazilian Portuguese.

**Project Name:** Merlin
**Language:** Brazilian Portuguese (pt-BR) for all UI and AI interactions
**Target Users:** Job candidates in Brazil seeking positions in Brazil

---

## Decisions Made

| Decision | Choice |
|----------|--------|
| Additional MVP feature | ATS Optimization |
| Voice interaction model | Google Gemini Live |
| Tech stack | Next.js (frontend) + Python FastAPI (backend) |
| Authentication | Google OAuth + Email/password |
| Company research | Web search at runtime |
| Resume templates | Single polished template |
| Monetization | Free for now, design for future freemium |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│            (React/TypeScript, Tailwind CSS)          │
│      UI in pt-BR · Responsive (mobile-first)        │
├─────────────────────────────────────────────────────┤
│  Auth        │  Dashboard    │  Voice Session        │
│  (NextAuth)  │  (Resume mgmt)│  (Gemini Live WS)    │
└──────┬───────┴──────┬────────┴──────┬────────────────┘
       │              │               │
       ▼              ▼               ▼
┌─────────────────────────────────────────────────────┐
│               Python FastAPI Backend                 │
├─────────────────────────────────────────────────────┤
│  /auth    │ /resume  │ /voice  │ /tailor  │ /export │
│           │ /parse   │ /session│ /analyze │ /docx   │
└─────┬─────┴────┬─────┴────┬────┴────┬─────┴────┬────┘
      │          │          │         │          │
      ▼          ▼          ▼         ▼          ▼
  PostgreSQL  Claude     Gemini    Brave      python-
  (Supabase)  Opus 4.6   Live     Search     docx
              API        API       API
```

---

## User Flow (Core MVP)

### Step 1: Cadastro e Login
- User signs up via Google OAuth or email/password
- Lands on dashboard ("Meu Painel")

### Step 2: Upload do Currículo
- Upload PDF/DOCX resume **OR** paste LinkedIn profile URL
- Backend parses resume → extracts structured data (name, experience, education, skills)
- Uses Claude Opus 4.6 to create a structured candidate profile

### Step 3: Pesquisa de Empresas (Background — Automatic)
- For each company in the candidate's history, run a web search (Brave Search API)
- Gather: company size, industry, key products/services, tech stack (if applicable)
- Claude Opus 4.6 infers likely skills developed at each role based on company context + job title

### Step 4: Entrevista por Voz (Voice Interview)
- Claude Opus 4.6 analyzes the parsed resume + company research
- Formulates up to 6 targeted questions to fill gaps and enrich the profile
- Questions are delivered via Google Gemini Live (voice-to-voice, pt-BR)
- Examples: "Você mencionou que trabalhou na TOTVS como dev sênior. Pode me contar sobre algum projeto onde você liderou a equipe?"
- Answers are transcribed and fed back to Claude to update the candidate profile

### Step 5: Upload da Vaga
- User pastes or uploads the job description
- Claude Opus 4.6 analyzes: required skills, preferred skills, company culture signals, seniority level

### Step 6: Análise de Compatibilidade + ATS Optimization
- Skills matrix: Required → Has / Likely Has / Missing
- ATS keyword analysis: identify critical terms from job description
- Score the match (percentage) and highlight gaps
- Display visual breakdown to the user

### Step 7: Reescrita do Currículo
- Claude Opus 4.6 rewrites the resume:
  - Tailored to the specific job description
  - Incorporates inferred skills (clearly marked as contextual, not fabricated)
  - ATS-optimized keywords naturally woven in
  - Brazilian resume format conventions (with photo option, personal data section)
  - **No fabricated data** — only inference from real experience
- User can review, request adjustments via chat
- Cover letter ("Carta de Apresentação") generated alongside

### Step 8: Exportação
- Generate .docx using the polished template
- Download resume + cover letter as separate files
- Option to preview before download

---

## Technical Stack Details

### Frontend — Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Auth:** NextAuth.js (Google provider + credentials provider)
- **State:** Zustand (lightweight, simple)
- **Voice UI:** WebSocket connection to backend → Gemini Live API
- **i18n:** All hardcoded in pt-BR (no i18n framework needed for MVP)
- **File upload:** react-dropzone
- **Rich text preview:** react-pdf for resume preview

### Backend — Python FastAPI
- **Python 3.12+**
- **Framework:** FastAPI with async support
- **AI — Resume Analysis & Rewriting:** Anthropic SDK (Claude Opus 4.6)
- **AI — Voice Interview:** Google Gemini Live API (multimodal voice)
- **Resume Parsing:** pypdf2 + python-docx for extraction, Claude for structuring
- **Company Research:** Brave Search API (web search at runtime)
- **Document Generation:** python-docx (Word output with template)
- **Database:** PostgreSQL via Supabase (hosted)
- **ORM:** SQLAlchemy + Alembic for migrations
- **File Storage:** Supabase Storage (for uploaded resumes)
- **WebSocket:** FastAPI WebSocket for voice session relay

### Database Schema (Core Tables)

```
users
  id, email, name, google_id, avatar_url, created_at

candidate_profiles
  id, user_id, raw_resume_text, structured_data (JSONB),
  voice_answers (JSONB), enriched_profile (JSONB), created_at, updated_at

company_research_cache
  id, company_name, research_data (JSONB), searched_at
  (cache to avoid re-searching the same company)

job_applications
  id, user_id, profile_id, job_description_text, job_analysis (JSONB),
  skills_matrix (JSONB), ats_score, created_at

tailored_resumes
  id, application_id, resume_content (JSONB), cover_letter_text,
  docx_file_url, version, created_at

voice_sessions
  id, profile_id, questions (JSONB), answers (JSONB),
  status (pending/in_progress/completed), created_at
```

### Voice Architecture (Gemini Live)

```
Browser (mic) ──WebSocket──► FastAPI ──► Gemini Live API
                                              │
Browser (speaker) ◄──WebSocket──◄─────────────┘
```

- Frontend captures audio via Web Audio API / MediaRecorder
- Streams to FastAPI WebSocket endpoint
- FastAPI relays to Gemini Live API session (pre-configured with pt-BR, the questions to ask, and conversation context)
- Gemini responds in voice → streamed back to browser
- Transcriptions saved to database for Claude to process

### ATS Optimization Logic
1. Extract all keywords/phrases from job description using Claude
2. Categorize: hard skills, soft skills, tools, certifications, industry terms
3. Match against candidate profile
4. For each required keyword not present: check if inferable from experience
5. Rewrite bullet points to naturally include high-priority keywords
6. Score: keyword coverage %, format compliance, section completeness

---

## Project Structure

```
Merlin/
├── frontend/                    # Next.js application
│   ├── app/
│   │   ├── (auth)/             # Login, signup pages
│   │   ├── (dashboard)/        # Main authenticated area
│   │   │   ├── page.tsx        # Dashboard home
│   │   │   ├── perfil/         # Profile/resume upload
│   │   │   ├── entrevista/     # Voice interview session
│   │   │   ├── vaga/           # Job description input
│   │   │   ├── analise/        # Fit analysis view
│   │   │   └── resultado/      # Final resume + download
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── voice/              # Voice session components
│   │   ├── resume/             # Resume preview/upload
│   │   └── analysis/           # Skills matrix, ATS score
│   ├── lib/
│   │   ├── api.ts              # Backend API client
│   │   ├── auth.ts             # NextAuth config
│   │   └── store.ts            # Zustand stores
│   ├── package.json
│   └── tailwind.config.ts
│
├── backend/                     # Python FastAPI
│   ├── app/
│   │   ├── main.py             # FastAPI app entry
│   │   ├── config.py           # Settings/env vars
│   │   ├── api/
│   │   │   ├── auth.py         # Auth endpoints
│   │   │   ├── resume.py       # Resume upload/parse
│   │   │   ├── voice.py        # Voice session WebSocket
│   │   │   ├── job.py          # Job description analysis
│   │   │   ├── tailor.py       # Resume tailoring
│   │   │   └── export.py       # DOCX generation
│   │   ├── services/
│   │   │   ├── claude.py       # Claude Opus 4.6 integration
│   │   │   ├── gemini.py       # Gemini Live voice
│   │   │   ├── search.py       # Brave Search for companies
│   │   │   ├── parser.py       # Resume parsing
│   │   │   ├── ats.py          # ATS analysis
│   │   │   └── docx_gen.py     # Word document generation
│   │   ├── models/
│   │   │   └── database.py     # SQLAlchemy models
│   │   ├── schemas/
│   │   │   └── api.py          # Pydantic schemas
│   │   └── prompts/
│   │       ├── profile.py      # Resume analysis prompts
│   │       ├── questions.py    # Voice interview question prompts
│   │       ├── tailor.py       # Resume rewriting prompts
│   │       ├── cover_letter.py # Cover letter prompts
│   │       └── ats.py          # ATS optimization prompts
│   ├── templates/
│   │   └── resume_template.docx  # Base Word template
│   ├── requirements.txt
│   └── alembic/                # DB migrations
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Implementation Phases

### Phase 1: Foundation (Scaffold + Auth + DB)
- Initialize Next.js and FastAPI projects
- Set up PostgreSQL/Supabase connection
- Implement Google OAuth + email auth
- Basic dashboard layout in pt-BR
- Docker Compose for local development

### Phase 2: Resume Upload & Parsing
- File upload UI (PDF/DOCX)
- Backend parsing pipeline (extract text → structure with Claude)
- LinkedIn URL parsing (optional — fetch public data)
- Display parsed profile for user review

### Phase 3: Company Research & Profile Enrichment
- Brave Search integration for company lookups
- Claude-based skill inference from company context
- Research caching to avoid duplicate searches
- Enriched profile display

### Phase 4: Voice Interview
- Gemini Live API integration
- WebSocket relay through FastAPI
- Voice session UI (microphone, visual feedback, transcript)
- Question generation with Claude → delivered by Gemini
- Answer processing and profile update

### Phase 5: Job Analysis & Resume Tailoring
- Job description input UI
- Claude-based job analysis (requirements extraction)
- Skills matrix and ATS scoring
- Resume rewriting with Claude Opus 4.6
- Cover letter generation
- Interactive review/adjustment chat

### Phase 6: Export & Polish
- python-docx template design
- DOCX generation (resume + cover letter)
- Download functionality
- End-to-end flow testing
- UI polish and responsive design

---

## Key Prompting Strategy

The quality of this product lives and dies by prompt engineering. Key principles:

1. **No fabrication** — All prompts explicitly instruct Claude to never invent facts. Skills are "inferred" or "likely" based on real data.
2. **Brazilian context** — Prompts include Brazilian resume conventions (photo, CPF mention, "objetivo profissional", etc.)
3. **ATS awareness** — Tailoring prompts include extracted keywords as constraints.
4. **Voice question quality** — Questions should be warm, conversational, and targeted at filling specific profile gaps.

---

## APIs & Services Required

| Service | Purpose | Pricing Model |
|---------|---------|---------------|
| Anthropic (Claude Opus 4.6) | Resume analysis, tailoring, cover letter | Per token |
| Google Gemini Live | Voice interview (pt-BR) | Per session/minute |
| Brave Search API | Company background research | Per query (free tier available) |
| Supabase | PostgreSQL + Auth + Storage | Free tier for MVP |
| Vercel | Next.js hosting | Free tier for MVP |

---

## Verification Plan

1. **Auth flow:** Register with Google → lands on dashboard → session persists
2. **Upload:** Upload a sample PDF resume → view parsed structured data
3. **Company research:** Verify Brave Search returns relevant data for Brazilian companies (TOTVS, Magazine Luiza, Nubank, etc.)
4. **Voice session:** Complete a full voice interview in Portuguese → verify transcript quality
5. **Tailoring:** Submit a real job description → verify tailored resume includes relevant keywords, no fabricated data
6. **ATS score:** Compare before/after ATS scores for same candidate + job
7. **Export:** Download .docx → open in Word/Google Docs → verify formatting
8. **Full E2E:** Complete entire flow from signup to download as a Brazilian candidate
