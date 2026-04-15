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

// Toggle for local development vs production
const IS_DEV = !("update_url" in chrome.runtime.getManifest());
const API_BASE = IS_DEV
  ? "http://localhost:8000"
  : "https://merlin-backend-531233742939.southamerica-east1.run.app";
const FIREBASE_API_KEY = "AIzaSyAPhPf4qzo94WplQwQl9gbjauBbFOi7J3w";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // Firebase tokens last 1 hour

// --- Auth Functions (chrome.identity → Firebase) ---

/**
 * Sign in using chrome.identity.getAuthToken (Google OAuth via manifest oauth2 config)
 * then exchange the Google token for a Firebase ID token.
 */
async function signIn(): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Get Google OAuth token via chrome.identity
    const googleToken = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (result: any) => {
        const token = typeof result === "string" ? result : result?.token;
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message || "Auth cancelled"));
        } else {
          resolve(token);
        }
      });
    });

    // Step 2: Exchange Google token for Firebase ID token
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postBody: `access_token=${googleToken}&providerId=google.com`,
          requestUri: `https://${chrome.runtime.id}.chromiumapp.org`,
          returnIdpCredential: true,
          returnSecureToken: true,
        }),
      }
    );

    if (!firebaseResponse.ok) {
      const err = await firebaseResponse.json();
      throw new Error(err.error?.message || "Firebase auth failed");
    }

    const firebaseData = await firebaseResponse.json();

    authState = {
      token: firebaseData.idToken,
      tokenExpiry: Date.now() + TOKEN_LIFETIME_MS,
      user: {
        uid: firebaseData.localId,
        email: firebaseData.email || null,
        displayName: firebaseData.displayName || null,
      },
    };
    chrome.storage.session.set({ authState });

    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

async function signOutUser(): Promise<void> {
  // Revoke the Google token
  if (authState.token) {
    chrome.identity.getAuthToken({ interactive: false }, (result: any) => {
      const token = typeof result === "string" ? result : result?.token;
      if (token) {
        chrome.identity.removeCachedAuthToken({ token });
      }
    });
  }
  authState = { token: null, tokenExpiry: 0, user: null };
  chrome.storage.session.set({ authState });
}

async function getValidToken(): Promise<string | null> {
  // Check if token is still valid
  if (authState.token && Date.now() < authState.tokenExpiry - TOKEN_REFRESH_BUFFER_MS) {
    return authState.token;
  }

  // Token expired — get a fresh Google token and re-exchange
  try {
    // Force remove cached token so we get a fresh one
    const oldGoogleToken = await new Promise<string | undefined>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (result: any) => {
        resolve(typeof result === "string" ? result : result?.token);
      });
    });
    if (oldGoogleToken) {
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: oldGoogleToken }, resolve);
      });
    }

    // Get new Google token
    const googleToken = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (result: any) => {
        const token = typeof result === "string" ? result : result?.token;
        if (chrome.runtime.lastError || !token) {
          reject(new Error("Token refresh failed"));
        } else {
          resolve(token);
        }
      });
    });

    // Exchange for Firebase token
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postBody: `access_token=${googleToken}&providerId=google.com`,
          requestUri: `https://${chrome.runtime.id}.chromiumapp.org`,
          returnSecureToken: true,
        }),
      }
    );

    if (!firebaseResponse.ok) return null;

    const data = await firebaseResponse.json();
    authState.token = data.idToken;
    authState.tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
    chrome.storage.session.set({ authState });
    return data.idToken;
  } catch {
    return null;
  }
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
  // From popup or content script
  const handle = async () => {
    switch (message.type) {
      case "SIGN_IN":
        return signIn();

      case "SIGN_OUT":
        await signOutUser();
        return { success: true };

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
