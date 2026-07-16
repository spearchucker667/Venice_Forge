/**
 * @fileoverview Phase 2F — Character Card Import / Export service.
 *
 * Two formats are supported:
 *   1. The native `CharacterCardExport` envelope (round-trip safe).
 *   2. Tavern V1 JSON through the authoritative character-card adapter.
 *   3. Character Card V2 JSON with lossless recognized fields, bounded
 *      extension preservation, and separate personality/greeting semantics.
 *
 * **Safety:**
 *   - Imports never include API keys, bearer tokens, or `Authorization`
 *     headers — `redactPromptSecrets` is applied to every free-text field.
 *   - The export envelope is JSON-safe: no Functions, no circular refs,
 *     no base64 image blobs (avatar bytes are dropped on export).
 *   - Secret-flagged records are reported as `skipped` and never
 *     persisted.
 */

import {
  CARD_FIELD_MAX,
  MAX_TAGS,
  RP_CARD_EXPORT_VERSION,
  VALID_ID_RE,
  type CharacterCardExport,
  type CharacterCardV1,
  type CharacterExampleDialogue,
} from "../types/rp";
import { isPromptSecretLike, redactPromptSecrets } from "../types/prompt-library";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../safetyHydration";
import { assessCharacterImport } from "../shared/safety/characterImportSafety";
import { SafetyGuardBlockedError } from "../shared/safety";
import {
  detectCharacterCardFormat,
  CHARACTER_CARD_JSON_MAX_BYTES,
  mapV1ToInternal,
  mapV2ToInternal,
  normalizeCharacterBook,
  preserveExtensions,
  type CharacterCardImportWarning,
} from "./characterCards/characterCardAdapter";

const EXAMPLE_DIALOGUE_MAX = 8;
const EXAMPLE_TEXT_MAX = 2_000;

function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

function safeString(value: unknown, max = CARD_FIELD_MAX): string {
  if (typeof value !== "string") return "";
  if (value.length > max) return value.slice(0, max);
  return value;
}

function safeRedactedString(value: unknown, max = CARD_FIELD_MAX): string {
  return redactPromptSecrets(safeString(value, max));
}

function safeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase();
    if (!t || t.length > 64 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function safeExamples(input: unknown): CharacterExampleDialogue[] {
  if (!Array.isArray(input)) return [];
  const out: CharacterExampleDialogue[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const text = redactPromptSecrets(safeString(r.text, EXAMPLE_TEXT_MAX));
    if (!text) continue;
    const speaker = safeString(r.speaker ?? r.name ?? "", 64);
    out.push({ speaker: speaker || "Example", text });
    if (out.length >= EXAMPLE_DIALOGUE_MAX) break;
  }
  return out;
}

function safeMetadata(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0 || k.length > 64) continue;
    if (k === "id" || k === "schema") continue;
    if (typeof v === "string") {
      if (v.length > 500) continue;
      if (isPromptSecretLike(v)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactPromptSecrets(v);
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === "boolean") {
      out[k] = v;
    }
    // Drop nested objects, arrays, and any other type — keep metadata flat.
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Build a JSON-safe export payload for the supplied character cards. */
export function exportCharacterCards(cards: readonly CharacterCardV1[]): CharacterCardExport {
  const safe: CharacterCardV1[] = [];
  for (const raw of cards) {
    if (!isValidId(raw.id)) continue;
    // Re-redact any potentially-secret text fields on the way out.
    const description = redactPromptSecrets(safeString(raw.description));
    const systemPrompt = redactPromptSecrets(safeString(raw.systemPrompt));
    const scenario = raw.scenario ? redactPromptSecrets(safeString(raw.scenario)) : undefined;
    const firstMessage = raw.firstMessage ? redactPromptSecrets(safeString(raw.firstMessage)) : undefined;
    if (isPromptSecretLike(description) || isPromptSecretLike(systemPrompt)) {
      continue;
    }
    const clean: CharacterCardV1 = {
      schema: "CharacterCardV1",
      id: raw.id,
      name: safeString(raw.name, 200) || raw.id,
      description,
      systemPrompt,
      tags: safeTags(raw.tags),
      adult: raw.adult === true,
      exampleDialogues: safeExamples(raw.exampleDialogues),
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    };
    const warnings: CharacterCardImportWarning[] = [];
    if (scenario) clean.scenario = scenario;
    if (firstMessage) clean.firstMessage = firstMessage;
    if (raw.modelId) clean.modelId = safeString(raw.modelId, 200);
    if (raw.author) clean.author = safeString(raw.author, 200);
    if (typeof raw.personality === "string") clean.personality = safeRedactedString(raw.personality);
    if (typeof raw.creatorNotes === "string") clean.creatorNotes = safeRedactedString(raw.creatorNotes);
    if (typeof raw.postHistoryInstructions === "string") {
      clean.postHistoryInstructions = safeRedactedString(raw.postHistoryInstructions);
    }
    if (Array.isArray(raw.alternateGreetings)) {
      clean.alternateGreetings = raw.alternateGreetings
        .slice(0, 32)
        .map((greeting) => safeRedactedString(greeting));
    }
    if (typeof raw.characterVersion === "string") clean.characterVersion = safeString(raw.characterVersion, 64);
    clean.tavernExtensions = preserveExtensions(raw.tavernExtensions, warnings, "tavernExtensions");
    const embeddedBook = normalizeCharacterBook(raw.embeddedCharacterBook, warnings);
    if (embeddedBook) clean.embeddedCharacterBook = embeddedBook;
    if (typeof raw.rawExampleDialogue === "string") {
      clean.rawExampleDialogue = safeRedactedString(raw.rawExampleDialogue);
    }
    if (raw.sourceFormat) clean.sourceFormat = raw.sourceFormat;
    const meta = safeMetadata(raw.metadata);
    if (meta) clean.metadata = meta;
    // Avatar bytes are dropped — the export is text-only.
    safe.push(clean);
  }
  return {
    version: RP_CARD_EXPORT_VERSION,
    app: "Venice Forge",
    exportedAt: Date.now(),
    cards: safe,
  };
}

export interface CharacterCardImportResult {
  imported: CharacterCardV1[];
  skipped: { reason: string; name?: string }[];
  warnings: CharacterCardImportWarning[];
}

function parseNativeEnvelope(input: unknown, now: number): CharacterCardV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.schema !== "CharacterCardV1") return null;
  if (!isValidId(r.id)) return null;
  const name = safeString(r.name, 200);
  if (!name) return null;
  const descriptionRaw = safeString(r.description, CARD_FIELD_MAX);
  const systemPromptRaw = safeString(r.systemPrompt, CARD_FIELD_MAX);
  if (isPromptSecretLike(descriptionRaw) || isPromptSecretLike(systemPromptRaw)) return null;
  const description = safeRedactedString(r.description, CARD_FIELD_MAX);
  const systemPrompt = safeRedactedString(r.systemPrompt, CARD_FIELD_MAX);
  const scenario = r.scenario ? safeRedactedString(r.scenario, CARD_FIELD_MAX) : undefined;
  const firstMessageRaw = r.firstMessage ? safeString(r.firstMessage, CARD_FIELD_MAX) : undefined;
  if (firstMessageRaw && isPromptSecretLike(firstMessageRaw)) return null;
  const firstMessage = r.firstMessage ? safeRedactedString(r.firstMessage, CARD_FIELD_MAX) : undefined;
  const warnings: CharacterCardImportWarning[] = [];
  const card: CharacterCardV1 = {
    schema: "CharacterCardV1",
    id: r.id as string,
    name,
    description,
    systemPrompt,
    scenario: scenario || undefined,
    firstMessage: firstMessage || undefined,
    tags: safeTags(r.tags),
    adult: r.adult === true,
    exampleDialogues: safeExamples(r.exampleDialogues),
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
    ...(typeof r.modelId === "string" ? { modelId: r.modelId.slice(0, 200) } : {}),
    ...(typeof r.author === "string" ? { author: safeRedactedString(r.author, 200) } : {}),
    ...(r.metadata && typeof r.metadata === "object" ? { metadata: safeMetadata(r.metadata) ?? {} } : {}),
  };
  if (typeof r.personality === "string") card.personality = safeRedactedString(r.personality);
  if (typeof r.creatorNotes === "string") card.creatorNotes = safeRedactedString(r.creatorNotes);
  if (typeof r.postHistoryInstructions === "string") {
    card.postHistoryInstructions = safeRedactedString(r.postHistoryInstructions);
  }
  if (Array.isArray(r.alternateGreetings)) {
    card.alternateGreetings = r.alternateGreetings.slice(0, 32).map((greeting) => safeRedactedString(greeting));
  }
  if (typeof r.characterVersion === "string") card.characterVersion = safeString(r.characterVersion, 64);
  card.tavernExtensions = preserveExtensions(r.tavernExtensions, warnings, "tavernExtensions");
  const embeddedBook = normalizeCharacterBook(r.embeddedCharacterBook, warnings);
  if (embeddedBook) card.embeddedCharacterBook = embeddedBook;
  if (typeof r.rawExampleDialogue === "string") card.rawExampleDialogue = safeRedactedString(r.rawExampleDialogue);
  if (
    r.sourceFormat === "venice-forge" ||
    r.sourceFormat === "tavern-v1-json" ||
    r.sourceFormat === "card-v2-json" ||
    r.sourceFormat === "card-v2-png"
  ) {
    card.sourceFormat = r.sourceFormat;
  }
  return card;
}

