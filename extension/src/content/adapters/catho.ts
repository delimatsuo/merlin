/**
 * Catho adapter.
 *
 * Catho's public job page exposes a simple apply form:
 *   <form id="form-apply-simple" method="post" action="/apply/apply">
 *     <button data-apply="normal">Quero me candidatar</button>
 *   </form>
 *
 * We only click it when the user is already logged into Catho. Logged-out
 * pages also render the same button, so the visible #signin link is the
 * guard that prevents redirecting a queue-owned tab into signup/login.
 */

import type { BoardAdapter } from "./adapter";
import type { AdditionalInfoResult } from "../screens/additional-info";
import type { CustomQuestionsResult, UnansweredField } from "../screens/custom-questions";
import type { PersonalizationResult } from "../screens/personalization";
import { matchAndFillFields, findBestOption } from "../field-matcher";
import {
  clickCheckbox,
  clickRadioOption,
  clickReactSelect,
  humanLikeClick,
  humanLikeType,
  randomDelay,
  scrapeFormFields,
  sleep,
  waitForNavigation,
  waitUntilClickable,
  type ScrapedField,
} from "../dom/helpers";
import { AutoApplyStep, ErrorType } from "../../lib/types";
import { AutoApplyFlowError } from "../../lib/errors";
import { getPiiProfile } from "../../lib/pii-store";
import {
  classifyCathoScreen,
  isCathoDismissActionText,
  isCathoHost,
  isCathoJobPath,
  isCathoUpsellText,
  type CathoScreenKind,
} from "./catho-utils";
import type { ValidationError } from "../dom/errors";

const APPLY_BUTTON_SELECTOR = '#form-apply-simple button[data-apply="normal"], button[data-apply="normal"]';
const FAILURE_MODAL_SELECTOR = "#ModalApplyFailure";
const SUCCESS_ALERT_SELECTOR = "[data-sent-apply-indicator-alert]";
const SENDING_ALERT_SELECTOR = "[data-sending-apply-indicator-alert]";
const SIGNIN_LINK_SELECTOR = 'a#signin[href*="/signin"], a[href="/signin/"]';
const CLICKABLE_SELECTOR = [
  "button",
  "a",
  '[role="button"]',
  "[tabindex]",
  '[class*="button"]',
  '[class*="Button"]',
  '[class*="btn"]',
  '[class*="Btn"]',
  '[class*="link"]',
  '[class*="Link"]',
  "div",
  "span",
  "p",
  "u",
  "strong",
  "i",
].join(",");
const UPSELL_CONTAINER_SELECTOR = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  "aside",
  "section",
  "article",
  '[class*="modal"]',
  '[class*="Modal"]',
  '[class*="overlay"]',
  '[class*="Overlay"]',
  '[class*="popup"]',
  '[class*="Popup"]',
].join(",");
const QUESTIONNAIRE_TEXT_MARKERS = [
  "questionario da vaga",
  "questionário da vaga",
  "preencha seu cpf",
  "enviar meu curriculo",
  "enviar meu currículo",
];

const CPF_INPUT_SELECTOR = [
  'input[name*="cpf" i]',
  'input[id*="cpf" i]',
  'input[placeholder*="cpf" i]',
  'input[aria-label*="cpf" i]',
].join(",");

function isVisible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  let cursor: HTMLElement | null = el;
  while (cursor) {
    const style = getComputedStyle(cursor);
    if (
      cursor.hidden ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    cursor = cursor.parentElement;
  }
  return el.getClientRects().length > 0;
}

function visibleElement(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll(selector)).find(isVisible) ?? null;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findApplyButton(): HTMLButtonElement | null {
  const btn = visibleElement(APPLY_BUTTON_SELECTOR);
  return btn instanceof HTMLButtonElement ? btn : null;
}

function isLoggedOut(): boolean {
  return visibleElement(SIGNIN_LINK_SELECTOR) !== null;
}

function elementText(el: HTMLElement): string {
  return el.innerText || el.textContent || "";
}

