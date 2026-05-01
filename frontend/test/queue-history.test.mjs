import assert from "node:assert/strict";
import {
  getQueueHistoryTimestamp,
  sortQueueHistoryNewestFirst,
} from "/tmp/merlin-frontend-tests/lib/queue-history.js";

const older = {
  id: "older",
  finished_at: "2026-05-01T12:00:00.000Z",
  created_at: "2026-05-01T10:00:00.000Z",
};
const newer = {
  id: "newer",
  finished_at: "2026-05-01T20:00:00.000Z",
  created_at: "2026-05-01T09:00:00.000Z",
};
const fallback = {
  id: "fallback",
  finished_at: null,
  created_at: "2026-05-01T18:00:00.000Z",
};

assert.equal(getQueueHistoryTimestamp(newer), Date.parse(newer.finished_at));
assert.equal(getQueueHistoryTimestamp(fallback), Date.parse(fallback.created_at));

const sorted = sortQueueHistoryNewestFirst([older, fallback, newer]);
assert.deepEqual(
  sorted.map((entry) => entry.id),
  ["newer", "fallback", "older"],
);

assert.deepEqual(
  [older, fallback, newer].map((entry) => entry.id),
  ["older", "fallback", "newer"],
  "sortQueueHistoryNewestFirst must not mutate the input array",
);
