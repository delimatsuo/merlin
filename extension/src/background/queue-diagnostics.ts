export type QueueDriveReason =
  | "queue_fetched"
  | "already_running"
  | "api_not_configured"
  | "api_error"
  | "unexpected_error";

export interface QueueDriveEntrySummary {
  id: string;
  status: string;
}

export interface QueueDriveResult {
  ok: boolean;
  reason: QueueDriveReason;
  activeCount: number;
  pendingCount: number;
  runningCount: number;
  attentionCount: number;
  openedCount: number;
  failedToOpenCount: number;
  pendingIds: string[];
  runningIds: string[];
  attentionIds: string[];
  apiStatus?: number;
  error?: string;
}

const EMPTY_COUNTS = {
  activeCount: 0,
  pendingCount: 0,
  runningCount: 0,
  attentionCount: 0,
  openedCount: 0,
  failedToOpenCount: 0,
  pendingIds: [],
  runningIds: [],
  attentionIds: [],
} satisfies Omit<QueueDriveResult, "ok" | "reason" | "apiStatus" | "error">;

export function queueBusyResult(): QueueDriveResult {
  return {
    ok: true,
    reason: "already_running",
    ...EMPTY_COUNTS,
  };
}

export function queueApiNotConfiguredResult(): QueueDriveResult {
  return {
    ok: false,
    reason: "api_not_configured",
    error: "Queue API client is not configured",
    ...EMPTY_COUNTS,
  };
}

export function queueApiErrorResult(input: {
  status?: number;
  error?: string;
}): QueueDriveResult {
  return {
    ok: false,
    reason: "api_error",
    ...EMPTY_COUNTS,
    apiStatus: input.status,
    error: input.error,
  };
}

export function queueUnexpectedErrorResult(error: unknown): QueueDriveResult {
  return {
    ok: false,
    reason: "unexpected_error",
    ...EMPTY_COUNTS,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function summarizeQueueDrive(input: {
  active: QueueDriveEntrySummary[];
  openedCount?: number;
  failedToOpenCount?: number;
}): QueueDriveResult {
  const pendingIds = input.active
    .filter((entry) => entry.status === "pending")
    .map((entry) => entry.id)
    .sort();
  const runningIds = input.active
    .filter((entry) => entry.status === "running")
    .map((entry) => entry.id)
    .sort();
  const attentionIds = input.active
    .filter((entry) => entry.status === "needs_attention")
    .map((entry) => entry.id)
    .sort();

  return {
    ok: true,
    reason: "queue_fetched",
    activeCount: input.active.length,
    pendingCount: pendingIds.length,
    runningCount: runningIds.length,
    attentionCount: attentionIds.length,
    openedCount: input.openedCount ?? 0,
    failedToOpenCount: input.failedToOpenCount ?? 0,
    pendingIds,
    runningIds,
    attentionIds,
  };
}
