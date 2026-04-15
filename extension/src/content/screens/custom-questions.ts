/**
 * Handler for the "Custom Questions" screen.
 * Scrapes questions, calls LLM for answers, fills them in.
 */

import {
  scrapeFormFields, humanLikeType, humanLikeClick, clickReactSelect,
  clickRadioOption, clickCheckbox, randomDelay, waitForNavigation,
  type ScrapedField
} from "../dom/helpers";
import { findNextButton } from "./detector";
import { findBestOption } from "../field-matcher";
import { apiPost } from "../../lib/api-client";
import { getCachedProfile } from "../../lib/profile";
import { detectValidationErrors, type ValidationError } from "../dom/errors";

export interface CustomQuestionsResult {
  answered: number;
  skipped: number;
  llmCalls: number;
  needsHuman: string[];  // Labels of questions that need manual input
  validationErrors: ValidationError[];
}

/**
 * Handle a page of custom questions.
 * For each question, calls the backend /answer-question endpoint.
 * Returns results including any fields that need human intervention.
 */
export async function handleCustomQuestions(): Promise<CustomQuestionsResult> {
  console.log("[CustomQuestions] Scraping question fields...");

  const fields = scrapeFormFields();
  console.log(`[CustomQuestions] Found ${fields.length} question fields`);

  if (fields.length === 0) {
    // No fields visible — try clicking next
    const nextBtn = findNextButton();
    if (nextBtn) {
      await humanLikeClick(nextBtn);
      await waitForNavigation(15000);
    }
    return { answered: 0, skipped: 0, llmCalls: 0, needsHuman: [], validationErrors: [] };
  }

  const jobUrl = window.location.href;
  const { companyName, jobTitle } = extractJobContext();
  const _profile = getCachedProfile();

  let answered = 0;
  let skipped = 0;
  let llmCalls = 0;
  const needsHuman: string[] = [];

  for (const field of fields) {
    // Skip file inputs
    if ((field.type as string) === "file") {
      needsHuman.push(field.label);
      skipped++;
      continue;
    }

    // Skip fields that already have values (Gupy pre-fills some)
    if (fieldHasValue(field)) {
      console.log(`[CustomQuestions] Skipping pre-filled: "${field.label}"`);
      answered++; // Count as handled
      continue;
    }

    try {
      // Call backend LLM for each question
      const response = await apiPost<{
        answer: string | null;
        needs_human: boolean;
        model_used: string;
      }>("/api/autoapply/answer-question", {
        question: field.label,
        field_type: field.type,
        options: field.options || null,
        job_url: jobUrl,
        company_name: companyName,
        job_title: jobTitle,
      });

      llmCalls++;

      if (response.needs_human || !response.answer) {
        console.log(`[CustomQuestions] NEEDS_HUMAN: "${field.label}" (model: ${response.model_used})`);
        needsHuman.push(field.label);
        skipped++;
        continue;
      }

      // Fill the answer
      await fillQuestionField(field, response.answer);
      answered++;
      console.log(`[CustomQuestions] Answered: "${field.label}" (model: ${response.model_used})`);

      // Delay between questions (human-like pace)
      await randomDelay(500, 1500);

    } catch (error) {
      console.error(`[CustomQuestions] Failed for "${field.label}":`, error);

      // Check if it's a budget error (429)
      const errMsg = (error as Error).message || "";
      if (errMsg.includes("429") || errMsg.includes("Limite")) {
        // Budget exceeded — stop processing more questions
        needsHuman.push(field.label);
        for (let i = fields.indexOf(field) + 1; i < fields.length; i++) {
          needsHuman.push(fields[i].label);
        }
        skipped += fields.length - fields.indexOf(field);
        break;
      }

      needsHuman.push(field.label);
      skipped++;
    }
  }

  console.log(`[CustomQuestions] Answered: ${answered}, Skipped: ${skipped}, LLM calls: ${llmCalls}`);

  // If there are needs_human fields, DON'T click next — let the state machine handle it
  if (needsHuman.length > 0) {
    return { answered, skipped, llmCalls, needsHuman, validationErrors: [] };
  }

  // All answered — click next
  await randomDelay(1000, 2000);
  const nextBtn = findNextButton();
  if (nextBtn) {
    await humanLikeClick(nextBtn);
    await waitForNavigation(15000);
  }

  // After clicking next, check for validation errors
  const validationErrors = await detectValidationErrors();
  if (validationErrors.length > 0) {
    console.warn("[CustomQuestions] Validation errors:", validationErrors);
    return { answered, skipped, llmCalls, needsHuman, validationErrors };
  }

  return { answered, skipped, llmCalls, needsHuman, validationErrors: [] };
}

/**
 * Fill a single question field with the LLM answer.
 */
async function fillQuestionField(field: ScrapedField, answer: string): Promise<void> {
  switch (field.type) {
    case "text":
    case "textarea": {
      const input = field.element as HTMLInputElement | HTMLTextAreaElement;
      await humanLikeType(input, answer);
      break;
    }

    case "select": {
      const bestOption = field.options ? findBestOption(field.options, answer) : answer;
      if (bestOption) {
        await clickReactSelect(field.element, bestOption);
      }
      break;
    }

    case "radio": {
      const container = field.element.closest(
        '[class*="RadioGroup"], [class*="radio"], [role="radiogroup"]'
      ) || field.element.parentElement;
      if (container) {
        const bestOption = field.options ? findBestOption(field.options, answer) : answer;
        if (bestOption) {
          await clickRadioOption(container as HTMLElement, bestOption);
        }
      }
      break;
    }

    case "checkbox": {
      const shouldCheck = answer.toLowerCase() === "true" || answer.toLowerCase() === "sim";
      const container = field.element.closest(
        '[class*="Checkbox"], [class*="checkbox"]'
      ) || field.element.parentElement;
      if (container) {
        await clickCheckbox(container as HTMLElement, shouldCheck);
      }
      break;
    }
  }
}

/**
 * Check if a field already has a value filled in.
 */
function fieldHasValue(field: ScrapedField): boolean {
  const el = field.element;

  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      return el.checked;
    }
    return el.value.trim().length > 0;
  }

  if (el instanceof HTMLTextAreaElement) {
    return el.value.trim().length > 0;
  }

  if (el instanceof HTMLSelectElement) {
    return el.selectedIndex > 0; // 0 is usually the placeholder
  }

  return false;
}

/**
 * Extract company name and job title from the page.
 */
function extractJobContext(): { companyName: string; jobTitle: string } {
  // Company name from subdomain (e.g., "acme" from "acme.gupy.io")
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0];
  const companyName = subdomain !== "www" ? subdomain : "";

  // Job title from page heading or document title
  let jobTitle = "";

  // Try to find job title in the page
  const headings = document.querySelectorAll("h1, h2, [class*='JobTitle'], [class*='job-title']");
  for (let i = 0; i < headings.length; i++) {
    const text = headings[i].textContent?.trim();
    if (text && text.length > 5 && text.length < 200) {
      jobTitle = text;
      break;
    }
  }

  // Fallback: document title often has "Job Title | Company - Gupy"
  if (!jobTitle) {
    const titleParts = document.title.split("|")[0]?.split("-")[0]?.trim();
    if (titleParts) jobTitle = titleParts;
  }

  return { companyName, jobTitle };
}
