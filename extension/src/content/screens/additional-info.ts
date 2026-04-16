/**
 * Handler for the "Additional Information" screen (PII + standard fields).
 * Scrapes form fields, runs 3-tier matching, and fills them in.
 */

import {
  scrapeFormFields,
  humanLikeType,
  humanLikeClick,
  clickReactSelect,
  clickRadioOption,
  clickCheckbox,
  randomDelay,
  waitForNavigation,
} from "../dom/helpers";
import { findNextButton } from "./detector";
import { matchAndFillFields, findBestOption } from "../field-matcher";
import { detectValidationErrors, type ValidationError } from "../dom/errors";

export interface AdditionalInfoResult {
  filled: number;
  skipped: number;
  llmCalls: number;
  validationErrors: ValidationError[];
}

export async function handleAdditionalInfo(): Promise<AdditionalInfoResult> {
  console.log("[AdditionalInfo] Scraping form fields...");

  const fields = scrapeFormFields();
  console.log(`[AdditionalInfo] Found ${fields.length} fields`);

  if (fields.length === 0) {
    // No fields — try to click next anyway
    const nextBtn = findNextButton();
    if (nextBtn) {
      await humanLikeClick(nextBtn);
      await waitForNavigation(15000);
    }
    return { filled: 0, skipped: 0, llmCalls: 0, validationErrors: [] };
  }

  // Quick check: if all fields are already pre-filled (e.g., radio buttons defaulting to "No"),
  // skip the LLM entirely and just click next
  const unfilled = fields.filter((f) => {
    const el = f.element;
    if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
      // For radio buttons, check if any option in the group is checked
      const name = el.name;
      if (name) {
        const checked = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
        return !checked; // unfilled if nothing checked
      }
      return !el.checked;
    }
    if (el instanceof HTMLSelectElement) return el.selectedIndex <= 0;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return !el.value.trim();
    return true;
  });

  console.log(`[AdditionalInfo] ${unfilled.length} of ${fields.length} fields need filling`);

  // If all fields are already filled (common for Additional Info with pre-selected "No" radios),
  // skip matching entirely
  if (unfilled.length === 0) {
    console.log("[AdditionalInfo] All fields pre-filled, clicking next");
    await randomDelay(300, 600);
    const nextBtn = findNextButton();
    if (nextBtn) {
      nextBtn.click();
      await waitForNavigation(5000);
    }
    return { filled: fields.length, skipped: 0, llmCalls: 0, validationErrors: [] };
  }

  // Run the 3-tier field matcher
  const jobUrl = window.location.href;
  const companyName = extractCompanyName();
  const results = await matchAndFillFields(fields, jobUrl, companyName);

  let filled = 0;
  let skipped = 0;
  const llmCalls = results.some((r) => r.source === "llm") ? 1 : 0; // Batch call counts as 1

  // Fill each matched field
  for (const result of results) {
    if (!result.value) {
      skipped++;
      continue;
    }

    try {
      await fillField(result.field.element, result.field.type, result.value, result.field.options);
      filled++;
      await randomDelay(300, 800); // Small delay between fields
    } catch (error) {
      console.warn(`[AdditionalInfo] Failed to fill "${result.field.label}":`, error);
      skipped++;
    }
  }

  console.log(`[AdditionalInfo] Filled: ${filled}, Skipped: ${skipped}`);

  // Click next/continue
  await randomDelay(300, 600);
  const nextBtn = findNextButton();
  if (nextBtn) {
    console.log(`[AdditionalInfo] Clicking next: "${nextBtn.textContent?.trim()}" (${nextBtn.tagName})`);
    nextBtn.click();
    await waitForNavigation(5000);
  }

  // After clicking next, check for validation errors
  const validationErrors = await detectValidationErrors();
  if (validationErrors.length > 0) {
    console.warn("[AdditionalInfo] Validation errors:", validationErrors);
    return { filled, skipped, llmCalls, validationErrors };
  }

  return { filled, skipped, llmCalls, validationErrors: [] };
}

async function fillField(
  element: HTMLElement,
  type: string,
  value: string,
  options?: string[],
): Promise<void> {
  switch (type) {
    case "text":
    case "textarea": {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      // Check if field already has the correct value
      if (input.value === value) return;
      await humanLikeType(input, value);
      break;
    }

    case "select": {
      // For custom React selects, find the best matching option
      const bestOption = options ? findBestOption(options, value) : value;
      if (bestOption) {
        await clickReactSelect(element, bestOption);
      }
      break;
    }

    case "radio": {
      const container =
        element.closest('[class*="RadioGroup"], [class*="radio"], [role="radiogroup"]') ||
        element.parentElement;
      if (container) {
        const bestOption = options ? findBestOption(options, value) : value;
        if (bestOption) {
          await clickRadioOption(container as HTMLElement, bestOption);
        }
      }
      break;
    }

    case "checkbox": {
      const shouldCheck = value.toLowerCase() === "true" || value.toLowerCase() === "sim";
      const container =
        element.closest('[class*="Checkbox"], [class*="checkbox"]') || element.parentElement;
      if (container) {
        await clickCheckbox(container as HTMLElement, shouldCheck);
      }
      break;
    }
  }
}

function extractCompanyName(): string {
  // Try to extract company name from the page
  const hostname = window.location.hostname; // e.g., "acme.gupy.io"
  const subdomain = hostname.split(".")[0];
  return subdomain !== "www" ? subdomain : "";
}
