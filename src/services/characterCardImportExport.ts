/**
 * @fileoverview Phase 2F — Character Card Import / Export service.
 *
 * Two formats are supported:
 *   1. The native `CharacterCardExport` envelope (round-trip safe).
 *   2. A "basic Tavern-style" card shape — the bare minimum mapping
 *      from the SillyTavern v1 / v2 spec (first_mes / mes_example /
 *      system_prompt / creator_notes) into our `CharacterCardV1` shape.
 *      Anything else in the input is ignored; secrets are redacted
 *      before persistence.
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

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
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
    const text = safeString(r.text, EXAMPLE_TEXT_MAX);
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
    if (scenario) clean.scenario = scenario;
    if (firstMessage) clean.firstMessage = firstMessage;
    if (raw.modelId) clean.modelId = safeString(raw.modelId, 200);
    if (raw.author) clean.author = safeString(raw.author, 200);
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
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function pick<T>(...vals: T[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

interface TavernLikeFields {
  name?: unknown;
  character_name?: unknown;
  description?: unknown;
  system_prompt?: unknown;
  personality?: unknown;
  scenario?: unknown;
  first_mes?: unknown;
  mes_example?: unknown;
  creator_notes?: unknown;
  tags?: unknown;
  creator?: unknown;
  character_version?: unknown;
  alternate_greetings?: unknown;
  data?: TavernLikeFields | undefined;
}

function readTavernShape(input: unknown): TavernLikeFields | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.data && typeof r.data === "object") {
    return r.data as TavernLikeFields;
  }
  return r as TavernLikeFields;
}

function parseTavernCard(input: unknown, now: number): CharacterCardV1 | null {
  const t = readTavernShape(input);
  if (!t) return null;
  const name = safeString(t.name ?? t.character_name, 200);
  if (!name) return null;
  const description = safeString(t.description ?? t.personality, CARD_FIELD_MAX);
  const systemPrompt = safeString(t.system_prompt ?? "", CARD_FIELD_MAX);
  if (isPromptSecretLike(description) || isPromptSecretLike(systemPrompt)) return null;
  const scenario = safeString(pick(t.scenario) ?? "", CARD_FIELD_MAX);
  const firstMessage = safeString(pick(t.first_mes) ?? "", CARD_FIELD_MAX);
  if (firstMessage && isPromptSecretLike(firstMessage)) return null;
  const creator = safeString(pick(t.creator, t.creator_notes) ?? "", 200);
  const tags = safeTags(t.tags);
  const example = safeString(pick(t.mes_example) ?? "", EXAMPLE_TEXT_MAX);
  const examples: CharacterExampleDialogue[] = example
    ? [{ speaker: "Example", text: example }]
    : [];
  const altGreetings = Array.isArray(t.alternate_greetings)
    ? t.alternate_greetings
        .map((g) => safeString(g, EXAMPLE_TEXT_MAX))
        .filter((g) => g.length > 0)
        .slice(0, EXAMPLE_DIALOGUE_MAX - examples.length)
    : [];
  for (const g of altGreetings) {
    if (isPromptSecretLike(g)) continue;
    examples.push({ speaker: "Greeting", text: g });
  }
  const meta: Record<string, unknown> = {};
  if (creator) meta.creator = creator;
  if (typeof t.character_version === "string") meta.importedVersion = t.character_version.slice(0, 64);
  meta.importedFrom = "tavern";
  return {
    schema: "CharacterCardV1",
    id: newId(),
    name,
    description,
    systemPrompt,
    scenario: scenario || undefined,
    firstMessage: firstMessage || undefined,
    tags,
    adult: false,
    exampleDialogues: examples,
    createdAt: now,
    updatedAt: now,
    metadata: meta,
  };
}

function parseNativeEnvelope(input: unknown, now: number): CharacterCardV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.schema !== "CharacterCardV1") return null;
  if (!isValidId(r.id)) return null;
  const name = safeString(r.name, 200);
  if (!name) return null;
  const description = safeString(r.description, CARD_FIELD_MAX);
  const systemPrompt = safeString(r.systemPrompt, CARD_FIELD_MAX);
  if (isPromptSecretLike(description) || isPromptSecretLike(systemPrompt)) return null;
  const scenario = r.scenario ? safeString(r.scenario, CARD_FIELD_MAX) : undefined;
  const firstMessage = r.firstMessage ? safeString(r.firstMessage, CARD_FIELD_MAX) : undefined;
  if (firstMessage && isPromptSecretLike(firstMessage)) return null;
  return {
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
    ...(typeof r.author === "string" ? { author: r.author.slice(0, 200) } : {}),
    ...(r.metadata && typeof r.metadata === "object" ? { metadata: safeMetadata(r.metadata) ?? {} } : {}),
  };
}

/**
 * Parse a JSON string or already-decoded object. Returns the sanitised
 * cards and a per-skip reason list. Throws on inputs that fail the
 * safety guard (assessed via the existing `assessCharacterImport`).
 */
export async function parseCharacterCardImport(
  raw: string | unknown,
): Promise<CharacterCardImportResult> {
  if (typeof raw === "string" && raw.length > MAX_INPUT_BYTES) {
    return { imported: [], skipped: [{ reason: "Input exceeds 8 MiB cap" }] };
  }
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { imported: [], skipped: [{ reason: `Invalid JSON: ${err instanceof Error ? err.message : "parse failed"}` }] };
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
    } else if (r.schema === "CharacterCardV1" || r.data) {
      candidates.push(parsed);
    } else {
      // Heuristic: if it has `name` + (`system_prompt` or `description`), treat as Tavern.
      candidates.push(parsed);
    }
  }

  const imported: CharacterCardV1[] = [];
  const skipped: { reason: string; name?: string }[] = [];
  const enabled = getEffectiveRendererLocalFamilySafeModeEnabled();

  for (const cand of candidates) {
    let card: CharacterCardV1 | null = null;
    if (cand && typeof cand === "object") {
      const r = cand as Record<string, unknown>;
      if (r.schema === "CharacterCardV1") {
        card = parseNativeEnvelope(cand, now);
      } else {
        card = parseTavernCard(cand, now);
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
    } catch (err) {
      skipped.push({ reason: "Safety guard blocked", name: card.name });
      continue;
    }
    imported.push(card);
  }

  return { imported, skipped };
}
