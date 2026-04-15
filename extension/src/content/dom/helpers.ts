/**
 * DOM helpers for interacting with React-controlled inputs.
 */

/**
 * Sets a value on a React-controlled input by dispatching native events.
 * React overrides the value setter, so we need to use the native one.
 */
export function setReactValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
