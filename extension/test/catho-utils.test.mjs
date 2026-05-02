import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const buildDir =
  process.env.MERLIN_EXTENSION_TEST_BUILD_DIR ??
  "/tmp/merlin-extension-tests";

const utils = await import(
  pathToFileURL(`${buildDir}/content/adapters/catho-utils.js`).href
);

const {
  classifyCathoScreen,
  isCathoDismissActionText,
  isCathoHost,
  isCathoJobPath,
  isCathoUpsellText,
} = utils;

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

assert.equal(isCathoUpsellText("Pule na frente dos concorrentes desta vaga"), true);
assert.equal(isCathoUpsellText("Quer ter até 18 vezes mais chances de receber um contato?"), true);
assert.equal(isCathoUpsellText("Questionário da vaga"), false);

assert.equal(isCathoDismissActionText("Agora não"), true);
assert.equal(isCathoDismissActionText("Agora nao"), true);
assert.equal(isCathoDismissActionText("Quero o Destaque Extra"), false);
