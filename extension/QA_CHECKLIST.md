# Extension Pre-Launch QA Checklist

Run this before submitting to the Chrome Web Store **and** again after the
store listing goes live (with the published install rather than unpacked).

## Setup — clean environment

- [ ] Open Chrome, click profile icon (top-right) → "Add" → create a fresh
      profile named "Merlin QA"
- [ ] Sign into the QA profile with a Google account that has a Merlin
      account already onboarded (knowledge file built, at least one resume)
- [ ] In the QA profile only, do NOT install any other extensions
- [ ] Confirm `gcloud config get-value account` is set to `deli@ellaexecutivesearch.com`

## Install — local unpacked build

- [ ] `cd extension && npm run build:store`
- [ ] `chrome://extensions/` → Developer mode ON → "Load unpacked"
- [ ] Select `extension/build-store/staging/` (the unzipped staging dir)
- [ ] Confirm extension ID matches `gpnbdjkdalnalehhfajgapalhlogbbbd`
- [ ] Confirm the toolbar icon shows the new gold-on-navy "M" logo
- [ ] Pin the extension to the toolbar

## Auth flow

- [ ] Click extension icon → popup shows "Entrar com Google"
- [ ] Click → consent screen appears in `chromiumapp.org` window → grants
- [ ] Popup reloads to "main" view, shows your email at top
- [ ] PII view appears (since this is a fresh profile, no PII saved)

## PII setup

- [ ] Fill CPF (validates with mask)
- [ ] Fill phone (validates with mask)
- [ ] Fill date of birth
- [ ] Optionally expand "Dados opcionais" and fill RG/ethnicity/etc
- [ ] Click "Salvar" → toast shows "Dados salvos"
- [ ] Popup switches to "ready" view with two ✓ checks

## Dashboard install banner

- [ ] Open `https://merlincv.com/dashboard/vagas` in the QA profile
- [ ] **Banner does NOT show** (extension is installed)
- [ ] In a non-QA profile, open the same URL → banner shows
- [ ] Click "Instalar no Chrome" → opens the Web Store listing in new tab
- [ ] Click "Agora não" → banner disappears, stays gone for 7 days

## Open-dashboard button

- [ ] In QA profile, navigate AWAY from `/dashboard/candidaturas` (e.g. to
      `/dashboard/profile`)
- [ ] Click extension icon → popup → "Abrir candidaturas em lote"
- [ ] **Existing tab navigates to /dashboard/candidaturas in same window**
      (no duplicate tab created)
- [ ] Now have a tab open at `/dashboard/candidaturas`
- [ ] Click extension button again → that existing tab gets focus, no new tab

## Single Gupy application — happy path

- [ ] Open a real Gupy job listing in another tab (search gupy.io for a
      junior role; pick one with a "Iniciar candidatura" button)
- [ ] On the Merlin dashboard, queue this single job for application
- [ ] Watch Gupy tab open in background
- [ ] Verify form is filled with PII + profile data
- [ ] Verify the extension submits or pauses at the final-review screen
      (depending on dry-run setting)
- [ ] Confirm `/dashboard/candidaturas` shows status "applied" or
      "needs_attention" with the right reason

## Batch — 3+ applications in parallel

- [ ] Queue 4 Gupy jobs at once
- [ ] Open `/dashboard/candidaturas` → all 4 visible as pending/running
- [ ] Confirm up to 4 Gupy tabs open in parallel (but not 5+)
- [ ] Confirm tabs open with stagger (5–10s between opens), not simultaneously
- [ ] Let the batch complete — confirm digest email arrives

## Failure cases

- [ ] Find a closed/expired Gupy job → verify extension marks it "skipped"
      not "failed"
- [ ] Trigger a custom-question screen the LLM can't confidently answer →
      verify status changes to "needs_attention" with reason
      "unknown_answer" and the user can review/answer
- [ ] Sign out from popup → confirm the session token is cleared and
      next API call returns 401, popup reverts to "Entrar com Google"

## CORS / network

- [ ] Open Chrome DevTools Network tab on `/dashboard/vagas`
- [ ] Trigger a queue creation → verify the POST to
      `https://merlin-backend-…run.app/api/applications/queue` succeeds
      (200), with `Access-Control-Allow-Origin` header echoing the
      `chrome-extension://pckpe…` origin
- [ ] Verify `OPTIONS` preflight is also 200

## Permissions (visible in Chrome install dialog)

- [ ] Reinstall the extension from the production ZIP and confirm Chrome
      shows the permissions you expect:
      - "Read your browsing history" (tabs)
      - "Read and change all your data on gupy.io and merlincv.com"
      - "Identity"
- [ ] **No** mention of localhost or other unexpected hosts

## Privacy policy

- [ ] Visit `https://merlincv.com/privacidade` → section 14 covers extension
- [ ] Visit `https://merlincv.com/privacy` → section 14 covers extension (EN)

## After Web Store publish (re-run on a 4th clean Chrome profile)

- [ ] Install from the Web Store listing (not unpacked)
- [ ] Confirm the extension ID is still `gpnbdjkdalnalehhfajgapalhlogbbbd`
- [ ] Re-run all sections above except "Install — local unpacked build"
- [ ] Confirm install banner stops showing on the dashboard (since
      `chrome.runtime.id` should now resolve from the published install)
- [ ] Sign-in flow still works (this is the most common breaker — Firebase
      `authorized_domains` and Google OAuth `redirect_uris` must include
      `gpnbdjkdalnalehhfajgapalhlogbbbd.chromiumapp.org`, which they do
      per memory)

## If anything fails

- Service worker logs: `chrome://extensions/` → Inspect views: service worker
- Content script logs: open Gupy tab → DevTools → Console (filter for `[SM]`,
  `[Welcome]`, `[GuPy AutoApply]`)
- Backend logs: `gcloud run services logs read merlin-backend --region southamerica-east1 --limit 50`
- Sentry: any backend exceptions during queue processing should now surface there
  (just-added in `app/jobs/entrypoint.py` and `app/jobs/scraper.py`)
