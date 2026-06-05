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

/** Returns true when the value is a valid RpAssetV1. */
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

/** Normalizes a raw input to a valid RpAssetV1. Returns null on failure. */
export function normalizeAsset(input: unknown): RpAssetV1 | null {
  if (!isValidAsset(input)) return null;
  return input as RpAssetV1;
}

/** Lists assets, optionally filtered by chatId. */
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

/** Reads a single asset by id, or returns null. */
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

/** Saves an asset atomically. Generates an id if missing. */
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

/** Deletes an asset by id. Returns true when removed. */
export async function deleteAsset(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopRpAssets.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/** Generates a new id that satisfies `VALID_ID_RE`. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `a_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
