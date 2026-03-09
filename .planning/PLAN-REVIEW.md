# Plan Review Report

**Plan**: `.planning/PLAN.md`
**Review Date**: 2026-03-09
**Reviewers**: Staff Engineer, Security Analyst, Architect
**Debate Rounds**: 1
**Final Verdict**: NEEDS_REVISION

---

## Executive Summary

The Merlin plan has a sound product concept, a logical user flow, and reasonable technology choices. However, it describes only the happy path and is missing critical sections on authentication architecture, cost controls, error handling, LGPD compliance, file upload security, prompt injection mitigation, and voice session resilience. All seven gaps are addressable without rearchitecting — they are missing plan sections, not wrong decisions. The plan needs one revision pass before implementation.

## Verdict Breakdown

| Reviewer | Verdict | Critical | Warnings | Nits |
|----------|---------|----------|----------|------|
| Staff Engineer | REQUEST CHANGES | 6 | 8 | 6 |
| Security Analyst | REQUEST CHANGES | 5 | 7 | 5 |
| Architect | REQUEST CHANGES | 3 | 6 | 5 |

## Critical Findings (Must Fix)

### CF-1: No Authentication Architecture [Unanimous — 3/3]

**Location:** Architecture Overview, Phase 1, Database Schema
**Issue:** Three auth systems named (NextAuth, Supabase Auth, FastAPI `/auth`) with no designated source of truth. No token format, no inter-service auth flow, no WebSocket auth protocol.
**Risk:** Session drift, token validation bypass, every endpoint effectively unprotected without a clear auth contract.
**Required Amendment:** Define a single auth authority. Recommended: NextAuth issues JWTs → FastAPI validates them. WebSocket auth via token-in-first-message. Supabase used as database only.
**Blast Radius:** critical

### CF-2: No Cost Controls or Model Tiering [2/3 explicit, 1/3 implicit]

**Location:** All Claude/Gemini API calls (Steps 2-8), APIs & Services
**Issue:** Claude Opus 4.6 used for every AI step (8-12 calls per user flow). No per-user budget, no circuit breakers, no consideration of cheaper models for simpler tasks. Single flow estimated at $2-5+. Free product with no cost ceiling.
**Risk:** Runaway API costs. A single viral day or abusive bot could produce a five-figure bill.
**Required Amendment:** (a) Tier models: Opus for resume rewriting/cover letter, Sonnet for analysis/extraction, Haiku for keyword matching. (b) Per-user daily token budget tracked in DB. (c) Circuit breakers on all API calls with cost thresholds.
**Blast Radius:** critical

### CF-3: No Error Handling or Recovery Strategy [2/3 explicit]

**Location:** Entire plan — only happy path described
**Issue:** Five chained external APIs with no mention of timeouts, retries, backoff, partial state recovery, or user-facing error states. Voice session drop = all progress lost.
**Risk:** Users see blank screens, lose work, get stuck in unrecoverable states.
**Required Amendment:** For each external API call: define timeout, retry count (with exponential backoff), fallback behavior, and user-facing error state. For voice sessions: checkpoint transcripts incrementally, define reconnection protocol. Support partial completion (e.g., skip company research if Brave is down).
**Blast Radius:** critical

### CF-4: No LGPD Compliance or PII Protection [2/3 explicit, 1/3 implicit]

**Location:** Database Schema, entire data flow
**Issue:** Platform collects CPF, full names, photos, work history, voice recordings — all personal data under Brazil's LGPD. No encryption at rest, no data retention policy, no consent workflow, no right-to-deletion mechanism. Raw PII stored in plain JSONB columns.
**Risk:** LGPD violations carry fines up to 2% of revenue. A breach exposes a curated identity theft dataset. Legal non-compliance for the target market.
**Required Amendment:** Add LGPD compliance section: (a) consent collection UI, (b) encryption at rest for PII, (c) data retention policy with automatic purging, (d) right-to-deletion endpoint, (e) privacy policy page, (f) document what data is sent to third-party APIs.
**Blast Radius:** critical

### CF-5: File Upload Security — RCE Vector [1/3 explicit, but objectively critical]

**Location:** Phase 2, Resume Parsing (pypdf2 + python-docx)
**Issue:** PDF/DOCX uploads parsed with no file type validation (magic bytes), no size limits, no sandboxing, no XXE protection for DOCX XML, using deprecated pypdf2 library with known CVEs.
**Risk:** Crafted PDF/DOCX achieves RCE on backend → full API key exfiltration, database dump, lateral movement to all services.
**Required Amendment:** (a) Validate by magic bytes, not extension. (b) Max file size 10MB. (c) Parse in sandboxed subprocess. (d) Replace pypdf2 with pypdf or pdfplumber. (e) Disable external entities in DOCX XML parsing. (f) Scan for zip bombs.
**Blast Radius:** critical

### CF-6: Prompt Injection via User Content [1/3 explicit, but critical for resume product]

