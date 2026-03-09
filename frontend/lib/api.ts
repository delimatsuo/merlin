import { auth } from "./firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private async getHeaders(): Promise<HeadersInit> {
    const user = auth.currentUser;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async get<T>(path: string): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE_URL}${path}`, { headers });
    if (response.status === 401) {
      // Token expired, force refresh
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true);
        return this.get(path);
      }
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(error.detail || `Erro ${response.status}`);
    }
    return response.json();
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401) {
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true);
        return this.post(path, body);
      }
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(error.detail || `Erro ${response.status}`);
    }
    return response.json();
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const user = auth.currentUser;
    const headers: HeadersInit = {};
    if (user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(error.detail || `Erro ${response.status}`);
    }
    return response.json();
  }

  async delete<T>(path: string): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(error.detail || `Erro ${response.status}`);
    }
    return response.json();
  }

  getWebSocketUrl(path: string): string {
    const wsBase = API_BASE_URL.replace(/^http/, "ws");
    return `${wsBase}${path}`;
  }
}

export const api = new ApiClient();
