/**
 * Handler for the "Personalization" screen.
 * Generates a contextual answer for "Why do you want this job?" using the LLM.
 */

import { scrapeFormFields, humanLikeType, humanLikeClick, randomDelay, waitForNavigation } from "../dom/helpers";
import { findNextButton } from "./detector";
import { apiPost } from "../../lib/api-client";

export interface PersonalizationResult {
  answered: boolean;
  llmCalls: number;
}

export async function handlePersonalization(): Promise<PersonalizationResult> {
  console.log("[Personalization] Looking for personalization textarea...");

  // Scrape fields — typically just one or two textareas
  const fields = scrapeFormFields();
  const textareaField = fields.find(f => f.type === "textarea");

  if (!textareaField) {
    // No textarea on this page. Don't click anything — the state machine is
    // responsible for navigation. Previously this handler scanned the whole
    // document for any "finalizar" button and clicked it with a raw b.click(),
    // which raced with the main loop's modal handler: when Gupy's
    // "Introduce yourself!" modal was open the handler would try to dismiss it
    // with an uncoordinated click, leaving the SM and the DOM out of sync.
    // Returning cleanly lets the loop re-detect and route to FINAL_CONFIRMATION
    // or COMPLETE as appropriate.
    console.log("[Personalization] No textarea found — letting state machine re-detect");
    return { answered: false, llmCalls: 0 };
  }

  // Check if already filled
  const textarea = textareaField.element as HTMLTextAreaElement;
  if (textarea.value.trim().length > 0) {
    console.log("[Personalization] Already filled, skipping");
    const nextBtn = findNextButton();
    if (nextBtn) {
      await humanLikeClick(nextBtn);
      await waitForNavigation(15000);
    }
    return { answered: true, llmCalls: 0 };
  }

  // Extract job context from page
  const { companyName, jobTitle } = extractJobContext();

  try {
    // Call LLM for a personalized answer
    const response = await apiPost<{
      answer: string | null;
      needs_human: boolean;
      model_used: string;
    }>("/api/autoapply/answer-question", {
      question: textareaField.label || "Por que você quer trabalhar nesta empresa?",
      field_type: "textarea",
      options: null,
      job_url: window.location.href,
      company_name: companyName,
      job_title: jobTitle,
    });

    if (response.needs_human || !response.answer) {
      console.log("[Personalization] LLM returned NEEDS_HUMAN");
      return { answered: false, llmCalls: 1 };
    }

    // Type the answer
    await humanLikeType(textarea, response.answer);
    console.log(`[Personalization] Answered (${response.model_used}): "${response.answer.substring(0, 50)}..."`);

    // Click next
    await randomDelay(1000, 2000);
    const nextBtn = findNextButton();
    if (nextBtn) {
      await humanLikeClick(nextBtn);
      await waitForNavigation(15000);
    }

    return { answered: true, llmCalls: 1 };
  } catch (error) {
    console.error("[Personalization] LLM call failed:", error);
    return { answered: false, llmCalls: 1 };
  }
}

function extractJobContext(): { companyName: string; jobTitle: string } {
  const hostname = window.location.hostname;
  const subdomain = hostname.split(".")[0];
  const companyName = subdomain !== "www" ? subdomain : "";

  let jobTitle = "";
  const headings = document.querySelectorAll("h1, h2, [class*='JobTitle'], [class*='job-title']");
  for (let i = 0; i < headings.length; i++) {
    const text = headings[i].textContent?.trim();
    if (text && text.length > 5 && text.length < 200) {
      jobTitle = text;
      break;
    }
  }
  if (!jobTitle) {
    const titleParts = document.title.split("|")[0]?.split("-")[0]?.trim();
    if (titleParts) jobTitle = titleParts;
  }

  return { companyName, jobTitle };
}
