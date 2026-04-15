/**
 * Handler for the "Custom Questions" screen (employer-defined questions).
 * Stub for Phase 2 — full implementation in Phase 3.
 */

import { scrapeFormFields } from "../dom/helpers";

interface CustomQuestionsResult {
  answered: number;
  llmCalls: number;
}

export async function handleCustomQuestions(): Promise<CustomQuestionsResult> {
  console.log("[CustomQuestions] Phase 3 will implement full custom question handling");

  // For now, just report what we see
  const fields = scrapeFormFields();
  console.log(`[CustomQuestions] Found ${fields.length} custom question fields`);

  // Phase 3 will: iterate fields, call /answer-question for each, fill answers
  return { answered: 0, llmCalls: 0 };
}
