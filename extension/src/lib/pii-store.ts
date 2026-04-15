/**
 * PII (Personally Identifiable Information) store.
 * Manages sensitive user data stored locally in chrome.storage.local.
 */

import { PiiProfile } from "./types";

export async function getPiiProfile(): Promise<PiiProfile | null> {
  // TODO: Retrieve PII from chrome.storage.local
  return null;
}

export async function savePiiProfile(_profile: PiiProfile): Promise<void> {
  // TODO: Save PII to chrome.storage.local
}

export async function clearPiiProfile(): Promise<void> {
  // TODO: Clear PII from chrome.storage.local
}
