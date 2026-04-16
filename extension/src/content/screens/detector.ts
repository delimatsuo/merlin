import { AutoApplyStep } from "../../lib/types";
import { SELECTORS } from "../dom/selectors";
import { findElementByText } from "../dom/helpers";

/**
 * Detect which Gupy application screen is currently displayed.
 * Primary: DOM markers (heading text, form containers, button labels).
 * Secondary: URL path segments as confirmation.
 * Gupy is a React SPA — URL changes are unreliable between screens.
 */
export function detectScreen(): AutoApplyStep {
  // Check for completion screen first (highest priority)
  if (isCompletionScreen()) return AutoApplyStep.COMPLETE;

  // Check for personalization prompt
  if (isPersonalizationScreen()) return AutoApplyStep.PERSONALIZATION;

  // Check for custom questions form
  if (isCustomQuestionsScreen()) return AutoApplyStep.CUSTOM_QUESTIONS_DETECT;

  // Check for additional info / standard form
  if (isAdditionalInfoScreen()) return AutoApplyStep.ADDITIONAL_INFO;

  // Check for welcome/apply screen
  if (isWelcomeScreen()) return AutoApplyStep.WELCOME;

  return AutoApplyStep.IDLE;
}

function isCompletionScreen(): boolean {
  // Look for success/completion messages
  const completionEl = document.querySelector(SELECTORS.gupy.completionMessage);
  if (completionEl) {
    const text = completionEl.textContent?.toLowerCase() || "";
    if (text.includes("sucesso") || text.includes("candidatura enviada") ||
        text.includes("inscriç") || text.includes("completed")) {
      return true;
    }
  }

  // Also check for success in the URL
  if (window.location.pathname.includes("success") || window.location.pathname.includes("complete")) {
    return true;
  }

  return false;
}

function isPersonalizationScreen(): boolean {
  // Detect personalization/cover letter section
  const personalization = document.querySelector(SELECTORS.gupy.personalizationSection);
  if (personalization) return true;

  // Check for "personalizar" or "cover letter" buttons/headings
  for (const text of SELECTORS.buttonText.personalize) {
    if (findElementByText("button, h2, h3, [class*='heading']", text)) return true;
  }

  return false;
}

function isCustomQuestionsScreen(): boolean {
  // Detect custom question containers by class
  const questions = document.querySelector(SELECTORS.gupy.questionContainer);
  if (questions) return true;

  // Detect by heading text — Gupy shows "Questions created by" or "Perguntas criadas"
  const headingTexts = ["questions created by", "perguntas criadas"];
  for (const text of headingTexts) {
    if (findElementByText("h1, h2, h3, h4, p, span, div", text)) return true;
  }

  // Check for "responder agora" / "answer now" prompt
  for (const text of SELECTORS.buttonText.answerNow) {
    if (findElementByText("button, a", text)) return true;
  }

  return false;
}

function isAdditionalInfoScreen(): boolean {
  // Detect standard application form with inputs
  const form = document.querySelector(SELECTORS.gupy.applicationForm);
  if (form) {
    // Must have at least one input field
    const hasInputs = form.querySelector(SELECTORS.form.textInput) ||
                      form.querySelector(SELECTORS.form.select) ||
                      form.querySelector(SELECTORS.form.textarea) ||
                      form.querySelector(SELECTORS.form.radio);
    if (hasInputs) return true;
  }

  // Fallback: if we're on an application URL and there are visible input fields, it's likely additional info
  if (window.location.pathname.includes("/candidates/applications/")) {
    const inputs = document.querySelectorAll("input[type='text'], input:not([type]), textarea, select");
    if (inputs.length >= 2) return true;
  }

  return false;
}

function isWelcomeScreen(): boolean {
  // Look for the apply/candidatar button
  for (const text of SELECTORS.buttonText.apply) {
    if (findElementByText("button, a", text)) return true;
  }

  // Look for "Continue" button (confirmation page)
  if (findElementByText("button, a", "continue") || findElementByText("button, a", "continuar")) {
    // Only if it's not a form page (avoid matching "Save and continue")
    const hasFormInputs = document.querySelectorAll("input[type='text'], textarea, input[type='radio']").length;
    if (hasFormInputs < 2) return true;
  }

  // Look for "Answer now" / "Responder agora" button (gateway before custom questions)
  for (const text of SELECTORS.buttonText.answerNow) {
    if (findElementByText("button, a", text)) return true;
  }

  // Or check URL for job listing page
  const isJobPage = /\/candidate\/job\/\d+/.test(window.location.pathname) &&
                    !window.location.pathname.includes("/apply");
  if (isJobPage) return true;

  // Job posting page (e.g., /jobs/12345)
  if (/\/jobs\/\d+/.test(window.location.pathname)) return true;

  return false;
}

/**
 * Check if the user is logged into Gupy.
 * Returns true if a user avatar or menu is detected.
 */
export function isGupyLoggedIn(): boolean {
  // If we're on an application form page, we must be logged in
  if (window.location.pathname.includes("/candidates/applications/")) return true;

  return !!(
    document.querySelector(SELECTORS.gupy.userAvatar) ||
    document.querySelector(SELECTORS.gupy.userMenu)
  );
}

/**
 * Check if we're on a Gupy application page.
 */
export function isGupyApplicationPage(): boolean {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  // Any page on *.gupy.io is a valid Gupy page for our purposes.
  // The screen detector will determine which step we're on.
  return hostname.endsWith("gupy.io");
}

/**
 * Find a clickable "next" or "continue" button on the current screen.
 */
export function findNextButton(): HTMLElement | null {
  // Try each next/continue text pattern
  for (const text of SELECTORS.buttonText.next) {
    const btn = findElementByText("button", text);
    if (btn && !(btn as HTMLButtonElement).disabled) return btn;
  }

  // Fallback: find submit button in form
  const submitBtn = document.querySelector(SELECTORS.gupy.saveAndContinue) as HTMLElement | null;
  if (submitBtn && !(submitBtn as HTMLButtonElement).disabled) return submitBtn;

  return null;
}

/**
 * Find the finish/submit button.
 */
export function findFinishButton(): HTMLElement | null {
  for (const text of SELECTORS.buttonText.finish) {
    const btn = findElementByText("button", text);
    if (btn && !(btn as HTMLButtonElement).disabled) return btn;
  }
  return null;
}
