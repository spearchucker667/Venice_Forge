/** @fileoverview Canonical sync protocol types and builders shared between renderer and main process. */

import type { SyncStoreName } from "../types/sync";

/** A record representing a hard-deleted item for sync propagation. */
export interface Tombstone {
  /** Unique ID for the tombstone itself, typically `storeName:recordId`. */
  id: string;
  /** The store where the record was deleted. */
  storeName: SyncStoreName;
  /** The ID of the deleted record. */
  recordId: string;
  /** Unix timestamp of deletion. */
  deletedAt: number;
  /** Device ID that performed the deletion (if known). */
  deviceId?: string;
}

/** Create a canonical tombstone with a deterministic id. */
export function createTombstone(
  storeName: SyncStoreName,
  recordId: string,
  deviceId?: string,
  deletedAt = Date.now(),
): Tombstone {
  return {
    id: `${storeName}:${recordId}`,
    storeName,
    recordId,
    deletedAt,
    deviceId,
  };
}

const SYNCABLE_STORE_PATTERN = /^[a-zA-Z0-9_]{1,64}$/;
const RECORD_ID_PATTERN = /^[a-zA-Z0-9_.:-]{1,256}$/;

/** Validate that a parsed object is a well-formed tombstone. */
export function validateTombstone(value: unknown): { ok: true; tombstone: Tombstone } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Tombstone must be an object." };
  }
  const t = value as Record<string, unknown>;

  if (typeof t.storeName !== "string" || !SYNCABLE_STORE_PATTERN.test(t.storeName)) {
    return { ok: false, error: "Tombstone has invalid or missing storeName." };
  }
  if (typeof t.recordId !== "string" || !RECORD_ID_PATTERN.test(t.recordId) || t.recordId.includes("..")) {
    return { ok: false, error: "Tombstone has invalid or missing recordId." };
  }
  if (typeof t.deletedAt !== "number" || !Number.isFinite(t.deletedAt) || t.deletedAt <= 0) {
    return { ok: false, error: "Tombstone has invalid deletedAt timestamp." };
  }
  const expectedId = `${t.storeName}:${t.recordId}`;
  if (typeof t.id !== "string" || t.id !== expectedId) {
    return { ok: false, error: "Tombstone id must equal storeName:recordId." };
  }
  if (t.storeName === "tombstones" || t.storeName === "diagnostics") {
    return { ok: false, error: "Tombstone cannot target tombstones or diagnostics stores." };
  }

  const tombstone: Tombstone = {
    id: t.id,
    storeName: t.storeName as SyncStoreName,
    recordId: t.recordId,
    deletedAt: t.deletedAt,
  };
  if (typeof t.deviceId === "string") {
    tombstone.deviceId = t.deviceId;
  }
  return { ok: true, tombstone };
}
