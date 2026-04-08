import { useProcessingStore } from "./store";

interface PollOptions {
  taskId: string;
  label: string;
  pollFn: () => Promise<{ status: string; [key: string]: unknown }>;
  onReady: (data: Record<string, unknown>) => void;
  onError?: (error: string) => void;
  link?: string;
  doneLabel?: string;
  intervalMs?: number;
  maxAttempts?: number;
}

const activePolls = new Map<string, boolean>();

export function stopBackgroundPoll(taskId: string): void {
  activePolls.delete(taskId);
}

export function isPolling(taskId: string): boolean {
  return activePolls.has(taskId);
}

export function startBackgroundPoll(opts: PollOptions): void {
  const {
    taskId,
    label,
    pollFn,
    onReady,
    onError,
    link,
    doneLabel,
    intervalMs = 3000,
    maxAttempts = 60,
  } = opts;

  // Prevent duplicate polls for the same task
  if (activePolls.has(taskId)) return;
  activePolls.set(taskId, true);

  const store = useProcessingStore.getState();
  store.addTask(taskId, label, { link, doneLabel });

  let attempts = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  const poll = async () => {
    if (!activePolls.has(taskId)) return; // Cancelled

    attempts++;
    try {
      const result = await pollFn();
      consecutiveErrors = 0; // Reset on success

      if (result.status === "analyzed" || result.status === "ready") {
        activePolls.delete(taskId);
        useProcessingStore.getState().completeTask(taskId);
        onReady(result as Record<string, unknown>);
      } else if (result.status === "error") {
        activePolls.delete(taskId);
        const errorMsg = "Erro no processamento. Tente novamente.";
        useProcessingStore.getState().failTask(taskId, errorMsg);
        onError?.(errorMsg);
      } else if (attempts >= maxAttempts) {
        activePolls.delete(taskId);
        const errorMsg = "Tempo limite atingido. Tente novamente.";
        useProcessingStore.getState().failTask(taskId, errorMsg);
        onError?.(errorMsg);
      } else {
        setTimeout(poll, intervalMs);
      }
    } catch {
      consecutiveErrors++;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        activePolls.delete(taskId);
        const errorMsg = "Erro de conexão. Tente novamente.";
        useProcessingStore.getState().failTask(taskId, errorMsg);
        onError?.(errorMsg);
      } else {
        // Retry after transient error
        setTimeout(poll, intervalMs);
      }
    }
  };

  setTimeout(poll, intervalMs);
}
