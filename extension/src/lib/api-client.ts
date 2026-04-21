/**
 * API client for the Chrome extension.
 * All requests are routed through the service worker to avoid
 * exposing the Firebase token in the content script context.
 */

export async function apiGet<T = any>(path: string): Promise<T> {
  console.log(`[API] GET ${path}`);
  const response = await chrome.runtime.sendMessage({
    type: "API_REQUEST",
    method: "GET",
    path,
  });
  console.log(`[API] GET ${path} response:`, response);
  if (response?.error) throw new Error(response.error);
  if (response?.status && response.status >= 400) {
    throw new Error(response.data?.detail || `API error: ${response.status}`);
  }
  if (!response) throw new Error("No response from service worker");
  return response.data;
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage({
    type: "API_REQUEST",
    method: "POST",
    path,
    body,
  });
  if (response.error) throw new Error(response.error);
  if (response.status && response.status >= 400) {
    throw new Error(response.data?.detail || `API error: ${response.status}`);
  }
  return response.data;
}
