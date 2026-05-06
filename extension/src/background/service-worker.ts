import {
  driveQueue,
  queueKick,
  focusQueueTab,
  getTabOwnership,
  installQueueAlarm,
  onTabStatusUpdate,
  configureQueue,
} from "./queue";
import { isAutoApplySessionKey } from "../lib/session-state";

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

// Injected at build time by webpack DefinePlugin (webpack.config.js).
// Default is prod; override with `API_BASE=…` / `FIREBASE_API_KEY=…` env
// vars at build time. Runtime detection via `update_url` was unreliable —
// it sent every unpacked (dev-loaded) build to localhost, silently breaking
// installs on real users.
declare const process: { env: { FIREBASE_API_KEY: string; API_BASE: string } };
const API_BASE = process.env.API_BASE;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // Firebase tokens last 1 hour

// --- Auth Functions (launchWebAuthFlow → Firebase) ---

const GOOGLE_CLIENT_ID = "531233742939-4vqg9iv7c0v4jr89hb5a428f1486pltj.apps.googleusercontent.com";
const REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org`;
const SCOPES = "openid email profile";

/**
 * Sign in via chrome.identity.launchWebAuthFlow (opens Google consent in a tab).
 * Gets a Google id_token, then exchanges it for a Firebase ID token.
 */
async function signIn(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Auth] Starting sign-in flow");

    // Step 1: Build Google OAuth URL
    const nonce = crypto.randomUUID();
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("response_type", "token id_token");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("prompt", "select_account");

    // Step 2: Launch auth flow — opens Google sign-in in a browser tab
    console.log("[Auth] Launching web auth flow");
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (!responseUrl) {
      throw new Error("Auth flow returned no URL");
    }
    console.log("[Auth] Got response URL from auth flow");

    // Step 3: Extract tokens from the redirect URL fragment
    const hashParams = new URLSearchParams(responseUrl.split("#")[1] || "");
    const googleIdToken = hashParams.get("id_token");
    const accessToken = hashParams.get("access_token");

    if (!googleIdToken) {
      throw new Error("No id_token in auth response");
    }
    console.log("[Auth] Extracted Google tokens, exchanging for Firebase token");

    // Step 4: Exchange Google id_token for Firebase ID token
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postBody: `id_token=${googleIdToken}&access_token=${accessToken}&providerId=google.com`,
          requestUri: REDIRECT_URI,
          returnIdpCredential: true,
          returnSecureToken: true,
        }),
      }
    );

    if (!firebaseResponse.ok) {
      const err = await firebaseResponse.json();
      throw new Error(err.error?.message || "Firebase auth failed");
    }

    const data = await firebaseResponse.json();
    console.log("[Auth] Firebase exchange successful, uid:", data.localId);

    authState = {
      token: data.idToken,
      tokenExpiry: Date.now() + TOKEN_LIFETIME_MS,
      user: {
        uid: data.localId,
        email: data.email || null,
        displayName: data.displayName || null,
      },
    };

    // CRITICAL: await storage write — without await, SW termination can race
    // and kill the worker before the write completes (popup is already dead)
    await chrome.storage.session.set({ authState });
    console.log("[Auth] Auth state persisted to session storage");

    return { success: true };
  } catch (error) {
    console.error("[Auth] Sign-in failed:", (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
}

async function signOutUser(): Promise<void> {
  authState = { token: null, tokenExpiry: 0, user: null };
  await chrome.storage.session.set({ authState });
}

async function readAuthState(): Promise<AuthState> {
  const stored = await chrome.storage.session.get("authState");
  const state = (stored.authState || authState) as AuthState;
  if (state.token && !authState.token) {
    authState = state;
  }
  return state;
}

async function getValidToken(): Promise<string | null> {
  // Check if token is still valid (in-memory)
  if (authState.token && Date.now() < authState.tokenExpiry - TOKEN_REFRESH_BUFFER_MS) {
    return authState.token;
  }

  // In-memory state may be stale after SW restart — check session storage
  if (!authState.token) {
    const stored = await chrome.storage.session.get("authState");
    if (stored.authState) {
      authState = stored.authState as AuthState;
      if (authState.token && Date.now() < authState.tokenExpiry - TOKEN_REFRESH_BUFFER_MS) {
        return authState.token;
      }
    }
  }

  // Token expired — try silent re-auth via launchWebAuthFlow (non-interactive)
  try {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("response_type", "token id_token");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("nonce", crypto.randomUUID());
    authUrl.searchParams.set("prompt", "none"); // Silent — no user interaction

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: false, // Silent refresh
    });

    if (!responseUrl) return null;

    const hashParams = new URLSearchParams(responseUrl.split("#")[1] || "");
    const googleIdToken = hashParams.get("id_token");
    const accessToken = hashParams.get("access_token");

    if (!googleIdToken) return null;

    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postBody: `id_token=${googleIdToken}&access_token=${accessToken}&providerId=google.com`,
          requestUri: REDIRECT_URI,
          returnSecureToken: true,
        }),
      }
    );

    if (!firebaseResponse.ok) return null;

    const data = await firebaseResponse.json();
    authState.token = data.idToken;
    authState.tokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
    authState.user = {
      uid: data.localId,
      email: data.email || null,
      displayName: data.displayName || null,
    };
    await chrome.storage.session.set({ authState });
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

function assertAutoApplySessionKey(key: unknown): string {
  if (typeof key !== "string" || !isAutoApplySessionKey(key)) {
    throw new Error("Forbidden auto-apply session key");
  }
  return key;
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

// --- Dashboard navigation ---

// Frontends matched by manifest host_permissions. Order = preference when
// the user has no Merlin tab open at all (prod first).
const MERLIN_FRONTENDS = [
  "https://merlincv.com",
  "https://staging.merlincv.com",
  "http://localhost:3000",
];
const CANDIDATURAS_PATH = "/dashboard/candidaturas";

async function openCandidaturasDashboard(): Promise<void> {
  // 1. Already-open candidaturas tab on any env → focus it (no new tab).
  const allMerlinTabs = await chrome.tabs.query({
    url: MERLIN_FRONTENDS.map((h) => `${h}/*`),
  });
  const existing = allMerlinTabs.find(
    (t) => t.url && t.url.includes(CANDIDATURAS_PATH),
  );
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  // 2. No candidaturas tab. Use the env the user already has open
  // (so a staging user doesn't get bounced to prod), else default to prod.
  let origin = MERLIN_FRONTENDS[0];
  for (const host of MERLIN_FRONTENDS) {
    if (allMerlinTabs.some((t) => t.url?.startsWith(host + "/"))) {
      origin = host;
      break;
    }
  }
  await chrome.tabs.create({ url: `${origin}${CANDIDATURAS_PATH}` });
}

// --- Message Handler ---

async function extensionPresenceResponse() {
  const state = await readAuthState();
  return {
    ok: true,
    version: chrome.runtime.getManifest().version,
    user: state.user,
    isAuthenticated: !!state.token,
  };
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    switch (message?.type) {
      case "PING":
        return extensionPresenceResponse();
      default:
        return { error: "Unknown message type" };
    }
  };

  handle().then((result) => {
    try { sendResponse(result); } catch { /* sender closed */ }
  }).catch((err) => {
    try { sendResponse({ error: err.message }); } catch { /* sender closed */ }
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // From popup or content script
  const handle = async () => {
    switch (message.type) {
      case "PING":
        return extensionPresenceResponse();

      case "SIGN_IN":
        return signIn();

      case "SIGN_OUT":
        await signOutUser();
        return { success: true };

      case "GET_AUTH_STATE": {
        // Read directly from storage to avoid race with SW startup restore
        const state = await readAuthState();
        return { user: state.user, isAuthenticated: !!state.token };
      }

      case "API_REQUEST":
        return apiRequest(message.method, message.path, message.body);

      case "SESSION_LOCK_ACQUIRE":
        return { acquired: acquireSession(sender.tab?.id || 0, message.jobUrl) };

      case "SESSION_LOCK_RELEASE":
        releaseSession(sender.tab?.id || 0);
        return { released: true };

      case "SESSION_LOCK_CHECK":
        return { locked: session.activeTabId !== null, activeTab: session.activeTabId };

      // --- Batch queue (backend-sourced) ---
      case "QUEUE_KICK":
        // Triggered by popup open, merlincv.com bridge, or tab events.
        {
          const queue = await queueKick();
          const state = await readAuthState();
          return {
            ok: queue.ok,
            error: queue.error,
            queue,
            user: state.user,
            isAuthenticated: !!state.token,
            version: chrome.runtime.getManifest().version,
          };
        }

      case "QUEUE_FOCUS_TAB":
        return { focused: await focusQueueTab(message.queueId) };

      case "QUEUE_OPEN_DASHBOARD":
        // Dashboard lives in the Merlin frontend. Focus an existing
        // candidaturas tab if one is open (any env), else open a new tab on
        // whichever env the user already has open, falling back to prod.
        // Then kick the queue immediately: from the popup, "Abrir
        // candidaturas em lote" is a user intent to start any pending work,
        // not just navigate to a page that may already be focused.
        {
          await openCandidaturasDashboard();
          const queue = await queueKick();
          const state = await readAuthState();
          return {
            ok: queue.ok,
            error: queue.error,
            opened: true,
            kicked: true,
            queue,
            user: state.user,
            isAuthenticated: !!state.token,
            version: chrome.runtime.getManifest().version,
          };
        }

      case "GET_QUEUE_OWNERSHIP": {
        const tabId = sender.tab?.id;
        if (!tabId) return { ownership: null, tabId: null };
        const ownership = await getTabOwnership(tabId);
        return { ownership, tabId };
      }

      case "AUTOAPPLY_SESSION_GET": {
        const key = assertAutoApplySessionKey(message.key);
        const stored = await chrome.storage.session.get(key);
        return { ok: true, value: stored[key] ?? null };
      }

      case "AUTOAPPLY_SESSION_SET": {
        const key = assertAutoApplySessionKey(message.key);
        await chrome.storage.session.set({ [key]: message.value });
        return { ok: true };
      }

      case "AUTOAPPLY_SESSION_REMOVE": {
        const key = assertAutoApplySessionKey(message.key);
        await chrome.storage.session.remove(key);
        return { ok: true };
      }

      // From content script state machines (tab-specific progress).
      case "TAB_STATUS_UPDATE":
        if (sender.tab?.id) {
          await onTabStatusUpdate(sender.tab.id, message.update);
        }
        return { ok: true };

      default:
        return { error: "Unknown message type" };
    }
  };

  handle().then((result) => {
    try { sendResponse(result); } catch { /* popup closed — response port dead, auth still completed */ }
  }).catch((err) => {
    try { sendResponse({ error: err.message }); } catch { /* popup closed */ }
  });
  return true; // Keep channel open for async
});

// Do not relax session storage access to content scripts. The Firebase ID
// token lives in `authState`, so page-context code reaches session state only
// through the narrow AUTOAPPLY_SESSION_* proxy above.

// Restore auth state from session storage on startup
chrome.storage.session.get("authState", (result) => {
  if (result.authState) {
    authState = result.authState as AuthState;
  }
});

// Wire the backend-sourced queue with the SW's authenticated API client and
// install the polling alarm (idempotent across SW restarts).
configureQueue(apiRequest);
installQueueAlarm().catch((err) =>
  console.error("[Queue] installQueueAlarm failed:", err),
);
// Kick once on startup in case there was a batch in flight when the SW died.
driveQueue().catch(() => { /* no-op — unauthenticated is common on cold start */ });

console.log("Gupy AutoApply service worker loaded");
