/**
 * Shared TypeScript types for the Gupy AutoApply extension.
 */

/** State machine steps matching the plan's state machine */
export enum AutoApplyStep {
  IDLE = "IDLE",
  PRE_CHECK = "PRE_CHECK",
  WELCOME = "WELCOME",
  ADDITIONAL_INFO = "ADDITIONAL_INFO",
  CUSTOM_QUESTIONS_DETECT = "CUSTOM_QUESTIONS_DETECT",
  CUSTOM_QUESTIONS_FILL = "CUSTOM_QUESTIONS_FILL",
  PERSONALIZATION = "PERSONALIZATION",
  FINAL_CONFIRMATION = "FINAL_CONFIRMATION",
  REVIEW = "REVIEW",
  COMPLETE = "COMPLETE",
  ERROR = "ERROR",
}

/** Error categories for the ERROR state */
export enum ErrorType {
  AUTH_REQUIRED = "AUTH_REQUIRED",
  GUPY_LOGIN_REQUIRED = "GUPY_LOGIN_REQUIRED",
  LLM_FAILED = "LLM_FAILED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  TIMEOUT = "TIMEOUT",
  NEEDS_HUMAN = "NEEDS_HUMAN",
  BUDGET_EXCEEDED = "BUDGET_EXCEEDED",
}

/** PII stored locally in chrome.storage.local — NEVER sent to backend or LLM */
export interface PiiProfile {
  cpf: string;
  rg: string;
  motherName: string;
  birthDate: string;
  gender: string;
  ethnicity: string;
  disability: string;
  maritalStatus: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

/** Professional profile from the Merlin knowledge file (safe for LLM) */
export interface ProfessionalProfile {
  summary: string;
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate?: string;
    description: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    endDate?: string;
  }>;
  languages: Array<{
    language: string;
    level: string;
  }>;
  salaryExpectation?: string;
  availability?: string;
  linkedinUrl?: string;
}

/** A form field detected on the page */
export interface FormField {
  label: string;
  type: "text" | "select" | "radio" | "checkbox" | "textarea";
  options?: string[];
  required: boolean;
  elementId: string;
}

/** Messages between content script and service worker */
export type ExtensionMessage =
  | { type: "GET_AUTH_TOKEN" }
  | { type: "AUTH_TOKEN"; token: string | null }
  | { type: "API_REQUEST"; method: string; path: string; body?: unknown }
  | { type: "API_RESPONSE"; data: unknown; error?: string }
  | { type: "START_AUTOAPPLY"; jobUrl: string }
  | { type: "STOP_AUTOAPPLY" }
  | { type: "STATUS_UPDATE"; step: AutoApplyStep; error?: ErrorType; detail?: string }
  | { type: "SESSION_LOCK_CHECK" }
  | { type: "SESSION_LOCK_RESULT"; locked: boolean; activeTab?: number };

/** Application log entry */
export interface ApplicationLog {
  jobUrl: string;
  company: string;
  jobTitle: string;
  status: "success" | "failed" | "dry-run";
  fieldsAnswered: number;
  questionsAnswered: number;
  llmCalls: number;
  errors: string[];
  durationSeconds: number;
  timestamp: string;
}
