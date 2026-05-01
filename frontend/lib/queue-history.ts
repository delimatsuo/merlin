import type { QueueEntry } from "./store";

type QueueHistoryDateFields = Pick<QueueEntry, "finished_at" | "created_at">;

export function getQueueHistoryTimestamp(entry: QueueHistoryDateFields): number {
  const raw = entry.finished_at || entry.created_at;
  if (!raw) return 0;

  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortQueueHistoryNewestFirst<T extends QueueHistoryDateFields>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      timestamp: getQueueHistoryTimestamp(entry),
    }))
    .sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)
    .map(({ entry }) => entry);
}
