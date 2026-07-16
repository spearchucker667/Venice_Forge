import type { CharacterBookV2Dto, JsonObject, JsonValue } from "../types/character-card-spec";

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 50_000;

interface TraversalState {
  nodes: number;
}

/** Converts unknown input into bounded, prototype-safe JSON. */
export function normalizeCompatibilityJson(
  value: unknown,
  depth = 0,
  state: TraversalState = { nodes: 0 },
): JsonValue | undefined {
  state.nodes += 1;
  if (depth > MAX_JSON_DEPTH || state.nodes > MAX_JSON_NODES) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeCompatibilityJson(item, depth + 1, state))
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const out: JsonObject = {};
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_JSON_KEYS.has(key)) continue;
    const clean = normalizeCompatibilityJson(nested, depth + 1, state);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

export function normalizeCompatibilityObject(value: unknown): JsonObject {
  const clean = normalizeCompatibilityJson(value);
  return clean && typeof clean === "object" && !Array.isArray(clean) ? clean : {};
}

export function normalizeEmbeddedCharacterBook(value: unknown): CharacterBookV2Dto | undefined {
  const clean = normalizeCompatibilityObject(value);
  return Array.isArray(clean.entries) && clean.extensions && typeof clean.extensions === "object" && !Array.isArray(clean.extensions)
    ? clean as unknown as CharacterBookV2Dto
    : undefined;
}
