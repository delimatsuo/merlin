/**
 * Batch application queue — runs in the service worker. Given a list of job
 * URLs, opens tabs (up to MAX_CONCURRENT at a time) and drives each through
 * the per-tab state machine. Tracks status per job and surfaces jobs that
 * need the user's attention (disqualifying modal, unknown-info prompts).
 *
 * Persisted in chrome.storage.local so the dashboard can render the full
 * queue and survive service-worker restarts.
 */

const QUEUE_KEY = "autoapply_batch_queue";
const MAX_CONCURRENT_DEFAULT = 3;

export type QueueJobStatus =
  | "pending" // not started
  | "running" // tab open, automation driving
  | "needs_attention" // paused — user input or confirmation required
  | "completed" // applied successfully
  | "skipped" // user skipped
  | "failed"; // automation error

export interface QueueJob {
  id: string;
  url: string;
  title?: string;
  company?: string;
  score?: number;
  status: QueueJobStatus;
  tabId?: number;
  attentionReason?: "confirmation" | "unknown_answer" | "error";
  errorMessage?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface QueueState {
  jobs: QueueJob[];
  maxConcurrent: number;
  active: boolean; // user pressed "start"
}

const DEFAULT_STATE: QueueState = {
  jobs: [],
  maxConcurrent: MAX_CONCURRENT_DEFAULT,
  active: false,
};

async function loadState(): Promise<QueueState> {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return (result[QUEUE_KEY] as QueueState | undefined) ?? { ...DEFAULT_STATE };
}

async function saveState(state: QueueState): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: state });
  // Notify any open dashboards
  chrome.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
}

function newJobId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

// --- Public API (called via message handler) ---

export async function enqueueJobs(
  items: Array<{ url: string; title?: string; company?: string; score?: number }>,
): Promise<QueueState> {
  const state = await loadState();
  for (const item of items) {
    if (state.jobs.some((j) => j.url === item.url)) continue; // dedupe
    state.jobs.push({
      id: newJobId(),
      url: item.url,
      title: item.title,
      company: item.company,
      score: item.score,
      status: "pending",
    });
  }
  await saveState(state);
  return state;
}

export async function removeJob(id: string): Promise<QueueState> {
  const state = await loadState();
  const job = state.jobs.find((j) => j.id === id);
  if (job?.tabId) {
    try {
      await chrome.tabs.remove(job.tabId);
    } catch {
      // Tab already closed.
    }
  }
  state.jobs = state.jobs.filter((j) => j.id !== id);
  await saveState(state);
  return state;
}

export async function clearCompleted(): Promise<QueueState> {
  const state = await loadState();
  state.jobs = state.jobs.filter(
    (j) => j.status !== "completed" && j.status !== "skipped",
  );
  await saveState(state);
  return state;
}

export async function getQueue(): Promise<QueueState> {
  return loadState();
}

export async function setConcurrency(n: number): Promise<QueueState> {
  const state = await loadState();
  state.maxConcurrent = Math.max(1, Math.min(10, n | 0));
  await saveState(state);
  return state;
}

/**
 * Start processing the queue. Opens tabs up to maxConcurrent. The queue
 * progresses on its own via tab events from there.
 */
export async function startQueue(): Promise<QueueState> {
  const state = await loadState();
  state.active = true;
  await saveState(state);
  await scheduleNext();
  return loadState();
}

export async function pauseQueue(): Promise<QueueState> {
  const state = await loadState();
  state.active = false;
  await saveState(state);
  return state;
}

/** Open tabs for pending jobs up to the concurrency cap. */
async function scheduleNext(): Promise<void> {
  const state = await loadState();
  if (!state.active) return;

  const running = state.jobs.filter(
    (j) => j.status === "running" || j.status === "needs_attention",
  ).length;
  const slots = state.maxConcurrent - running;
  if (slots <= 0) return;

  const pending = state.jobs.filter((j) => j.status === "pending").slice(0, slots);
  for (const job of pending) {
    try {
      const tab = await chrome.tabs.create({ url: job.url, active: false });
      job.tabId = tab.id;
      job.status = "running";
      job.startedAt = Date.now();
    } catch (err) {
      job.status = "failed";
      job.errorMessage = (err as Error).message;
    }
  }
  await saveState(state);
}

// --- Tab event handlers ---

async function findJobByTabId(tabId: number): Promise<{ state: QueueState; job?: QueueJob }> {
  const state = await loadState();
  return { state, job: state.jobs.find((j) => j.tabId === tabId) };
}

/** Called from content-script → SW messages about per-tab progress. */
export async function onTabStatusUpdate(
  tabId: number,
  update: {
    step?: string;
    completed?: boolean;
    failed?: boolean;
    errorMessage?: string;
    needsHuman?: boolean;
    needsConfirmation?: boolean;
  },
): Promise<void> {
  const { state, job } = await findJobByTabId(tabId);
  if (!job) return;

  let changed = false;
  if (update.completed) {
    job.status = "completed";
    job.finishedAt = Date.now();
    changed = true;
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab may have already closed.
    }
    job.tabId = undefined;
  } else if (update.failed) {
    job.status = "failed";
    job.errorMessage = update.errorMessage;
    job.finishedAt = Date.now();
    changed = true;
  } else if (update.needsHuman) {
    job.status = "needs_attention";
    job.attentionReason = "unknown_answer";
    changed = true;
  } else if (update.needsConfirmation) {
    job.status = "needs_attention";
    job.attentionReason = "confirmation";
    changed = true;
  }

  if (changed) {
    await saveState(state);
    await updateBadge();
    await scheduleNext();
  }
}

/** Handle user-initiated tab close mid-run. */
export async function onTabRemoved(tabId: number): Promise<void> {
  const { state, job } = await findJobByTabId(tabId);
  if (!job) return;
  if (job.status === "completed" || job.status === "skipped") return;
  // User closed tab before automation finished — treat as skipped.
  job.status = "skipped";
  job.tabId = undefined;
  job.finishedAt = Date.now();
  await saveState(state);
  await updateBadge();
  await scheduleNext();
}

async function updateBadge(): Promise<void> {
  const state = await loadState();
  const attention = state.jobs.filter((j) => j.status === "needs_attention").length;
  const text = attention > 0 ? String(attention) : "";
  const color = attention > 0 ? "#dc2626" : "#000000";
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    // Action API not available on this surface.
  }
}

// Wire tab-removed listener (idempotent — service worker may restart).
chrome.tabs.onRemoved.addListener((tabId) => {
  onTabRemoved(tabId).catch((err) => console.error("[Queue] onTabRemoved failed:", err));
});
