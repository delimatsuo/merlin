# Gupy AutoApply Extension — Handover

**Last updated**: 2026-04-24
**Last commit on `staging`**: `2c8154ca` — fix(extension): remove unused scripting + activeTab permissions

Read this first. It tells you where we are, what's pending, what to read next, and what to do when the Web Store verdict lands.

---

## Current state (TL;DR)

- **Extension v1.0.1 is under review** at the Chrome Web Store. Submitted 2026-04-24 after v1.0.0 was rejected.
- All runtime config (OAuth, Firebase, CORS) is verified and working — the extension is ready to sign users in as soon as Google approves.
- Code, store listing, and submission pre-flights are done. There is **nothing to implement** while waiting.

## Ongoing situation

### Web Store submission
| Version | Date | Outcome |
|---|---|---|
| 1.0.0 | 2026-04-23 | ❌ Rejected — "Purple Potassium" violation, Routing ID `FZSL`. Requested `scripting` permission but never called `chrome.scripting.*`. |
| 1.0.1 | 2026-04-24 | ⏳ Awaiting review. Removed `scripting` AND `activeTab` (audit confirmed neither used — content scripts run via pre-declared `matches` + `host_permissions`). |

Reviewer notes submitted with v1.0.1 explicitly point at the FZSL routing ID and describe the fix.

Expected turnaround: 1–3 business days.

### What the verdict email looks like
- Sender: `Chrome Web Store Developer Support` (noreply@google.com)
- Subject contains "Gupy AutoApply" and either "Published" or "Rejected"
- Full item in the Dev Console too: https://chrome.google.com/webstore/devconsole → Gupy AutoApply → Build → Status

---

## Read these next (in order)

1. **`extension/STORE_LISTING.md`** — Web Store submission cheat sheet. Header now contains submission history and verified pre-flight config. Field-by-field paste blocks for the Dev Console.
2. **`extension/QA_CHECKLIST.md`** — Manual QA runbook for post-approval verification with a real Google account in a fresh Chrome profile.
3. **`extension/manifest.json`** — current permissions: `tabs`, `storage`, `identity`, `alarms` (nothing else).
4. **Auto-memory `project_gupy_autoapply.md`** — persistent project context, loaded automatically via `MEMORY.md`.

---

## Pending issues

### 1. ⏳ Web Store review in progress
Nothing to do. Wait for the email.

### 2. 🟡 Privacy policy URL on the listing points to `staging.merlincv.com/privacy`
This is intentional — production `merlincv.com/privacy` doesn't have Section 14 (extension disclosures) yet because the content lives on the `staging` branch and we can't promote to `main` until the extension is approved (the install banner + batch-apply flow would otherwise point users at a not-yet-public extension).

**Action when approved**: merge `staging` → `main`, then edit the Privacy URL field in the Web Store dashboard to `https://merlincv.com/privacy`.

### 3. 🟡 Two extension IDs in circulation
- Dev unpacked: `pckpedgciidgclkelofcicgaeelcicea` (from `key` field in `manifest.json`)
- Published: `gpnbdjkdalnalehhfajgapalhlogbbbd` (Google-assigned)

Both are currently allowlisted in OAuth + Firebase + Cloud Run CORS. Once approved, copy Google's public key from the Web Store Dev Console → Package tab → replace `manifest.json`'s `key` field so local dev installs get the same ID as published. See `STORE_LISTING.md` section "4. (Optional, recommended) sync local dev to published ID" for exact steps.

### 4. 🟢 Stale ancillary files in repo root (not blocking)
Untracked: `.playwright-mcp/`, `candidaturas-filled.png`, `dashboard-preview.png`, `email-preview-*.html`, `login-clean-state.png`. Leftover from ad-hoc screenshots/testing. Safe to ignore or gitignore.

---

## Verified pre-flight config

All three were verified programmatically on 2026-04-24. **Do not change unless the verdict is a rejection that specifically flags one of these**.