function controlLabel(control: HTMLElement): string {
  return (
    control.getAttribute("aria-label") ||
    control.getAttribute("title") ||
    elementText(control)
  );
}

function isActionSizedLabel(label: string): boolean {
  return normalizeText(label).length <= 80;
}

function isDismissControl(control: HTMLElement): boolean {
  const label = controlLabel(control);
  return isActionSizedLabel(label) && isCathoDismissActionText(label);
}

function findDismissControl(root: HTMLElement): HTMLElement | null {
  const controls = Array.from(root.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR))
    .filter(isVisible);
  return controls.find(isDismissControl) ?? null;
}

function findDismissControlInUpsellAncestor(control: HTMLElement): HTMLElement | null {
  if (!isDismissControl(control)) return null;

  let cursor: HTMLElement | null = control;
  for (let depth = 0; cursor && depth < 14; depth++) {
    if (isCathoUpsellText(elementText(cursor))) return control;
    cursor = cursor.parentElement;
  }

  return null;
}

function findDismissControlNearUpsellText(root: HTMLElement): HTMLElement | null {
  let cursor: HTMLElement | null = root;
  for (let depth = 0; cursor && depth < 8; depth++) {
    const dismiss = findDismissControl(cursor);
    if (dismiss) return dismiss;
    cursor = cursor.parentElement;
  }

  return null;
}

function findVisibleDismissControl(): HTMLElement | null {
  const controls = Array.from(document.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR))
    .filter(isVisible);

  for (const control of controls) {
    const dismiss = findDismissControlInUpsellAncestor(control);
    if (dismiss) return dismiss;
  }

  return (
    isCathoUpsellText(elementText(document.body))
      ? controls.find(isDismissControl) ?? null
      : null
  );
}

function findCathoUpsellDismissButton(): HTMLElement | null {
  const containers = Array.from(document.querySelectorAll<HTMLElement>(UPSELL_CONTAINER_SELECTOR))
    .filter(isVisible)
    .filter((container) => isCathoUpsellText(elementText(container)));

  for (const container of containers) {
    const dismiss = findDismissControl(container);
    if (dismiss) return dismiss;
  }

  const upsellTextNodes = Array.from(
    document.querySelectorAll<HTMLElement>(UPSELL_CONTAINER_SELECTOR),
  )
    .filter(isVisible)
    .filter((candidate) => isCathoUpsellText(elementText(candidate)));
  for (const textNode of upsellTextNodes) {
    const dismiss = findDismissControlNearUpsellText(textNode);
    if (dismiss) return dismiss;
  }

  return findVisibleDismissControl();
}

async function dismissCathoUpsells(maxDismissals = 3): Promise<number> {
  let dismissed = 0;

  for (let attempt = 0; attempt < maxDismissals; attempt++) {
    const button = findCathoUpsellDismissButton();
    if (!button) break;

    console.log(
      "[Catho] Dismissing upsell modal:",
      elementText(button).trim() || button.getAttribute("aria-label") || button.tagName,
    );
    await humanLikeClick(button);
    dismissed++;
    await sleep(500);
  }

  return dismissed;
}

function isFailureVisible(): boolean {
  return visibleElement(FAILURE_MODAL_SELECTOR) !== null;
}

function textLooksLikeQuestionnaire(text: string): boolean {
  const normalized = normalizeText(text);
  return QUESTIONNAIRE_TEXT_MARKERS.some((marker) =>
    normalized.includes(normalizeText(marker)),
  );
}

