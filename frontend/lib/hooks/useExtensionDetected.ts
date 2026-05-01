"use client";

import { useEffect, useState } from "react";

export interface ExtensionUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

export interface ExtensionStatus {
  detected: boolean | undefined;
  version?: string;
  user?: ExtensionUser | null;
  isAuthenticated?: boolean;
}

/**
 * Detect the Merlin Chrome extension via postMessage handshake with the
 * `merlin-bridge.ts` content script.
 *
 * Returns:
 *   - `undefined` while the handshake is in flight (avoid flashing a
 *     "not installed" UI before the bridge has a chance to reply)
 *   - `true` if the extension content script answered MERLIN_EXTENSION_READY
 *   - `false` after a short timeout with no reply
 */
export function useExtensionStatus(timeoutMs = 1200): ExtensionStatus {
  const [status, setStatus] = useState<ExtensionStatus>({
    detected: undefined,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onMsg = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (e.data?.type === "MERLIN_EXTENSION_READY") {
        if (timer) clearTimeout(timer);
        setStatus({
          detected: true,
          version: typeof e.data.version === "string" ? e.data.version : undefined,
          user: e.data.user ?? null,
          isAuthenticated:
            typeof e.data.isAuthenticated === "boolean"
              ? e.data.isAuthenticated
              : undefined,
        });
      }
    };
    window.addEventListener("message", onMsg);

    try {
      window.postMessage(
        { type: "MERLIN_EXTENSION_PING" },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }

    timer = setTimeout(() => {
      setStatus((prev) =>
        prev.detected === undefined ? { detected: false } : prev,
      );
    }, timeoutMs);

    return () => {
      window.removeEventListener("message", onMsg);
      if (timer) clearTimeout(timer);
    };
  }, [timeoutMs]);

  return status;
}

export function useExtensionDetected(timeoutMs = 1200): boolean | undefined {
  return useExtensionStatus(timeoutMs).detected;
}

// Published extension ID, assigned by the Chrome Web Store on first upload.
// Distinct from the dev-time ID (pckpedgciidgclkelofcicgaeelcicea) which is
// forced by the `key` field in manifest.json for local unpacked installs.
export const CHROME_WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/gpnbdjkdalnalehhfajgapalhlogbbbd";
