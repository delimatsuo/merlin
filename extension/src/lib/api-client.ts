/**
 * API client for communicating with the Merlin backend.
 */

const BACKEND_URL = "https://merlin-backend-531233742939.southamerica-east1.run.app";

export async function apiRequest<T>(
  _endpoint: string,
  _options?: RequestInit
): Promise<T> {
  // TODO: Implement authenticated API calls to the Merlin backend
  throw new Error("Not implemented");
}

export { BACKEND_URL };