function findQuestionnaireModal(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="Modal"]',
    ),
  ).filter(isVisible);

  for (const candidate of candidates) {
    if (textLooksLikeQuestionnaire(candidate.innerText || candidate.textContent || "")) {
      return candidate;
    }
  }

  const submit = findQuestionnaireSubmitButton(document.body);
  let node: HTMLElement | null = submit;
  for (let depth = 0; node && depth < 8; depth++) {
    if (textLooksLikeQuestionnaire(node.innerText || node.textContent || "")) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

function isQuestionnaireVisible(): boolean {
  return findQuestionnaireModal() !== null;
}

function isSuccessVisible(): boolean {
  const alert = visibleElement(SUCCESS_ALERT_SELECTOR);
  if (alert && /cv enviado|candidatura/i.test(alert.textContent ?? "")) {
    return true;
  }

  const bodyText = (document.body?.innerText ?? "").toLowerCase();
  return (
    bodyText.includes("cv enviado") ||
    bodyText.includes("candidatura enviada") ||
    bodyText.includes("voce ja se candidatou") ||
    bodyText.includes("você já se candidatou")
  );
}

function findQuestionnaireSubmitButton(root: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  return (
    buttons.find((button) => {
      if (!isVisible(button)) return false;
      const text = normalizeText(button.innerText || button.textContent || "");
      return text.includes("enviar meu curriculo");
    }) ?? null
  );
}

async function waitForApplyOutcome(
  timeoutMs = 25000,
): Promise<"success" | "failure" | "login" | "questionnaire" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  let sawSending = false;

  while (Date.now() < deadline) {
    await dismissCathoUpsells(2);

    if (isSuccessVisible()) return "success";
    if (isFailureVisible()) return "failure";
    if (isQuestionnaireVisible()) return "questionnaire";
    if (isLoggedOut() && !findApplyButton()) return "login";

    if (visibleElement(SENDING_ALERT_SELECTOR)) sawSending = true;
    if (sawSending && !visibleElement(SENDING_ALERT_SELECTOR) && isSuccessVisible()) {
      return "success";
    }

    await sleep(400);
  }

  return "timeout";
}

function mapScreen(kind: CathoScreenKind): AutoApplyStep {
  switch (kind) {
    case "complete":
      return AutoApplyStep.COMPLETE;
    case "error":
      return AutoApplyStep.ERROR;
    case "questionnaire":
      return AutoApplyStep.CUSTOM_QUESTIONS_FILL;
    case "welcome":
      return AutoApplyStep.WELCOME;
    case "idle":
    default:
      return AutoApplyStep.IDLE;
  }
}

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
    return el.selectedIndex > 0;
  }

  return false;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof (CSS as any).escape === "function") {
    return (CSS as any).escape(value);
  }
  return value.replace(/([^\w-])/g, "\\$1");
}

async function fillCathoField(field: ScrapedField, answer: string): Promise<void> {
  switch (field.type) {
    case "text":
    case "textarea": {
      const input = field.element as HTMLInputElement | HTMLTextAreaElement;
      await humanLikeType(input, answer);
      break;
    }

    case "select": {
      const bestOption = field.options ? findBestOption(field.options, answer) : answer;
      if (!bestOption) {
        throw new Error(`No matching option for "${answer}"`);
      }
      const selected = await clickReactSelect(field.element, bestOption);
      if (!selected) {
        throw new Error(`Select option "${bestOption}" not found`);
      }
      break;
    }

    case "radio": {
      const radio = field.element as HTMLInputElement;
      const name = radio.name;
      const allRadios = name
        ? Array.from(
            document.querySelectorAll<HTMLInputElement>(
              `input[type="radio"][name="${cssEscape(name)}"]`,
            ),
          )
        : [radio];

      let container: HTMLElement | null = radio.parentElement;
      while (container && !allRadios.every((r) => container!.contains(r))) {
        container = container.parentElement;
      }
      if (!container) container = document.body;

      const bestOption = field.options ? findBestOption(field.options, answer) : answer;
      if (!bestOption) {
        throw new Error(`No matching option for "${answer}" in ${JSON.stringify(field.options)}`);
      }
      const clicked = await clickRadioOption(container, bestOption);
      if (!clicked || !allRadios.some((r) => r.checked)) {
        throw new Error(`Radio click failed for option "${bestOption}"`);
      }
      break;
    }

    case "checkbox": {
      const shouldCheck = ["true", "sim", "yes"].includes(normalizeText(answer));
      const container =
        (field.element.closest(
          '[class*="Checkbox"], [class*="checkbox"], [class*="field"], [class*="Field"]',
        ) as HTMLElement | null) ?? field.element.parentElement;
      if (!container) throw new Error("Checkbox container not found");
      await clickCheckbox(container, shouldCheck);
      break;
    }
  }
}

