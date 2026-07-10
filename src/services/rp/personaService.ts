/**
 * @fileoverview Renderer-side user persona service.
 *
 * Two backends:
 *   - Electron: `window.veniceForge.personas.{list,get,save,delete}`
 *   - Web: IndexedDB store `personas` (encrypted)
 *
 * The renderer NEVER calls `window.veniceForge.*` directly.
 *
 * **Safety:** `savePersona` calls `assessPersonaImport` (VERIFY-014) so the
 * persona's description + reference are gated by the existing child-
 * exploitation guard before persistence. Blocked saves reject with a
 * `SafetyGuardBlockedError`.
 */

import { isElectron, desktopPersonas } from "../desktopBridge";
import type { PersonaImage, UserPersonaV1 } from "../../types/rp";
import { isValidRpId, MAX_TAGS } from "../../types/rp";
import { assessPersonaImport } from "../../shared/safety/characterImportSafety";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../../safetyHydration";

const STORE = "personas" as const;
const ID_RE = isValidRpId;
const MAX_LIST_PERSONAS = 1_000;
export const MAX_PERSONA_IMAGE_BYTES = 5 * 1024 * 1024;

export function normalizePersonaImage(input: unknown): PersonaImage | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  if (raw.mimeType !== "image/png" && raw.mimeType !== "image/jpeg" && raw.mimeType !== "image/webp") return undefined;
  if (typeof raw.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.data)) return undefined;
  if (typeof raw.byteLength !== "number" || !Number.isSafeInteger(raw.byteLength)
    || raw.byteLength < 1 || raw.byteLength > MAX_PERSONA_IMAGE_BYTES) return undefined;
  const image: PersonaImage = { mimeType: raw.mimeType, data: raw.data, byteLength: raw.byteLength };
  if (typeof raw.contentHash === "string" && /^[a-f0-9]{64}$/i.test(raw.contentHash)) image.contentHash = raw.contentHash;
  return image;
}

/**
 * Coerces an unknown value into a valid `UserPersonaV1`.
 * Validates fields against length caps, regex constraints, and required fields.
 *
 * @param input - The raw data to normalize.
 * @returns The normalized `UserPersonaV1` object, or `null` if the input is invalid.
 */
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
  // Phase 2F: optional project scope.
  const projectId = typeof r.projectId === "string" ? r.projectId.trim() : null;
  const scope: UserPersonaV1["scope"] = r.scope === "project" ? "project" : "global";
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
    scope,
  };
  if (reference) out.reference = reference;
  if (projectId) out.projectId = projectId;
  const image = normalizePersonaImage(r.image);
  if (image) out.image = image;
  return out;
}

/**
 * Retrieves a list of all user personas, capped at the maximum allowed list size.
 *
 * @returns A promise resolving to an array of normalized `UserPersonaV1` objects.
 * @throws {Error} If the underlying storage layer fails to list the personas.
 */
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

/**
 * Retrieves a single user persona by its ID.
 *
 * @param id - The ID of the persona to retrieve.
 * @returns A promise resolving to the `UserPersonaV1` if found, or `null` if not found or invalid.
 */
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

/**
 * Saves a persona atomically. Generates a new ID if one is missing.
 * Runs `assessPersonaImport` so persisted content is gated by the safety guard.
 *
 * @param persona - The `UserPersonaV1` object to save.
 * @returns A promise resolving to the saved and normalized `UserPersonaV1` object.
 * @throws {Error} If the persona is invalid.
 * @throws {SafetyGuardBlockedError} If the content fails the safety check.
 */
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
  // VERIFY-014 / B1 fix: gate the save with the safety guard.
  const safety = assessPersonaImport(normalized, getEffectiveRendererLocalFamilySafeModeEnabled());
  if (!safety.allow || safety.action === "block") {
    throw new SafetyGuardBlockedError(safety);
  }
  if (isElectron()) {
    const res = await desktopPersonas.save(normalized);
    if (!res.ok) throw new Error(res.error ?? "Failed to save persona.");
    return res.persona ? normalizePersona(res.persona) ?? normalized : normalized;
  }
  await StorageService.saveItem(STORE, normalized as unknown as Record<string, unknown>);
  return normalized;
}

/**
 * Deletes a persona by its ID.
 *
 * @param id - The ID of the persona to delete.
 * @returns A promise resolving to `true` if the persona was successfully deleted, `false` otherwise.
 */
export async function deletePersona(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopPersonas.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/**
 * Generates a unique, URL-safe ID for a persona.
 *
 * @returns A randomly generated string ID.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
