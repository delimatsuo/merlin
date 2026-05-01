/**
 * Content script entry point.
 * Injected into all gupy.io pages. Does NOT auto-start on every Gupy page —
 * only runs when:
 *   1. A popup or SW message explicitly requests it (manual mode), OR
 *   2. The tab was opened by the batch queue (per-tab ownership flag set
 *      by the SW — keyed by chrome.tabs.id, queried via GET_QUEUE_OWNERSHIP).
 *
 * The old "applying immediately on every Gupy page" bug happened because
 * hasActiveSession() read a global session flag shared across tabs. The
 * state machine now keys its session by tab id, so a second Gupy tab with
 * no queue ownership sees no active session for itself and stays idle.
 */

import { StateMachine } from "./state-machine";
import { getAdapter } from "./adapters/registry";
import { AutoApplyStep } from "../lib/types";

/**
 * Safety net: keep watching the page for the success screen even after the
 * state machine has exited or gotten stuck. Fires a single completion report
 * if we ever observe COMPLETE. This guards against:
 *   - SM reaching ERROR (timed out in IDLE) before the user-submitted page
 *     finishes loading
 *   - SM exiting normally but the detector missing the success screen in its
 *     final poll window
 *   - Any future adapter path that reaches COMPLETE without going through
 *     the state machine's main loop.
 */
function installCompletionSafetyNet(queueId: string): void {
  let reported = false;
  const start = Date.now();
  const MAX_WATCH_MS = 10 * 60 * 1000; // 10 min — longer than any realistic apply
  const timer = setInterval(() => {
    if (reported) return;
    if (Date.now() - start > MAX_WATCH_MS) {
      clearInterval(timer);
      return;
    }
    try {
      const a = getAdapter();
      if (!a) return;
      if (a.detectScreen() === AutoApplyStep.COMPLETE) {
        reported = true;
        console.log(
          "[GuPy AutoApply] Safety-net: success screen detected, reporting completion. queueId:",
          queueId,
        );
        chrome.runtime
          .sendMessage({ type: "TAB_STATUS_UPDATE", update: { completed: true } })
          .catch(() => {});
        clearInterval(timer);
      }
    } catch {
      /* adapter changed mid-navigation — retry next tick */
    }
  }, 2000);
}

function isSupportedApplicationPage(): boolean {
  const a = getAdapter();
  return !!a && a.isApplicationPage();
}

const sm = new StateMachine();

async function initializeTabId(): Promise<number | null> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_QUEUE_OWNERSHIP" });
    const tabId = resp?.tabId ?? null;
    if (typeof tabId === "number") {
      sm.setTabId(tabId);
      return tabId;
    }
  } catch {
    /* SW not ready */
  }
  return null;
}

// Listen for messages from popup/service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_AUTOAPPLY") {
    if (!isSupportedApplicationPage()) {
      sendResponse({ success: false, error: "Não estamos em uma página de candidatura suportada." });
      return true;
    }

    const jobUrl = window.location.href;
    (async () => {
      await initializeTabId();
      sm.markManualOrigin();
      sm.run(jobUrl);
    })();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "STOP_AUTOAPPLY") {
    sm.stop();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "CONFIRM_SUBMIT") {
    sm.confirmSubmit();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "CANCEL_SUBMIT") {
    sm.cancelSubmit();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "SUBMIT_USER_ANSWERS") {
    sm.submitUserAnswers(message.answers);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_CONTENT_STATUS") {
    sendResponse({
      step: sm.getStep(),
      error: sm.getError(),
      isOnGupyPage: isSupportedApplicationPage(),
      isOnSupportedPage: isSupportedApplicationPage(),
    });
    return true;
  }

  return false;
});

// Gated auto-run on page load.
(async () => {
  if (!isSupportedApplicationPage()) return;

  const tabId = await initializeTabId();
  if (tabId === null) {
    console.log("[GuPy AutoApply] Tab id unknown — skipping auto-run");
    return;
  }

  // Path 1: queue-owned tab (opened by SW for batch).
  const ownership = await chrome.runtime
    .sendMessage({ type: "GET_QUEUE_OWNERSHIP" })
    .catch(() => null);
  if (ownership?.ownership?.queueId) {
    console.log(
      "[GuPy AutoApply] Queue-owned tab — auto-running. queueId:",
      ownership.ownership.queueId,
    );
    installCompletionSafetyNet(ownership.ownership.queueId);
    await new Promise((r) => setTimeout(r, 500));
    sm.run(window.location.href, { forceMode: "auto" });
    return;
  }

  // Path 2: in-tab navigation during a manual-mode run.
  // Only resumes if this specific tab previously started a run.
  if (await sm.hasActiveSessionForTab()) {
    console.log("[GuPy AutoApply] Resuming manual-mode session for this tab");
    await new Promise((r) => setTimeout(r, 500));
    sm.run(window.location.href);
    return;
  }

  // Path 3: page reload while paused on NEEDS_HUMAN — restore the prompt but
  // don't re-run the machine. User must click "Save and continue" to resume.
  console.log("[GuPy AutoApply] Content script ready on application page");
  await new Promise((r) => setTimeout(r, 500));
  await sm.restorePendingPromptIfAny();
})();
