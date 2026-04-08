# Fix Timeout Brittleness — Implementation Plan

## Problem

Users see "Failed to fetch" errors when using the app. The backend works correctly (returns 200) but responses take too long and the browser gives up before receiving them.

**Measured latencies (from Cloud Run logs):**
- `POST /api/resume/upload` — **238 seconds (4 minutes)**
- `POST /api/tailor/generate` — **60-91 seconds**
- `POST /api/linkedin/analyze` — **66 seconds**
- `POST /api/job/analyze` — **30-45 seconds**

The browser's default fetch timeout is ~60-300s depending on browser/platform. Mobile browsers and unstable connections timeout faster. When the browser times out, the user sees "Failed to fetch" — a cryptic network error with no retry option.

**User impact:** A new user (Cristiane) tried to upload her resume 3+ times, got errors each time, lost the upload button, and nearly gave up. She only succeeded after multiple retries.

## Root Causes

### 1. Frontend: No timeout, no progress feedback, no retry on network errors

**File:** `frontend/lib/api.ts`

- `fetch()` calls have no `AbortController` timeout — they rely on the browser's default, which varies
- No progress indicator for long operations — user sees nothing for 60+ seconds
- Retry logic only handles HTTP 503/429, not network errors ("Failed to fetch")
- Error message for network failures is the raw browser error, not a user-friendly message

### 2. Backend: Resume upload does too much work in one request

**File:** `backend/app/api/resume.py` (lines 24-129)

The upload endpoint does ALL of this synchronously in a single HTTP request:
1. Validate file (fast)
2. Parse PDF/DOCX text extraction (fast, ~1-2s)
3. `structure_resume()` — **Claude Sonnet AI call** (~30-60s)
4. Upload file to Cloud Storage (~2-5s)
5. Save profile to Firestore (~1-2s)
6. `merge_resume_into_knowledge()` — fire-and-forget async task (but still contributes to overall time)

Steps 3 is the bottleneck. Total: 30-60s for a normal run, up to 240s when Claude is slow or retrying.

### 3. Backend: Generate endpoint calls two AI models sequentially

**File:** `backend/app/api/tailor.py` (lines 25-104)

The generate endpoint does:
1. `rewrite_resume()` — **Claude Sonnet call** (~40-60s)
2. `generate_cover_letter()` — **Claude Sonnet call** (~20-30s)
3. Save to Firestore (~1-2s)

These two AI calls run **sequentially**, totaling 60-90s.

## Fix Strategy

Two layers: frontend resilience (quick win) + backend optimization (bigger impact).

---

## Part 1: Frontend Resilience (Quick Win)

### Changes to `frontend/lib/api.ts`

**1. Add 3-minute timeout with AbortController**

Every `fetch()` call should use an `AbortController` with a 180-second timeout. When it fires, show a user-friendly message instead of "Failed to fetch".

Add a helper method to the `ApiClient` class:

```typescript
private fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 180_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}
```

Replace all `fetch()` calls in `get()`, `post()`, `put()`, `patch()`, `upload()`, `delete()`, `getBlob()`, `postBlob()`, `postAudio()` with `this.fetchWithTimeout(...)`.

**2. Catch network errors and show friendly message**

In `retryWithBackoff()`, wrap the `fn()` call to catch `TypeError` (network error) and `AbortError` (timeout):

```typescript
try {
  response = await fn();
} catch (e) {
  if (e instanceof DOMException && e.name === 'AbortError') {
    throw new Error("A requisição demorou mais que o esperado. Tente novamente.");
  }
  if (e instanceof TypeError && e.message.includes('fetch')) {
    throw new Error("Erro de conexão. Verifique sua internet e tente novamente.");
  }
  throw e;
}
```

**3. Add retry on network errors (not just 503/429)**

After the existing 503/429 retry block in `retryWithBackoff()`, add a catch for `TypeError` (network failure) with 1 retry:

```typescript
// Retry once on network error (connection dropped, DNS failure)
if (!response) {
  await new Promise(r => setTimeout(r, 3000));
  response = await fn();
}
```

### Changes to long-running operation pages

**Files:**
- `frontend/app/(dashboard)/dashboard/job/page.tsx` — job analysis
- `frontend/app/(dashboard)/dashboard/perfil/page.tsx` or equivalent — resume upload
- Components that call `/api/tailor/generate`

For each page that triggers a long operation, the loading state should show an explicit message:

```tsx
{loading && (
  <p className="text-sm text-muted-foreground animate-pulse">
    Estamos processando... Isso pode levar até 2 minutos.
  </p>
)}
```

This is NOT a spinner-only loading state. The text must tell the user to wait.

---

## Part 2: Backend Optimization

### 2A. Run resume + cover letter generation in parallel

**File:** `backend/app/api/tailor.py` (lines 78-104)

Currently `rewrite_resume()` and `generate_cover_letter()` run sequentially. They're independent — run them in parallel with `asyncio.gather()`:

```python
# Before (sequential, 60-90s):
resume_content, changelog = await rewrite_resume(...)
cover_letter = await generate_cover_letter(...)

# After (parallel, 40-60s):
import asyncio

async def _rewrite():
    return await rewrite_resume(
        profile=structured_data,
        job_description=job_description,
        job_analysis=job_analysis,
        ats_keywords=ats_keywords,
        knowledge=knowledge,
        enrichment=enrichment,
    )

async def _cover_letter():
    try:
        return await generate_cover_letter(
            profile=structured_data,
            job_description=job_description,
            job_analysis=job_analysis,
        )
    except Exception as e:
        logger.error("tailor_cover_letter_error", uid=user.uid, error=str(e))
        return ""

(resume_result, cover_letter) = await asyncio.gather(_rewrite(), _cover_letter())
resume_content, changelog = resume_result
```

