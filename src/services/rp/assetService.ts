/**
 * @fileoverview Renderer-side RP asset service.
 *
 * An "asset" is a routed image (scene generation, character portrait, etc.).
 * Assets are metadata records; image bytes live in the existing routed-pictures
 * directory (Electron) or as data URLs (web). The `url` field on the asset
 * record is the resolved view URL.
 *
 * Two backends:
 *   - Electron: `window.veniceForge.rpAssets.{list,get,save,delete}`
 *   - Web: IndexedDB store `rp_assets` (encrypted)
 */

import { isElectron, desktopRpAssets } from "../desktopBridge";
import type { RpAssetV1 } from "../../types/rp";
import { isValidRpId } from "../../types/rp";
import StorageService from "../storageService";

const STORE = "rp_assets" as const;
const ID_RE = isValidRpId;
const MAX_LIST_ASSETS = 5_000;

/**
 * Validates whether a given value conforms to the `RpAssetV1` schema.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid `RpAssetV1` object, `false` otherwise.
 */
export function isValidAsset(value: unknown): value is RpAssetV1 {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  if (a.schema !== "RpAssetV1") return false;
  if (!ID_RE(a.id)) return false;
  if (typeof a.chatId !== "string" || !ID_RE(a.chatId)) return false;
  if (!Array.isArray(a.characterIds)) return false;
  if (typeof a.model !== "string") return false;
  if (typeof a.prompt !== "string") return false;
  if (typeof a.url !== "string") return false;
  if (typeof a.createdAt !== "number") return false;
  return true;
}

/**
 * Normalizes a raw input object into a valid `RpAssetV1`.
 *
 * @param input - The raw data to normalize.
 * @returns The normalized `RpAssetV1` object, or `null` if the input is invalid.
 */
export function normalizeAsset(input: unknown): RpAssetV1 | null {
  if (!isValidAsset(input)) return null;
  return input as RpAssetV1;
}

/**
 * Retrieves a list of all assets, optionally filtered by `chatId`.
 *
 * @param filter - Optional filter object. If `chatId` is provided, only assets belonging to that chat are returned.
 * @returns A promise resolving to an array of normalized `RpAssetV1` objects.
 * @throws {Error} If the underlying storage layer fails to list the assets.
 */
export async function listAssets(filter?: { chatId?: string }): Promise<RpAssetV1[]> {
  if (isElectron()) {
    const res = await desktopRpAssets.list(filter?.chatId);
    if (!res.ok) throw new Error(res.error ?? "Failed to list assets.");
    return (res.assets ?? [])
      .map(normalizeAsset)
      .filter((a): a is RpAssetV1 => a !== null)
      .slice(0, MAX_LIST_ASSETS);
  }
  const records = await StorageService.getItems<RpAssetV1>(STORE);
  const out = records
    .map(normalizeAsset)
    .filter((a): a is RpAssetV1 => a !== null)
    .filter((a) => !filter?.chatId || a.chatId === filter.chatId)
    .slice(0, MAX_LIST_ASSETS);
  return out;
}

/**
 * Retrieves a single asset by its ID.
 *
 * @param id - The ID of the asset to retrieve.
 * @returns A promise resolving to the `RpAssetV1` if found, or `null` if not found or invalid.
 */
export async function readAsset(id: string): Promise<RpAssetV1 | null> {
  if (!ID_RE(id)) return null;
  if (isElectron()) {
    const res = await desktopRpAssets.get(id);
    if (!res.ok) return null;
    return res.asset ? normalizeAsset(res.asset) : null;
  }
  const record = await StorageService.getItem<RpAssetV1>(STORE, id);
  return record ? normalizeAsset(record) : null;
}

/**
 * Saves an asset atomically. Generates a new ID if one is missing.
 *
 * @param asset - The `RpAssetV1` object to save.
 * @returns A promise resolving to the saved and normalized `RpAssetV1` object.
 * @throws {Error} If the asset is invalid.
 */
export async function saveAsset(asset: RpAssetV1): Promise<RpAssetV1> {
  const now = Date.now();
  const id = asset.id && ID_RE(asset.id) ? asset.id : generateId();
  const next: RpAssetV1 = {
    ...asset,
    id,
    schema: "RpAssetV1",
    createdAt: asset.createdAt ?? now,
  };
  const normalized = normalizeAsset(next);
  if (!normalized) throw new Error("Invalid asset.");
  if (isElectron()) {
    const res = await desktopRpAssets.save(normalized);
    if (!res.ok) throw new Error(res.error ?? "Failed to save asset.");
    return res.asset ? normalizeAsset(res.asset) ?? normalized : normalized;
  }
  await StorageService.saveItem(STORE, normalized as unknown as Record<string, unknown>);
  return normalized;
}

/**
 * Deletes an asset by its ID.
 *
 * @param id - The ID of the asset to delete.
 * @returns A promise resolving to `true` if the asset was successfully deleted, `false` otherwise.
 */
export async function deleteAsset(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopRpAssets.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/**
 * Generates a unique, URL-safe ID for an asset.
 *
 * @returns A randomly generated string ID.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `a_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
