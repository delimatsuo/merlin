# Retention Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user retention tracking (activeDays + lastActivityAt) and an admin dashboard tab showing headline metrics and a retention curve chart.

**Architecture:** Two new fields on user docs updated during existing log_activity(). One new admin API endpoint reads user docs to compute retention stats. One new frontend page renders stat cards + bar chart.

**Tech Stack:** Python/FastAPI (backend), Firestore (data), Next.js/TypeScript (frontend)

---

### Task 1: Add activeDays + lastActivityAt tracking to Firestore

**Files:**
- Modify: `backend/app/services/firestore.py:670-698` (increment_daily_usage)
- Modify: `backend/app/services/firestore.py:927-944` (log_activity)

- [ ] **Step 1: Update increment_daily_usage to track activeDays**

In `backend/app/services/firestore.py`, modify `increment_daily_usage()` to also increment `activeDays` when the date changes and always update `lastActivityAt`:

```python
    async def increment_daily_usage(self, uid: str) -> None:
        """Increment daily usage counter atomically using a transaction.

        Resets the counter when the date changes. The transaction prevents
        race conditions where two concurrent requests both read the same count.
        Also tracks activeDays (distinct active days) and lastActivityAt for retention.
        """
        today = _brazil_today()
        now_iso = _brazil_now().isoformat()
        doc_ref = self.db.collection("users").document(uid)

        transaction = self.db.transaction()

        @async_transactional
        async def update_in_transaction(txn, ref):
            doc = await ref.get(transaction=txn)
            if doc.exists:
                data = doc.to_dict()
                usage = data.get("dailyUsage", {})
                if usage.get("date") == today:
                    count = usage.get("tailorCount", 0) + 1
                    txn.update(ref, {
                        "dailyUsage": {"tailorCount": count, "date": today},
                        "lastActivityAt": now_iso,
                    })
                else:
                    # New day — increment activeDays
                    active_days = data.get("activeDays", 0) + 1
                    txn.update(ref, {
                        "dailyUsage": {"tailorCount": 1, "date": today},
                        "lastActivityAt": now_iso,
                        "activeDays": active_days,
                    })
            else:
                txn.set(ref, {
                    "dailyUsage": {"tailorCount": 1, "date": today},
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "lastActivityAt": now_iso,
                    "activeDays": 1,
                })

        await update_in_transaction(transaction, doc_ref)
```

- [ ] **Step 2: Verify backend loads**

Run: `cd backend && source venv/bin/activate && python -c "from app.services.firestore import FirestoreService; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/firestore.py
git commit -m "feat(retention): track activeDays + lastActivityAt on user doc"
```

---

### Task 2: Backfill script for existing users

**Files:**
- Create: `backend/app/jobs/backfill_active_days.py`
- Modify: `backend/app/jobs/entrypoint.py` (add --backfill-active-days flag)

- [ ] **Step 1: Create backfill script**

Create `backend/app/jobs/backfill_active_days.py`:

```python
"""One-time backfill: compute activeDays + lastActivityAt from generationLog."""

from collections import defaultdict
from datetime import timezone
from zoneinfo import ZoneInfo

import structlog

from app.services.firestore import FirestoreService

_BRT = ZoneInfo("America/Sao_Paulo")
logger = structlog.get_logger()


async def backfill_active_days() -> dict:
    """Scan generationLog, compute distinct active days per user, write to user docs."""
    fs = FirestoreService()

    # Phase 1: Scan all generation logs
    user_dates: dict[str, set[str]] = defaultdict(set)
    user_last_activity: dict[str, str] = {}
    total_logs = 0

    async for doc in fs.db.collection("generationLog").stream():
        data = doc.to_dict()
        uid = data.get("uid", "")
        created_at = data.get("createdAt", "")
        if not uid or not created_at:
            continue

        total_logs += 1

        # Convert to BRT date
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            brt_date = dt.astimezone(_BRT).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        user_dates[uid].add(brt_date)

        # Track latest activity
        if uid not in user_last_activity or created_at > user_last_activity[uid]:
            user_last_activity[uid] = created_at

    logger.info("backfill_scan_done", logs=total_logs, users=len(user_dates))

    # Phase 2: Write to user docs
    updated = 0
    for uid, dates in user_dates.items():
        active_days = len(dates)
        last_activity = user_last_activity.get(uid, "")
        try:
            await fs.db.collection("users").document(uid).update({
                "activeDays": active_days,
                "lastActivityAt": last_activity,
            })
            updated += 1
        except Exception as e:
            logger.warning("backfill_user_error", uid=uid[:8], error=str(e))

    logger.info("backfill_complete", updated=updated)
    return {"logs_scanned": total_logs, "users_updated": updated}
```

