import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const contentRoot = path.join(repoRoot, "src", "content");

function listTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const offenders = listTsFiles(contentRoot)
  .filter((file) => fs.readFileSync(file, "utf8").includes("chrome.storage.session"))
  .map((file) => path.relative(repoRoot, file));

assert.deepEqual(
  offenders,
  [],
  [
    "Content scripts must not call chrome.storage.session directly.",
    "Chrome blocks that storage area from untrusted page contexts by default.",
    "Use the service-worker session-state proxy instead.",
    `Offenders: ${offenders.join(", ")}`,
  ].join("\n"),
);
