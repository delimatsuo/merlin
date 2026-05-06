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

import {
  type QueueDriveResult,
  queueApiErrorResult,
  queueApiNotConfiguredResult,
  queueBusyResult,
  queueUnexpectedErrorResult,
  summarizeQueueDrive,
} from "./queue-diagnostics";
import { isQueueEntryAutoApplySupported } from "./queue-eligibility";

const POLL_ALARM = "merlin_queue_poll";
const POLL_INTERVAL_MIN = 1.5; // 90 seconds per spec
const ACTIVE_STATUSES = new Set(["pending", "running", "needs_attention"]);

/**
 * Max application tabs we drive in parallel. A single stuck tab (e.g. waiting
 * out Gupy's "Introduce yourself!" cooling period or waiting on a human for
 * a custom question) no longer blocks the rest of the batch. 4 gives roughly
 * 4× throughput while staying well below any plausible bot-detection heuristic
 * — each tab is still a one-user-one-application event, just in parallel.
 */
const MAX_CONCURRENT_APPLICATIONS = 4;

/**
 * Minimum + jitter between tab opens within a single drive pass. Prevents all
 * N tabs from opening in the same millisecond (which looks scripted) and also
 * gives each tab's content script a moment to initialize before the next fires.
 */
const TAB_OPEN_MIN_DELAY_MS = 5000;
const TAB_OPEN_MAX_DELAY_MS = 10000;

