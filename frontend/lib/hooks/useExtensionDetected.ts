"use client";

import { useEffect, useState } from "react";

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
export function useExtensionDetected(timeoutMs = 600): boolean | undefined {
  const [detected, setDetected] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onMsg = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (e.data?.type === "MERLIN_EXTENSION_READY") {
        if (timer) clearTimeout(timer);
        setDetected(true);
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
      setDetected((prev) => (prev === undefined ? false : prev));
    }, timeoutMs);

    return () => {
      window.removeEventListener("message", onMsg);
      if (timer) clearTimeout(timer);
    };
  }, [timeoutMs]);

  return detected;
}

// Published extension ID, assigned by the Chrome Web Store on first upload.
// Distinct from the dev-time ID (pckpedgciidgclkelofcicgaeelcicea) which is
// forced by the `key` field in manifest.json for local unpacked installs.
export const CHROME_WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/gpnbdjkdalnalehhfajgapalhlogbbbd";
