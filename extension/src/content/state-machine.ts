/**
 * State machine for the auto-apply flow.
 * Manages transitions between application screens.
 */

import { AutoApplyStep, ErrorType } from "../lib/types";

export class StateMachine {
  private currentStep: AutoApplyStep = AutoApplyStep.IDLE;
  private errorType: ErrorType | null = null;
  private errorDetail: string | null = null;

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
  }

  reset(): void {
    this.currentStep = AutoApplyStep.IDLE;
    this.errorType = null;
    this.errorDetail = null;
  }
}
