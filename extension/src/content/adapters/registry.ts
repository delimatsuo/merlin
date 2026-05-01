/**
 * Adapter registry — picks the right BoardAdapter for a given URL.
 *
 * To add a board: write an adapter, register it here, and declare its host
 * patterns in the manifest's content_scripts matches. Order matters — the
 * first adapter that matches wins, so more-specific adapters should come
 * before catch-alls.
 */

import type { BoardAdapter } from "./adapter";
import { gupyAdapter } from "./gupy";
import { cathoAdapter } from "./catho";

const ADAPTERS: BoardAdapter[] = [
  gupyAdapter,
  cathoAdapter,
  // Future: vagasAdapter, linkedinAdapter, greenhouseAdapter, ...
];

export function getAdapter(url: URL = new URL(window.location.href)): BoardAdapter | null {
  for (const a of ADAPTERS) {
    if (a.matches(url)) return a;
  }
  return null;
}

/** True if any registered adapter handles the current page. */
export function isSupportedBoard(url: URL = new URL(window.location.href)): boolean {
  return getAdapter(url) !== null;
}
