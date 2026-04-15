const SETTINGS_KEY = "gupy_autoapply_settings";

export interface ExtensionSettings {
  mode: "dry-run" | "auto";
}

const DEFAULTS: ExtensionSettings = { mode: "dry-run" };

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULTS, ...(result[SETTINGS_KEY] || {}) };
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}

export async function getMode(): Promise<"dry-run" | "auto"> {
  const settings = await getSettings();
  return settings.mode;
}
