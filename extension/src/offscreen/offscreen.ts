import { signIn, getIdToken, onAuthChange, auth } from "../lib/firebase-auth";
import { signOut } from "firebase/auth";

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SIGN_IN") {
    signIn()
      .then(async (user) => {
        const token = await user.getIdToken();
        sendResponse({ success: true, token, email: user.email, displayName: user.displayName });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === "GET_TOKEN") {
    getIdToken(message.forceRefresh || false)
      .then((token) => {
        sendResponse({ success: true, token });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === "SIGN_OUT") {
    signOut(auth)
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

// Monitor auth state and relay to service worker
onAuthChange((user) => {
  chrome.runtime.sendMessage({
    type: "AUTH_STATE_CHANGED",
    user: user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null,
  }).catch(() => {}); // Ignore if no listener
});
