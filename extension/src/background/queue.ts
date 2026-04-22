/**
 * Batch application queue driver — runs in the service worker.
 *
 * Source of truth is the backend at /api/applications/queue. The SW polls
 * periodically and drives one tab at a time (sequential). When a tab
 * finishes (completed / failed / needs_attention) it PATCHes the backend
 * and opens the next pending entry. When the queue drains, it POSTs
 * /complete-batch so the backend can send the email digest.
 *
 * Per-tab ownership is tracked in chrome.storage.session under keys like
 * `queue_tab_<tabId>`. The content script consults this to decide whether
 * to auto-run on page load (fixing the old "applying immediately on every
 * Gupy page" bug, which read a global session flag).
 */

const POLL_ALARM = "merlin_queue_poll";
const POLL_INTERVAL_MIN = 1.5; // 90 seconds per spec
const ACTIVE_STATUSES = new Set(["pending", "running", "needs_attention"]);

type ApiFn = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ data?: any; error?: string; status?: number }>;

export interface QueueEntry {
  id: string;
  job_id: string;
  job_url: string;
  title: string;
  company: string;
  status:
    | "pending"
    | "running"
    | "applied"
    | "needs_attention"
    | "failed"
    | "skipped"
    | "cancelled";
  attention_reason: "confirmation" | "unknown_answer" | null;
  error_message: string | null;
  tab_id: number | null;
  batch_id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface QueueOwnership {
  queueId: string;
  batchId: string;
}

let apiRequest: ApiFn | null = null;
let driving = false;

/** Wire the API client from the service worker so we don't duplicate auth. */
export function configureQueue(api: ApiFn): void {
  apiRequest = api;
}

function ownershipKey(tabId: number): string {
  return `queue_tab_${tabId}`;
}

async function setTabOwnership(tabId: number, ownership: QueueOwnership): Promise<void> {
  await chrome.storage.session.set({ [ownershipKey(tabId)]: ownership });
}

async function clearTabOwnership(tabId: number): Promise<void> {
  await chrome.storage.session.remove(ownershipKey(tabId));
}

export async function getTabOwnership(tabId: number): Promise<QueueOwnership | null> {
  const result = await chrome.storage.session.get(ownershipKey(tabId));
  return (result[ownershipKey(tabId)] as QueueOwnership | undefined) ?? null;
}

async function fetchQueue(): Promise<{ active: QueueEntry[]; recent: QueueEntry[] } | null> {
  if (!apiRequest) return null;
  const resp = await apiRequest("GET", "/api/applications/queue");
  if (resp.error || !resp.data) return null;
  return resp.data;
}

async function patchQueueEntry(
  id: string,
  body: {
    status: string;
    attention_reason?: string;
    error_message?: string;
    tab_id?: number | null;
  },
): Promise<void> {
  if (!apiRequest) return;
  await apiRequest("PATCH", `/api/applications/queue/${id}`, body);
}

async function completeBatch(batchId: string): Promise<void> {
  if (!apiRequest) return;
  await apiRequest("POST", "/api/applications/queue/complete-batch", {
    batch_id: batchId,
  });
}

async function updateBadge(attentionCount: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({
      text: attentionCount > 0 ? String(attentionCount) : "",
    });
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  } catch {
    /* action not available */
  }
}

/** Look up the queue entry id owning a tab via the stored per-tab flag. */
async function findQueueIdForTab(tabId: number): Promise<string | null> {
  const ownership = await getTabOwnership(tabId);
  return ownership?.queueId ?? null;
}

/**
 * Main drive step. Idempotent — safe to call from any trigger (alarm,
 * popup open, tab status update, batch kick).
 *
 * Rules:
 *   - At most one tab in status "running" at a time (sequential).
 *   - "needs_attention" tabs stay open but do NOT block the next pending.
 *   - When no active entries remain, call complete-batch (once per batch).
 */
