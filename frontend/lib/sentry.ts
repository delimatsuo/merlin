import * as Sentry from "@sentry/browser";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

let initialized = false;

export function initSentry() {
  if (initialized || !SENTRY_DSN || typeof window === "undefined") return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: window.location.hostname.includes("staging")
      ? "staging"
      : window.location.hostname === "localhost"
        ? "development"
        : "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,

    // Capture 100% of errors, 10% of transactions (adjust as needed)
    sampleRate: 1.0,
    tracesSampleRate: 0.1,

    // Filter out noisy browser extension errors
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "Load failed",
      "Failed to fetch",
      "NetworkError",
      "AbortError",
    ],

    beforeSend(event) {
      // Strip PII from user context
      if (event.user) {
        delete event.user.ip_address;
      }
      return event;
    },
  });

  initialized = true;
}

export function setUser(uid: string, email?: string) {
  Sentry.setUser({ id: uid, email });
}

export function clearUser() {
  Sentry.setUser(null);
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({ category, message, data, level: "info" });
}
