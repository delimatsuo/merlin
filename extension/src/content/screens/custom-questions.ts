/**
 * Handler for the "Custom Questions" screen.
 * Uses the 3-tier strategy: PII → conservative → LLM.
 * PII and conservative matches are resolved client-side (no network).
 * Only truly professional questions hit the backend LLM.
 */

import {
  scrapeFormFields, humanLikeType, humanLikeClick, clickReactSelect,
  clickRadioOption, clickCheckbox, randomDelay, waitForNavigation,
  findElementByText,
  type ScrapedField
} from "../dom/helpers";
import { findNextButton } from "./detector";
import { matchAndFillFields, findBestOption } from "../field-matcher";
import { apiPost } from "../../lib/api-client";
import { getCachedProfile } from "../../lib/profile";
import { detectValidationErrors, type ValidationError } from "../dom/errors";

export interface UnansweredField {
  label: string;
  type: "text" | "select" | "radio" | "checkbox" | "textarea";
  options?: string[];
}

export interface CustomQuestionsResult {
  answered: number;
  skipped: number;
  llmCalls: number;
  needsHuman: string[];  // Labels of questions that need manual input
  unansweredFields: UnansweredField[];  // Full field info for popup input form
  validationErrors: ValidationError[];
}

/**
 * Handle a page of custom questions using the 3-tier matching strategy.
 * Tier 1 (PII) and Tier 2 (conservative) resolve client-side.
 * Tier 3 sends remaining fields to the backend LLM in batch.
 * Any remaining unmatched fields go to individual /answer-question calls.
 */
