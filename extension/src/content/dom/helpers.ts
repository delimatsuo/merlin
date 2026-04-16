/**
 * DOM helpers for interacting with React-controlled inputs on Gupy pages.
 *
 * Gupy uses React, so direct `.value = x` won't update internal state.
 * These utilities use native property setters and synthetic events to
 * bridge the gap, plus human-like timing to avoid bot detection.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ScrapedField {
  label: string;
  type: "text" | "select" | "radio" | "checkbox" | "textarea";
  options?: string[];
  required: boolean;
  /** The input element itself */
  element: HTMLElement;
  /** Unique identifier for targeting (slugified label or input name/id) */
  elementId: string;
}

/* ------------------------------------------------------------------ */
/*  Timing helpers                                                     */
/* ------------------------------------------------------------------ */

/** Simple delay utility. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random delay between `minMs` and `maxMs` (defaults 1000–3000 ms). */
export async function randomDelay(
  minMs = 1000,
  maxMs = 3000,
): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delay);
}

/* ------------------------------------------------------------------ */
/*  React value setter                                                 */
/* ------------------------------------------------------------------ */

/**
 * Sets a value on a React-controlled input by using the native value
 * setter and dispatching input/change/blur events so React picks up the
 * change.
 */
export function setReactValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/* ------------------------------------------------------------------ */
/*  Human-like interactions                                            */
/* ------------------------------------------------------------------ */

/**
 * Types a string character by character with realistic timing.
 * Clears any existing value first.
 */
export async function humanLikeType(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  // Focus the element
  el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));

  // Clear existing value (select all + delete)
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, bubbles: true }),
  );
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true }),
  );
  setReactValue(el, "");

  // Type character by character
  let current = "";
  for (const char of value) {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }),
    );

    current += char;
    setReactValue(el, current);

    el.dispatchEvent(
      new KeyboardEvent("keyup", { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }),
    );

    // Random 30–80 ms between characters
    await sleep(Math.floor(Math.random() * 51) + 30);
  }

  // Final blur
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/**
 * Simulates a realistic mouse click sequence on an element.
 */
export async function humanLikeClick(el: HTMLElement): Promise<void> {
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  // Small pause (50–100 ms)
  await sleep(Math.floor(Math.random() * 51) + 50);
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // Native click as fallback — needed for React Router links and
  // elements that only respond to trusted events
  el.click();
}

/* ------------------------------------------------------------------ */
/*  Wait utilities                                                     */
/* ------------------------------------------------------------------ */

/**
 * Waits for an element matching `selector` to appear in the DOM.
 * Returns the element or `null` on timeout.
 */
export function waitForElement(
  selector: string,
  parent?: HTMLElement,
  timeout = 15000,
): Promise<HTMLElement | null> {
  const root = parent ?? document.body;

  return new Promise((resolve) => {
    // Already present?
    const existing = root.querySelector<HTMLElement>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    observer = new MutationObserver(() => {
      const el = root.querySelector<HTMLElement>(selector);
      if (el) {
        cleanup();
        resolve(el);
      }
    });

    observer.observe(root, { childList: true, subtree: true });

    timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeout);
  });
}

/**
 * Waits for the main content area to change, indicating a page
 * navigation within Gupy's SPA.
 */
export function waitForNavigation(timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const container =
      document.querySelector<HTMLElement>("[role='main']") ??
      document.querySelector<HTMLElement>("main") ??
      document.querySelector<HTMLElement>("#root") ??
      document.body;

    const snapshot = container.innerHTML.length;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    observer = new MutationObserver(() => {
      const current = container.innerHTML.length;
      // Significant change = more than 10 % difference in length
      if (Math.abs(current - snapshot) / (snapshot || 1) > 0.1) {
        cleanup();
        resolve(true);
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);
  });
}

/* ------------------------------------------------------------------ */
/*  React select / radio / checkbox                                    */
/* ------------------------------------------------------------------ */

/**
 * Opens a React-based custom dropdown and selects an option by text.
 * Returns `true` if the option was found and clicked.
 */
export async function clickReactSelect(
  triggerEl: HTMLElement,
  optionText: string,
  timeout = 15000,
): Promise<boolean> {
  // Open the dropdown
  await humanLikeClick(triggerEl);

  // Wait for the options list to appear
  const optionSelector =
    '[class*="option"], [class*="Option"], [role="option"], [role="listbox"] li, ul li';
  const firstOption = await waitForElement(optionSelector, undefined, timeout);
  if (!firstOption) return false;

  // Small extra delay for all options to render
  await sleep(100);

  // Gather all visible options
  const root = firstOption.parentElement ?? document.body;
  const allOptions = root.querySelectorAll<HTMLElement>(optionSelector);

  const needle = optionText.trim().toLowerCase();
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i];
    if (opt.textContent?.trim().toLowerCase() === needle) {
      await humanLikeClick(opt);
      return true;
    }
  }

  return false;
}

/**
 * Finds a radio button option within a container by label text and
 * clicks it. Returns `true` if found and clicked.
 */
export async function clickRadioOption(
  container: HTMLElement,
  optionText: string,
): Promise<boolean> {
  const labels = container.querySelectorAll("label");
  const needle = optionText.trim().toLowerCase();

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label.textContent?.trim().toLowerCase() === needle) {
      await humanLikeClick(label);
      return true;
    }
  }

  return false;
}

/**
 * Finds a checkbox within a container and clicks its label if the
 * desired state differs from the current state.
 * Returns `true` if the checkbox ended up in the desired state.
 */