- [ ] **Step 2: Add CLI flag to entrypoint**

In `backend/app/jobs/entrypoint.py`, add a `--backfill-active-days` handler after the existing `--backfill` block (around line 80):

```python
    elif "--backfill-active-days" in sys.argv:
        async def run_backfill_active_days():
            logger = structlog.get_logger()
            logger.info("backfill_active_days_start")
            from app.jobs.backfill_active_days import backfill_active_days
            stats = await backfill_active_days()
            logger.info("backfill_active_days_done", **stats)
        asyncio.run(run_backfill_active_days())
```

- [ ] **Step 3: Verify imports**

Run: `cd backend && source venv/bin/activate && python -c "from app.jobs.backfill_active_days import backfill_active_days; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/jobs/backfill_active_days.py backend/app/jobs/entrypoint.py
git commit -m "feat(retention): add backfill script for activeDays from generationLog"
```

---

### Task 3: Admin API endpoint

**Files:**
- Modify: `backend/app/api/admin.py`
- Modify: `backend/app/services/firestore.py` (add get_retention_stats method)

- [ ] **Step 1: Add Firestore query method**

Add to `backend/app/services/firestore.py` in the `FirestoreService` class, after `get_feature_counts()`:

```python
    async def get_retention_stats(self) -> dict:
        """Compute retention metrics from user docs."""
        total = 0
        activated = 0
        found_value = 0
        active_this_week = 0
        thresholds = [1, 2, 3, 5, 10, 15, 20]
        threshold_counts = {t: 0 for t in thresholds}

        now = _brazil_now()
        week_ago = (now - timedelta(days=7)).isoformat()

        async for doc in self.db.collection("users").stream():
            total += 1
            data = doc.to_dict()
            active_days = data.get("activeDays", 0)
            last_activity = data.get("lastActivityAt", "")

            # Check if activated (has knowledge file) — use denormalized field
            # Fall back to checking subcollection only if needed
            knowledge_ref = self.db.collection("users").document(doc.id).collection("knowledge").document("current")
            knowledge_doc = await knowledge_ref.get()
            if knowledge_doc.exists:
                activated += 1

            if active_days >= 3:
                found_value += 1

            if last_activity and last_activity >= week_ago:
                active_this_week += 1

            for t in thresholds:
                if active_days >= t:
                    threshold_counts[t] += 1

        retention_curve = [
            {
                "days": t,
                "users": threshold_counts[t],
                "pct": round(threshold_counts[t] / total * 100, 1) if total > 0 else 0,
            }
            for t in thresholds
        ]

        return {
            "total_users": total,
            "activated": activated,
            "found_value": found_value,
            "active_this_week": active_this_week,
            "retention_curve": retention_curve,
        }
```

Note: Add `from datetime import timedelta` to the imports at the top of the file if not already present.

- [ ] **Step 2: Add admin endpoint**

Add to `backend/app/api/admin.py` after the existing `/stats` endpoint:

```python
@router.get("/retention")
@limiter.limit("20/minute")
async def get_retention(
    request: Request,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    """Retention metrics: headline numbers + retention curve."""
    fs = FirestoreService()
    return await fs.get_retention_stats()
```

- [ ] **Step 3: Verify endpoint loads**

Run: `cd backend && source venv/bin/activate && python -c "from app.api.admin import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/firestore.py backend/app/api/admin.py
git commit -m "feat(retention): add GET /api/admin/retention endpoint"
```

---

### Task 4: Add Retencao tab to admin nav

**Files:**
- Modify: `frontend/app/(admin)/layout.tsx`

- [ ] **Step 1: Add nav item**

In `frontend/app/(admin)/layout.tsx`, add the `Activity` icon import and a new nav entry:

Change line 7:
```typescript
import { BarChart3, Users, DollarSign, Settings, ArrowLeft, MessageCircle, Activity } from "lucide-react";
```

Add after the Custos entry in `adminNav` (line 13):
```typescript
  { href: "/admin/retencao", label: "Retenção", icon: Activity },
```

The full `adminNav` array should be:
```typescript
const adminNav = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/feedback", label: "Feedback", icon: MessageCircle },
  { href: "/admin/custos", label: "Custos", icon: DollarSign },
  { href: "/admin/retencao", label: "Retenção", icon: Activity },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(admin\)/layout.tsx
git commit -m "feat(retention): add Retencao tab to admin nav"
```

---

### Task 5: Retention dashboard page

**Files:**
- Create: `frontend/app/(admin)/admin/retencao/page.tsx`

- [ ] **Step 1: Create the retention page**

Create `frontend/app/(admin)/admin/retencao/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface RetentionCurvePoint {
  days: number;
  users: number;
  pct: number;
}

interface RetentionData {
  total_users: number;
  activated: number;
  found_value: number;
  active_this_week: number;
  retention_curve: RetentionCurvePoint[];
}

function StatCard({ label, value, subtitle }: { label: string; value: number; subtitle: string }) {
  return (
    <div className="apple-shadow rounded-2xl bg-card p-6">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

export default function AdminRetencao() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.get<RetentionData>("/api/admin/retention");
        setData(result);
      } catch (e) {
        console.error("Failed to load retention data", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-secondary rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-card animate-pulse apple-shadow" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-card animate-pulse apple-shadow" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Erro ao carregar dados de retenção.</p>;
  }

  const maxPct = Math.max(...data.retention_curve.map((p) => p.pct), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Retenção</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Usuários que retornam e extraem valor da plataforma
        </p>
      </div>

      {/* Headline stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total de Usuários" value={data.total_users} subtitle="Cadastrados na plataforma" />
        <StatCard label="Ativados" value={data.activated} subtitle="Completaram o onboarding" />
        <StatCard label="Encontraram Valor" value={data.found_value} subtitle="3+ dias ativos" />
        <StatCard label="Ativos esta Semana" value={data.active_this_week} subtitle="Últimos 7 dias" />
      </div>

      {/* Retention curve chart */}
      <div className="apple-shadow rounded-2xl bg-card p-6">
        <h2 className="text-sm font-semibold mb-1">Curva de Retenção</h2>
        <p className="text-xs text-muted-foreground mb-6">
          % de usuários que atingiram N dias ativos
        </p>
        <div className="flex items-end gap-3 h-48">
          {data.retention_curve.map((point) => (
            <div key={point.days} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                {point.users}
              </span>
              <div
                className="w-full rounded-t-lg bg-foreground/80 transition-all duration-500"
                style={{ height: `${(point.pct / maxPct) * 100}%`, minHeight: point.pct > 0 ? "4px" : "0" }}
              />
              <span className="text-[10px] text-muted-foreground tabular-nums">{point.pct}%</span>
              <span className="text-[10px] font-medium text-foreground">
                {point.days}d
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript and build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds, `/admin/retencao` listed in output

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(admin\)/admin/retencao/page.tsx
git commit -m "feat(retention): add retention dashboard page with stats + chart"
```

---

### Task 6: Run backfill and verify end-to-end

**Files:** None (operational task)

- [ ] **Step 1: Run backfill locally**

```bash
cd backend && source venv/bin/activate && python -m app.jobs.entrypoint --backfill-active-days
```

Expected output: `backfill_active_days_done logs_scanned=NNN users_updated=NNN`

- [ ] **Step 2: Test the API endpoint locally**

```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload &
# In another terminal, get a valid admin token and:
curl -s http://localhost:8000/api/admin/retention -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

Expected: JSON with `total_users`, `activated`, `found_value`, `active_this_week`, `retention_curve`

- [ ] **Step 3: Push to staging and verify**

```bash
git push origin staging
```

After deploy, navigate to staging admin dashboard and click "Retenção" tab.
Expected: Stat cards show real numbers, retention curve chart renders.

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add -A && git commit -m "fix(retention): address issues found during verification"
```