export async function handleCustomQuestions(): Promise<CustomQuestionsResult> {
  console.log("[CustomQuestions] Scraping question fields...");

  const fields = scrapeFormFields();
  console.log(`[CustomQuestions] Found ${fields.length} question fields`);

  if (fields.length === 0) {
    // Try "next" button first, then "answer now" (gateway page)
    const clickable = "button, a, div, span, [role='button'], [class*='btn'], [class*='Btn'], [class*='button'], [class*='Button']";
    let clicked = false;

    const nextBtn = findNextButton();
    if (nextBtn) {
      await humanLikeClick(nextBtn);
      clicked = true;
    }

    if (!clicked) {
      // Look for "Answer now" / "Responder agora" — try <a> first, then any element
      for (const text of ["answer now", "responder agora"]) {
        // Prefer actual <a> links — their native .click() triggers navigation
        const link = findElementByText("a", text);
        if (link) {
          const href = (link as HTMLAnchorElement).href;
          console.log(`[CustomQuestions] Found gateway link: "${link.textContent?.trim()}" href=${href}`);
          if (href && href !== "#" && !href.startsWith("javascript:")) {
            // Direct navigation — most reliable for SPA links
            window.location.href = href;
          } else {
            link.click();
          }
          clicked = true;
          break;
        }

        // Fallback: any clickable element
        const btn = findElementByText(clickable, text);
        if (btn) {
          console.log(`[CustomQuestions] Found gateway button: "${btn.textContent?.trim()}" (${btn.tagName})`);
          btn.click();
          clicked = true;
          break;
        }
      }
    }

    if (clicked) await waitForNavigation(15000);
    return { answered: 0, skipped: 0, llmCalls: 0, needsHuman: [], unansweredFields: [], validationErrors: [] };
  }

  const jobUrl = window.location.href;
  const { companyName, jobTitle } = extractJobContext();

  let answered = 0;
  let skipped = 0;
  let llmCalls = 0;
  const needsHuman: string[] = [];
  const unansweredFields: UnansweredField[] = [];

  // Filter to only fields that need filling
  const fieldsToFill = fields.filter((f) => {
    if ((f.type as string) === "file") {
      needsHuman.push(f.label);
      skipped++;
      return false;
    }
    if (fieldHasValue(f)) {
      console.log(`[CustomQuestions] Skipping pre-filled: "${f.label}"`);
      answered++;
      return false;
    }
    return true;
  });

  if (fieldsToFill.length === 0) {
    return finishAndNavigate(answered, skipped, llmCalls, needsHuman, []);
  }

  // --- 3-tier matching (PII → conservative → batch LLM) ---
  const matchResults = await matchAndFillFields(fieldsToFill, jobUrl, companyName);
  // Count LLM calls from batch (1 call for all unmatched fields)
  const batchUsedLlm = matchResults.some((r) => r.source === "llm");
  if (batchUsedLlm) llmCalls++;

  // Track fields that need individual LLM fallback
  const needsIndividualLlm: ScrapedField[] = [];

  for (const result of matchResults) {
    if (result.value !== null) {
      // Tier 1, 2, or 3 produced an answer — fill it
      try {
        await fillQuestionField(result.field, result.value);
        answered++;
        console.log(`[CustomQuestions] Filled "${result.field.label}" via ${result.source}`);
        await randomDelay(300, 800);
      } catch (err) {
        console.error(`[CustomQuestions] Fill failed for "${result.field.label}":`, err);
        needsHuman.push(result.field.label);
        skipped++;
      }
    } else if (result.source === "needs_human") {
      // Batch LLM said NEEDS_HUMAN — try individual call with richer context
      needsIndividualLlm.push(result.field);
    }
  }

  // --- Fallback: individual LLM calls for remaining fields ---
  for (const field of needsIndividualLlm) {
    try {
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
        console.log(`[CustomQuestions] NEEDS_HUMAN: "${field.label}" (${response.model_used})`);
        needsHuman.push(field.label);
        skipped++;
        continue;
      }

      await fillQuestionField(field, response.answer);
      answered++;
      console.log(`[CustomQuestions] Answered: "${field.label}" (${response.model_used})`);
      await randomDelay(500, 1500);

    } catch (error) {
      console.error(`[CustomQuestions] Failed for "${field.label}":`, error);
      const errMsg = (error as Error).message || "";
      if (errMsg.includes("429") || errMsg.includes("Limite")) {
        needsHuman.push(field.label);
        for (let i = needsIndividualLlm.indexOf(field) + 1; i < needsIndividualLlm.length; i++) {
          needsHuman.push(needsIndividualLlm[i].label);
        }
        skipped += needsIndividualLlm.length - needsIndividualLlm.indexOf(field);
        break;
      }
      needsHuman.push(field.label);
      skipped++;
    }
  }

  // Build unansweredFields from all fields whose labels ended up in needsHuman
  const needsHumanSet = new Set(needsHuman);
  const allFields = [...fieldsToFill, ...fields.filter((f) => (f.type as string) === "file")];
  for (const f of allFields) {
    if (needsHumanSet.has(f.label)) {
      unansweredFields.push({ label: f.label, type: f.type, options: f.options });
    }
  }

  console.log(`[CustomQuestions] Answered: ${answered}, Skipped: ${skipped}, LLM calls: ${llmCalls}`);
  return finishAndNavigate(answered, skipped, llmCalls, needsHuman, unansweredFields);
}

/**
 * Fill unanswered fields with user-provided answers.
 * Called when the user submits answers from the popup.
 */
export async function fillUserAnswers(answers: Record<string, string>): Promise<number> {
  const fields = scrapeFormFields();
  let filled = 0;

  for (const [label, value] of Object.entries(answers)) {
    const field = fields.find((f) => f.label === label);
    if (field && value) {
      try {
        await fillQuestionField(field, value);
        filled++;
        await randomDelay(200, 500);
      } catch (err) {
        console.error(`[CustomQuestions] Failed to fill user answer for "${label}":`, err);
      }
    }
  }

  return filled;
}

async function finishAndNavigate(
  answered: number,
  skipped: number,
  llmCalls: number,
  needsHuman: string[],
  unansweredFields: UnansweredField[],
): Promise<CustomQuestionsResult> {
  if (needsHuman.length > 0) {
    return { answered, skipped, llmCalls, needsHuman, unansweredFields, validationErrors: [] };
  }

  await randomDelay(1000, 2000);
  const nextBtn = findNextButton();
  if (nextBtn) {
    await humanLikeClick(nextBtn);
    await waitForNavigation(15000);
  }

  const validationErrors = await detectValidationErrors();
  if (validationErrors.length > 0) {
    console.warn("[CustomQuestions] Validation errors:", validationErrors);
    return { answered, skipped, llmCalls, needsHuman, unansweredFields, validationErrors };
  }

  return { answered, skipped, llmCalls, needsHuman, unansweredFields: [], validationErrors: [] };
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
