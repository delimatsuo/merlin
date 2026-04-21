/**
 * In-page prompt for NEEDS_HUMAN fields. Because the popup auto-closes on
 * page interaction, we inject a banner + field highlights directly into the
 * Gupy page, and intercept the "Save and continue" click so the user's typed
 * answers get POSTed to /save-answers for the profile learning loop.
 */

import type { UnansweredField } from "./custom-questions";
import { scrapeFormFields, type ScrapedField } from "../dom/helpers";
import { getAdapter } from "../adapters/registry";

const BANNER_ID = "merlin-needs-human-banner";
const HIGHLIGHT_CLASS = "merlin-needs-human-highlight";

export type AnswerSubmitter = (
  answers: Record<string, string>,
) => Promise<void>;

export function showInPageHumanPrompt(
  fields: UnansweredField[],
  onBeforeSubmit: AnswerSubmitter,
): void {
  removeInPagePrompt();
  if (fields.length === 0) return;

  injectStyles();
  injectBanner(fields.length);

  const scraped = scrapeFormFields();
  const targets = new Map<string, HTMLElement>();
  for (const pending of fields) {
    const match = scraped.find((f) => f.label === pending.label);
    if (match) {
      targets.set(pending.label, match.element);
      highlightField(match);
    }
  }

  if (targets.size === 0) return;

  // Delegated capture on the document so React rerenders that swap the
  // submit button DOM node don't orphan our listener. We identify the
  // click target at fire time by re-resolving via the adapter, and de-dup
  // with a closure flag instead of `{ once: true }`.
  let fired = false;
  const handler = (event: Event) => {
    if (fired) return;
    const clicked = event.target;
    if (!(clicked instanceof Element)) return;

    const currentSubmit = getAdapter()?.findNextButton() ?? null;
    const inSubmit =
      currentSubmit && (currentSubmit === clicked || currentSubmit.contains(clicked));
    // Fallback: match any "Save/Continue/Salvar" button up the ancestor chain.
    const ancestorBtn = clicked.closest("button, [role='button'], a");
    const looksLikeSubmit =
      !!ancestorBtn &&
      /salvar|continuar|save|continue|enviar|submit|finalizar/i.test(
        (ancestorBtn.textContent || "").trim(),
      );
    if (!inSubmit && !looksLikeSubmit) return;

    fired = true;
    _activeSubmitListener = null;

    const answers: Record<string, string> = {};
    for (const [label, el] of targets) {
      const field = scraped.find((f) => f.label === label);
      const value = field ? readScrapedValue(field) : readElementValue(el);
      if (value) answers[label] = value;
    }

    if (Object.keys(answers).length > 0) {
      // Fire-and-forget: content script may be torn down by the navigation
      // that the click is about to trigger. The save-answers POST goes to
      // the service worker via chrome.runtime.sendMessage, which is NOT
      // dependent on the content script surviving.
      onBeforeSubmit(answers).catch((err) => {
        console.error("[Merlin] save-answers failed:", err);
      });
    }

    removeInPagePrompt();
  };

  // Drop any previous listener before adding a new one, so repeated
  // showInPageHumanPrompt calls don't stack handlers.
  if (_activeSubmitListener) {
    document.removeEventListener("click", _activeSubmitListener, true);
  }
  _activeSubmitListener = handler;
  document.addEventListener("click", handler, { capture: true });
}

// Module-level so removeInPagePrompt can also detach the listener.
let _activeSubmitListener: ((e: Event) => void) | null = null;

export function removeInPagePrompt(): void {
  document.getElementById(BANNER_ID)?.remove();
  document
    .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
    .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
  if (_activeSubmitListener) {
    document.removeEventListener("click", _activeSubmitListener, true);
    _activeSubmitListener = null;
  }
}

function injectStyles(): void {
  if (document.getElementById("merlin-needs-human-styles")) return;
  const style = document.createElement("style");
  style.id = "merlin-needs-human-styles";
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #6366f1 !important;
      outline-offset: 4px !important;
      border-radius: 6px !important;
    }
    #${BANNER_ID} {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      background: #6366f1;
      color: #fff;
      padding: 14px 16px;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      max-width: 340px;
    }
    #${BANNER_ID} strong { display: block; margin-bottom: 4px; }
    #${BANNER_ID} small { display: block; margin-top: 6px; opacity: 0.9; }
  `;
  document.head.appendChild(style);
}

function injectBanner(count: number): void {
  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <strong>Merlin AutoApply</strong>
    Preencha ${count} ${count === 1 ? "campo destacado" : "campos destacados"}.
    <small>Suas respostas serão salvas no seu perfil Merlin ao clicar em "Salvar e continuar".</small>
  `;
  document.body.appendChild(banner);
}

function highlightField(field: ScrapedField): void {
  // Highlight the wrapping question block, not the raw input — Gupy's
  // styles override outlines on inputs.
  const container =
    field.element.closest(
      "[class*='question'], [class*='Question'], [class*='field'], [class*='Field'], fieldset, .form-group",
    ) || field.element.parentElement;
  (container as HTMLElement | null)?.classList.add(HIGHLIGHT_CLASS);
}

function readScrapedValue(field: ScrapedField): string {
  const el = field.element;
  if (el instanceof HTMLInputElement) {
    if (el.type === "radio") return readRadioValue(el);
    if (el.type === "checkbox") return el.checked ? "Sim" : "Não";
    if (field.type === "select") {
      // React-controlled selects may leave the underlying input empty and
      // display the chosen option in a sibling element.
      return el.value.trim() || readReactSelectValue(el);
    }
    return el.value.trim();
  }
  if (el instanceof HTMLTextAreaElement) return el.value.trim();
  if (el instanceof HTMLSelectElement) {
    return el.options[el.selectedIndex]?.text.trim() ?? "";
  }
  return readElementValue(el);
}

function readReactSelectValue(input: HTMLElement): string {
  const wrapper =
    input.closest(
      "[class*='select'], [class*='Select'], [role='combobox'], [class*='field'], [class*='Field']",
    ) || input.parentElement;
  if (!wrapper) return "";

  // Prefer explicit "selected value" markers (react-select, Material UI, etc.)
  const valueEl = wrapper.querySelector<HTMLElement>(
    "[class*='singleValue'], [class*='SingleValue'], [class*='selected-value'], [class*='SelectedValue'], [class*='value-container'] [class*='value']:not([class*='placeholder'])",
  );
  const explicit = valueEl?.textContent?.trim();
  if (explicit) return explicit;

  // Fallback: first non-placeholder/label text node inside the wrapper.
  const candidates = wrapper.querySelectorAll<HTMLElement>("*");
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const cls = (el.className?.toString() || "").toLowerCase();
    if (/placeholder|label|indicator|arrow|icon/.test(cls)) continue;
    if (el.querySelector("input, textarea, select")) continue;
    const t = (el.textContent || "").trim();
    if (t.length > 0 && t.length < 200) return t;
  }
  return "";
}

function readRadioValue(radio: HTMLInputElement): string {
  if (!radio.name) return "";
  const checked = document.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${CSS.escape(radio.name)}"]:checked`,
  );
  if (!checked) return "";
  const label =
    (checked.id
      ? document.querySelector<HTMLElement>(
          `label[for="${CSS.escape(checked.id)}"]`,
        )
      : null) ?? checked.closest("label");
  return (label?.textContent?.trim() || checked.value).trim();
}

function readElementValue(el: HTMLElement): string {
  if ("value" in el && typeof (el as HTMLInputElement).value === "string") {
    return (el as HTMLInputElement).value.trim();
  }
  return (el.textContent || "").trim();
}
