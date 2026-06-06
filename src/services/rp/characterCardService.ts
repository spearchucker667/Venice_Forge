/**
 * @fileoverview Renderer-side character card service.
 *
 * Two backends:
 *   - Electron: `window.veniceForge.characterCards.{list,get,save,delete}`
 *     (file-backed via `electron/services/characterCardStorage.ts`)
 *   - Web: IndexedDB store `character_cards` (encrypted by the existing
 *     `StorageService`); avatars stored as data URLs alongside the record.
 *
 * The renderer NEVER calls `window.veniceForge.*` directly — modules import
 * from this service. Mirrors the existing `characterService.ts` pattern.
 *
 * **Safety:** `saveCharacterCard` calls `assessCharacterImport` (VERIFY-014) so
 * user-authored content is gated by the existing child-exploitation guard
 * before it is persisted or later assembled into a prompt. Blocked saves
 * reject with a `SafetyGuardBlockedError` carrying the decision's user message.
 */

import { isElectron, desktopCharacterCards } from "../desktopBridge";
import type { CharacterCardV1, CharacterCardAvatar } from "../../types/rp";
import { CARD_FIELD_MAX, MAX_TAGS, RP_SCHEMA_VERSION, isValidRpId } from "../../types/rp";
import { assessCharacterImport } from "../../shared/safety/characterImportSafety";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../../safetyHydration";

const STORE = "character_cards" as const;
const ID_RE = isValidRpId;
const MAX_LIST_CARDS = 2_000;

/** Coerces an unknown value into a valid CharacterCardV1, or returns null. */
export function normalizeCard(input: unknown): CharacterCardV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!ID_RE(id)) return null;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
  if (!name) return null;
  const description = typeof r.description === "string" ? r.description.slice(0, CARD_FIELD_MAX) : "";
  const systemPrompt = typeof r.systemPrompt === "string" ? r.systemPrompt.slice(0, CARD_FIELD_MAX) : "";
  const scenario = typeof r.scenario === "string" ? r.scenario.slice(0, CARD_FIELD_MAX) : undefined;
  const tags = Array.isArray(r.tags)
    ? (r.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64))
    : [];
  if (tags.length > MAX_TAGS) tags.length = MAX_TAGS;
  const modelId = typeof r.modelId === "string" ? r.modelId.trim() : undefined;
  const author = typeof r.author === "string" ? r.author.slice(0, 200) : undefined;
  const adult = r.adult === true;
  const exampleDialogues = Array.isArray(r.exampleDialogues)
    ? (r.exampleDialogues
        .map((raw) => {
          if (!raw || typeof raw !== "object") return null;
          const d = raw as Record<string, unknown>;
          const speaker = typeof d.speaker === "string" ? d.speaker.trim().slice(0, 200) : "";
          const text = typeof d.text === "string" ? d.text.slice(0, CARD_FIELD_MAX) : "";
          if (!speaker || !text) return null;
          return { speaker, text };
        })
        .filter((d): d is { speaker: string; text: string } => d !== null))
    : [];
  const avatar = (() => {
    if (!r.avatar || typeof r.avatar !== "object") return undefined;
    const a = r.avatar as Record<string, unknown>;
    if (typeof a.data !== "string" || typeof a.byteLength !== "number") return undefined;
    const mimeType = a.mimeType === "image/jpeg" || a.mimeType === "image/webp" ? a.mimeType : "image/png";
    const out: CharacterCardAvatar = { data: a.data, mimeType, byteLength: a.byteLength };
    return out;
  })();
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
  const out: CharacterCardV1 = {
    schema: "CharacterCardV1",
    id,
    name,
    description,
    systemPrompt,
    tags,
    adult,
    exampleDialogues,
    createdAt,
    updatedAt,
  };
  if (scenario) out.scenario = scenario;
  if (modelId) out.modelId = modelId;
  if (author) out.author = author;
  if (avatar) out.avatar = avatar;
  return out;
}

/** Clamps a card's input fields to the allowed lengths. */
export function clampCard(card: CharacterCardV1): CharacterCardV1 {
  return normalizeCard(card) ?? card;
}

/** Lists all local character cards (sorted by updatedAt desc, capped). */
export async function listCharacterCards(): Promise<CharacterCardV1[]> {
  if (isElectron()) {
    const res = await desktopCharacterCards.list();
    if (!res.ok) throw new Error(res.error ?? "Failed to list character cards.");
    return (res.cards ?? []).map(normalizeCard).filter((c): c is CharacterCardV1 => c !== null).slice(0, MAX_LIST_CARDS);
  }
  const records = await StorageService.getItems<CharacterCardV1>(STORE);
  return records.map(normalizeCard).filter((c): c is CharacterCardV1 => c !== null).slice(0, MAX_LIST_CARDS);
}

/** Reads a single card by id, or returns null. */
export async function readCharacterCard(id: string): Promise<CharacterCardV1 | null> {
  if (!ID_RE(id)) return null;
  if (isElectron()) {
    const res = await desktopCharacterCards.get(id);
    if (!res.ok) return null;
    return res.card ? normalizeCard(res.card) : null;
  }
  const record = await StorageService.getItem<CharacterCardV1>(STORE, id);
  return record ? normalizeCard(record) : null;
}

/** Saves a card atomically. Generates an id if missing. */
export async function saveCharacterCard(card: CharacterCardV1): Promise<CharacterCardV1> {
  const now = Date.now();
  const id = card.id && ID_RE(card.id) ? card.id : generateId();
  const next: CharacterCardV1 = {
    ...card,
    id,
    schema: "CharacterCardV1",
    createdAt: card.createdAt ?? now,
    updatedAt: now,
  };
  const normalized = normalizeCard(next);
  if (!normalized) throw new Error("Invalid character card.");
  // VERIFY-014 / B1 fix: run the safety guard at the save boundary so user-
  // authored content is vetted before it is persisted (B1).
  const safety = assessCharacterImport(normalized, getEffectiveRendererLocalFamilySafeModeEnabled());
  if (!safety.allow || safety.action === "block") {
    throw new SafetyGuardBlockedError(safety);
  }
  if (isElectron()) {
    const res = await desktopCharacterCards.save(normalized);
    if (!res.ok) throw new Error(res.error ?? "Failed to save character card.");
    return res.card ? normalizeCard(res.card) ?? normalized : normalized;
  }
  await StorageService.saveItem(STORE, normalized as unknown as Record<string, unknown>);
  return normalized;
}

/** Deletes a card by id. Returns true when removed. */
export async function deleteCharacterCard(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopCharacterCards.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/** Generates a new id that satisfies `VALID_ID_RE`. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    // crypto.randomUUID uses hyphens which are valid for our regex; keep as-is.
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Schema version helper. */
export const characterCardSchemaVersion = RP_SCHEMA_VERSION;
