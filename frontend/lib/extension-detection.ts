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

type RuntimeMessageCallback = (response?: unknown) => void;

export interface ChromeRuntimeLike {
  lastError?: unknown;
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: RuntimeMessageCallback,
  ) => void;
}

export const MERLIN_EXTENSION_IDS = [
  "gpnbdjkdalnalehhfajgapalhlogbbbd",
  "pckpedgciidgclkelofcicgaeelcicea",
] as const;

function normalizeExternalResponse(response: unknown): ExtensionStatus | null {
  if (!response || typeof response !== "object") return null;
  const data = response as {
    ok?: unknown;
    version?: unknown;
    user?: unknown;
    isAuthenticated?: unknown;
  };
  if (data.ok !== true) return null;
  return {
    detected: true,
    version: typeof data.version === "string" ? data.version : undefined,
    user: (data.user as ExtensionUser | null | undefined) ?? null,
    isAuthenticated:
      typeof data.isAuthenticated === "boolean" ? data.isAuthenticated : undefined,
  };
}

function sendExternalPing(
  runtime: ChromeRuntimeLike,
  extensionId: string,
  timeoutMs: number,
): Promise<ExtensionStatus | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    try {
      runtime.sendMessage(extensionId, { type: "PING" }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(normalizeExternalResponse(response));
      });
    } catch {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export async function pingInstalledExtension(
  runtime: ChromeRuntimeLike | undefined,
  extensionIds: readonly string[] = MERLIN_EXTENSION_IDS,
  timeoutMs = 800,
): Promise<ExtensionStatus | null> {
  if (!runtime?.sendMessage) return null;
  for (const extensionId of extensionIds) {
    const response = await sendExternalPing(runtime, extensionId, timeoutMs);
    if (response?.detected) return response;
  }
  return null;
}
