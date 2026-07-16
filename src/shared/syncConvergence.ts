import { toEpochMilliseconds } from "./syncTimestamp";

interface SyncComparableRecord {
  updatedAt?: unknown;
  revisionId?: unknown;
  deviceId?: unknown;
}

function timestamp(value: unknown): number {
  return toEpochMilliseconds(
    typeof value === "string" || typeof value === "number" || value instanceof Date || value === null
      ? value
      : undefined,
  ) ?? 0;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

/** Positive means incoming deterministically wins, negative means local wins. */
export function compareSyncRecords(incoming: SyncComparableRecord, local: SyncComparableRecord): number {
  const timeDifference = timestamp(incoming.updatedAt) - timestamp(local.updatedAt);
  if (timeDifference !== 0) return timeDifference;
  for (const field of ["revisionId", "deviceId"] as const) {
    const comparison = String(incoming[field] ?? "").localeCompare(String(local[field] ?? ""));
    if (comparison !== 0) return comparison;
  }
  return canonicalize(incoming).localeCompare(canonicalize(local));
}

export function compareSyncMessages(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const timeDifference = timestamp(left.createdAt) - timestamp(right.createdAt);
  if (timeDifference !== 0) return timeDifference;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

/**
 * Detects silent-edit data loss: pairs of messages whose IDs match
 * (so they'd be skipped by the message-level append merge) but whose
 * non-id content diverges. The caller iterates this list to fork each
 * divergent pair into a conflict record so edits on different devices
 * are never written over without user review.
 *
 * Excludes `createdAt` and any known transport-only fields from the
 * canonical comparison so timestamps and revision metadata do not
 * themselves cause a divergence classification.
 */
export function findMessageContentDivergences(
  localMessages: Array<Record<string, unknown>>,
  importedMessages: Array<Record<string, unknown>>,
  excludedKeys: readonly string[] = ["createdAt", "revisionId", "baseRevisionId", "deviceId"],
): Array<{ id: string; local: Record<string, unknown>; imported: Record<string, unknown> }> {
  const divergences: Array<{ id: string; local: Record<string, unknown>; imported: Record<string, unknown> }> = [];
  const localById = new Map<string, Record<string, unknown>>();
  for (const message of localMessages) {
    if (message && typeof message === "object" && typeof message.id === "string") {
      localById.set(message.id, message);
    }
  }
  for (const imported of importedMessages) {
    if (!imported || typeof imported !== "object" || typeof imported.id !== "string") continue;
    const local = localById.get(imported.id);
    if (!local) continue;
    if (!messagesHaveContentDivergence(local, imported, excludedKeys)) continue;
    divergences.push({ id: imported.id, local, imported });
  }
  return divergences;
}

function messagesHaveContentDivergence(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  excludedKeys: readonly string[],
): boolean {
  const excludeSet = new Set<string>(excludedKeys);
  return canonicalize(stripExcluded(left, excludeSet)) !== canonicalize(stripExcluded(right, excludeSet));
}

function stripExcluded(
  value: Record<string, unknown>,
  excluded: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (excluded.has(key)) continue;
    result[key] = entry;
  }
  return result;
}
