// Types
interface AuthState {
  token: string | null;
  tokenExpiry: number; // Unix timestamp in ms
  user: { uid: string; email: string | null; displayName: string | null } | null;
}

interface SessionState {
  activeTabId: number | null;
  jobUrl: string | null;
}

let authState: AuthState = { token: null, tokenExpiry: 0, user: null };
let session: SessionState = { activeTabId: null, jobUrl: null };

const API_BASE = "https://merlin-backend-531233742939.southamerica-east1.run.app";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // Firebase tokens last 1 hour

// --- Offscreen Document Management ---

let offscreenCreated = false;

async function ensureOffscreen(): Promise<void> {
  if (offscreenCreated) return;

  // Check if already exists
  const existingContexts = await (chrome.runtime as any).getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: "dist/offscreen.html",
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: "Firebase Auth requires DOM for popup sign-in",
  });
  offscreenCreated = true;
}

// --- Auth Functions ---

async function signIn(): Promise<{ success: boolean; error?: string }> {
  await ensureOffscreen();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "SIGN_IN" }, (response) => {
      if (response?.success) {
        authState = {
          token: response.token,
          tokenExpiry: Date.now() + TOKEN_LIFETIME_MS,
          user: { uid: "", email: response.email, displayName: response.displayName },
        };
        // Store in session storage
        chrome.storage.session.set({ authState });
      }
      resolve(response || { success: false, error: "No response from offscreen" });
    });
  });
}

async function getValidToken(): Promise<string | null> {
  // Check if token needs refresh
  if (authState.token && Date.now() < authState.tokenExpiry - TOKEN_REFRESH_BUFFER_MS) {
    return authState.token;
  }

  // Token expired or about to expire — refresh
  await ensureOffscreen();
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TOKEN", forceRefresh: true }, (response) => {
      if (response?.success && response.token) {
        authState.token = response.token;
        authState.tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
        chrome.storage.session.set({ authState });
        resolve(response.token);
      } else {
        resolve(null);
      }
    });
  });
}

// --- API Proxy ---

async function apiRequest(method: string, path: string, body?: unknown): Promise<{ data?: any; error?: string; status?: number }> {
  const token = await getValidToken();
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Client-Type": "extension",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      // Token might be expired — try refresh once
      const newToken = await getValidToken();
      if (newToken && newToken !== token) {
        const retry = await fetch(`${API_BASE}${path}`, {
          method,
          headers: {
            "Authorization": `Bearer ${newToken}`,
            "Content-Type": "application/json",
            "X-Client-Type": "extension",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await retry.json();
        return { data, status: retry.status };
      }
      return { error: "Authentication failed", status: 401 };
    }

    const data = await response.json();
    return { data, status: response.status };
  } catch (error) {
    return { error: (error as Error).message, status: 0 };
  }
}

// --- Session Lock ---

function acquireSession(tabId: number, jobUrl: string): boolean {
  if (session.activeTabId !== null && session.activeTabId !== tabId) {
    return false; // Another tab is already running
  }
  session = { activeTabId: tabId, jobUrl };
  return true;
}

function releaseSession(tabId: number): void {
  if (session.activeTabId === tabId) {
    session = { activeTabId: null, jobUrl: null };
  }
}

// Clean up session if tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  releaseSession(tabId);
});

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Auth state change from offscreen
  if (message.type === "AUTH_STATE_CHANGED") {
    if (message.user) {
      authState.user = message.user;
      chrome.storage.session.set({ authState });
    } else {
      authState = { token: null, tokenExpiry: 0, user: null };
      chrome.storage.session.set({ authState });
    }
    return;
  }

  // From popup or content script
  const handle = async () => {
    switch (message.type) {
      case "SIGN_IN":
        return signIn();

      case "SIGN_OUT":
        await ensureOffscreen();
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "SIGN_OUT" }, resolve);
        });

      case "GET_AUTH_STATE":
        return { user: authState.user, isAuthenticated: !!authState.token };

      case "API_REQUEST":
        return apiRequest(message.method, message.path, message.body);

      case "SESSION_LOCK_ACQUIRE":
        return { acquired: acquireSession(sender.tab?.id || 0, message.jobUrl) };

      case "SESSION_LOCK_RELEASE":
        releaseSession(sender.tab?.id || 0);
        return { released: true };

      case "SESSION_LOCK_CHECK":
        return { locked: session.activeTabId !== null, activeTab: session.activeTabId };

      default:
        return { error: "Unknown message type" };
    }
  };

  handle().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true; // Keep channel open for async
});

// Restore auth state from session storage on startup
chrome.storage.session.get("authState", (result) => {
  if (result.authState) {
    authState = result.authState as AuthState;
  }
});

console.log("Gupy AutoApply service worker loaded");
