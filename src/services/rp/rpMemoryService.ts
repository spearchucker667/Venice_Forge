/**
 * @fileoverview RP-specific memory layer. Extends the existing `memoryService`
 * with three scopes: `pinned`, `long-term`, `character`. Stored alongside the
 * existing `ai_memory` IndexedDB store (or `rp-memories` filesystem dir on desktop)
 * with a `scope` discriminator.
 *
 * Scopes:
 *   - `pinned`     — always injected, even before budget pressure drops anything else
 *   - `long-term`  — model-summarized or editor-curated facts; chosen by recency
 *   - `character`  — scoped to a specific character id; included when that character
 *                    is active in the chat
 *
 * The prompt builder handles ordering and budget enforcement.
 */

import type { RpMemoryScope, RpMemoryV1 } from "../../types/rp";
import { isValidRpId, RP_SCHEMA_VERSION } from "../../types/rp";

/** Default cap when selecting memories for a chat. */
export const RP_MEMORY_MAX_PER_SCOPE = 50;
/** Hard cap on a single memory's content length. */
export const RP_MEMORY_MAX_CHARS = 2_000;

const SCHEMA = "RpMemoryV1" as const;

/** Returns true when the value is a valid RpMemoryV1. */
export function isValidRpMemory(value: unknown): value is RpMemoryV1 {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (m.schema !== SCHEMA) return false;
  if (!isValidRpId(m.id)) return false;
  if (m.scope !== "pinned" && m.scope !== "long-term" && m.scope !== "character") return false;
  if (m.scope === "character" && !isValidRpId(m.characterId)) return false;
  if (typeof m.content !== "string" || m.content.length === 0 || m.content.length > RP_MEMORY_MAX_CHARS) return false;
  if (!Array.isArray(m.tags)) return false;
  if (!m.source || typeof m.source !== "object") return false;
  const src = m.source as Record<string, unknown>;
  if (typeof src.kind !== "string") return false;
  if (!Array.isArray(src.messageIds)) return false;
  if (typeof m.createdAt !== "number" || typeof m.updatedAt !== "number") return false;
  return true;
}

/** Normalizes a raw memory input to a valid RpMemoryV1. Returns null on failure. */
export function normalizeRpMemory(input: unknown, now = Date.now()): RpMemoryV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!isValidRpId(id)) return null;
  const scope = r.scope as RpMemoryScope | undefined;
  if (scope !== "pinned" && scope !== "long-term" && scope !== "character") return null;
  if (scope === "character") {
    const cid = typeof r.characterId === "string" ? r.characterId.trim() : "";
    if (!isValidRpId(cid)) return null;
  }
  const rawContent = typeof r.content === "string" ? r.content : "";
  if (!rawContent) return null;
  const content = rawContent.length > RP_MEMORY_MAX_CHARS ? rawContent.slice(0, RP_MEMORY_MAX_CHARS) : rawContent;
  const tags = Array.isArray(r.tags)
    ? (r.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64))
    : [];
  const src = r.source as Record<string, unknown> | undefined;
  const kind = src?.kind;
  if (kind !== "user-stated" && kind !== "model-summarized" && kind !== "editor-curated") return null;
  const messageIds = Array.isArray(src?.messageIds)
    ? (src!.messageIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 64)
    : [];
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : now;
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
  const out: RpMemoryV1 = {
    schema: SCHEMA,
    id,
    scope,
    content,
    tags,
    source: { kind, messageIds },
    createdAt,
    updatedAt,
  };
  if (scope === "character") out.characterId = (r.characterId as string).trim();
  return out;
}

/** Selects memories for a given chat. Filters by character scope and applies
 *  per-scope caps. The prompt builder handles final ordering and budget. */
export function selectMemoriesForChat(args: {
  memories: RpMemoryV1[];
  activeCharacterIds: ReadonlyArray<string>;
  pinnedCap?: number;
  longTermCap?: number;
  characterCap?: number;
}): RpMemoryV1[] {
  const pinnedCap = args.pinnedCap ?? 10;
  const longTermCap = args.longTermCap ?? 20;
  const characterCap = args.characterCap ?? 20;
  const activeSet = new Set(args.activeCharacterIds);

  const pinned = args.memories.filter((m) => m.scope === "pinned").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, pinnedCap);
  const longTerm = args.memories.filter((m) => m.scope === "long-term").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, longTermCap);
  const character = args.memories
    .filter((m) => m.scope === "character" && m.characterId !== undefined && activeSet.has(m.characterId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, characterCap);

  return [...pinned, ...character, ...longTerm];
}

/** Schema version accessor (re-exported for store layers). */
export const rpMemorySchemaVersion = RP_SCHEMA_VERSION;
