import assert from "node:assert/strict";
import {
  MERLIN_EXTENSION_IDS,
  pingInstalledExtension,
} from "/tmp/merlin-frontend-tests/lib/extension-detection.js";

assert.deepEqual(MERLIN_EXTENSION_IDS, [
  "gpnbdjkdalnalehhfajgapalhlogbbbd",
  "pckpedgciidgclkelofcicgaeelcicea",
]);

const runtime = {
  lastError: null,
  sendMessage(extensionId, message, callback) {
    assert.equal(message.type, "PING");
    if (extensionId === "gpnbdjkdalnalehhfajgapalhlogbbbd") {
      this.lastError = { message: "not installed" };
      callback(undefined);
      return;
    }
    this.lastError = null;
    callback({
      ok: true,
      version: "1.0.12",
      user: { uid: "uid-1", email: "deli@example.com" },
      isAuthenticated: true,
    });
  },
};

const found = await pingInstalledExtension(runtime, MERLIN_EXTENSION_IDS, 50);
assert.deepEqual(found, {
  detected: true,
  version: "1.0.12",
  user: { uid: "uid-1", email: "deli@example.com" },
  isAuthenticated: true,
});

const missingRuntime = {
  lastError: null,
  sendMessage(_extensionId, _message, callback) {
    this.lastError = { message: "not installed" };
    callback(undefined);
  },
};

assert.equal(await pingInstalledExtension(missingRuntime, MERLIN_EXTENSION_IDS, 50), null);
