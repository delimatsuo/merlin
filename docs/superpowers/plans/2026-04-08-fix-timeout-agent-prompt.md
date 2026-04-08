# Agent Prompt: Fix Timeout Brittleness

## Your Mission

You are working on Merlin, an AI resume tailoring platform for Brazilian candidates. Users are experiencing "Failed to fetch" errors because backend AI calls take 60-240 seconds and the browser times out before getting a response. The backend actually succeeds (returns 200) but the client disconnects.

Your job is to implement the fixes described in the plan at `docs/superpowers/plans/2026-04-08-fix-timeout-brittleness.md`. Read it first — it has full context, file paths, code snippets, and measured latencies.

## Project Context

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind v4 at `frontend/`
- **Backend**: Python 3.12 FastAPI at `backend/`
- **AI calls**: Claude Sonnet 4.6 via Anthropic SDK (30-90s per call)
- **Deploy**: Push to `staging` branch triggers GitHub Actions → Firebase Hosting + Cloud Run
- **All UI text**: Portuguese (pt-BR)

## The Problem

Real user report: Cristiane tried uploading her resume 3+ times, got "Failed to fetch" each time, upload button disappeared, nearly gave up. The backend finished processing (200 OK in logs) but took 238 seconds — her browser timed out.

Measured latencies from Cloud Run production logs:
- `POST /api/resume/upload` — 238 seconds (parses PDF + structures with Claude)
- `POST /api/tailor/generate` — 60-91 seconds (rewrites resume + generates cover letter with Claude, sequentially)
- `POST /api/linkedin/analyze` — 66 seconds (Claude analysis)

## Tasks (in order)

### Task 1: Frontend timeout + friendly error messages
**File:** `frontend/lib/api.ts`

- Add `AbortController` with 180-second timeout to all `fetch()` calls
- Catch `AbortError` → "A requisição demorou mais que o esperado. Tente novamente."
- Catch `TypeError` (network) → "Erro de conexão. Verifique sua internet e tente novamente."
- The plan has exact code snippets for the `fetchWithTimeout` helper and error handling

### Task 2: Parallel AI calls in generate endpoint
**File:** `backend/app/api/tailor.py` (lines 78-104)

- `rewrite_resume()` and `generate_cover_letter()` currently run sequentially (80s total)
- They're independent — run with `asyncio.gather()` (cuts to ~50s)
- The plan has the exact before/after code

### Task 3: Loading messages for long operations
**Files:** Pages that trigger long operations (upload, generate, analyze)

- Replace spinner-only loading with text: "Estamos processando... Isso pode levar até 2 minutos."
- The user needs to know the system is working, not frozen

### Task 4: Async resume upload with polling
**Files:** `backend/app/api/resume.py`, `backend/app/services/firestore.py`, upload page frontend

- Upload endpoint should return in <5s (parse text + save with status="processing")
- AI structuring runs in background via `asyncio.create_task()`
- New `GET /api/resume/status/{profile_id}` endpoint for polling
- Frontend polls every 3s until status is "ready"
- The plan has complete code for the new endpoint and background task

## How to Work

1. Read the full plan at `docs/superpowers/plans/2026-04-08-fix-timeout-brittleness.md`
2. Work on tasks in order (1 → 2 → 3 → 4)
3. After each task: verify TypeScript compiles (`cd frontend && npx tsc --noEmit`), verify Python loads (`cd backend && source venv/bin/activate && python -c "from app.main import app; print('OK')"`)
4. Commit after each task with a descriptive message
5. Push to `staging` branch when done

## Important Notes

- Do NOT hardcode API keys or secrets. Credentials are in GCP Secret Manager.
- All user-facing text must be in pt-BR (Portuguese).
- The backend venv is at `backend/venv/` (Python 3.12 at `/opt/homebrew/bin/python3.12`)
- Run frontend build check: `cd frontend && npm run build`
- The `save_profile()` method in `backend/app/services/firestore.py` may need a `status` parameter added for Task 4. Check the current signature before modifying.
