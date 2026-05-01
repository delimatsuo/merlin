/**
 * Content script injected on merlincv.com / staging.merlincv.com / localhost:3000.
 *
 * Forwards limited events from the Merlin dashboard to the extension service
 * worker so the SW can react immediately (e.g. start driving the batch queue
 * right after the user clicks "Aplicar em lote"), instead of waiting for the
 * next 90-second poll tick.
 *
 * The bridge only accepts messages from the same window origin and only
 * forwards a whitelist of message types — any other window.postMessage is
 * ignored to keep the SW surface narrow.
 */

type BridgedMessage =
  | { type: "MERLIN_QUEUE_KICK" }
  | { type: "MERLIN_QUEUE_FOCUS_TAB"; queueId: string }
  | { type: "MERLIN_EXTENSION_PING" };

const ALLOWED_TYPES = new Set<BridgedMessage["type"]>([
  "MERLIN_QUEUE_KICK",
  "MERLIN_QUEUE_FOCUS_TAB",
  "MERLIN_EXTENSION_PING",
]);

function sendWorkerMessage<T>(message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: T | undefined) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function announceReady(): Promise<void> {
  const response = await sendWorkerMessage<{ ok?: boolean }>({ type: "PING" });
  if (response?.ok) {
    window.postMessage(
      { type: "MERLIN_EXTENSION_READY" },
      window.location.origin,
    );
  }
}

async function forwardToWorker(
  message: { type: "QUEUE_KICK" } | { type: "QUEUE_FOCUS_TAB"; queueId: string },
  resultType: "MERLIN_QUEUE_KICK_RESULT" | "MERLIN_QUEUE_FOCUS_TAB_RESULT",
): Promise<void> {
  const response = await sendWorkerMessage<{ error?: string }>(message);
  window.postMessage(
    {
      type: resultType,
      ok: !!response && !response.error,
      error: response?.error ?? (!response ? "extension_unavailable" : undefined),
    },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  // Only accept messages from this exact window (same origin and source).
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (!ALLOWED_TYPES.has(data.type)) return;

  if (data.type === "MERLIN_QUEUE_KICK") {
    void forwardToWorker({ type: "QUEUE_KICK" }, "MERLIN_QUEUE_KICK_RESULT");
  } else if (data.type === "MERLIN_QUEUE_FOCUS_TAB") {
    void forwardToWorker(
      { type: "QUEUE_FOCUS_TAB", queueId: data.queueId },
      "MERLIN_QUEUE_FOCUS_TAB_RESULT",
    );
  } else if (data.type === "MERLIN_EXTENSION_PING") {
    // Frontend component mounted after the bridge loaded — answer its ping
    // so pages that client-side-navigate in can still detect us.
    void announceReady();
  }
});

// Announce our presence on initial load so pages already listening hear us.
void announceReady();
