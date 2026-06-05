/**
 * @fileoverview Renderer-side lorebook service.
 *
 * Two backends:
 *   - Electron: `window.veniceForge.lorebooks.{list,get,save,delete}`
 *   - Web: IndexedDB store `lorebooks` (encrypted)
 *
 * Pure evaluation helpers (entryMatches, selectTriggeredEntries) live in
 * `lorebookService.ts` and are re-exported here for convenience.
 */

import { isElectron, desktopLorebooks } from "../desktopBridge";
import type { LorebookV1 } from "../../types/rp";
import { isValidRpId, MAX_LOREBOOK_ENTRIES } from "../../types/rp";
import StorageService from "../storageService";
import { normalizeLorebook, validateLorebook } from "./lorebookService";

const STORE = "lorebooks" as const;
const ID_RE = isValidRpId;
const MAX_LIST_BOOKS = 1_000;

export { entryMatches, selectTriggeredEntries, normalizeLorebook, validateLorebook } from "./lorebookService";

/** Lists all lorebooks (capped). */
export async function listLorebooks(): Promise<LorebookV1[]> {
  if (isElectron()) {
    const res = await desktopLorebooks.list();
    if (!res.ok) throw new Error(res.error ?? "Failed to list lorebooks.");
    return (res.lorebooks ?? [])
      .map(normalizeLorebook)
      .filter((b): b is LorebookV1 => b !== null)
      .slice(0, MAX_LIST_BOOKS);
  }
  const records = await StorageService.getItems<LorebookV1>(STORE);
  return records
    .map(normalizeLorebook)
    .filter((b): b is LorebookV1 => b !== null)
    .slice(0, MAX_LIST_BOOKS);
}

/** Reads a single lorebook by id, or returns null. */
export async function readLorebook(id: string): Promise<LorebookV1 | null> {
  if (!ID_RE(id)) return null;
  if (isElectron()) {
    const res = await desktopLorebooks.get(id);
    if (!res.ok) return null;
    return res.lorebook ? normalizeLorebook(res.lorebook) : null;
  }
  const record = await StorageService.getItem<LorebookV1>(STORE, id);
  return record ? normalizeLorebook(record) : null;
}

/** Saves a lorebook atomically. Generates an id if missing. */
export async function saveLorebook(book: LorebookV1): Promise<LorebookV1> {
  const now = Date.now();
  const id = book.id && ID_RE(book.id) ? book.id : generateId();
  const next: LorebookV1 = {
    ...book,
    id,
    schema: "LorebookV1",
    createdAt: book.createdAt ?? now,
    updatedAt: now,
    entries: book.entries ?? [],
  };
  const normalized = normalizeLorebook(next);
  if (!normalized) throw new Error("Invalid lorebook.");
  if (normalized.entries.length > MAX_LOREBOOK_ENTRIES) {
    throw new Error(`Lorebook cannot contain more than ${MAX_LOREBOOK_ENTRIES} entries.`);
  }
  validateLorebook(normalized);
  if (isElectron()) {
    const res = await desktopLorebooks.save(normalized);
    if (!res.ok) throw new Error(res.error ?? "Failed to save lorebook.");
    return res.lorebook ? normalizeLorebook(res.lorebook) ?? normalized : normalized;
  }
  await StorageService.saveItem(STORE, normalized as unknown as Record<string, unknown>);
  return normalized;
}

/** Deletes a lorebook by id. Returns true when removed. */
export async function deleteLorebook(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopLorebooks.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/** Generates a new id that satisfies `VALID_ID_RE`. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `l_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
