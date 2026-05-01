interface SessionProxyResponse<T> {
  ok?: boolean;
  value?: T | null;
  error?: string;
}

async function sendSessionMessage<T>(message: Record<string, unknown>): Promise<SessionProxyResponse<T>> {
  const response = (await chrome.runtime.sendMessage(message)) as SessionProxyResponse<T> | undefined;
  if (!response) {
    throw new Error("No response from service worker session proxy");
  }
  if (response.error) {
    throw new Error(response.error);
  }
  return response;
}

export async function getAutoApplySession<T>(key: string): Promise<T | undefined> {
  const response = await sendSessionMessage<T>({ type: "AUTOAPPLY_SESSION_GET", key });
  return response.value ?? undefined;
}

export async function setAutoApplySession<T>(key: string, value: T): Promise<void> {
  await sendSessionMessage<void>({ type: "AUTOAPPLY_SESSION_SET", key, value });
}

export async function removeAutoApplySession(key: string): Promise<void> {
  await sendSessionMessage<void>({ type: "AUTOAPPLY_SESSION_REMOVE", key });
}
