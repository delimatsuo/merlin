/**
 * State machine for the auto-apply flow.
 * Manages transitions between application screens.
 */

export enum AutoApplyStep {
  IDLE = "IDLE",
  DETECTING = "DETECTING",
  WELCOME = "WELCOME",
  ADDITIONAL_INFO = "ADDITIONAL_INFO",
  CUSTOM_QUESTIONS = "CUSTOM_QUESTIONS",
  PERSONALIZATION = "PERSONALIZATION",
  REVIEW = "REVIEW",
  SUBMITTED = "SUBMITTED",
  ERROR = "ERROR",
}

export class StateMachine {
  private currentStep: AutoApplyStep = AutoApplyStep.IDLE;

  getStep(): AutoApplyStep {
    return this.currentStep;
  }

  transition(next: AutoApplyStep): void {
    console.log(`[StateMachine] ${this.currentStep} -> ${next}`);
    this.currentStep = next;
  }

  reset(): void {
    this.currentStep = AutoApplyStep.IDLE;
  }
}
