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
  // Priority order matters. Two-way races we care about:
  //   1. Introduce-yourself modal vs. form underneath — the modal wins so
  //      isPersonalizationScreen() doesn't match its "finalizar" button.
  //   2. Introduce-yourself modal vs. completion screen — the modal wins so
  //      a stale "candidatura concluída" tooltip can't false-positive us
  //      past the real submit step.

  // Gupy's pre-submit confirmation modal (FINAL_CONFIRMATION).
  if (findIntroduceYourselfModal()) return AutoApplyStep.FINAL_CONFIRMATION;

  // Check for completion screen (real post-submit success page)
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
  // Gupy's success page reuses the /curriculum URL (no URL change after
  // submit) and class names drift, so we can't rely on a single signal.
  //
  // Previous versions matched on heading-OR-button-OR-bodyText, which
  // false-positived when any of those strings appeared on the application
  // form itself (tooltips, hidden tabs, modal body text). A single
  // false-positive reported "completed" to the queue without actually
  // submitting. Now we require TWO independent signals: a heading/title
  // text AND a distinctive post-submit element (button label or URL path).
  // Legacy class-based hits still qualify as a second signal.

  const headingTexts = [
    "application completed",
    "candidatura concluída",
    "candidatura concluida",
    "candidatura enviada",
    "aplicação concluída",
    "aplicacao concluida",
    "inscrição concluída",
    "inscricao concluida",
    "sua candidatura foi enviada",
  ];
  const headingSelector =
    "h1, h2, h3, h4, [class*='title'], [class*='Title'], [class*='heading'], [class*='Heading']";
  let hasHeading = false;
  for (const text of headingTexts) {
    if (findElementByText(headingSelector, text)) {
      hasHeading = true;
      break;
    }
  }

  const postSubmitButtonTexts = [
    "track application",
    "acompanhar candidatura",
    "acompanhar minha candidatura",
    "review my curriculum",
    "revisar meu currículo",
    "revisar meu curriculo",
  ];
  const clickable = "button, a, [role='button']";
  let hasPostSubmitButton = false;
  for (const text of postSubmitButtonTexts) {
    if (findElementByText(clickable, text)) {
      hasPostSubmitButton = true;
      break;
    }
  }

  const isSuccessUrl =
    window.location.pathname.includes("success") ||
    window.location.pathname.includes("complete");

  let hasLegacyMarker = false;
  const completionEl = document.querySelector(SELECTORS.gupy.completionMessage);
  if (completionEl) {
    const text = completionEl.textContent?.toLowerCase() || "";
    hasLegacyMarker =
      text.includes("sucesso") ||
      text.includes("candidatura enviada") ||
      text.includes("inscriç") ||
      text.includes("completed") ||
      text.includes("concluída") ||
      text.includes("concluida");
  }

  // Strict URL routes to /success are themselves a two-signal match (a URL
  // change rarely happens spuriously on Gupy's SPA).
  if (isSuccessUrl) return true;

  // Otherwise require a heading AND one supporting signal (button or legacy
  // marker). Heading alone is insufficient: modal titles sometimes include
  // "candidatura" phrases in tooltip text.
  return hasHeading && (hasPostSubmitButton || hasLegacyMarker);
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

  // Fallback: if we're on an application URL and there are visible form elements, it's likely additional info
  if (window.location.pathname.includes("/candidates/applications/")) {
    const inputs = document.querySelectorAll("input[type='text'], input[type='radio'], input:not([type]), textarea, select");
    let visibleCount = 0;
    inputs.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.offsetParent !== null && htmlEl.offsetHeight > 0) visibleCount++;
    });
    if (visibleCount >= 2) return true;
  }

  return false;
}

