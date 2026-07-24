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
import type { CharacterCardV1, CharacterCardAvatar, CharacterContextFile, CharacterUrlScrapingProvider } from "../../types/rp";
import { CARD_FIELD_MAX, MAX_TAGS, RP_SCHEMA_VERSION, isValidRpId } from "../../types/rp";
import { assessCharacterImport } from "../../shared/safety/characterImportSafety";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../../safetyHydration";
import {
  normalizeCompatibilityObject,
  normalizeEmbeddedCharacterBook,
} from "../../shared/characterCardCompatibility";

const STORE = "character_cards" as const;
const ID_RE = isValidRpId;
const MAX_LIST_CARDS = 2_000;

/** Coerces an unknown value into a valid CharacterCardV1, or returns null. */
export function normalizeCard(input: unknown): CharacterCardV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!ID_RE(id)) return null;
  const sourceFormat =
    r.sourceFormat === "venice-forge" ||
    r.sourceFormat === "tavern-v1-json" ||
    r.sourceFormat === "card-v2-json" ||
    r.sourceFormat === "card-v2-png"
      ? r.sourceFormat
      : undefined;
  const isExternalV2 = sourceFormat === "card-v2-json" || sourceFormat === "card-v2-png";
  const name = typeof r.name === "string"
    ? (isExternalV2 ? r.name : r.name.trim()).slice(0, 200)
    : "";
  if (!name && sourceFormat !== "card-v2-json" && sourceFormat !== "card-v2-png") return null;
  const description = typeof r.description === "string" ? r.description.slice(0, CARD_FIELD_MAX) : "";
  const systemPrompt = typeof r.systemPrompt === "string" ? r.systemPrompt.slice(0, CARD_FIELD_MAX) : "";
  const scenario = typeof r.scenario === "string" ? r.scenario.slice(0, CARD_FIELD_MAX) : undefined;
  const tags = Array.isArray(r.tags)
    ? (r.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => (isExternalV2 ? t : t.trim().toLowerCase()))
        .filter((t) => (isExternalV2 ? t.length <= 64 : t.length > 0 && t.length <= 64)))
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
  // Phase 2F additions
  const firstMessage = typeof r.firstMessage === "string" ? r.firstMessage.slice(0, CARD_FIELD_MAX) : undefined;
  const versions: CharacterCardV1["versions"] = Array.isArray(r.versions)
    ? (r.versions
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
        .map((v) => {
          const vId = typeof v.id === "string" ? v.id.trim() : "";
          if (!ID_RE(vId)) return null;
          const snap = v.snapshot && typeof v.snapshot === "object" ? v.snapshot as Record<string, unknown> : null;
          if (!snap) return null;
          const snapName = typeof snap.name === "string" ? snap.name.slice(0, 200) : name;
          const snapDescription = typeof snap.description === "string" ? snap.description.slice(0, CARD_FIELD_MAX) : "";
          const snapSystem = typeof snap.systemPrompt === "string" ? snap.systemPrompt.slice(0, CARD_FIELD_MAX) : "";
          const snapScenario = typeof snap.scenario === "string" ? snap.scenario.slice(0, CARD_FIELD_MAX) : undefined;
          const snapFirst = typeof snap.firstMessage === "string" ? snap.firstMessage.slice(0, CARD_FIELD_MAX) : undefined;
          const snapTags = Array.isArray(snap.tags)
            ? (snap.tags
                .filter((t): t is string => typeof t === "string")
                .map((t) => t.trim().toLowerCase())
                .filter((t) => t.length > 0 && t.length <= 64)
                .slice(0, MAX_TAGS))
            : [];
          const snapDialogues = Array.isArray(snap.exampleDialogues)
            ? (snap.exampleDialogues
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
          const snapModel = typeof snap.modelId === "string" ? snap.modelId.trim() : undefined;
          const snapAuthor = typeof snap.author === "string" ? snap.author.slice(0, 200) : undefined;
          const snapAdult = snap.adult === true;
          const vOut: NonNullable<CharacterCardV1["versions"]>[number] = {
            id: vId,
            createdAt: typeof v.createdAt === "number" ? v.createdAt : Date.now(),
            snapshot: {
              name: snapName,
              description: snapDescription,
              systemPrompt: snapSystem,
              tags: snapTags,
              adult: snapAdult,
              exampleDialogues: snapDialogues,
            },
          };
          const reason = typeof v.reason === "string" ? v.reason.slice(0, 200) : undefined;
          if (reason) vOut.reason = reason;
          if (snapScenario) vOut.snapshot.scenario = snapScenario;
          if (snapFirst) vOut.snapshot.firstMessage = snapFirst;
          if (snapModel) vOut.snapshot.modelId = snapModel;
          if (snapAuthor) vOut.snapshot.author = snapAuthor;
          if (typeof snap.personality === "string") vOut.snapshot.personality = snap.personality.slice(0, CARD_FIELD_MAX);
          if (typeof snap.creatorNotes === "string") vOut.snapshot.creatorNotes = snap.creatorNotes.slice(0, CARD_FIELD_MAX);
          if (typeof snap.postHistoryInstructions === "string") {
            vOut.snapshot.postHistoryInstructions = snap.postHistoryInstructions.slice(0, CARD_FIELD_MAX);
          }
          if (Array.isArray(snap.alternateGreetings)) {
            vOut.snapshot.alternateGreetings = snap.alternateGreetings
              .filter((greeting): greeting is string => typeof greeting === "string")
              .slice(0, 32)
              .map((greeting) => greeting.slice(0, CARD_FIELD_MAX));
          }
          if (typeof snap.characterVersion === "string") {
            vOut.snapshot.characterVersion = snap.characterVersion.slice(0, 64);
          }
          vOut.snapshot.tavernExtensions = normalizeCompatibilityObject(snap.tavernExtensions);
          const snapshotBook = normalizeEmbeddedCharacterBook(snap.embeddedCharacterBook);
          if (snapshotBook) vOut.snapshot.embeddedCharacterBook = snapshotBook;
          if (typeof snap.rawExampleDialogue === "string") {
            vOut.snapshot.rawExampleDialogue = snap.rawExampleDialogue.slice(0, CARD_FIELD_MAX);
          }
          return vOut;
        })
        .filter((v): v is NonNullable<CharacterCardV1["versions"]>[number] => v !== null))
    : undefined;
  const currentVersionId = typeof r.currentVersionId === "string" ? r.currentVersionId : undefined;
  const metadata: Record<string, unknown> | undefined = (() => {
    if (!r.metadata || typeof r.metadata !== "object") return undefined;
    const m = r.metadata as Record<string, unknown>;
    const outMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m)) {
      if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        if (typeof v === "string" && v.length > 500) continue;
        outMeta[k] = v;
      }
    }
    return Object.keys(outMeta).length > 0 ? outMeta : undefined;
  })();

  const contextFiles = Array.isArray(r.contextFiles)
    ? r.contextFiles
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => ({
          id: typeof f.id === "string" ? f.id : "",
          name: typeof f.name === "string" ? f.name : "",
          content: typeof f.content === "string" ? f.content : "",
          size: typeof f.size === "number" ? f.size : 0,
          targetField:
            f.targetField === "systemPrompt" ||
            f.targetField === "personality" ||
            f.targetField === "instructions" ||
            f.targetField === "scenario" ||
            f.targetField === "postHistoryInstructions" ||
            f.targetField === "general"
              ? (f.targetField as CharacterContextFile["targetField"])
              : undefined,
          loadedAt: typeof f.loadedAt === "number" ? f.loadedAt : undefined,
        }))
        .filter((f) => f.id && f.name && f.content)
    : undefined;

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
  if (firstMessage) out.firstMessage = firstMessage;
  if (versions && versions.length > 0) out.versions = versions;
  if (currentVersionId) out.currentVersionId = currentVersionId;
  if (metadata) out.metadata = metadata;
  const archivedAt = typeof r.archivedAt === "number" ? r.archivedAt : undefined;
  if (archivedAt !== undefined) out.archivedAt = archivedAt;

  // ---- Phase 2H (ST Card Studio) Compatibility additions ----
  const personality = typeof r.personality === "string" ? r.personality.slice(0, CARD_FIELD_MAX) : undefined;
  const creatorNotes = typeof r.creatorNotes === "string" ? r.creatorNotes.slice(0, CARD_FIELD_MAX) : undefined;
  const postHistoryInstructions = typeof r.postHistoryInstructions === "string" ? r.postHistoryInstructions.slice(0, CARD_FIELD_MAX) : undefined;
  const alternateGreetings = Array.isArray(r.alternateGreetings)
    ? r.alternateGreetings.filter((g): g is string => typeof g === "string").map((g) => g.slice(0, CARD_FIELD_MAX))
    : [];
  const characterVersion = typeof r.characterVersion === "string" ? r.characterVersion.slice(0, 64) : undefined;

  const tavernExtensions = normalizeCompatibilityObject(r.tavernExtensions);
  const embeddedCharacterBook = normalizeEmbeddedCharacterBook(r.embeddedCharacterBook);

  const rawExampleDialogue = typeof r.rawExampleDialogue === "string" ? r.rawExampleDialogue.slice(0, CARD_FIELD_MAX) : undefined;

  if (personality !== undefined) out.personality = personality;
  if (creatorNotes !== undefined) out.creatorNotes = creatorNotes;
  if (postHistoryInstructions !== undefined) out.postHistoryInstructions = postHistoryInstructions;
  out.alternateGreetings = alternateGreetings;
  if (characterVersion !== undefined) out.characterVersion = characterVersion;
  out.tavernExtensions = tavernExtensions;
  if (embeddedCharacterBook !== undefined) out.embeddedCharacterBook = embeddedCharacterBook;
  if (rawExampleDialogue !== undefined) out.rawExampleDialogue = rawExampleDialogue;
  if (sourceFormat !== undefined) out.sourceFormat = sourceFormat;

  if (contextFiles && contextFiles.length > 0) out.contextFiles = contextFiles;
  if (typeof r.webSearch === "boolean") out.webSearch = r.webSearch;
  // urlScrapingProvider replaces the legacy `urlScraping: boolean`. Backcompat:
  //   legacy `urlScraping === true`   -> "brave" (was the original behaviour)
  //   legacy `urlScraping === false`  -> "off"
  //   legacy field missing/unset + new provider set -> honour new field
  //   provider field that is not in the enum is silently coerced to "off"
  const urlScrapingProvider = (() => {
    if (
      r.urlScrapingProvider === "off" ||
      r.urlScrapingProvider === "brave" ||
      r.urlScrapingProvider === "google"
    ) {
      return r.urlScrapingProvider;
    }
    if (typeof r.urlScraping === "boolean") {
      return r.urlScraping ? "brave" : "off";
    }
    return "off";
  })() as CharacterUrlScrapingProvider;
  out.urlScrapingProvider = urlScrapingProvider;
  if (typeof r.enableThoughts === "boolean") out.enableThoughts = r.enableThoughts;
  if (typeof r.temperature === "number") out.temperature = r.temperature;
  if (typeof r.topP === "number") out.topP = r.topP;
  out.schemaVersion = RP_SCHEMA_VERSION;
  if (typeof r.revisionId === "string") out.revisionId = r.revisionId.slice(0, 128);
  if (typeof r.baseRevisionId === "string") out.baseRevisionId = r.baseRevisionId.slice(0, 128);
  if (typeof r.deviceId === "string") out.deviceId = r.deviceId.slice(0, 128);
  if (typeof r.deletedAt === "number") out.deletedAt = r.deletedAt;

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