This cuts the generate endpoint from ~80s to ~50s (limited by the slower of the two calls).

### 2B. Make resume upload return faster

**File:** `backend/app/api/resume.py` (lines 24-129)

The upload endpoint should return immediately after parsing + basic validation, then process AI structuring in the background. The frontend polls for completion.

**New flow:**

1. **Upload endpoint** (fast, <5s): validate file → parse text → save raw profile with `status: "processing"` → return `profileId` + `status: "processing"`

2. **New polling endpoint** `GET /api/resume/status/{profile_id}`: returns `{ status: "processing" | "ready" | "error", profile?: {...} }`

3. **Background task**: `structure_resume()` runs as `asyncio.create_task()`. When done, updates the profile doc with structured data and sets `status: "ready"`.

**Implementation:**

In `backend/app/api/resume.py`, split the upload endpoint:

```python
@router.post("/upload", response_model=ProfileResponse)
async def upload_resume(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
):
    # ... existing validation (lines 30-82) ...
    
    # Parse resume text (fast, <2s)
    raw_text = await parse_resume(content, file.content_type)
    
    # Upload file to Cloud Storage
    fs = FirestoreService()
    file_url = await fs.upload_resume_file(user.uid, file.filename or "resume", content)
    
    # Save profile immediately with status "processing"
    profile_id = await fs.save_profile(
        uid=user.uid,
        raw_text=raw_text,
        structured_data={},  # Empty — will be filled by background task
        file_url=file_url,
        user_email=user.email or "",
        user_name=user.name or "",
        status="processing",
    )
    
    # Structure in background (AI call, ~30-60s)
    async def _process_in_background():
        try:
            profile_data = await structure_resume(raw_text)
            await fs.update_profile_structured(user.uid, profile_id, profile_data)
            await fs.increment_global_generation("resume_structuring", uid=user.uid)
            # Merge into knowledge
            from app.services.knowledge import merge_resume_into_knowledge
            await merge_resume_into_knowledge(user.uid, profile_data, profile_id)
            await fs.log_activity(user.uid, user.email or "", "upload")
        except Exception as e:
            logger.error("resume_bg_structure_error", uid=user.uid, error=str(e))
            await fs.update_profile_status(user.uid, profile_id, "error")
    
    asyncio.create_task(_process_in_background())
    
    return ProfileResponse(
        profileId=profile_id,
        profile={},
        status="processing",
    )


@router.get("/status/{profile_id}")
async def get_resume_status(
    profile_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Poll for resume processing status."""
    fs = FirestoreService()
    profile = await fs.get_profile(user.uid, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
    
    status = profile.get("status", "ready")
    if status == "ready" or status == "parsed":
        return {"status": "ready", "profile": profile.get("structuredData", {})}
    elif status == "error":
        return {"status": "error"}
    else:
        return {"status": "processing"}
```

**Note:** This requires two new Firestore helper methods:
- `update_profile_structured(uid, profile_id, data)` — sets structuredData + status="ready"
- `update_profile_status(uid, profile_id, status)` — sets status field

**Frontend changes** for the upload page:

After calling `POST /api/resume/upload`, if the response has `status: "processing"`:
1. Show a "Processing your resume..." message with a spinner
2. Poll `GET /api/resume/status/{profileId}` every 3 seconds
3. When status changes to "ready", update the UI with the profile data
4. If status is "error", show an error message with retry option

---

## Task Summary

| Task | Impact | Effort | Files |
|------|--------|--------|-------|
| 1. Frontend timeout + error messages | Stops "Failed to fetch" errors | Small | `frontend/lib/api.ts` |
| 2. Loading messages for long operations | User knows to wait | Small | Upload + generate pages |
| 3. Parallel resume + cover letter | Generate: 80s → 50s | Small | `backend/app/api/tailor.py` |
| 4. Async resume upload | Upload: 240s → 5s | Medium | `backend/app/api/resume.py`, `frontend/`, `backend/app/services/firestore.py` |

**Recommended order:** 1 → 3 → 2 → 4

Tasks 1 and 3 are quick wins that immediately improve the experience. Task 4 is the proper fix but requires frontend polling logic.

---

## Key Files Reference

| File | Role |
|------|------|
| `frontend/lib/api.ts` | API client — all fetch calls, retry logic, error handling |
| `backend/app/api/resume.py` | Resume upload endpoint (the 4-minute bottleneck) |
| `backend/app/api/tailor.py` | Resume + cover letter generation (60-90s sequential AI calls) |
| `backend/app/api/job.py` | Job analysis endpoint |
| `backend/app/api/linkedin.py` | LinkedIn analysis endpoint |
| `backend/app/services/gemini_ai.py` | All AI calls (Claude Sonnet + Gemini), timeout config |
| `backend/app/config.py` | Timeout settings (`generation_timeout: 90`) |
| `backend/app/services/firestore.py` | Firestore operations, profile CRUD |

## Backend Timeout Config

In `backend/app/config.py`:
- `default_timeout: 45` — general timeout
- `generation_timeout: 90` — Claude API timeout (httpx)
- Cloud Run request timeout: 300s (set in deploy.yml)

The Anthropic client in `gemini_ai.py` (line 60) uses `httpx.Timeout(settings.generation_timeout, connect=10.0)` with `max_retries=3`. So a single AI call can take up to 90s × retries = ~270s worst case.