function isWelcomeScreen(): boolean {
  // Broad selector — Gupy renders "buttons" as various element types
  const clickable = "button, a, div, span, [role='button'], [class*='btn'], [class*='Btn'], [class*='button'], [class*='Button']";

  // Look for the apply/candidatar button
  for (const text of SELECTORS.buttonText.apply) {
    if (findElementByText(clickable, text)) return true;
  }

  // Look for "Continue" button (confirmation page)
  if (findElementByText(clickable, "continue") || findElementByText(clickable, "continuar")) {
    // Only if it's not a form page (avoid matching "Save and continue")
    const hasFormInputs = document.querySelectorAll("input[type='text'], textarea, input[type='radio']").length;
    if (hasFormInputs < 2) return true;
  }

  // Look for "Answer now" / "Responder agora" button (gateway before custom questions)
  for (const text of SELECTORS.buttonText.answerNow) {
    if (findElementByText(clickable, text)) return true;
  }

  // Or check URL for job listing page
  const isJobPage = window.location.pathname.includes("/candidate/job/") &&
                    !window.location.pathname.includes("/apply");
  if (isJobPage) return true;

  // Job posting page — Gupy uses various ID formats (numeric, alphanumeric)
  if (window.location.pathname.startsWith("/jobs/")) return true;

  return false;
}

/**
 * Is the job posting closed / no longer accepting applications?
 * Gupy tenants render this on the welcome page (before the form flow),
 * with either an "Applications closed" badge, a "No longer accepting
 * applications" / "Inscrições encerradas" label, or a disabled Apply button.
 */
export function isJobClosed(): boolean {
  const bodyText = (document.body?.innerText || "").toLowerCase();
  const closedPhrases = [
    "applications closed",
    "no longer accepting applications",
    "inscrições encerradas",
    "inscricoes encerradas",
    "candidaturas encerradas",
    "vaga encerrada",
    "vagas encerradas",
    "não está mais recebendo candidaturas",
    "nao esta mais recebendo candidaturas",
    "esta vaga expirou",
    "this job is no longer available",
  ];
  for (const phrase of closedPhrases) {
    if (bodyText.includes(phrase)) return true;
  }

  // Disabled Apply button is a strong signal on the job posting page.
  // Gupy usually renders the Apply button as <button disabled> on closed jobs.
  const applyButtons = document.querySelectorAll<HTMLButtonElement>("button");
  const applyLabels = ["apply", "candidatar", "candidatar-se", "inscrever-se", "aplicar"];
  for (let i = 0; i < applyButtons.length; i++) {
    const btn = applyButtons[i];
    const text = (btn.textContent || "").trim().toLowerCase();
    if (applyLabels.some((l) => text === l || text.startsWith(l + " ") || text.startsWith(l))) {
      if (btn.disabled) return true;
    }
  }

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

const CLICKABLE = "button, a, div, span, [role='button'], [class*='btn'], [class*='Btn'], [class*='button'], [class*='Button']";

/**
 * Detect Gupy's "Review of disqualifying questions" confirmation modal that
 * appears between the custom-questions form and the next step.
 */
export function findDisqualifyingReviewModal(): HTMLElement | null {
  const headingTexts = [
    "review of disqualifying",
    "revisão das perguntas",
    "revisao das perguntas",
    "revisão de perguntas eliminatórias",
    "revisao de perguntas eliminatorias",
    "perguntas eliminatórias",
    "perguntas eliminatorias",
  ];
  for (const text of headingTexts) {
    const el = findElementByText("h1, h2, h3, [class*='title'], [class*='Title'], [class*='heading'], [class*='Heading']", text);
    if (el) {
      const modal = el.closest("[role='dialog'], [class*='modal'], [class*='Modal'], [class*='dialog'], [class*='Dialog']") as HTMLElement | null;
      if (modal) return modal;
      // Fallback: return the heading's containing card-ish ancestor
      return (el.closest("section, div[class*='container']") as HTMLElement | null) ?? el;
    }
  }
  return null;
}

/**
 * Inside the review modal, find the "Confirm" button (not the "Review" button
 * that dismisses back to the form).
 */
export function findConfirmButtonInModal(modal: HTMLElement): HTMLElement | null {
  const confirmTexts = ["confirm", "confirmar"];
  for (const text of confirmTexts) {
    const buttons = modal.querySelectorAll<HTMLElement>(CLICKABLE);
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if ((btn as HTMLButtonElement).disabled) continue;
      const label = btn.textContent?.trim().toLowerCase() || "";
      if (label === text || label.startsWith(text + " ")) return btn;
    }
  }
  return null;
}

