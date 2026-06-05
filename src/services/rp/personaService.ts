/**
 * @fileoverview Renderer-side user persona service.
 *
 * Two backends:
 *   - Electron: `window.veniceForge.personas.{list,get,save,delete}`
 *   - Web: IndexedDB store `personas` (encrypted)
 *
 * The renderer NEVER calls `window.veniceForge.*` directly.
 */

import { isElectron, desktopPersonas } from "../desktopBridge";
import type { UserPersonaV1 } from "../../types/rp";
import { isValidRpId, MAX_TAGS } from "../../types/rp";
import StorageService from "../storageService";

const STORE = "personas" as const;
const ID_RE = isValidRpId;
const MAX_LIST_PERSONAS = 1_000;

/** Coerces an unknown value into a valid UserPersonaV1, or returns null. */
export function normalizePersona(input: unknown): UserPersonaV1 | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!ID_RE(id)) return null;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
  if (!name) return null;
  const description = typeof r.description === "string" ? r.description.slice(0, 32_000) : "";
  const reference = typeof r.reference === "string" ? r.reference.slice(0, 200) : undefined;
  const tags = Array.isArray(r.tags)
    ? (r.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 64))
    : [];
  if (tags.length > MAX_TAGS) tags.length = MAX_TAGS;
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
  const out: UserPersonaV1 = {
    schema: "UserPersonaV1",
    id,
    name,
    description,
    tags,
    createdAt,
    updatedAt,
  };
  if (reference) out.reference = reference;
  return out;
}

/** Lists all personas (sorted by updatedAt desc, capped). */
export async function listPersonas(): Promise<UserPersonaV1[]> {
  if (isElectron()) {
    const res = await desktopPersonas.list();
    if (!res.ok) throw new Error(res.error ?? "Failed to list personas.");
    return (res.personas ?? [])
      .map(normalizePersona)
      .filter((p): p is UserPersonaV1 => p !== null)
      .slice(0, MAX_LIST_PERSONAS);
  }
  const records = await StorageService.getItems<UserPersonaV1>(STORE);
  return records
    .map(normalizePersona)
    .filter((p): p is UserPersonaV1 => p !== null)
    .slice(0, MAX_LIST_PERSONAS);
}

/** Reads a single persona by id, or returns null. */
export async function readPersona(id: string): Promise<UserPersonaV1 | null> {
  if (!ID_RE(id)) return null;
  if (isElectron()) {
    const res = await desktopPersonas.get(id);
    if (!res.ok) return null;
    return res.persona ? normalizePersona(res.persona) : null;
  }
  const record = await StorageService.getItem<UserPersonaV1>(STORE, id);
  return record ? normalizePersona(record) : null;
}

/** Saves a persona atomically. Generates an id if missing. */
export async function savePersona(persona: UserPersonaV1): Promise<UserPersonaV1> {
  const now = Date.now();
  const id = persona.id && ID_RE(persona.id) ? persona.id : generateId();
  const next: UserPersonaV1 = {
    ...persona,
    id,
    schema: "UserPersonaV1",
    createdAt: persona.createdAt ?? now,
    updatedAt: now,
  };
  const normalized = normalizePersona(next);
  if (!normalized) throw new Error("Invalid persona.");
  if (isElectron()) {
    const res = await desktopPersonas.save(normalized);
    if (!res.ok) throw new Error(res.error ?? "Failed to save persona.");
    return res.persona ? normalizePersona(res.persona) ?? normalized : normalized;
  }
  await StorageService.saveItem(STORE, normalized as unknown as Record<string, unknown>);
  return normalized;
}

/** Deletes a persona by id. Returns true when removed. */
export async function deletePersona(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopPersonas.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/** Generates a new id that satisfies `VALID_ID_RE`. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
