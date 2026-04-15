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

interface AdditionalInfoResult {
  filled: number;
  skipped: number;
  llmCalls: number;
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
    return { filled: 0, skipped: 0, llmCalls: 0 };
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
  await randomDelay(1000, 2000);
  const nextBtn = findNextButton();
  if (nextBtn) {
    await humanLikeClick(nextBtn);
    await waitForNavigation(15000);
  }

  return { filled, skipped, llmCalls };
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
