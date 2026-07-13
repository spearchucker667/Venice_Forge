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
