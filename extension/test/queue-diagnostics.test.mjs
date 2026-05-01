import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const buildDir =
  process.env.MERLIN_EXTENSION_TEST_BUILD_DIR ??
  "/tmp/merlin-extension-tests";

const diagnostics = await import(
  pathToFileURL(`${buildDir}/background/queue-diagnostics.js`).href
);

const {
  queueApiErrorResult,
  queueBusyResult,
  summarizeQueueDrive,
} = diagnostics;

const active = [
  { id: "pending-b", status: "pending" },
  { id: "running-a", status: "running" },
  { id: "attention-a", status: "needs_attention" },
  { id: "pending-a", status: "pending" },
  { id: "failed-a", status: "failed" },
];

assert.deepEqual(
  summarizeQueueDrive({
    active,
    openedCount: 2,
    failedToOpenCount: 1,
  }),
  {
    ok: true,
    reason: "queue_fetched",
    activeCount: 5,
    pendingCount: 2,
    runningCount: 1,
    attentionCount: 1,
    openedCount: 2,
    failedToOpenCount: 1,
    pendingIds: ["pending-a", "pending-b"],
    runningIds: ["running-a"],
    attentionIds: ["attention-a"],
  },
);

assert.deepEqual(queueBusyResult(), {
  ok: true,
  reason: "already_running",
  activeCount: 0,
  pendingCount: 0,
  runningCount: 0,
  attentionCount: 0,
  openedCount: 0,
  failedToOpenCount: 0,
  pendingIds: [],
  runningIds: [],
  attentionIds: [],
});

assert.deepEqual(queueApiErrorResult({ status: 401, error: "Not authenticated" }), {
  ok: false,
  reason: "api_error",
  activeCount: 0,
  pendingCount: 0,
  runningCount: 0,
  attentionCount: 0,
  openedCount: 0,
  failedToOpenCount: 0,
  pendingIds: [],
  runningIds: [],
  attentionIds: [],
  apiStatus: 401,
  error: "Not authenticated",
});
