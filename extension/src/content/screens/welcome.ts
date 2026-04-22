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

  const clickableSelector = "button, a, div[role='button'], span[role='button'], [role='button'], [class*='btn'], [class*='Btn'], [class*='button'], [class*='Button']";

  // 1. Apply / Candidatar button (job posting page)
  for (const text of SELECTORS.buttonText.apply) {
    const btn = findElementByText(clickableSelector, text);
    if (btn) {
      console.log(`[Welcome] Clicking apply: "${text}" (${btn.tagName})`);
      await humanLikeClick(btn);
      await waitForNavigation(8000);
      return;
    }
  }

  // 2. "Answer now" / "Responder agora" button (gateway before custom questions)
  for (const text of SELECTORS.buttonText.answerNow) {
    const btn = findElementByText(clickableSelector, text);
    if (btn) {
      console.log(`[Welcome] Clicking answer now: "${text}" (${btn.tagName})`);
      await humanLikeClick(btn);
      await waitForNavigation(8000);
      return;
    }
  }

  // 3. Continue / Continuar button (confirmation page)
  // Search broadly — Gupy renders buttons as various element types
  const continueTexts = ["continue", "continuar"];
  for (const text of continueTexts) {
    const btn = findElementByText("button, a, div, span, [role='button']", text);
    if (btn) {
      const btnText = btn.textContent?.toLowerCase().trim() || "";
      // Avoid matching "Save and continue" (that's a form submit, not a welcome button)
      if (!btnText.includes("save") && !btnText.includes("salvar")) {
        console.log(`[Welcome] Clicking continue: "${btnText}" (${btn.tagName})`);
        await humanLikeClick(btn);
        await waitForNavigation(8000);
        return;
      }
    }
  }

  // Fallback: look for any prominent button/link on the page
  // Gupy job pages have the Apply button in the header or as a CTA
  const allButtons = document.querySelectorAll("button, a[role='button'], a.btn, a[class*='apply'], a[class*='Apply'], button[class*='apply'], button[class*='Apply']");
  for (let i = 0; i < allButtons.length; i++) {
    const b = allButtons[i] as HTMLElement;
    const text = b.textContent?.toLowerCase().trim() || "";
    if (text && text.length < 30 && (
      text.includes("apply") || text.includes("candidat") || text.includes("inscrev")
    )) {
      console.log(`[Welcome] Found apply button via fallback: "${b.textContent?.trim()}"`);
      await humanLikeClick(b);
      await waitForNavigation(8000);
      return;
    }
  }

  console.warn("[Welcome] No actionable button found — page may need manual interaction");
}