export async function clickCheckbox(
  container: HTMLElement,
  shouldCheck: boolean,
): Promise<boolean> {
  const checkbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!checkbox) return false;

  if (checkbox.checked === shouldCheck) return true;

  // Try to find the associated label
  const label =
    (checkbox.id
      ? container.querySelector<HTMLElement>(`label[for="${checkbox.id}"]`)
      : null) ?? container.querySelector<HTMLElement>("label");

  if (label) {
    await humanLikeClick(label);
  } else {
    await humanLikeClick(checkbox);
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Finders                                                            */
/* ------------------------------------------------------------------ */

/**
 * Finds an element matching `selector` whose text content contains
 * `text` (case-insensitive).
 */
export function findElementByText(
  selector: string,
  text: string,
  parent?: HTMLElement,
): HTMLElement | null {
  const root = parent ?? document.body;
  const elements = root.querySelectorAll(selector);
  const needle = text.trim().toLowerCase();

  // Pass 1: exact match on native clickable elements (button, a, input)
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag !== "button" && tag !== "a" && tag !== "input") continue;
    const content = el.textContent?.trim().toLowerCase() || "";
    if (content === needle) return el;
  }

  // Pass 2: exact match on any element
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const content = el.textContent?.trim().toLowerCase() || "";
    if (content === needle) return el;
  }

  // Pass 3: short text match on native clickable elements
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag !== "button" && tag !== "a" && tag !== "input") continue;
    const content = el.textContent?.trim().toLowerCase() || "";
    if (content.includes(needle) && content.length < needle.length * 3 + 20) {
      return el;
    }
  }

  // Pass 4: short text match on any element
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const content = el.textContent?.trim().toLowerCase() || "";
    if (content.includes(needle) && content.length < needle.length * 3 + 20) {
      return el;
    }
  }

  // Pass 5: any match (fallback)
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    if (el.textContent?.toLowerCase().includes(needle)) {
      return el;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Form scraping                                                      */
/* ------------------------------------------------------------------ */

/** Escape a string for use in a CSS selector (ID, attribute value). */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof (CSS as any).escape === "function") {
    return (CSS as any).escape(s);
  }
  return s.replace(/([^\w-])/g, "\\$1");
}

/** Convert a string to a URL-friendly slug for use as an elementId. */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Scrapes all form fields from the given container (defaults to
 * `document.body`). Returns an array of `ScrapedField` descriptors.
 */
export function scrapeFormFields(
  container?: HTMLElement,
): ScrapedField[] {
  const root = container ?? document.body;
  const fields: ScrapedField[] = [];
  const seen = new Set<HTMLElement>();

  // Strategy: walk all labels and find their associated inputs
  const labels = root.querySelectorAll("label");

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const labelText = label.textContent?.trim() ?? "";
    if (!labelText) continue;

    // Find associated input — via `for` attribute or nested
    let input: HTMLElement | null = null;

    const forAttr = label.getAttribute("for");
    if (forAttr) {
      input = root.querySelector<HTMLElement>(`#${cssEscape(forAttr)}`);
    }

    if (!input) {
      input =
        label.querySelector<HTMLElement>("input, textarea, select") ??
        label.parentElement?.querySelector<HTMLElement>("input, textarea, select") ??
        null;
    }

    // Also check the next sibling group
    if (!input) {
      const parent = label.closest("[class*='field'], [class*='Field'], [class*='group'], [class*='Group']");
      if (parent) {
        input = parent.querySelector<HTMLElement>("input, textarea, select");
      }
    }

    if (!input || seen.has(input)) continue;
    seen.add(input);

    const tagName = input.tagName.toLowerCase();
    const inputType = (input as HTMLInputElement).type?.toLowerCase() ?? "";

    let type: ScrapedField["type"];
    let options: string[] | undefined;

    if (tagName === "textarea") {
      type = "textarea";
    } else if (tagName === "select") {
      type = "select";
      const opts = input.querySelectorAll("option");
      options = Array.from(opts)
        .map((o) => o.textContent?.trim() ?? "")
        .filter(Boolean);
    } else if (inputType === "checkbox") {
      type = "checkbox";
    } else if (inputType === "radio") {
      type = "radio";
      // Gather all radios with the same name
      const name = (input as HTMLInputElement).name;
      if (name) {
        const radios = root.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${cssEscape(name)}"]`,
        );
        options = Array.from(radios).map((r) => {
          const rLabel =
            r.id ? root.querySelector<HTMLElement>(`label[for="${cssEscape(r.id)}"]`) : null;
          return rLabel?.textContent?.trim() ?? r.value;
        });
      }
    } else {
      type = "text";
    }

    // Check for React custom selects (divs that act as selects)
    if (type === "text") {
      const parent = input.closest("[class*='select'], [class*='Select']");
      if (parent && parent.querySelector("[class*='option'], [class*='Option'], [role='listbox']")) {
        type = "select";
      }
    }

    const required =
      labelText.includes("*") ||
      (input as HTMLInputElement).required === true ||
      input.getAttribute("aria-required") === "true";

    const elementId =
      (input as HTMLInputElement).id ||
      (input as HTMLInputElement).name ||
      slugify(labelText) ||
      `field-${fields.length}`;

    fields.push({
      label: labelText.replace(/\s*\*\s*$/, "").trim(),
      type,
      options,
      required,
      element: input,
      elementId,
    });
  }

  return fields;
}