function extractJobContext(): { companyName: string; jobTitle: string } {
  const jobTitle =
    Array.from(document.querySelectorAll("h1"))
      .map((el) => el.textContent?.trim() ?? "")
      .find((text) => text.length > 5) ?? document.title.split("|")[0]?.trim() ?? "";

  const companyName =
    Array.from(document.querySelectorAll<HTMLElement>("h2, [class*='company'], [class*='Company']"))
      .map((el) => el.textContent?.trim() ?? "")
      .find((text) => text.length > 1 && text.length < 120) ?? "";

  return { companyName, jobTitle };
}

function genericValidationError(message: string): ValidationError[] {
  return [{ field: "Catho", message }];
}

async function fillCpfIfPresent(modal: HTMLElement): Promise<number> {
  const input = modal.querySelector<HTMLInputElement>(CPF_INPUT_SELECTOR);
  if (!input || fieldHasValue({
    label: "CPF",
    type: "text",
    required: true,
    element: input,
    elementId: input.id || input.name || "cpf",
  })) {
    return 0;
  }

  const pii = await getPiiProfile();
  if (!pii?.cpf) return 0;
  await humanLikeType(input, pii.cpf);
  return 1;
}

export const cathoAdapter: BoardAdapter = {
  name: "Catho",

  matches(url: URL): boolean {
    return isCathoHost(url.hostname);
  },

  isApplicationPage(): boolean {
    return (
      isCathoHost(window.location.hostname) &&
      isCathoJobPath(window.location.pathname) &&
      (findApplyButton() !== null || isQuestionnaireVisible() || isSuccessVisible())
    );
  },

  detectScreen(): AutoApplyStep {
    return mapScreen(
      classifyCathoScreen({
        successVisible: isSuccessVisible(),
        failureVisible: isFailureVisible(),
        questionnaireVisible: isQuestionnaireVisible(),
        applyButtonVisible: findApplyButton() !== null,
      }),
    );
  },

  async handleWelcome(): Promise<void> {
    if (isLoggedOut()) {
      throw new AutoApplyFlowError(
        ErrorType.AUTH_REQUIRED,
        "Faça login na Catho no navegador e tente a candidatura novamente.",
      );
    }

    await dismissCathoUpsells();

    const btn = findApplyButton();
    if (!btn) {
      throw new AutoApplyFlowError(
        ErrorType.VALIDATION_ERROR,
        "Botão 'Quero me candidatar' da Catho não encontrado.",
      );
    }

    const becameClickable = await waitUntilClickable(btn, 10000, 300);
    if (!becameClickable) {
      throw new AutoApplyFlowError(
        ErrorType.TIMEOUT,
        "Botão de candidatura da Catho permaneceu indisponível.",
      );
    }

    await humanLikeClick(btn);
    await dismissCathoUpsells();
    const outcome = await waitForApplyOutcome();

    if (outcome === "success") return;
    if (outcome === "questionnaire") return;
    if (outcome === "login") {
      throw new AutoApplyFlowError(
        ErrorType.AUTH_REQUIRED,
        "A Catho pediu login antes de concluir a candidatura.",
      );
    }
    if (outcome === "failure") {
      throw new AutoApplyFlowError(
        ErrorType.VALIDATION_ERROR,
        "A Catho não concluiu a candidatura nesta vaga.",
      );
    }

    throw new AutoApplyFlowError(
      ErrorType.TIMEOUT,
      "Catho não mostrou confirmação de envio nem questionário em 25s.",
    );
  },

  async handleAdditionalInfo(): Promise<AdditionalInfoResult> {
    return { filled: 0, skipped: 0, validationErrors: [], llmCalls: 0 };
  },

  async handleCustomQuestions(): Promise<CustomQuestionsResult> {
    await dismissCathoUpsells();

    const modal = findQuestionnaireModal();
    if (!modal) {
      return {
        answered: 0,
        skipped: 0,
        needsHuman: [],
        unansweredFields: [],
        validationErrors: [],
        llmCalls: 0,
      };
    }

    let answered = await fillCpfIfPresent(modal);
    let skipped = 0;
    let llmCalls = 0;
    const needsHuman: string[] = [];
    const unansweredFields: UnansweredField[] = [];
    const { companyName, jobTitle } = extractJobContext();

    const fields = scrapeFormFields(modal).filter((field) => {
      if ((field.type as string) === "file") {
        needsHuman.push(field.label);
        skipped++;
        return false;
      }
      if (fieldHasValue(field)) {
        answered++;
        return false;
      }
      return true;
    });

    const matchResults = await matchAndFillFields(fields, window.location.href, companyName || jobTitle);
    if (matchResults.some((result) => result.source === "llm")) llmCalls++;

    for (const result of matchResults) {
      if (result.value === null) {
        needsHuman.push(result.field.label);
        skipped++;
        continue;
      }
      try {
        await fillCathoField(result.field, result.value);
        answered++;
        await randomDelay(150, 350);
      } catch (error) {
        console.error(`[Catho] Failed to fill "${result.field.label}":`, error);
        needsHuman.push(result.field.label);
        skipped++;
      }
    }

    const needsHumanSet = new Set(needsHuman);
    for (const field of fields) {
      if (needsHumanSet.has(field.label)) {
        unansweredFields.push({
          label: field.label,
          type: field.type,
          options: field.options,
        });
      }
    }

    if (needsHuman.length > 0) {
      return {
        answered,
        skipped,
        llmCalls,
        needsHuman,
        unansweredFields,
        validationErrors: [],
      };
    }

    const submit = findQuestionnaireSubmitButton(modal);
    if (!submit) {
      return {
        answered,
        skipped,
        llmCalls,
        needsHuman: [],
        unansweredFields: [],
        validationErrors: genericValidationError("Botão 'Enviar meu currículo' não encontrado."),
      };
    }

    const clickable = await waitUntilClickable(submit, 10000, 300);
    if (!clickable) {
      return {
        answered,
        skipped,
        llmCalls,
        needsHuman: [],
        unansweredFields: [],
        validationErrors: genericValidationError("Botão 'Enviar meu currículo' permaneceu indisponível."),
      };
    }

    await humanLikeClick(submit);
    await waitForNavigation(8000).catch(() => {});
    const outcome = await waitForApplyOutcome(20000);
    if (outcome === "success") {
      return { answered, skipped, llmCalls, needsHuman: [], unansweredFields: [], validationErrors: [] };
    }

    if (outcome === "failure") {
      return {
        answered,
        skipped,
        llmCalls,
        needsHuman: [],
        unansweredFields: [],
        validationErrors: genericValidationError("A Catho não concluiu a candidatura após o questionário."),
      };
    }

    return {
      answered,
      skipped,
      llmCalls,
      needsHuman: [],
      unansweredFields: [],
      validationErrors: genericValidationError("Catho não mostrou confirmação de envio após o questionário."),
    };
  },

  async handlePersonalization(): Promise<PersonalizationResult> {
    return { answered: false, llmCalls: 0 };
  },

  async fillUserAnswers(answers: Record<string, string>): Promise<number> {
    const modal = findQuestionnaireModal();
    if (!modal) return 0;
    const fields = scrapeFormFields(modal);
    let filled = 0;

    for (const [label, value] of Object.entries(answers)) {
      const field = fields.find((candidate) => candidate.label === label);
      if (!field || !value) continue;
      await fillCathoField(field, value);
      filled++;
      await randomDelay(150, 350);
    }

    return filled;
  },

  findNextButton(): HTMLElement | null {
    return null;
  },

  findFinishButton(): HTMLElement | null {
    return null;
  },
};
