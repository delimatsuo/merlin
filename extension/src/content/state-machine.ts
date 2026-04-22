/**
 * State machine for the auto-apply flow.
 * Manages transitions between application screens with a run loop,
 * state persistence, and status broadcasting.
 */

import { AutoApplyStep, ErrorType } from "../lib/types";
import { getAdapter } from "./adapters/registry";
import type { BoardAdapter } from "./adapters/adapter";
import type { AdditionalInfoResult } from "./screens/additional-info";
import type { CustomQuestionsResult, UnansweredField } from "./screens/custom-questions";
import type { PersonalizationResult } from "./screens/personalization";
import { showInPageHumanPrompt, removeInPagePrompt } from "./screens/in-page-prompt";
import { randomDelay, waitForNavigation, humanLikeClick } from "./dom/helpers";
import { getPiiProfile, isPiiComplete } from "../lib/pii-store";
import { loadProfile } from "../lib/profile";
import { getMode } from "../lib/settings";
import { apiPost } from "../lib/api-client";

function adapter(): BoardAdapter {
  const a = getAdapter();
  if (!a) {
    throw new Error(`No adapter registered for ${window.location.hostname}`);
  }
  return a;
}

/** Notify the service-worker queue about this tab's progress. */
function reportTabStatus(update: {
  step?: string;
  completed?: boolean;
  failed?: boolean;
  errorMessage?: string;
  needsHuman?: boolean;
  needsConfirmation?: boolean;
}): void {
  chrome.runtime
    .sendMessage({ type: "TAB_STATUS_UPDATE", update })
    .catch(() => {});
}

/**
 * Per-tab session storage. Scoped by tab id to prevent cross-tab auto-resume
 * — the old single-key "autoapply_active_session" was read by content scripts
 * on any Gupy tab, which caused the "starts applying the moment you open a
 * Gupy page" bug when multiple tabs shared a single session state.
 */
const ACTIVE_SESSION_KEY_PREFIX = "autoapply_active_session_";
const GLOBAL_SESSION_KEY = "autoapply_active_session"; // legacy, still cleared

export class StateMachine {
  private currentStep: AutoApplyStep = AutoApplyStep.IDLE;
  private errorType: ErrorType | null = null;
  private errorDetail: string | null = null;
  private jobUrl: string = "";
  private running: boolean = false;
  private mode: "dry-run" | "auto" = "dry-run";
  private fieldsAnswered: number = 0;
  private questionsAnswered: number = 0;
  private llmCalls: number = 0;
  private startTime: number = 0;
  private errors: string[] = [];
  private pendingFields: UnansweredField[] = [];
  private tabId: number | null = null;
  private manualOrigin: boolean = false;

  setTabId(tabId: number): void {
    this.tabId = tabId;
  }

  markManualOrigin(): void {
    this.manualOrigin = true;
  }

  private sessionKey(): string {
    // Falls back to a stable per-hostname key if we somehow don't have a tab id.
    // The risk this mitigates (cross-tab auto-resume) only applies at content-
    // script load time, where we always fetch tab id before reading state.
    if (this.tabId !== null) return `${ACTIVE_SESSION_KEY_PREFIX}${this.tabId}`;
    return GLOBAL_SESSION_KEY;
  }

  getStep(): AutoApplyStep {
    return this.currentStep;
  }

  getError(): { type: ErrorType; detail: string } | null {
    if (this.errorType) {
      return { type: this.errorType, detail: this.errorDetail || "" };
    }
    return null;
  }

  transition(next: AutoApplyStep): void {
    console.log(`[StateMachine] ${this.currentStep} -> ${next}`);
    this.currentStep = next;
    if (next !== AutoApplyStep.ERROR) {
      this.errorType = null;
      this.errorDetail = null;
    }
  }

  transitionToError(errorType: ErrorType, detail?: string): void {
    console.error(`[StateMachine] ${this.currentStep} -> ERROR(${errorType}): ${detail || ""}`);
    this.currentStep = AutoApplyStep.ERROR;
    this.errorType = errorType;
    this.errorDetail = detail || null;
    if (detail) {
      this.errors.push(`${errorType}: ${detail}`);
    }
    reportTabStatus({ failed: true, errorMessage: detail });
  }

  reset(): void {
    this.currentStep = AutoApplyStep.IDLE;
    this.errorType = null;
    this.errorDetail = null;
  }

