import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const buildDir =
  process.env.MERLIN_EXTENSION_TEST_BUILD_DIR ??
  "/tmp/merlin-extension-tests";

const helpers = await import(
  pathToFileURL(`${buildDir}/content/dom/helpers.js`).href
);

const { isClickable, waitUntilClickable } = helpers;

globalThis.getComputedStyle = (el) => ({
  pointerEvents: el.pointerEvents ?? "auto",
  opacity: el.opacity ?? "1",
});

function element({
  ariaDisabled = "",
  disabled = false,
  pointerEvents = "auto",
  parentElement = null,
} = {}) {
  return {
    tagName: "BUTTON",
    textContent: "Finish application",
    disabled,
    pointerEvents,
    parentElement,
    getAttribute(name) {
      return name === "aria-disabled" ? ariaDisabled : null;
    },
  };
}

assert.equal(isClickable(element({ ariaDisabled: "true" })), false);
assert.equal(
  isClickable(element({ ariaDisabled: "true" }), { ignoreAriaDisabled: true }),
  true,
);

assert.equal(
  isClickable(element({ disabled: true }), { ignoreAriaDisabled: true }),
  false,
);
assert.equal(
  isClickable(element({ pointerEvents: "none" }), { ignoreAriaDisabled: true }),
  false,
);
assert.equal(
  isClickable(
    element({
      parentElement: element({ pointerEvents: "none" }),
    }),
    { ignoreAriaDisabled: true },
  ),
  false,
);

assert.equal(
  await waitUntilClickable(
    element({ ariaDisabled: "true" }),
    5,
    1,
    { ignoreAriaDisabled: true },
  ),
  true,
);
