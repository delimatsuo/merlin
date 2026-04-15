/**
 * Shared TypeScript types for the Gupy AutoApply extension.
 */

/** Overall auto-apply state */
export enum AutoApplyState {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  ERROR = "ERROR",
}

/** Error categories */
export enum ErrorType {
  AUTH_EXPIRED = "AUTH_EXPIRED",
  NETWORK_ERROR = "NETWORK_ERROR",
  DOM_CHANGED = "DOM_CHANGED",
  FIELD_NOT_FOUND = "FIELD_NOT_FOUND",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  UNKNOWN = "UNKNOWN",
}

/** PII stored locally (never sent to our backend) */
export interface PiiProfile {
  fullName: string;
  cpf: string;
  phone: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  linkedin?: string;
  portfolio?: string;
}

/** Professional profile from the Merlin knowledge file */
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
}

/** A form field detected on the page */
export interface FormField {
  element: HTMLElement;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "file";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}
