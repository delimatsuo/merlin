/**
 * Offscreen document for Firebase Auth.
 * Chrome extensions cannot run Firebase Auth in the service worker,
 * so we use an offscreen document as a bridge.
 */

console.log("Offscreen document loaded");

// Listen for auth requests from the service worker
chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse) => {
  // TODO: Handle Firebase Auth operations
  return false;
});
