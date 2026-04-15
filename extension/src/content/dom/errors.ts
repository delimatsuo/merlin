/**
 * Validation error detection for Gupy forms.
 * Scans the DOM for error messages after clicking save/next.
 */

import { SELECTORS } from "./selectors";
import { sleep } from "./helpers";

export interface ValidationError {
  field: string;   // Label or identifier of the field with error
  message: string; // The error message text
}

/**
 * Wait briefly after a form submission, then scan for validation errors.
 * Returns empty array if no errors found.
 */
export async function detectValidationErrors(waitMs: number = 2000): Promise<ValidationError[]> {
  // Wait for Gupy to render validation errors
  await sleep(waitMs);

  const errors: ValidationError[] = [];

  // Strategy 1: Look for error message elements
  const errorSelectors = SELECTORS.form.errorMessage.split(", ");
  for (const selector of errorSelectors) {
    const elements = document.querySelectorAll(selector);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 500) {
        // Try to find the associated field label
        const fieldLabel = findAssociatedFieldLabel(el as HTMLElement);
        errors.push({ field: fieldLabel, message: text });
      }
    }
  }

  // Strategy 2: Look for validation error containers
  const validationEls = document.querySelectorAll(SELECTORS.form.validationError);
  for (let i = 0; i < validationEls.length; i++) {
    const el = validationEls[i];
    const text = el.textContent?.trim();
    if (text && text.length > 0 && !errors.some(e => e.message === text)) {
      const fieldLabel = findAssociatedFieldLabel(el as HTMLElement);
      errors.push({ field: fieldLabel, message: text });
    }
  }

  // Strategy 3: Look for inputs with aria-invalid or error styling
  const invalidInputs = document.querySelectorAll(
    'input[aria-invalid="true"], textarea[aria-invalid="true"], [class*="invalid"], [class*="error-border"]'
  );
  for (let i = 0; i < invalidInputs.length; i++) {
    const input = invalidInputs[i] as HTMLElement;
    const fieldLabel = findAssociatedFieldLabel(input);
    if (fieldLabel && !errors.some(e => e.field === fieldLabel)) {
      errors.push({ field: fieldLabel, message: "Campo inválido" });
    }
  }

  return errors;
}

/**
 * Find the label text associated with an element by traversing up the DOM.
 */
function findAssociatedFieldLabel(el: HTMLElement): string {
  // Try: parent form group's label
  let parent: HTMLElement | null = el;
  for (let depth = 0; depth < 5 && parent; depth++) {
    parent = parent.parentElement;
    if (!parent) break;

    const label = parent.querySelector("label");
    if (label?.textContent?.trim()) {
      return label.textContent.trim();
    }
  }

  // Try: aria-label on the input
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  // Try: placeholder
  if (el instanceof HTMLInputElement && el.placeholder) {
    return el.placeholder;
  }

  return "Campo desconhecido";
}

/**
 * Check if there are any toast/snackbar error notifications on the page.
 */
export function detectToastError(): string | null {
  const toastSelectors = [
    '[class*="toast"]', '[class*="Toast"]',
    '[class*="snackbar"]', '[class*="Snackbar"]',
    '[class*="notification"]', '[class*="Notification"]',
    '[role="status"]',
  ];

  for (const selector of toastSelectors) {
    const elements = document.querySelectorAll(selector);
    for (let i = 0; i < elements.length; i++) {
      const text = elements[i].textContent?.trim().toLowerCase() || "";
      if (text.includes("erro") || text.includes("error") || text.includes("falha") || text.includes("inválid")) {
        return elements[i].textContent?.trim() || null;
      }
    }
  }

  return null;
}
