import type { PiiProfile } from "./types";

const PII_KEY = "gupy_autoapply_pii";

export async function getPiiProfile(): Promise<PiiProfile | null> {
  const result = await chrome.storage.local.get(PII_KEY);
  return (result[PII_KEY] as PiiProfile) || null;
}

export async function savePiiProfile(profile: PiiProfile): Promise<void> {
  await chrome.storage.local.set({ [PII_KEY]: profile });
}

export async function clearPiiProfile(): Promise<void> {
  await chrome.storage.local.remove(PII_KEY);
}

export function isPiiComplete(profile: PiiProfile | null): boolean {
  if (!profile) return false;
  // At minimum, CPF and phone are required for Gupy
  return !!(profile.cpf && profile.phone);
}
