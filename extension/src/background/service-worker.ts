/**
 * Background service worker for the Gupy AutoApply extension.
 * Handles authentication state, API calls, and message routing.
 */

console.log("Gupy AutoApply service worker loaded");

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse) => {
  // TODO: Implement message routing
  return false;
});
