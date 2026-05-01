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
import type { CustomQuestionsResult } from "../screens/custom-questions";
import type { PersonalizationResult } from "../screens/personalization";
import { sleep, waitUntilClickable } from "../dom/helpers";
import { AutoApplyStep, ErrorType } from "../../lib/types";
import { AutoApplyFlowError } from "../../lib/errors";

const APPLY_BUTTON_SELECTOR = '#form-apply-simple button[data-apply="normal"], button[data-apply="normal"]';
const FAILURE_MODAL_SELECTOR = "#ModalApplyFailure";
const SUCCESS_ALERT_SELECTOR = "[data-sent-apply-indicator-alert]";
const SENDING_ALERT_SELECTOR = "[data-sending-apply-indicator-alert]";
const SIGNIN_LINK_SELECTOR = 'a#signin[href*="/signin"], a[href="/signin/"]';

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

function findApplyButton(): HTMLButtonElement | null {
  const btn = visibleElement(APPLY_BUTTON_SELECTOR);
  return btn instanceof HTMLButtonElement ? btn : null;
}

function isLoggedOut(): boolean {
  return visibleElement(SIGNIN_LINK_SELECTOR) !== null;
}

function isFailureVisible(): boolean {
  return visibleElement(FAILURE_MODAL_SELECTOR) !== null;
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

async function waitForApplyOutcome(timeoutMs = 25000): Promise<"success" | "failure" | "login" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  let sawSending = false;

  while (Date.now() < deadline) {
    if (isSuccessVisible()) return "success";
    if (isFailureVisible()) return "failure";
    if (isLoggedOut() && !findApplyButton()) return "login";

    if (visibleElement(SENDING_ALERT_SELECTOR)) sawSending = true;
    if (sawSending && !visibleElement(SENDING_ALERT_SELECTOR) && isSuccessVisible()) {
      return "success";
    }

    await sleep(400);
  }

  return "timeout";
}

export const cathoAdapter: BoardAdapter = {
  name: "Catho",

  matches(url: URL): boolean {
    return url.hostname === "www.catho.com.br";
  },

  isApplicationPage(): boolean {
    const segments = window.location.pathname.split("/").filter(Boolean);
    return segments[0] === "vagas" && segments.length >= 3 && (findApplyButton() !== null || isSuccessVisible());
  },

  detectScreen(): AutoApplyStep {
    if (isSuccessVisible()) return AutoApplyStep.COMPLETE;
    if (isFailureVisible()) return AutoApplyStep.ERROR;
    if (findApplyButton()) return AutoApplyStep.WELCOME;
    return AutoApplyStep.IDLE;
  },

  async handleWelcome(): Promise<void> {
    if (isLoggedOut()) {
      throw new AutoApplyFlowError(
        ErrorType.AUTH_REQUIRED,
        "Faça login na Catho no navegador e tente a candidatura novamente.",
      );
    }

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

    btn.click();
    const outcome = await waitForApplyOutcome();

    if (outcome === "success") return;
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
      "Catho não mostrou confirmação de envio em 25s.",
    );
  },

  async handleAdditionalInfo(): Promise<AdditionalInfoResult> {
    return { filled: 0, skipped: 0, validationErrors: [], llmCalls: 0 };
  },

  async handleCustomQuestions(): Promise<CustomQuestionsResult> {
    return { answered: 0, skipped: 0, needsHuman: [], unansweredFields: [], validationErrors: [], llmCalls: 0 };
  },

  async handlePersonalization(): Promise<PersonalizationResult> {
    return { answered: false, llmCalls: 0 };
  },

  async fillUserAnswers(): Promise<number> {
    return 0;
  },

  findNextButton(): HTMLElement | null {
    return null;
  },

  findFinishButton(): HTMLElement | null {
    return null;
  },
};