function staggerDelayMs(): number {
  return (
    TAB_OPEN_MIN_DELAY_MS +
    Math.floor(Math.random() * (TAB_OPEN_MAX_DELAY_MS - TAB_OPEN_MIN_DELAY_MS))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ApiFn = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ data?: any; error?: string; status?: number }>;

export interface QueueEntry {
  id: string;
  job_id: string;
  job_url: string;
  source: string;
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

function apiErrorMessage(resp: { data?: any; error?: string; status?: number }): string | undefined {
  if (resp.error) return resp.error;
  if (typeof resp.data?.detail === "string") return resp.data.detail;
  if (typeof resp.data?.message === "string") return resp.data.message;
  if (resp.status && resp.status >= 400) return `HTTP ${resp.status}`;
  return undefined;
}

async function fetchQueue(): Promise<{
  queue?: { active: QueueEntry[]; recent: QueueEntry[] };
  error?: string;
  status?: number;
}> {
  if (!apiRequest) {
    return { error: "Queue API client is not configured" };
  }
  const resp = await apiRequest("GET", "/api/applications/queue");
  if (resp.error || !resp.data || (resp.status !== undefined && resp.status >= 400)) {
    return {
      status: resp.status,
      error: apiErrorMessage(resp) ?? "Queue API request failed",
    };
  }
  return { queue: resp.data };
}

async function patchQueueEntry(
  id: string,
  body: {
    status: string;
    attention_reason?: string;
    error_message?: string;
    tab_id?: number | null;
  },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!apiRequest) {
    return { ok: false, error: "Queue API client is not configured" };
  }
  const resp = await apiRequest("PATCH", `/api/applications/queue/${id}`, body);
  if (resp.error || (resp.status !== undefined && resp.status >= 400)) {
    return {
      ok: false,
      status: resp.status,
      error: apiErrorMessage(resp) ?? "Queue API patch failed",
    };
  }
  return { ok: true, status: resp.status };
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
 *   - Up to MAX_CONCURRENT_APPLICATIONS tabs in status "running" at once.
 *   - "needs_attention" tabs stay open but do NOT count toward concurrency
 *     (they're waiting on the user, not actively consuming a slot).
 *   - When no active entries remain, call complete-batch (once per batch).
 */
export async function driveQueue(): Promise<QueueDriveResult> {
  if (driving) return queueBusyResult();
  if (!apiRequest) return queueApiNotConfiguredResult();

  driving = true;
  let openedCount = 0;
  let failedToOpenCount = 0;

  try {
    const fetched = await fetchQueue();
    if (!fetched.queue) {
      return queueApiErrorResult({
        status: fetched.status,
        error: fetched.error,
      });
    }

    const active = fetched.queue.active;

    for (const entry of active) {
      if (!ACTIVE_STATUSES.has(entry.status) || isQueueEntryAutoApplySupported(entry)) continue;
      await patchQueueEntry(entry.id, {
        status: "skipped",
        error_message: "Fluxo de candidatura manual/WhatsApp não é automatizável pelo Merlin.",
      });
      if (entry.tab_id !== null && entry.tab_id !== undefined) {
        await clearTabOwnership(entry.tab_id);
        try {
          await chrome.tabs.remove(entry.tab_id);
        } catch {
          /* tab already closed */
        }
      }
    }

    const driveableActive = active.filter((e) => isQueueEntryAutoApplySupported(e));
    const attentionCount = driveableActive.filter((e) => e.status === "needs_attention").length;
    await updateBadge(attentionCount);

    const running = driveableActive.filter((e) => e.status === "running");
    const pending = driveableActive.filter((e) => e.status === "pending");

    // Prune ownership for tabs that have been closed externally.
    for (const entry of driveableActive) {
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

    // Open up to `slots` new tabs this pass. A small random stagger between
    // opens avoids all N tabs firing in the same millisecond (which looks
    // scripted and would also hit Gupy with burst traffic from one account).
    const slots = Math.max(0, MAX_CONCURRENT_APPLICATIONS - running.length);
    const toOpen = pending.slice(0, slots);
    if (toOpen.length > 0) {
      console.log(
        `[Queue] Opening ${toOpen.length} tab(s) (running=${running.length}, pending=${pending.length}, cap=${MAX_CONCURRENT_APPLICATIONS})`,
      );
    }
    for (let i = 0; i < toOpen.length; i++) {
      const next = toOpen[i];
      try {
        const tab = await chrome.tabs.create({ url: next.job_url, active: false });
        if (tab.id) {
          await setTabOwnership(tab.id, { queueId: next.id, batchId: next.batch_id });
          const patchResult = await patchQueueEntry(next.id, {
            status: "running",
            tab_id: tab.id,
          });
          if (!patchResult.ok) {
            failedToOpenCount += 1;
            await clearTabOwnership(tab.id);
            try {
              await chrome.tabs.remove(tab.id);
            } catch {
              /* tab already closed */
            }
            console.error(
              "[Queue] Failed to mark entry running:",
              patchResult.error,
              patchResult.status,
            );
          } else {
            openedCount += 1;
          }
        } else {
          failedToOpenCount += 1;
        }
      } catch (err) {
        failedToOpenCount += 1;
        await patchQueueEntry(next.id, {
          status: "failed",
          error_message: (err as Error).message,
        });
      }
      // Stagger before opening the next tab (skip stagger after the last one).
      if (i < toOpen.length - 1) {
        await sleep(staggerDelayMs());
      }
    }

    // Batch complete? Re-fetch and check for zero active.
    const refreshed = await fetchQueue();
    if (!refreshed.queue) {
      return summarizeQueueDrive({ active: driveableActive, openedCount, failedToOpenCount });
    }
    if (refreshed.queue.active.length === 0 && refreshed.queue.recent.length > 0) {
      // Find the most recent batch id that hasn't been notified yet.
      const latestBatch = refreshed.queue.recent[0].batch_id;
      const notifiedKey = `batch_notified_${latestBatch}`;
      const stored = await chrome.storage.session.get(notifiedKey);
      if (!stored[notifiedKey]) {
        await completeBatch(latestBatch);
        await chrome.storage.session.set({ [notifiedKey]: true });
      }
    }

    return summarizeQueueDrive({ active: driveableActive, openedCount, failedToOpenCount });
  } catch (err) {
    console.error("[Queue] driveQueue failed:", err);
    return queueUnexpectedErrorResult(err);
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
export async function queueKick(): Promise<QueueDriveResult> {
  return driveQueue();
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