  /**
   * Main run loop. Drives the state machine from PRE_CHECK to REVIEW/COMPLETE.
   */
  async run(jobUrl: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.jobUrl = jobUrl;
    this.startTime = Date.now();

    try {
      // Restore state if resuming
      await this.restoreState();

      // Load mode setting
      this.mode = await getMode();
      console.log(`[SM] Running in ${this.mode} mode`);

      // If starting fresh, begin with pre-checks
      if (this.currentStep === AutoApplyStep.IDLE) {
        this.transition(AutoApplyStep.PRE_CHECK);
        this.broadcastStatus();

        const preCheckOk = await this.runPreChecks();
        if (!preCheckOk) return; // Error already set
      }

      // Main loop
      while (
        this.running &&
        this.currentStep !== AutoApplyStep.COMPLETE &&
        this.currentStep !== AutoApplyStep.ERROR &&
        this.currentStep !== AutoApplyStep.REVIEW
      ) {
        // Handle board-specific blocking confirmation modals (e.g. Gupy's
        // "Review of disqualifying questions"). In auto mode we click the
        // confirm button; in dry-run we pause for the user.
        const a = adapter();
        const reviewModal = a.findBlockingModal?.() ?? null;
        if (reviewModal) {
          if (this.mode === "auto") {
            const confirmBtn = a.findModalConfirmButton?.(reviewModal) ?? null;
            if (confirmBtn) {
              console.log(`[SM] Auto-confirming ${a.name} blocking modal`);
              await humanLikeClick(confirmBtn);
              await waitForNavigation(10000);
              this.transition(a.detectScreen());
              continue;
            }
          }
          console.log(`[SM] ${a.name} blocking modal open — pausing for user confirmation`);
          reportTabStatus({ needsConfirmation: true });
          // Keep running=true in persisted state so the content script on the
          // next page auto-resumes after the user clicks Confirm manually.
          this.running = false;
          await chrome.storage.session.set({
            [this.sessionKey()]: {
              step: this.currentStep,
              fieldsAnswered: this.fieldsAnswered,
              questionsAnswered: this.questionsAnswered,
              llmCalls: this.llmCalls,
              startTime: this.startTime,
              jobUrl: this.jobUrl,
              mode: this.mode,
              running: true,
              pendingFields: this.pendingFields,
              manualOrigin: this.manualOrigin,
            },
          });
          this.broadcastStatus();
          return;
        }

        // Detect current screen
        const detectedScreen = a.detectScreen();

        // If detection disagrees with our state, use detection (DOM is truth)
        if (detectedScreen !== AutoApplyStep.IDLE && detectedScreen !== this.currentStep) {
          console.log(`[SM] Screen detection override: ${this.currentStep} -> ${detectedScreen}`);
          this.transition(detectedScreen);
        }

        this.broadcastStatus();
        await this.persistState();

        // Handle current state
        switch (this.currentStep) {
          case AutoApplyStep.WELCOME:
            await a.handleWelcome();
            await randomDelay(300, 800);
            await waitForNavigation(5000);
            this.transition(a.detectScreen()); // Re-detect after navigation
            break;

          case AutoApplyStep.ADDITIONAL_INFO: {
            const infoResult: AdditionalInfoResult = await a.handleAdditionalInfo();
            this.fieldsAnswered += infoResult.filled;
            this.llmCalls += infoResult.llmCalls;

            if (infoResult.validationErrors.length > 0) {
              const firstError = infoResult.validationErrors[0];
              this.transitionToError(
                ErrorType.VALIDATION_ERROR,
                `Erro em "${firstError.field}": ${firstError.message}`,
              );
              break;
            }

            await randomDelay(1000, 2000);
            // Click next and wait for navigation is handled inside handleAdditionalInfo
            this.transition(a.detectScreen());
            break;
          }

          case AutoApplyStep.CUSTOM_QUESTIONS_DETECT:
          case AutoApplyStep.CUSTOM_QUESTIONS_FILL: {
            const qResult: CustomQuestionsResult = await a.handleCustomQuestions();
            this.questionsAnswered += qResult.answered;
            this.llmCalls += qResult.llmCalls;

            if (qResult.validationErrors.length > 0) {
              const firstError = qResult.validationErrors[0];
              this.transitionToError(
                ErrorType.VALIDATION_ERROR,
                `Erro em "${firstError.field}": ${firstError.message}`,
              );
              break;
            }

            if (qResult.needsHuman.length > 0) {
              // Pause for user input instead of erroring out
              this.pendingFields = qResult.unansweredFields;
              this.transition(AutoApplyStep.CUSTOM_QUESTIONS_FILL);
              this.broadcastNeedsHuman(qResult.unansweredFields);
              await this.persistState();

              // Inject in-page banner + highlights so the user sees the prompt
              // even when the popup is closed, and auto-save typed answers to
              // the knowledge file on "Save and continue" click. Mark the
              // session as running again so the content script resumes after
              // the page navigates.
              showInPageHumanPrompt(qResult.unansweredFields, async (answers) => {
                try {
                  await apiPost("/api/autoapply/save-answers", { answers });
                  console.log("[SM] Saved", Object.keys(answers).length, "user answers to knowledge file");
                } catch (err) {
                  console.error("[SM] save-answers POST failed:", err);
                }
                this.pendingFields = [];
                this.running = true;
                await this.persistState();
              });

              this.running = false; // Pause — will resume when user provides answers
              return;
            }

            await randomDelay(1000, 2000);
            this.transition(a.detectScreen());
            break;
          }

          case AutoApplyStep.PERSONALIZATION: {
            const pResult: PersonalizationResult = await a.handlePersonalization();
            if (pResult.answered) this.questionsAnswered += 1;
            this.llmCalls += pResult.llmCalls;
            await randomDelay(1000, 2000);
            // After personalization, check if we're now on the review/finish screen
            const nextScreen = a.detectScreen();
            if (nextScreen === AutoApplyStep.COMPLETE || nextScreen === AutoApplyStep.IDLE) {
              if (this.mode === "auto") {
                // Auto mode: submit directly
                await this.autoSubmit();
              } else {
                // Dry-run: pause for review
                this.transition(AutoApplyStep.REVIEW);
              }
            } else {
              this.transition(nextScreen);
            }
            break;
          }

          default: {
            // Unknown state or IDLE — try to detect
            const detected = a.detectScreen();
            if (detected === AutoApplyStep.IDLE) {
              // Nothing to do — maybe page hasn't loaded yet
              // Give up after 30 seconds of no screen detected
              const elapsed = Date.now() - this.startTime;
              if (elapsed > 30000) {
                this.transitionToError(ErrorType.TIMEOUT, "Nenhuma tela reconhecida após 30s.");
                break;
              }
              await randomDelay(2000, 3000);
            } else {
              this.transition(detected);
            }
            break;
          }
        }
      }

      // Reached REVIEW state (dry-run pause)
      if (this.currentStep === AutoApplyStep.REVIEW) {
        this.broadcastStatus();
        await this.persistState();
        console.log("[SM] Dry-run: paused at REVIEW. Waiting for user confirmation...");
        // The state machine stops here. The popup will show confirm/cancel.
        // When user confirms, the popup sends CONFIRM_SUBMIT to content script,
        // which calls sm.confirmSubmit() or sm.cancelSubmit()
      }

      // Reached COMPLETE
      if (this.currentStep === AutoApplyStep.COMPLETE) {
        await this.logApplication(this.mode === "dry-run" ? "dry-run" : "success");
        this.broadcastStatus();
        await this.clearState();
        reportTabStatus({ completed: true });
      }
    } catch (error) {
      console.error("[SM] Unhandled error:", error);
      this.transitionToError(ErrorType.LLM_FAILED, (error as Error).message);
      this.broadcastStatus();
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Poll the screen detector until it reports COMPLETE, or give up.
   * Gupy sometimes re-renders the submit confirmation in place (no full
   * navigation), so waitForNavigation alone is insufficient — we must
   * see the success screen before declaring the application applied.
   */
  private async awaitSubmissionLanded(timeoutMs: number = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const a = adapter();
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      if (a.detectScreen() === AutoApplyStep.COMPLETE) return true;
    }
    return false;
  }

  /** Dump the current page state to help iterate on detector when it misses. */
  private logPostSubmitFailure(label: string): void {
    const h1 = document.querySelector("h1")?.textContent?.slice(0, 120) ?? "(none)";
    const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .slice(0, 20)
      .map((b) => (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60))
      .filter((t) => t.length > 0);
    console.error(
      `[SM] ${label}: success screen not detected within 30s.`,
      "\n  URL:",
      window.location.href,
      "\n  H1:",
      h1,
      "\n  First buttons:",
      buttons,
    );
  }

  async confirmSubmit(): Promise<void> {
    if (this.currentStep !== AutoApplyStep.REVIEW) return;

    console.log("[SM] User confirmed submission");
    this.running = true;

    const finishBtn = adapter().findFinishButton();
    if (!finishBtn) {
      this.transitionToError(
        ErrorType.VALIDATION_ERROR,
        "Botão de envio não encontrado. A Gupy pode ter mudado a interface.",
      );
      this.broadcastStatus();
      this.running = false;
      return;
    }

    await humanLikeClick(finishBtn);
    // waitForNavigation is a best-effort hint; the real proof is the
    // detector seeing COMPLETE.
    await waitForNavigation(15000).catch(() => {});

    const landed = await this.awaitSubmissionLanded(30000);
    if (!landed) {
      this.logPostSubmitFailure("confirmSubmit");
      this.transitionToError(
        ErrorType.TIMEOUT,
        "Envio clicado, mas a tela de confirmação não apareceu em 30s.",
      );
      this.broadcastStatus();
      this.running = false;
      return;
    }

    this.transition(AutoApplyStep.COMPLETE);
    await this.logApplication("success");
    this.broadcastStatus();
    await this.clearState();
    reportTabStatus({ completed: true });
    this.running = false;
  }

  private async autoSubmit(): Promise<void> {
    console.log("[SM] Auto mode: submitting directly");

    const finishBtn = adapter().findFinishButton();
    if (!finishBtn) {
      // Don't silently report completed when we never actually submitted.
      this.transitionToError(
        ErrorType.VALIDATION_ERROR,
        "Botão de envio não encontrado. A Gupy pode ter mudado a interface.",
      );
      return;
    }

    await humanLikeClick(finishBtn);
    await waitForNavigation(15000).catch(() => {});

    const landed = await this.awaitSubmissionLanded(30000);
    if (!landed) {
      this.logPostSubmitFailure("autoSubmit");
      this.transitionToError(
        ErrorType.TIMEOUT,
        "Envio clicado, mas a tela de confirmação não apareceu em 30s.",
      );
      return;
    }

    // Let the outer run-loop's COMPLETE handler do the reporting so we
    // don't double-log / double-notify.
    this.transition(AutoApplyStep.COMPLETE);
  }

  cancelSubmit(): void {
    if (this.currentStep !== AutoApplyStep.REVIEW) return;

    console.log("[SM] User cancelled submission");
    this.transition(AutoApplyStep.IDLE);
    this.broadcastStatus();
    this.clearState();
    this.running = false;
  }

  /**
   * Called when the user provides answers for NEEDS_HUMAN fields from the popup.
   * Fills the form fields and resumes the state machine.
   */
  async submitUserAnswers(answers: Record<string, string>): Promise<void> {
    if (this.currentStep !== AutoApplyStep.CUSTOM_QUESTIONS_FILL) return;

    console.log("[SM] Filling user-provided answers:", Object.keys(answers));
    const a = adapter();
    const filled = await a.fillUserAnswers(answers);
    this.questionsAnswered += filled;
    this.pendingFields = [];
    removeInPagePrompt();

    // Resume the state machine — re-detect screen and continue
    this.running = true;
    this.transition(a.detectScreen());
    this.broadcastStatus();

    // Continue the main loop
    await this.run(this.jobUrl);
  }

  private broadcastNeedsHuman(fields: UnansweredField[]): void {
    chrome.runtime.sendMessage({
      type: "NEEDS_HUMAN_INPUT",
      fields,
      fieldsAnswered: this.fieldsAnswered,
      questionsAnswered: this.questionsAnswered,
    }).catch(() => {});
    reportTabStatus({ needsHuman: true });
  }

  private async runPreChecks(): Promise<boolean> {
    // Check 1: on a supported board's application page
    const a = getAdapter();
    if (!a || !a.isApplicationPage()) {
      this.transitionToError(ErrorType.GUPY_LOGIN_REQUIRED, "Navegue para uma página de candidatura suportada.");
      this.broadcastStatus();
      return false;
    }

    // Check 2: Extension authenticated
    const authResponse = await chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" });
    if (!authResponse?.isAuthenticated) {
      this.transitionToError(ErrorType.AUTH_REQUIRED, "Faça login na extensão primeiro.");
      this.broadcastStatus();
      return false;
    }

    // Check 4: PII profile configured
    const pii = await getPiiProfile();
    if (!isPiiComplete(pii)) {
      this.transitionToError(ErrorType.AUTH_REQUIRED, "Configure seu perfil PII na extensão.");
      this.broadcastStatus();
      return false;
    }

    // Check 5: Professional profile loaded
    try {
      await loadProfile();
    } catch (err) {
      console.error("[SM] loadProfile failed:", err);
      this.transitionToError(ErrorType.LLM_FAILED, `Perfil: ${(err as Error).message}`);
      this.broadcastStatus();
      return false;
    }

    // All checks passed — detect initial screen
    const screen = a.detectScreen();
    this.transition(screen !== AutoApplyStep.IDLE ? screen : AutoApplyStep.WELCOME);
    return true;
  }

  private broadcastStatus(): void {
    chrome.runtime.sendMessage({
      type: "STATUS_UPDATE",
      step: this.currentStep,
      error: this.errorType,
      detail: this.errorDetail || undefined,
      fieldsAnswered: this.fieldsAnswered,
      questionsAnswered: this.questionsAnswered,
    }).catch(() => {}); // Ignore if no listener
  }

  private async persistState(): Promise<void> {
    await chrome.storage.session.set({
      [this.sessionKey()]: {
        step: this.currentStep,
        fieldsAnswered: this.fieldsAnswered,
        questionsAnswered: this.questionsAnswered,
        llmCalls: this.llmCalls,
        startTime: this.startTime,
        jobUrl: this.jobUrl,
        mode: this.mode,
        running: this.running,
        pendingFields: this.pendingFields,
        manualOrigin: this.manualOrigin,
      },
    });
  }

  private async restoreState(): Promise<void> {
    const key = this.sessionKey();
    const result = await chrome.storage.session.get(key);
    const state = result[key] as {
      step?: AutoApplyStep;
      fieldsAnswered?: number;
      questionsAnswered?: number;
      llmCalls?: number;
      startTime?: number;
      jobUrl?: string;
      mode?: "dry-run" | "auto";
      running?: boolean;
      manualOrigin?: boolean;
    } | undefined;
    if (state) {
      this.currentStep = state.step ?? AutoApplyStep.IDLE;
      this.fieldsAnswered = state.fieldsAnswered ?? 0;
      this.questionsAnswered = state.questionsAnswered ?? 0;
      this.llmCalls = state.llmCalls ?? 0;
      this.startTime = state.startTime ?? Date.now();
      if (state.jobUrl) this.jobUrl = state.jobUrl;
      if (state.mode) this.mode = state.mode;
      if (state.manualOrigin) this.manualOrigin = true;
      console.log(`[SM] Restored state: ${this.currentStep}`);
    }
  }

  /** Check if THIS tab has an active session to resume. Per-tab keying
   *  prevents a new Gupy tab from auto-starting based on another tab's run. */
  async hasActiveSessionForTab(): Promise<boolean> {
    if (this.tabId === null) return false;
    const key = this.sessionKey();
    const result = await chrome.storage.session.get(key);
    const state = result[key] as { running?: boolean } | undefined;
    return !!state?.running;
  }

  /**
   * If a previous run paused on NEEDS_HUMAN and the user reloaded the page,
   * re-inject the in-page prompt so they can still answer and save.
   */
  async restorePendingPromptIfAny(): Promise<void> {
    const key = this.sessionKey();
    const result = await chrome.storage.session.get(key);
    const state = result[key] as
      | { pendingFields?: UnansweredField[]; running?: boolean }
      | undefined;
    if (!state?.pendingFields?.length || state.running) return;

    showInPageHumanPrompt(state.pendingFields, async (answers) => {
      try {
        await apiPost("/api/autoapply/save-answers", { answers });
        console.log("[SM] Saved", Object.keys(answers).length, "user answers to knowledge file");
      } catch (err) {
        console.error("[SM] save-answers POST failed:", err);
      }
      this.pendingFields = [];
      this.running = true;
      this.currentStep = state.running ? this.currentStep : AutoApplyStep.CUSTOM_QUESTIONS_FILL;
      await this.persistState();
    });
  }

  private async clearState(): Promise<void> {
    await chrome.storage.session.remove(this.sessionKey());
    // Also clear the legacy global key if any process wrote to it.
    await chrome.storage.session.remove(GLOBAL_SESSION_KEY);
  }

  private extractPageContext(): { company: string; jobTitle: string } {
    const hostname = window.location.hostname;
    const subdomain = hostname.split(".")[0];
    const company = subdomain !== "www" ? subdomain : "";

    let jobTitle = "";
    const headings = document.querySelectorAll("h1, h2");
    for (let i = 0; i < headings.length; i++) {
      const text = headings[i].textContent?.trim();
      if (text && text.length > 5 && text.length < 200) {
        jobTitle = text;
        break;
      }
    }
    return { company, jobTitle };
  }

  private async logApplication(status: "success" | "failed" | "dry-run"): Promise<void> {
    try {
      const duration = Math.round((Date.now() - this.startTime) / 1000);
      const { company, jobTitle } = this.extractPageContext();
      await chrome.runtime.sendMessage({
        type: "API_REQUEST",
        method: "POST",
        path: "/api/autoapply/log",
        body: {
          job_url: this.jobUrl,
          company,
          job_title: jobTitle,
          status,
          fields_answered: this.fieldsAnswered,
          questions_answered: this.questionsAnswered,
          llm_calls: this.llmCalls,
          errors: this.errors,
          duration_seconds: duration,
        },
      });
    } catch (error) {
      console.error("[SM] Failed to log application:", error);
    }
  }
}
