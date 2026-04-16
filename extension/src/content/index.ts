/**
 * Content script entry point.
 * Injected into all gupy.io pages.
 * Listens for START_AUTOAPPLY message and auto-resumes if a session is active.
 */

import { StateMachine } from "./state-machine";
import { isGupyApplicationPage } from "./screens/detector";

const sm = new StateMachine();

// Listen for messages from popup/service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_AUTOAPPLY") {
    if (!isGupyApplicationPage()) {
      sendResponse({ success: false, error: "Não estamos em uma página de candidatura do Gupy." });
      return true;
    }

    const jobUrl = window.location.href;
    sm.run(jobUrl);
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
      isOnGupyPage: isGupyApplicationPage(),
    });
    return true;
  }

  return false;
});

// Auto-resume: if there's an active session from a previous page navigation,
// continue the state machine on this new page
(async () => {
  if (isGupyApplicationPage() && await sm.hasActiveSession()) {
    console.log("[GuPy AutoApply] Resuming active session after navigation");
    // Small delay to let the page settle
    await new Promise((r) => setTimeout(r, 1500));
    sm.run(window.location.href);
  } else if (isGupyApplicationPage()) {
    console.log("[GuPy AutoApply] Content script ready on application page");
  }
})();
