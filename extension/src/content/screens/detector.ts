/**
 * Screen detector — identifies which Gupy application screen is currently displayed.
 */

import { AutoApplyStep } from "../state-machine";

export function detectScreen(): AutoApplyStep {
  // TODO: Implement screen detection based on DOM selectors
  return AutoApplyStep.IDLE;
}
