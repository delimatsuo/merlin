/**
 * BoardAdapter: the per-job-board contract.
 *
 * The state machine, queue, and learning loop are board-agnostic. Everything
 * that differs per board (Gupy, Catho, Greenhouse, Lever, LinkedIn EasyApply,
 * Workday, ...) lives behind this interface. Add a new board by writing an
 * adapter and registering it in registry.ts.
 */

import type { AutoApplyStep } from "../../lib/types";
import type { AdditionalInfoResult } from "../screens/additional-info";
import type { CustomQuestionsResult } from "../screens/custom-questions";
import type { PersonalizationResult } from "../screens/personalization";

export interface BoardAdapter {
  /** Human-readable name, e.g. "Gupy". Used in logs + telemetry. */
  readonly name: string;

  /** URL predicate — does this adapter handle the current page? */
  matches(url: URL): boolean;

  /** Is the user on an active application flow right now? */
  isApplicationPage(): boolean;

  /** Classify the current screen so the state machine knows what to run. */
  detectScreen(): AutoApplyStep;

  // --- Per-step handlers ---
  handleWelcome(): Promise<void>;
  handleAdditionalInfo(): Promise<AdditionalInfoResult>;
  handleCustomQuestions(): Promise<CustomQuestionsResult>;
  handlePersonalization(): Promise<PersonalizationResult>;

  /** Fill user-provided answers from the popup / in-page prompt. */
  fillUserAnswers(answers: Record<string, string>): Promise<number>;

  // --- Navigation + terminal actions ---
  findNextButton(): HTMLElement | null;
  findFinishButton(): HTMLElement | null;

  // --- Optional per-board modals / checkpoints ---
  /**
   * Return the current blocking confirmation modal that isn't part of the
   * canonical submit sequence (e.g. Gupy's "Review of disqualifying
   * questions"). The final-submit modal has its own state (see below) and
   * must NOT be returned here.
   */
  findBlockingModal?(): HTMLElement | null;
  /** Given a modal from findBlockingModal, return the "confirm/submit" button. */
  findModalConfirmButton?(modal: HTMLElement): HTMLElement | null;

  /**
   * Return the final-submit confirmation modal (e.g. Gupy's "Introduce
   * yourself!") if it's currently open. This is the last step before
   * COMPLETE. When visible, detectScreen() should return FINAL_CONFIRMATION.
   */
  findFinalConfirmationModal?(): HTMLElement | null;
  /** Given that modal, return the "Finish / Finalizar candidatura" button. */
  findFinalConfirmationSubmitButton?(modal: HTMLElement): HTMLElement | null;
}