**Location:** All prompt templates (prompts/ directory), Steps 2-7
**Issue:** User-supplied resume text, job descriptions, and voice transcriptions fed into Claude prompts with no sanitization. Attacker can craft input to exfiltrate system prompts, manipulate output (fabricating credentials), or leak other users' data.
**Risk:** Fabricated credentials in resumes (defeating the "no fabrication" principle), prompt leakage to competitors, data exfiltration. In a resume context, fabrication is the most dangerous outcome.
**Required Amendment:** (a) Strict system/user/assistant message separation — never interpolate user content into system prompts. (b) Output validation: verify all skills/credentials in tailored resume exist in original profile. (c) Input content filtering. (d) Document prompt architecture.
**Blast Radius:** high

### CF-7: Voice Session Architecture — Three Compounding Problems [Unanimous — 3/3]

**Location:** Voice Architecture, Step 4, Phase 4
**Issue:** Three unresolved problems compound:
1. **Orchestration gap:** No spec for how Claude's questions enter the Gemini session. Gemini has its own LLM and can deviate from the script.
2. **No WebSocket auth:** No token on WS upgrade, no session timeout, no per-user limit. Open proxy to Gemini API.
3. **Scaling SPOF:** Each session holds 2 WS connections on the server. Server restart kills all sessions. No horizontal scaling path.
**Risk:** Incoherent interviews (Gemini goes off-script), API cost abuse (unauthenticated WS), and service outages (server restart kills voice sessions).
**Required Amendment:** (a) Define Claude→Gemini handoff protocol (system prompt injection with guardrails). (b) JWT validation on WS upgrade. (c) Session timeout (10 min), per-user limit (1 concurrent). (d) Transcript checkpoint recovery. (e) Document scaling approach.
**Blast Radius:** critical

## Warning Findings (Should Fix)

### WF-1: LinkedIn Parsing — Legal and SSRF Risk [2/3]
**Location:** Step 2, Phase 2
**Issue:** LinkedIn actively blocks scraping and has sued companies. Server-side URL fetching enables SSRF.
**Suggested Amendment:** Remove from MVP or restrict to user-pasted text only. No server-side URL fetching.
**Blast Radius:** medium

### WF-2: JSONB Columns Without Validation or Indexing [2/3]
**Location:** Database Schema — 5 of 6 tables use JSONB for core data
**Issue:** No JSON schema validation, no documented access patterns, no GIN indexes.
**Suggested Amendment:** Define Pydantic models for each JSONB column. Validate on write. Add GIN indexes for queried fields.
**Blast Radius:** medium

### WF-3: No Deployment Strategy for Backend [1/3, but obvious gap]
**Location:** Entire plan
**Issue:** Plan lists Vercel for Next.js but never specifies where FastAPI runs. Vercel cannot host Python WebSocket servers.
**Suggested Amendment:** Specify backend hosting (Cloud Run, Railway, Fly.io, etc.). Address WebSocket support.
**Blast Radius:** medium

### WF-4: No Background Job Infrastructure [1/3]
**Location:** Architecture Overview
**Issue:** Company research (N API calls) and AI-heavy operations are too slow for synchronous HTTP. No task queue mentioned.
**Suggested Amendment:** Add ARQ or Celery for async processing. Return job IDs, notify on completion.
**Blast Radius:** medium

### WF-5: No Observability / Logging / Monitoring [3/3]
**Location:** Entire plan
**Issue:** No structured logging, error tracking, API cost monitoring, or alerting.
**Suggested Amendment:** Add observability section: structlog, Sentry, API cost tracking per user, health check endpoints.
**Blast Radius:** medium

### WF-6: No Security Headers or CORS [2/3]
**Location:** Frontend + Backend architecture
**Issue:** No CORS policy, CSP, HSTS, X-Frame-Options, or X-Content-Type-Options.
**Suggested Amendment:** Add security headers section for both services.
**Blast Radius:** medium

### WF-7: Phase Ordering — Voice Risk is Phase 4 [1/3]
**Location:** Implementation Phases
**Issue:** Voice (highest risk, most novel component) is Phase 4. If it fails, Phases 1-3 may need rework.
**Suggested Amendment:** Run a voice feasibility spike in Phase 1 to validate Gemini Live + pt-BR before building CRUD.
**Blast Radius:** medium

### WF-8: Interactive Chat Feature Underspecified [2/3]
**Location:** Step 7 — "request adjustments via chat"
**Issue:** Single bullet point describes what could be a multi-week feature. No scope, context window, message limit, or cost implications.
**Suggested Amendment:** Scope to "regenerate with instructions" text box for MVP, or break out as Phase 7.
**Blast Radius:** medium

### WF-9: Secret Management [1/3]
**Location:** Entire plan, `.env.example`
**Issue:** 5+ API keys with no vault, rotation, or environment-specific scoping.
**Suggested Amendment:** Document secret management approach for production. Add `.env` to `.gitignore` from first commit.
**Blast Radius:** medium

