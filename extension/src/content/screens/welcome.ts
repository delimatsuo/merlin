/**
 * Handler for the Gupy welcome/intro screen.
 * Clicks the apply button and waits for navigation.
 */

import { SELECTORS } from "../dom/selectors";
import { findElementByText, humanLikeClick, waitForNavigation } from "../dom/helpers";

export async function handleWelcome(): Promise<void> {
  console.log("[Welcome] Looking for apply button...");

  // Try to find the apply/candidatar button by text
  for (const text of SELECTORS.buttonText.apply) {
    const btn = findElementByText("button, a", text);
    if (btn && !(btn as HTMLButtonElement).disabled) {
      console.log(`[Welcome] Found apply button: "${text}"`);
      await humanLikeClick(btn);
      await waitForNavigation(15000);
      return;
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

  console.warn("[Welcome] No apply button found");
}
