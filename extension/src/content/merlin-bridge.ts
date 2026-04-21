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
  | { type: "MERLIN_QUEUE_FOCUS_TAB"; queueId: string };

const ALLOWED_TYPES = new Set<BridgedMessage["type"]>([
  "MERLIN_QUEUE_KICK",
  "MERLIN_QUEUE_FOCUS_TAB",
]);

window.addEventListener("message", (event) => {
  // Only accept messages from this exact window (same origin and source).
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (!ALLOWED_TYPES.has(data.type)) return;

  if (data.type === "MERLIN_QUEUE_KICK") {
    chrome.runtime.sendMessage({ type: "QUEUE_KICK" }).catch(() => {});
  } else if (data.type === "MERLIN_QUEUE_FOCUS_TAB") {
    chrome.runtime
      .sendMessage({ type: "QUEUE_FOCUS_TAB", queueId: data.queueId })
      .catch(() => {});
  }
});

// Announce our presence so the Merlin frontend can detect the extension.
window.postMessage({ type: "MERLIN_EXTENSION_READY" }, window.location.origin);