### WF-10: Supabase Storage Access Control [1/3]
**Location:** File storage, `tailored_resumes.docx_file_url`
**Issue:** No specification of whether storage buckets are public/private, whether URLs are signed/expiring.
**Suggested Amendment:** Private buckets, signed URLs with short TTL, user ownership validation.
**Blast Radius:** high

### WF-11: Company Research — Slow and Unbounded [1/3]
**Location:** Step 3
**Issue:** N Brave Search + N Claude calls where N is user-controlled (number of past employers). Senior candidates could trigger 12+ searches.
**Suggested Amendment:** Cap at 5 most recent companies. Run as background job. Add cache TTL.
**Blast Radius:** medium

## Nit Findings (Optional)

| # | Finding | Location | Fix |
|---|---------|----------|-----|
| NF-1 | pypdf2 is deprecated | Tech Stack | Replace with `pypdf` or `pdfplumber` |
| NF-2 | No resume version history | DB Schema | Add version tracking to `candidate_profiles` |
| NF-3 | Mixed Portuguese/English naming | Project Structure | Establish and document naming convention |
| NF-4 | Single DOCX template | Phase 6 | Design template as parameter, not hardcoded |
| NF-5 | No automated testing strategy | Verification Plan | Add unit/integration/contract tests to plan |
| NF-6 | `.env.example` variables not listed | Project Structure | Enumerate all required env vars |
| NF-7 | No mobile voice UI considerations | Voice Architecture | Test Safari iOS WebSocket/Web Audio constraints |
| NF-8 | No dependency pinning strategy | requirements.txt, package.json | Pin versions, use lock files, add Dependabot |
| NF-9 | No Docker security baseline | docker-compose.yml | Non-root users, minimal images, no hardcoded secrets |
| NF-10 | No abuse prevention for free tier | Monetization decision | CAPTCHA, email verification, daily limits |

## Required Plan Amendments

1. **Add "Authentication Architecture" section** — Single auth authority, token format, inter-service flow, WebSocket auth
2. **Add "Cost Controls & Model Tiering" section** — Per-user budgets, model selection per task, circuit breakers
3. **Add "Resilience & Error Handling" section** — Timeouts, retries, fallbacks, partial completion, voice recovery
4. **Add "LGPD Compliance & Data Privacy" section** — Consent, encryption, retention, deletion, privacy policy
5. **Add "File Upload Security" section** — Validation, sandboxing, library replacement, XXE protection
6. **Add "Prompt Security" section** — Message separation, output validation, content filtering
7. **Redesign "Voice Architecture" section** — Orchestration protocol, WS auth, scaling, recovery, session limits

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Runaway API costs | high | critical | Per-user budgets, model tiering, circuit breakers |
| Voice session failure mid-interview | high | high | Transcript checkpoints, reconnection, fallback to text |
| PII data breach | medium | critical | Encryption at rest, RLS, signed URLs, secret management |
| Prompt injection / fabrication | medium | high | Message separation, output validation, content filtering |
| File upload RCE | low | critical | Sandboxed parsing, file validation, library update |
| LGPD non-compliance | high | high | Consent flow, retention policy, deletion endpoint |
| Auth bypass between services | medium | critical | Single auth authority, JWT validation middleware |
| Gemini goes off-script in voice | high | medium | Constrained system prompt, topic guardrails, session monitoring |
| Backend WebSocket bottleneck | medium | medium | Dedicated voice service, connection limits, scaling plan |

## Resolved Disagreements

| Issue | Staff Engineer | Security Analyst | Architect | Resolution |
|-------|---------------|-----------------|-----------|------------|
| LinkedIn parsing severity | CRITICAL | WARNING | WARNING | **WARNING** — Plan marks it optional. Simple to remove from MVP scope. |
| Secret management severity | Not flagged | CRITICAL | Not flagged | **HIGH WARNING** — Important but standard operational practice. Not architecturally blocking. |
| LGPD severity | WARNING (under DB) | CRITICAL | NIT | **CRITICAL** — Legally required for Brazilian PII-handling app. Architect under-rated. |

## Gap Analysis — Issues All Reviewers Missed

1. **No accessibility (a11y)**: Voice-centric feature excludes deaf users. No alternative text-based interview flow. Brazilian Lei Brasileira de Inclusão applies.
2. **No concurrency model**: Two browser tabs = two simultaneous tailoring flows on same profile. No optimistic locking or mutex.
3. **No API versioning/contract**: Frontend and backend are separate deployments with no documented contract or backward compatibility policy.
4. **No abuse prevention beyond rate limiting**: Free platform could be used for resume fraud at scale, even with "no fabrication" prompt.
5. **No offline/poor-connectivity handling**: Brazilian internet varies by region. Voice over WebSocket is bandwidth-intensive. No graceful degradation.
6. **No testing strategy**: Manual verification plan only. System with 5 external APIs needs automated testing in the plan.

## Reviewer Sign-Off

- [ ] Staff Engineer: CHANGES REQUESTED (7 critical findings)
- [ ] Security Analyst: CHANGES REQUESTED (5 critical findings)
- [ ] Architect: CHANGES REQUESTED (3 critical findings)
