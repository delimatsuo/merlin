# Retention Dashboard Design

## Problem

We need to know if users are extracting value from the product. The core question: "Are users coming back to generate more resumes for new job applications?"

## Retention Model

A user's **active days** = distinct calendar days (BRT) with at least one AI generation.

- **1 day**: Tried it
- **2 days**: Came back once
- **3+ days**: Found value (core metric)
- **Stopped after 3+**: Likely got a job (success)

## Approach: Track on user doc + backfill

Add two fields to the user document, updated on every generation. One-time backfill from existing `generationLog` for historical data. Admin dashboard reads user docs only.

---

## Data Model

### New fields on `users/{uid}`

| Field | Type | Description |
|-------|------|-------------|
| `lastActivityAt` | string (ISO timestamp) | Updated on every generation |
| `activeDays` | integer | Count of distinct days (BRT) with at least 1 generation |

### Update logic

In `FirestoreService.log_generation()` (already runs on every AI call):

1. Set `lastActivityAt = now (BRT ISO)`
2. Read current `dailyUsage.date` on the user doc
3. If today's date (BRT) differs from `dailyUsage.date`, increment `activeDays` by 1

This piggybacks on the existing `dailyUsage` mechanism. The `dailyUsage.date` field already tracks the current day for rate limiting — when it changes, we know it's a new active day. No extra Firestore reads needed.

### Backfill script

One-time script (`backend/app/jobs/backfill_active_days.py`):

1. Scan all `generationLog` documents
2. Group by `uid` + calendar date (BRT)
3. For each user: count distinct dates, find max timestamp
4. Write `activeDays` and `lastActivityAt` to user doc

---

## Admin API

### `GET /api/admin/retention`

Returns all retention data in a single response. Requires admin auth.

**Response:**

```json
{
  "total_users": 81,
  "activated": 45,
  "found_value": 28,
  "active_this_week": 12,
  "retention_curve": [
    { "days": 1, "users": 45, "pct": 55.6 },
    { "days": 2, "users": 34, "pct": 42.0 },
    { "days": 3, "users": 28, "pct": 34.6 },
    { "days": 5, "users": 18, "pct": 22.2 },
    { "days": 10, "users": 8, "pct": 9.9 }
  ]
}
```

**Field definitions:**

- `total_users`: Count of all user documents
- `activated`: Users with a `knowledge/current` subcollection document (completed onboarding)
- `found_value`: Users with `activeDays >= 3`
- `active_this_week`: Users with `lastActivityAt` within last 7 days
- `retention_curve`: For each threshold (1, 2, 3, 5, 10, 15, 20), count users with `activeDays >= threshold` and compute percentage of `total_users`

**Implementation:** Single scan of `users` collection. For each user doc, check `activeDays` and `lastActivityAt` fields. Check for `knowledge/current` subcollection only for `activated` count (can be denormalized later if slow).

---

## Frontend

### New admin tab: "Retencao"

Location: `/app/(admin)/admin/retencao/page.tsx`

Added to the admin nav alongside Dashboard, Usuarios, Custos, Feedback, Configuracoes.

### Layout

**Top row — 4 stat cards:**

| Card | Value | Subtitle |
|------|-------|----------|
| Total de Usuarios | `total_users` | Cadastrados na plataforma |
| Ativados | `activated` | Completaram o onboarding |
| Encontraram Valor | `found_value` | 3+ dias ativos |
| Ativos esta Semana | `active_this_week` | Ultimos 7 dias |

**Below — Retention curve chart:**

Bar chart (same style as existing 30-day generation chart on Dashboard tab):
- X-axis: Active day thresholds (1, 2, 3, 5, 10, 15, 20)
- Y-axis: Percentage of total users
- Each bar shows the count on hover

### Visual style

Matches existing admin pages: apple-shadow rounded cards, consistent typography, same color palette. Uses the same chart approach as the existing admin dashboard.

---

## Files to create/modify

### New files
- `backend/app/jobs/backfill_active_days.py` — one-time backfill script
- `frontend/app/(admin)/admin/retencao/page.tsx` — retention dashboard page

### Modified files
- `backend/app/services/firestore.py` — update `log_generation()` to write `lastActivityAt` + `activeDays`
- `backend/app/api/admin.py` — add `GET /api/admin/retention` endpoint
- `frontend/app/(admin)/admin/layout.tsx` — add "Retencao" tab to admin nav

---

## Out of scope

- Cohort analysis by signup month
- Per-user retention details on Users page
- User management features (delete/block/suspend) — separate project
- Email re-engagement for dormant users
- Session duration tracking
