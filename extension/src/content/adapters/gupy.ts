/**
 * Gupy adapter — wraps the existing per-screen handlers behind the
 * BoardAdapter contract. Files under content/screens/ remain in place for
 * now; this module is the single seam the state machine talks to.
 */

import type { BoardAdapter } from "./adapter";
import {
  detectScreen,
  isGupyApplicationPage,
  findNextButton,
  findFinishButton,
  findDisqualifyingReviewModal,
  findConfirmButtonInModal,
  findIntroduceYourselfModal,
  findFinishButtonInIntroduceModal,
} from "../screens/detector";
import { handleWelcome } from "../screens/welcome";
import { handleAdditionalInfo } from "../screens/additional-info";
import { handleCustomQuestions, fillUserAnswers } from "../screens/custom-questions";
import { handlePersonalization } from "../screens/personalization";

export const gupyAdapter: BoardAdapter = {
  name: "Gupy",

  matches(url: URL): boolean {
    return url.hostname.endsWith(".gupy.io") || url.hostname === "gupy.io";
  },

  isApplicationPage(): boolean {
    return isGupyApplicationPage();
  },

  detectScreen() {
    return detectScreen();
  },

  handleWelcome() {
    return handleWelcome();
  },

  handleAdditionalInfo() {
    return handleAdditionalInfo();
  },

  handleCustomQuestions() {
    return handleCustomQuestions();
  },

  handlePersonalization() {
    return handlePersonalization();
  },

  fillUserAnswers(answers) {
    return fillUserAnswers(answers);
  },

  findNextButton() {
    return findNextButton();
  },

  findFinishButton() {
    return findFinishButton();
  },

  // `findBlockingModal` handles modals that aren't part of the canonical
  // submit sequence — currently just the disqualifying-review confirmation.
  // The "Introduce yourself!" modal is NOT returned here: it IS the submit
  // step, so it's modelled as AutoApplyStep.FINAL_CONFIRMATION and detected
  // by detectScreen(). Treating it as a blocking modal previously caused a
  // race with the personalization handler's rogue finish-click.
  findBlockingModal() {
    return findDisqualifyingReviewModal();
  },

  findModalConfirmButton(modal) {
    return findConfirmButtonInModal(modal);
  },

  findFinalConfirmationModal() {
    return findIntroduceYourselfModal();
  },

  findFinalConfirmationSubmitButton(modal) {
    return findFinishButtonInIntroduceModal(modal);
  },
};
