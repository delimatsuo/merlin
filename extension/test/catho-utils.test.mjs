import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const buildDir =
  process.env.MERLIN_EXTENSION_TEST_BUILD_DIR ??
  "/tmp/merlin-extension-tests";

const utils = await import(
  pathToFileURL(`${buildDir}/content/adapters/catho-utils.js`).href
);

const { classifyCathoScreen, isCathoHost, isCathoJobPath } = utils;

assert.equal(isCathoHost("catho.com.br"), true);
assert.equal(isCathoHost("www.catho.com.br"), true);
assert.equal(isCathoHost("assets.catho.com.br"), true);
assert.equal(isCathoHost("evilcatho.com.br"), false);
assert.equal(isCathoHost("catho.com.br.evil.test"), false);

assert.equal(isCathoJobPath("/vagas/analista-de-dados/36359652/"), true);
assert.equal(isCathoJobPath("/vagas/analista-de-dados"), false);
assert.equal(isCathoJobPath("/signin/"), false);

assert.equal(
  classifyCathoScreen({
    successVisible: false,
    failureVisible: false,
    questionnaireVisible: true,
    applyButtonVisible: true,
  }),
  "questionnaire",
);

assert.equal(
  classifyCathoScreen({
    successVisible: false,
    failureVisible: false,
    questionnaireVisible: false,
    applyButtonVisible: true,
  }),
  "welcome",
);

assert.equal(
  classifyCathoScreen({
    successVisible: true,
    failureVisible: false,
    questionnaireVisible: true,
    applyButtonVisible: true,
  }),
  "complete",
);