/**
 * Detect Gupy's "Introduce yourself!" optional-personalization modal that
 * appears right before the final submit step. Two buttons: "Personalize
 * application" (opens cover letter flow) and "Finish application" (skip).
 * Auto mode skips straight to submit by clicking the finish button.
 *
 * Gupy styles modal text via styled-components, so the heading is not always
 * in an h1..h4. We detect defensively by looking for any visible dialog that
 * contains BOTH an "Introduce yourself"/"Apresente-se" heading AND a
 * "Finish/Finalizar/Concluir" button — that combination is unique to this
 * modal in the Gupy candidate flow.
 */
export function findIntroduceYourselfModal(): HTMLElement | null {
  const introMarkers = ["introduce yourself", "apresente-se", "apresente se"];
  const finishMarkers = [
    "finish application",
    "finalizar candidatura",
    "finalizar aplicação",
    "finalizar aplicacao",
    "concluir candidatura",
  ];

  // Primary: any visible dialog/modal whose text contains both markers.
  const dialogs = document.querySelectorAll<HTMLElement>(
    "[role='dialog'], [aria-modal='true'], [class*='modal'], [class*='Modal'], [class*='dialog'], [class*='Dialog']",
  );
  for (let i = 0; i < dialogs.length; i++) {
    const dialog = dialogs[i];
    const style = getComputedStyle(dialog);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const text = (dialog.textContent || "").toLowerCase();
    const hasIntro = introMarkers.some((m) => text.includes(m));
    const hasFinish = finishMarkers.some((m) => text.includes(m));
    if (hasIntro && hasFinish) {
      console.log("[Detector] Found Introduce-yourself modal via dialog signature");
      return dialog;
    }
  }

  // Fallback: broader heading selector (p/span/div, not just h*), then walk
  // up to the dialog ancestor.
  for (const text of introMarkers) {
    const el = findElementByText(
      "h1, h2, h3, h4, h5, h6, p, strong, span, div, [class*='title'], [class*='Title'], [class*='heading'], [class*='Heading']",
      text,
    );
    if (el) {
      const modal = el.closest(
        "[role='dialog'], [aria-modal='true'], [class*='modal'], [class*='Modal'], [class*='dialog'], [class*='Dialog']",
      ) as HTMLElement | null;
      if (modal) {
        console.log("[Detector] Found Introduce-yourself modal via heading fallback");
        return modal;
      }
      return (el.closest("section, div") as HTMLElement | null) ?? el;
    }
  }
  return null;
}

/**
 * Inside the Introduce-yourself modal, find the "Finish application" /
 * "Finalizar candidatura" button. We deliberately pick finish over
 * personalize so the batch driver doesn't get sidetracked into an optional
 * cover-letter flow — users can iterate on cover letters separately.
 */
export function findFinishButtonInIntroduceModal(modal: HTMLElement): HTMLElement | null {
  const finishTexts = [
    "finish application",
    "finalizar candidatura",
    "finalizar aplicação",
    "finalizar aplicacao",
    "concluir candidatura",
    "finish",
    "finalizar",
    "concluir",
  ];
  const buttons = modal.querySelectorAll<HTMLElement>(CLICKABLE);
  for (const text of finishTexts) {
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if ((btn as HTMLButtonElement).disabled) continue;
      const label = btn.textContent?.trim().toLowerCase() || "";
      if (label === text || label.includes(text)) {
        console.log(`[Detector] Found Introduce-yourself Finish button (matched "${text}")`);
        return btn;
      }
    }
  }
  // Last resort: pick a non-"Personalize" button in the modal. The modal
  // reliably contains exactly two buttons (personalize vs finish); whichever
  // is NOT "personalize"/"personalizar" is the dismiss button.
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    if ((btn as HTMLButtonElement).disabled) continue;
    const label = btn.textContent?.trim().toLowerCase() || "";
    if (!label) continue;
    if (label.includes("personaliz")) continue;
    if (label.length > 0 && label.length < 50) {
      console.log(`[Detector] Introduce-yourself: picking non-personalize button "${label}"`);
      return btn;
    }
  }
  return null;
}

/**
 * Find a clickable "next" or "continue" button on the current screen.
 */
export function findNextButton(): HTMLElement | null {
  // Try each next/continue text pattern
  for (const text of SELECTORS.buttonText.next) {
    const btn = findElementByText(CLICKABLE, text);
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
    const btn = findElementByText(CLICKABLE, text);
    if (btn && !(btn as HTMLButtonElement).disabled) return btn;
  }
  return null;
}
