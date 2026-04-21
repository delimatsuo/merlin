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

  findBlockingModal() {
    return findDisqualifyingReviewModal();
  },

  findModalConfirmButton(modal) {
    return findConfirmButtonInModal(modal);
  },
};
