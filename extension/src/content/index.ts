/**
 * Content script entry point.
 * Injected into all gupy.io pages.
 * Listens for START_AUTOAPPLY message from popup/service worker to begin automation.
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

// Announce presence
if (isGupyApplicationPage()) {
  console.log("[GuPy AutoApply] Content script ready on application page");
}
