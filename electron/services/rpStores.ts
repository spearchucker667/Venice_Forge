/**
 * @fileoverview Single-file store instances for personas, lorebooks, and rp_assets.
 *
 * Each store is a closure returned by `createSingleFileStore<T>(dirName, validate)`
 * and bound to a validator that enforces the schema and id regex.
 */

import type { UserPersonaV1, LorebookV1, RpAssetV1 } from "../../src/types/rp";
import { isValidRpId } from "../../src/types/rp";
import { createSingleFileStore } from "./rpSingleFileStore";

function isValidPersona(obj: unknown): obj is UserPersonaV1 {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  if (p.schema !== "UserPersonaV1") return false;
  if (typeof p.id !== "string" || !isValidRpId(p.id)) return false;
  if (typeof p.name !== "string") return false;
  if (typeof p.description !== "string") return false;
  if (!Array.isArray(p.tags)) return false;
  if (typeof p.createdAt !== "number" || typeof p.updatedAt !== "number") return false;
  if (p.reference !== undefined && typeof p.reference !== "string") return false;
  return true;
}

function isValidLorebook(obj: unknown): obj is LorebookV1 {
  if (!obj || typeof obj !== "object") return false;
  const lb = obj as Record<string, unknown>;
  if (lb.schema !== "LorebookV1") return false;
  if (typeof lb.id !== "string" || !isValidRpId(lb.id)) return false;
  if (typeof lb.name !== "string") return false;
  if (typeof lb.description !== "string") return false;
  if (!Array.isArray(lb.tags)) return false;
  if (!Array.isArray(lb.entries)) return false;
  if (typeof lb.createdAt !== "number" || typeof lb.updatedAt !== "number") return false;
  for (const e of lb.entries) {
    if (!e || typeof e !== "object") return false;
    const ee = e as Record<string, unknown>;
    if (typeof ee.id !== "string" || !isValidRpId(ee.id)) return false;
    if (!Array.isArray(ee.keys)) return false;
    if (typeof ee.content !== "string") return false;
    if (typeof ee.constant !== "boolean") return false;
    if (
      ee.insertionMode !== "before_char" &&
      ee.insertionMode !== "after_char" &&
      ee.insertionMode !== "at_depth"
    ) {
      return false;
    }
    if (typeof ee.order !== "number") return false;
    if (typeof ee.caseSensitive !== "boolean") return false;
    if (typeof ee.matchWholeWords !== "boolean") return false;
    if (typeof ee.enabled !== "boolean") return false;
  }
  return true;
}

function isValidAsset(obj: unknown): obj is RpAssetV1 {
  if (!obj || typeof obj !== "object") return false;
  const a = obj as Record<string, unknown>;
  if (a.schema !== "RpAssetV1") return false;
  if (typeof a.id !== "string" || !isValidRpId(a.id)) return false;
  if (typeof a.chatId !== "string" || !isValidRpId(a.chatId)) return false;
  if (!Array.isArray(a.characterIds)) return false;
  if (typeof a.model !== "string") return false;
  if (typeof a.prompt !== "string") return false;
  if (typeof a.url !== "string") return false;
  if (typeof a.createdAt !== "number") return false;
  if (a.messageId !== undefined && typeof a.messageId !== "string") return false;
  if (a.negativePrompt !== undefined && typeof a.negativePrompt !== "string") return false;
  if (a.seed !== undefined && typeof a.seed !== "number") return false;
  return true;
}

export const personaStore = createSingleFileStore<UserPersonaV1>("personas", isValidPersona);
export const lorebookStore = createSingleFileStore<LorebookV1>("lorebooks", isValidLorebook);
export const rpAssetStore = createSingleFileStore<RpAssetV1>("rp-assets", isValidAsset);