export async function driveQueue(): Promise<void> {
  if (driving) return;
  driving = true;
  try {
    const queue = await fetchQueue();
    if (!queue) return;

    const active = queue.active;
    const attentionCount = active.filter((e) => e.status === "needs_attention").length;
    await updateBadge(attentionCount);

    const running = active.filter((e) => e.status === "running");
    const pending = active.filter((e) => e.status === "pending");

    // Prune ownership for tabs that have been closed externally.
    for (const entry of active) {
      if (entry.tab_id !== null && entry.tab_id !== undefined) {
        try {
          await chrome.tabs.get(entry.tab_id);
        } catch {
          // Tab gone — mark entry as skipped (user closed mid-run).
          if (entry.status === "running") {
            await patchQueueEntry(entry.id, {
              status: "skipped",
              error_message: "Aba fechada pelo usuário",
            });
          }
          await clearTabOwnership(entry.tab_id);
        }
      }
    }

    // Only open a new tab if nothing is actively running.
    if (running.length === 0 && pending.length > 0) {
      const next = pending[0];
      try {
        const tab = await chrome.tabs.create({ url: next.job_url, active: false });
        if (tab.id) {
          await setTabOwnership(tab.id, { queueId: next.id, batchId: next.batch_id });
          await patchQueueEntry(next.id, {
            status: "running",
            tab_id: tab.id,
          });
        }
      } catch (err) {
        await patchQueueEntry(next.id, {
          status: "failed",
          error_message: (err as Error).message,
        });
      }
    }

    // Batch complete? Re-fetch and check for zero active.
    const refreshed = await fetchQueue();
    if (!refreshed) return;
    if (refreshed.active.length === 0 && refreshed.recent.length > 0) {
      // Find the most recent batch id that hasn't been notified yet.
      const latestBatch = refreshed.recent[0].batch_id;
      const notifiedKey = `batch_notified_${latestBatch}`;
      const stored = await chrome.storage.session.get(notifiedKey);
      if (!stored[notifiedKey]) {
        await completeBatch(latestBatch);
        await chrome.storage.session.set({ [notifiedKey]: true });
      }
    }
  } catch (err) {
    console.error("[Queue] driveQueue failed:", err);
  } finally {
    driving = false;
  }
}

/** Called by the content-script state machine as the tab makes progress. */
export async function onTabStatusUpdate(
  tabId: number,
  update: {
    completed?: boolean;
    failed?: boolean;
    errorMessage?: string;
    needsHuman?: boolean;
    needsConfirmation?: boolean;
    skipped?: boolean;
    skipReason?: string;
  },
): Promise<void> {
  const queueId = await findQueueIdForTab(tabId);
  if (!queueId) return; // Not a queue-owned tab — ignore.

  if (update.completed) {
    await patchQueueEntry(queueId, { status: "applied" });
    await clearTabOwnership(tabId);
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      /* already closed */
    }
    await driveQueue();
    return;
  }

  if (update.skipped) {
    // Job posting closed or otherwise un-appliable — mark skipped (not failed)
    // and advance. Distinct from "failed" in the UI so the user can see this
    // wasn't a tooling bug.
    await patchQueueEntry(queueId, {
      status: "skipped",
      error_message: update.skipReason ?? "Vaga não aceita mais candidaturas.",
    });
    await clearTabOwnership(tabId);
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      /* already closed */
    }
    await driveQueue();
    return;
  }

  if (update.failed) {
    await patchQueueEntry(queueId, {
      status: "failed",
      error_message: update.errorMessage ?? "Erro desconhecido",
    });
    await clearTabOwnership(tabId);
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      /* already closed */
    }
    await driveQueue();
    return;
  }

  if (update.needsHuman || update.needsConfirmation) {
    const reason = update.needsConfirmation ? "confirmation" : "unknown_answer";
    await patchQueueEntry(queueId, {
      status: "needs_attention",
      attention_reason: reason,
    });
    // Skip-and-continue: tab stays open for user, but queue advances.
    await driveQueue();
    return;
  }
}

/** Called when a tab closes (external event). Differs from status updates:
 *  closure can mean success-already-reported, user cancelled, or crash. */
export async function onTabRemoved(tabId: number): Promise<void> {
  const queueId = await findQueueIdForTab(tabId);
  if (!queueId) return;
  await clearTabOwnership(tabId);
  // If the entry is still running / needs_attention, mark it skipped.
  if (!apiRequest) return;
  const resp = await apiRequest("GET", "/api/applications/queue");
  const entry = (resp.data?.active as QueueEntry[] | undefined)?.find((e) => e.id === queueId);
  if (entry && (entry.status === "running" || entry.status === "needs_attention")) {
    await patchQueueEntry(queueId, {
      status: "skipped",
      error_message: "Aba fechada antes de concluir",
    });
  }
  await driveQueue();
}

/** Called from the frontend (via merlincv.com content-script bridge) or popup. */
export async function queueKick(): Promise<void> {
  await driveQueue();
}

/** Focus the tab for a given queue entry, if it's still open. */
export async function focusQueueTab(queueId: string): Promise<boolean> {
  const keys = await chrome.storage.session.get();
  for (const [k, v] of Object.entries(keys)) {
    if (!k.startsWith("queue_tab_")) continue;
    const ownership = v as QueueOwnership;
    if (ownership?.queueId === queueId) {
      const tabId = Number(k.slice("queue_tab_".length));
      try {
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** Install the polling alarm. Idempotent across SW restarts. */
export async function installQueueAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (!existing) {
    await chrome.alarms.create(POLL_ALARM, {
      periodInMinutes: POLL_INTERVAL_MIN,
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) {
    driveQueue().catch((err) =>
      console.error("[Queue] alarm driveQueue failed:", err),
    );
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  onTabRemoved(tabId).catch((err) =>
    console.error("[Queue] onTabRemoved failed:", err),
  );
});
