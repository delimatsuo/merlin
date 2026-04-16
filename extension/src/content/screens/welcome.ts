/**
 * Handler for the Gupy welcome/intro screen.
 * Clicks the apply button and waits for navigation.
 */

import { SELECTORS } from "../dom/selectors";
import { findElementByText, humanLikeClick, waitForNavigation } from "../dom/helpers";

export async function handleWelcome(): Promise<void> {
  console.log("[Welcome] Looking for actionable button...");

  // Priority order: Apply → Answer Now → Continue
  // Each represents a different gateway page in the Gupy flow

  // 1. Apply / Candidatar button (job posting page)
  for (const text of SELECTORS.buttonText.apply) {
    const btn = findElementByText("button, a", text);
    if (btn && !(btn as HTMLButtonElement).disabled) {
      console.log(`[Welcome] Clicking apply: "${text}"`);
      await humanLikeClick(btn);
      await waitForNavigation(15000);
      return;
    }
  }

  // 2. "Answer now" / "Responder agora" button (gateway before custom questions)
  for (const text of SELECTORS.buttonText.answerNow) {
    const btn = findElementByText("button, a", text);
    if (btn && !(btn as HTMLButtonElement).disabled) {
      console.log(`[Welcome] Clicking answer now: "${text}"`);
      await humanLikeClick(btn);
      await waitForNavigation(15000);
      return;
    }
  }

  // 3. Continue / Continuar button (confirmation page)
  const continueTexts = ["continue", "continuar"];
  for (const text of continueTexts) {
    const btn = findElementByText("button, a", text);
    if (btn && !(btn as HTMLButtonElement).disabled) {
      // Avoid matching "Save and continue" (that's a form submit, not a welcome button)
      const btnText = btn.textContent?.toLowerCase().trim() || "";
      if (!btnText.includes("save") && !btnText.includes("salvar")) {
        console.log(`[Welcome] Clicking continue: "${btnText}"`);
        await humanLikeClick(btn);
        await waitForNavigation(15000);
        return;
      }
    }
  }

  // Fallback: try the generic apply button selector
  const applyBtn = document.querySelector(SELECTORS.gupy.applyButton) as HTMLElement | null;
  if (applyBtn) {
    console.log("[Welcome] Found apply button via selector");
    await humanLikeClick(applyBtn);
    await waitForNavigation(15000);
    return;
  }

  console.warn("[Welcome] No actionable button found");
}