/**
 * Parse a JSON string or already-decoded object. Returns the sanitised
 * cards and a per-skip reason list. Throws on inputs that fail the
 * safety guard (assessed via the existing `assessCharacterImport`).
 */
export async function parseCharacterCardImport(
  raw: string | unknown,
): Promise<CharacterCardImportResult> {
  if (typeof raw === "string" && new TextEncoder().encode(raw).byteLength > CHARACTER_CARD_JSON_MAX_BYTES) {
    return { imported: [], skipped: [{ reason: "Input exceeds 8 MiB cap" }], warnings: [] };
  }
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { imported: [], skipped: [{ reason: `Invalid JSON: ${err instanceof Error ? err.message : "parse failed"}` }], warnings: [] };
    }
  } else {
    parsed = raw;
  }

  const now = Date.now();
  const candidates: unknown[] = [];
  if (Array.isArray(parsed)) {
    candidates.push(...parsed);
  } else if (parsed && typeof parsed === "object") {
    const r = parsed as Record<string, unknown>;
    if (r.version === RP_CARD_EXPORT_VERSION && Array.isArray(r.cards)) {
      candidates.push(...(r.cards as unknown[]));
    } else {
      candidates.push(parsed);
    }
  }

  const imported: CharacterCardV1[] = [];
  const skipped: { reason: string; name?: string }[] = [];
  const enabled = getEffectiveRendererLocalFamilySafeModeEnabled();
  const warnings: CharacterCardImportWarning[] = [];

  for (const cand of candidates) {
    let card: CharacterCardV1 | null = null;
    if (cand && typeof cand === "object") {
      const detect = detectCharacterCardFormat(cand);

      if (detect.format === "venice-forge") {
        card = parseNativeEnvelope(cand, now);
      } else if (detect.format === "card-v2-json") {
        card = mapV2ToInternal(detect.data, warnings);
      } else if (detect.format === "tavern-v1-json") {
        card = mapV1ToInternal(detect.data, warnings);
      }
    }

    if (!card) {
      skipped.push({ reason: "Invalid card shape" });
      continue;
    }
    try {
      const decision = assessCharacterImport(card, enabled);
      if (!decision.allow || decision.action === "block") {
        throw new SafetyGuardBlockedError(decision);
      }
    } catch {
      skipped.push({ reason: "Safety guard blocked", name: card.name });
      continue;
    }
    imported.push(card);
  }

  return { imported, skipped, warnings };
}
