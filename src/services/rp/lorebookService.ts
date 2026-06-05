/**
 * @fileoverview Lorebook service for the Character RP Studio.
 *
 * Lorebooks (a.k.a. "World Info") are collections of keyword-triggered text
 * fragments. At RP time, the prompt builder asks: for each entry, does the
 * recent message window contain any of its trigger keys (respecting
 * case-sensitivity and whole-word settings)? If yes, the entry is included.
 *
 * Storage:
 *   - Electron: `<userData>/lorebooks/<id>.json` via `createSingleFileStore`
 *   - Web: IndexedDB store `lorebooks` (encrypted) — see webLorebookStore below
 *
 * Safety:
 *   - The lorebook service does NOT run the child exploitation safety guard
 *     on save. Lorebook content is a system-prompt fragment, and the chat
 *     boundary (assessRpContext) runs the guard on the full assembled payload
 *     before any prompt is sent. This means individual entries can contain
 *     sensitive-but-allowed content; the boundary still catches combined-context
 *     evasion.
 *   - Trigger keys are trimmed, lowercased (unless case-sensitive), and capped.
 *   - The `at_depth` insertion mode is honored by the prompt builder.
 */

import type { LorebookEntryV1, LorebookV1 } from "../../types/rp";
import { MAX_LOREBOOK_ENTRIES, MAX_LOREBOOK_ENTRY_CHARS, MAX_TAGS, isValidRpId } from "../../types/rp";

/** Minimum length for a non-constant trigger key. */
const MIN_KEY_LENGTH = 1;
/** Maximum length for a trigger key (after trim). */
const MAX_KEY_LENGTH = 64;
/** Maximum entries returned by `selectTriggeredEntries` to keep prompt size bounded. */
const MAX_TRIGGERED_ENTRIES = 50;

/** Returns true when the entry matches any of its trigger keys against the
 *  provided recent text. Respects `constant`, `caseSensitive`, `matchWholeWords`,
 *  and the `enabled` flag. */
export function entryMatches(entry: LorebookEntryV1, recentText: string): boolean {
  if (!entry.enabled) return false;
  if (entry.constant) return true;
  if (!recentText) return false;
  const allKeys = entry.keys.length > 0 ? entry.keys : entry.secondaryKeys ?? [];
  if (allKeys.length === 0) return false;
  const haystack = entry.caseSensitive ? recentText : recentText.toLowerCase();
  for (const raw of allKeys) {
    const key = raw.trim();
    if (key.length < MIN_KEY_LENGTH) continue;
    const needle = entry.caseSensitive ? key : key.toLowerCase();
    if (entry.matchWholeWords) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`);
      if (re.test(haystack)) return true;
    } else {
      if (haystack.includes(needle)) return true;
    }
  }
  return false;
}

/** Selects triggered entries from a lorebook, capped and deterministically ordered. */
export function selectTriggeredEntries(book: LorebookV1, recentText: string, cap = MAX_TRIGGERED_ENTRIES): LorebookEntryV1[] {
  if (!book || !Array.isArray(book.entries)) return [];
  const triggered = book.entries.filter((e) => entryMatches(e, recentText));
  triggered.sort((a, b) => {
    if (a.constant !== b.constant) return a.constant ? -1 : 1; // constants first
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
  return triggered.slice(0, Math.max(0, cap));
}

/** Normalizes a single lorebook entry: trims keys, clamps content, caps tag-like fields. */
export function normalizeEntry(input: unknown): LorebookEntryV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!isValidRpId(id)) return null;
  const content = typeof r.content === "string" ? r.content.slice(0, MAX_LOREBOOK_ENTRY_CHARS) : "";
  if (!content) return null;
  const keys = Array.isArray(r.keys)
    ? (r.keys
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim().slice(0, MAX_KEY_LENGTH))
        .filter((k) => k.length >= MIN_KEY_LENGTH))
    : [];
  const secondaryKeys = Array.isArray(r.secondaryKeys)
    ? (r.secondaryKeys
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim().slice(0, MAX_KEY_LENGTH))
        .filter((k) => k.length >= MIN_KEY_LENGTH))
    : undefined;
  if (keys.length === 0 && !secondaryKeys) return null;
  const constant = r.constant === true;
  const insertionMode: LorebookEntryV1["insertionMode"] =
    r.insertionMode === "after_char" || r.insertionMode === "at_depth" ? r.insertionMode : "before_char";
  const depth = typeof r.depth === "number" && Number.isFinite(r.depth) ? Math.max(0, Math.floor(r.depth)) : undefined;
  const order = typeof r.order === "number" && Number.isFinite(r.order) ? r.order : 100;
  const caseSensitive = r.caseSensitive === true;
  const matchWholeWords = r.matchWholeWords === true;
  const enabled = r.enabled !== false;
  const out: LorebookEntryV1 = {
    id,
    keys,
    content,
    constant,
    insertionMode,
    order,
    caseSensitive,
    matchWholeWords,
    enabled,
  };
  if (secondaryKeys && secondaryKeys.length > 0) out.secondaryKeys = secondaryKeys;
  if (insertionMode === "at_depth" && depth !== undefined) out.depth = depth;
  return out;
}

/** Normalizes a lorebook: trims, clamps, and re-validates all fields. */
export function normalizeLorebook(input: unknown): LorebookV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!isValidRpId(id)) return null;
  const name = typeof r.name === "string" ? r.name.slice(0, 200) : "";
  if (!name) return null;
  const description = typeof r.description === "string" ? r.description.slice(0, 4_000) : "";
  const tags = Array.isArray(r.tags)
    ? (r.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64)
        .slice(0, MAX_TAGS))
    : [];
  const rawEntries = Array.isArray(r.entries) ? r.entries : [];
  const entries: LorebookEntryV1[] = [];
  for (const raw of rawEntries) {
    if (entries.length >= MAX_LOREBOOK_ENTRIES) break;
    const e = normalizeEntry(raw);
    if (e) entries.push(e);
  }
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
  return {
    schema: "LorebookV1",
    id,
    name,
    description,
    tags,
    entries,
    createdAt,
    updatedAt,
  };
}

/** Validates a lorebook before save. Throws on failure. */
export function validateLorebook(book: LorebookV1): void {
  if (!book || book.schema !== "LorebookV1") {
    throw new Error("Lorebook is missing the LorebookV1 schema tag.");
  }
  if (!isValidRpId(book.id)) {
    throw new Error("Lorebook id is invalid.");
  }
  if (!book.name) {
    throw new Error("Lorebook name is required.");
  }
  if (book.entries.length > MAX_LOREBOOK_ENTRIES) {
    throw new Error(`Lorebook cannot contain more than ${MAX_LOREBOOK_ENTRIES} entries.`);
  }
  for (const e of book.entries) {
    if (e.content.length > MAX_LOREBOOK_ENTRY_CHARS) {
      throw new Error(`Lorebook entry "${e.id}" exceeds ${MAX_LOREBOOK_ENTRY_CHARS} characters.`);
    }
  }
  if (book.tags.length > MAX_TAGS) {
    throw new Error(`Lorebook cannot have more than ${MAX_TAGS} tags.`);
  }
}