| # | Item | Value | How to re-verify |
|---|---|---|---|
| 1 | OAuth redirect URI | `https://gpnbdjkdalnalehhfajgapalhlogbbbd.chromiumapp.org` — NO trailing slash (code at `src/background/service-worker.ts:40` emits without slash, must match exactly) | `curl` probe of `accounts.google.com/o/oauth2/v2/auth` (see session log for exact command) |
| 2 | Firebase authorized domain | `gpnbdjkdalnalehhfajgapalhlogbbbd.chromiumapp.org` present in project `merlin-489714` | `curl -H "x-goog-user-project: merlin-489714" https://identitytoolkit.googleapis.com/admin/v2/projects/merlin-489714/config` with access token |
| 3 | Cloud Run env | `CHROME_EXTENSION_ORIGIN=chrome-extension://pckpedgciidgclkelofcicgaeelcicea,chrome-extension://gpnbdjkdalnalehhfajgapalhlogbbbd` on `merlin-backend` in `southamerica-east1` | `gcloud run services describe merlin-backend --region=southamerica-east1 --project=merlin-489714 --account=deli@ellaexecutivesearch.com --format="value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].value)"` |

**Gotcha that already bit us once**: Google OAuth does exact-string matching on `redirect_uri`. A trailing slash in the Cloud Console entry does NOT normalize to match a code-emitted URI without slash. If sign-in ever fails with `redirect_uri_mismatch`, check this first.

---

## What to do when the verdict arrives

### ✅ If APPROVED

1. Test install from the store in a fresh Chrome profile → run `extension/QA_CHECKLIST.md`.
2. Merge `staging` → `main` (this deploys frontend with install banner + Section 14 of privacy policy).
3. In Web Store Dev Console → Privacy tab → change Privacy URL from `https://staging.merlincv.com/privacy` → `https://merlincv.com/privacy`. Save.
4. (Recommended) Copy Google's public key from Dev Console → Package tab → replace `manifest.json`'s `key` field → commit. Local dev installs will now share the published extension ID. Can defer.
5. Announce internally. Update `project_gupy_autoapply.md` memory: status → "published".

### ❌ If REJECTED AGAIN

1. Read the rejection email carefully — get the violation reference ID and Routing ID.
2. **Do not auto-trust the reviewer.** The v1.0.0 rejection was correct; future ones may not be. Audit the claim against the code before changing anything.
3. If legitimate:
   - Make the minimal fix
   - Bump `package.json` version (currently 1.0.1 — next would be 1.0.2)
   - `cd extension && npm run build:store`
   - Upload new ZIP to Dev Console
   - Update `STORE_LISTING.md` submission history
   - Resubmit with a note referencing the prior Routing ID
4. If the rejection is mistaken and you can argue it:
   - Use the **Appeal** button in the Dev Console (do not open a new submission)
   - Appeal text should quote code/audit evidence, not rhetoric

---

## Build & test commands

```bash
# From repo root
cd extension

# Dev build (local unpacked)
npm run build

# Store-ready ZIP (bumps from package.json version, strips localhost, drops key)
npm run build:store
# Output: build-store/merlin-autoapply-vX.Y.Z.zip
```

Where to load the unpacked dev build:
- `chrome://extensions/` → Developer mode → Load unpacked → `extension/build-store/staging/`

---

## Key files

| File | What it is |
|---|---|
| `extension/manifest.json` | Source-of-truth permissions. Only `tabs`, `storage`, `identity`, `alarms`. |
| `extension/package.json` | `version` drives the store ZIP filename and the `version` field in the produced manifest. |
| `extension/src/background/service-worker.ts` | OAuth + Firebase token exchange + session lock + tab queue. Auth redirect URI built at line 40. |
| `extension/src/background/queue.ts` | Parallel-tab queue (max 4 concurrent), polled via `chrome.alarms` every 90s. |
| `extension/src/content/state-machine.ts` | Gupy form automation — field matching, custom question answering, modal detection. |
| `extension/src/content/field-matcher.ts` | 3-tier PII matching (client-side only, never sent to backend). |
| `extension/src/popup/popup.ts` | Popup UI — login, PII form, status. |
| `extension/scripts/build-store.sh` | Store-build pipeline. Reads `package.json` version. |
| `backend/app/api/autoapply.py` | 5 backend endpoints (at `/api/autoapply/*`) for the extension. |
| `backend/app/services/gemini_ai.py` | `match_form_fields()` + `answer_custom_question()`. |

---

## Environment reminders

- **gcloud account**: must be `deli@ellaexecutivesearch.com` (NOT `delimatsuo@gmail.com`). Verify with `gcloud config get-value account` before any GCP commands.
- **GCP project**: `merlin-489714`
- **Region**: `southamerica-east1`
- **Firebase API Key** (public, Browser key): `AIzaSyAPhPf4qzo94WplQwQl9gbjauBbFOi7J3w`
- **Secrets** live in GCP Secret Manager: `ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, `GEMINI_API_KEY`
