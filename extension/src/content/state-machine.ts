/**
 * State machine for the auto-apply flow.
 * Manages transitions between application screens with a run loop,
 * state persistence, and status broadcasting.
 */

import { AutoApplyStep, ErrorType } from "../lib/types";
import { detectScreen, isGupyLoggedIn, isGupyApplicationPage, findFinishButton } from "./screens/detector";
import { handleWelcome } from "./screens/welcome";
import { handleAdditionalInfo, type AdditionalInfoResult } from "./screens/additional-info";
import { handleCustomQuestions, type CustomQuestionsResult } from "./screens/custom-questions";
import { handlePersonalization, type PersonalizationResult } from "./screens/personalization";
import { randomDelay, waitForNavigation, humanLikeClick } from "./dom/helpers";
import { getPiiProfile, isPiiComplete } from "../lib/pii-store";
import { loadProfile } from "../lib/profile";
import { getMode } from "../lib/settings";

const STATE_KEY_PREFIX = "autoapply_state_";

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
        // Detect current screen
        const detectedScreen = detectScreen();

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
            await handleWelcome();
            await randomDelay(1000, 2000);
            await waitForNavigation(15000);
            this.transition(detectScreen()); // Re-detect after navigation
            break;

          case AutoApplyStep.ADDITIONAL_INFO: {
            const infoResult: AdditionalInfoResult = await handleAdditionalInfo();
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
            this.transition(detectScreen());
            break;
          }

          case AutoApplyStep.CUSTOM_QUESTIONS_DETECT:
          case AutoApplyStep.CUSTOM_QUESTIONS_FILL: {
            const qResult: CustomQuestionsResult = await handleCustomQuestions();
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
              this.transitionToError(
                ErrorType.NEEDS_HUMAN,
                `Pergunta precisa de resposta manual: "${qResult.needsHuman[0]}"`,
              );
              break;
            }

            await randomDelay(1000, 2000);
            this.transition(detectScreen());
            break;
          }

          case AutoApplyStep.PERSONALIZATION: {
            const pResult: PersonalizationResult = await handlePersonalization();
            if (pResult.answered) this.questionsAnswered += 1;
            this.llmCalls += pResult.llmCalls;
            await randomDelay(1000, 2000);
            // After personalization, check if we're now on the review/finish screen
            const nextScreen = detectScreen();
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
            const detected = detectScreen();
            if (detected === AutoApplyStep.IDLE) {
              // Nothing to do — maybe page hasn't loaded
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
        await this.logApplication("dry-run");
        this.broadcastStatus();
        await this.clearState();
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

  async confirmSubmit(): Promise<void> {
    if (this.currentStep !== AutoApplyStep.REVIEW) return;

    console.log("[SM] User confirmed submission");
    this.running = true;

    const finishBtn = findFinishButton();
    if (finishBtn) {
      await humanLikeClick(finishBtn);
      await waitForNavigation(15000);
    }

    this.transition(AutoApplyStep.COMPLETE);
    await this.logApplication("success");
    this.broadcastStatus();
    await this.clearState();
    this.running = false;
  }

  private async autoSubmit(): Promise<void> {
    console.log("[SM] Auto mode: submitting directly");

    const finishBtn = findFinishButton();
    if (finishBtn) {
      await humanLikeClick(finishBtn);
      await waitForNavigation(15000);
    }

    this.transition(AutoApplyStep.COMPLETE);
    await this.logApplication("success");
    this.broadcastStatus();
    await this.clearState();
  }

  cancelSubmit(): void {
    if (this.currentStep !== AutoApplyStep.REVIEW) return;

    console.log("[SM] User cancelled submission");
    this.transition(AutoApplyStep.IDLE);
    this.broadcastStatus();
    this.clearState();
    this.running = false;
  }

  private async runPreChecks(): Promise<boolean> {
    // Check 1: On a Gupy application page
    if (!isGupyApplicationPage()) {
      this.transitionToError(ErrorType.GUPY_LOGIN_REQUIRED, "Navegue para uma vaga no Gupy primeiro.");
      this.broadcastStatus();
      return false;
    }

    // Check 2: User logged into Gupy
    if (!isGupyLoggedIn()) {
      this.transitionToError(ErrorType.GUPY_LOGIN_REQUIRED, "Faça login no Gupy primeiro.");
      this.broadcastStatus();
      return false;
    }

    // Check 3: Extension authenticated
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
    } catch {
      this.transitionToError(ErrorType.LLM_FAILED, "Não foi possível carregar o perfil profissional.");
      this.broadcastStatus();
      return false;
    }

    // All checks passed — detect initial screen
    const screen = detectScreen();
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
    const key = STATE_KEY_PREFIX + this.jobUrl;
    await chrome.storage.session.set({
      [key]: {
        step: this.currentStep,
        fieldsAnswered: this.fieldsAnswered,
        questionsAnswered: this.questionsAnswered,
        llmCalls: this.llmCalls,
        startTime: this.startTime,
      },
    });
  }

  private async restoreState(): Promise<void> {
    const key = STATE_KEY_PREFIX + this.jobUrl;
    const result = await chrome.storage.session.get(key);
    const state = result[key] as {
      step?: AutoApplyStep;
      fieldsAnswered?: number;
      questionsAnswered?: number;
      llmCalls?: number;
      startTime?: number;
    } | undefined;
    if (state) {
      this.currentStep = state.step ?? AutoApplyStep.IDLE;
      this.fieldsAnswered = state.fieldsAnswered ?? 0;
      this.questionsAnswered = state.questionsAnswered ?? 0;
      this.llmCalls = state.llmCalls ?? 0;
      this.startTime = state.startTime ?? Date.now();
      console.log(`[SM] Restored state: ${this.currentStep}`);
    }
  }

  private async clearState(): Promise<void> {
    const key = STATE_KEY_PREFIX + this.jobUrl;
    await chrome.storage.session.remove(key);
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
