import { toast } from "sonner";

import { auth } from "./firebase";
import { captureError, addBreadcrumb } from "./sentry";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000; // 2s, 4s, 8s

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

  private async getAuthHeaders(): Promise<HeadersInit> {
    const user = auth.currentUser;
    const headers: HeadersInit = {};
    if (user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      const detail = error.detail;
      // Only expose user-friendly messages; hide internal/stack trace details
      let message: string;
      if (typeof detail === "string" && detail.length < 200 && !detail.includes("Traceback")) {
        message = detail;
      } else if (response.status === 429) {
        message = typeof detail === "string" ? detail : "Muitas requisicoes. Aguarde um momento.";
      } else if (response.status === 503) {
        message = typeof detail === "string" ? detail : "O serviço está temporariamente indisponível. Tente novamente mais tarde.";
      } else if (response.status === 413) {
        message = "Arquivo muito grande.";
      } else if (response.status >= 500) {
        message = "Erro interno. Tente novamente em alguns minutos.";
      } else {
        message = `Erro ${response.status}. Tente novamente.`;
      }
      const err = new Error(message);
      // Don't report expected errors to Sentry (422=validation, 429=rate limit, 403=not admin, 503=overloaded)
      if (response.status !== 422 && response.status !== 429 && response.status !== 403 && response.status !== 503) {
        captureError(err, { status: response.status, url: response.url });
      }
      throw err;
    }
    return response.json();
  }

  private sanitizeError(detail: unknown, status: number): string {
    if (typeof detail === "string" && detail.length < 200 && !detail.includes("Traceback")) {
      return detail;
    }
    if (status === 429) {
      return typeof detail === "string" ? detail : "Muitas requisicoes. Aguarde um momento.";
    }
    if (status === 503) {
      return typeof detail === "string" ? detail : "O serviço está temporariamente indisponível. Tente novamente mais tarde.";
    }
    if (status >= 500) return "Erro interno. Tente novamente em alguns minutos.";
    return `Erro ${status}. Tente novamente.`;
  }

  private async retryWithBackoff(fn: () => Promise<Response>): Promise<Response> {
    let response = await fn();

    // Retry once on 401 (token expired)
    if (response.status === 401) {
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true);
        response = await fn();
      }
    }

    // Retry with exponential backoff on 503/429 (transient overload)
    if (response.status === 503 || response.status === 429) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const delaySec = Math.round(delay / 1000);
        const toastId = toast.loading(
          `Serviço temporariamente ocupado. Tentando novamente em ${delaySec}s... (${attempt}/${MAX_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        toast.dismiss(toastId);
        response = await fn();
        if (response.status !== 503 && response.status !== 429) break;
      }
    }

    return response;
  }

  async get<T>(path: string): Promise<T> {
    addBreadcrumb("api", `GET ${path}`);
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      return fetch(`${API_BASE_URL}${path}`, { headers });
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    addBreadcrumb("api", `POST ${path}`);
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      return fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      return fetch(`${API_BASE_URL}${path}`, {
        method: "PUT",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      return fetch(`${API_BASE_URL}${path}`, {
        method: "PATCH",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    });
    return this.handleResponse<T>(response);
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getAuthHeaders();
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: formData,
      });
    });
    return this.handleResponse<T>(response);
  }

  async getBlob(path: string): Promise<Blob> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getAuthHeaders();
      return fetch(`${API_BASE_URL}${path}`, { headers });
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(this.sanitizeError(error.detail, response.status));
    }
    return response.blob();
  }

  async postBlob(path: string, body?: unknown): Promise<Blob> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      return fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(this.sanitizeError(error.detail, response.status));
    }
    return response.blob();
  }

  async postAudio(path: string, audioBlob: Blob): Promise<{ transcript: string }> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getAuthHeaders();
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      return fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: formData,
      });
    });
    return this.handleResponse(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await this.retryWithBackoff(async () => {
      const headers = await this.getHeaders();
      return fetch(`${API_BASE_URL}${path}`, {
        method: "DELETE",
        headers,
      });
    });
    return this.handleResponse<T>(response);
  }

  getWebSocketUrl(path: string): string {
    const wsBase = API_BASE_URL.replace(/^http/, "ws");
    return `${wsBase}${path}`;
  }
}

export const api = new ApiClient();
