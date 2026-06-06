/**
 * @fileoverview Renderer-side RP chat service.
 *
 * Two backends:
 *   - Electron: `window.veniceForge.rpChats.{list,get,save,delete}`
 *   - Web: IndexedDB store `rp_chats` (encrypted)
 *
 * Provides high-level operations (creating a chat, adding messages, updating
 * the active roster) that the rp-chat-store consumes.
 *
 * **Safety:** `saveRpChat` and `appendMessage` both call `assessRpContext`
 * (VERIFY-014) so the full chat content (system prompt, characters, persona,
 * history, and the new turn) is vetted by the existing child-exploitation
 * guard before persistence. EVERY public write path runs the guard — a
 * blocked turn never reaches storage. `_unsafeWriteChat` is the unguarded
 * internal helper used only after one of the public functions has already
 * gated the payload; never call it from feature code.
 *
 * **Hydration:** both `saveRpChat` and `appendMessage` route the toggle
 * value through `getEffectiveRendererLocalFamilySafeModeEnabled` so a
 * save attempted before the main-process config snapshot has hydrated
 * (in Electron mode) throws `ConfigNotHydratedError` instead of making
 * a stale preflight decision.
 */

import { isElectron, desktopRpChats } from "../desktopBridge";
import type { RpChatV1, RpMessageV1, RpRole } from "../../types/rp";
import { isValidRpId, MAX_ACTIVE_CHARACTERS } from "../../types/rp";
import { assessRpContext } from "../../shared/safety/characterImportSafety";
import { SafetyGuardBlockedError } from "../../shared/safety";
import StorageService from "../storageService";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../../safetyHydration";

const STORE = "rp_chats" as const;
const ID_RE = isValidRpId;
const MAX_LIST_CHATS = 1_000;

function isValidRole(r: unknown): r is RpRole {
  return r === "system" || r === "user" || r === "character" || r === "narrator" || r === "tool";
}

/** Returns true when the value is a valid RpChatV1. */
export function isValidChat(value: unknown): value is RpChatV1 {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.schema !== "RpChatV1") return false;
  if (!ID_RE(c.id)) return false;
  if (typeof c.title !== "string") return false;
  if (!Array.isArray(c.characterIds)) return false;
  if (c.characterIds.length > MAX_ACTIVE_CHARACTERS) return false;
  if (!c.characterIds.every((x) => typeof x === "string" && ID_RE(x))) return false;
  if (typeof c.modelId !== "string") return false;
  if (!Array.isArray(c.messages)) return false;
  if (!Array.isArray(c.lorebookIds)) return false;
  if (typeof c.adult !== "boolean") return false;
  if (!c.metadata || typeof c.metadata !== "object") return false;
  const meta = c.metadata as Record<string, unknown>;
  if (typeof meta.pinned !== "boolean" || typeof meta.archived !== "boolean") return false;
  if (!Array.isArray(meta.tags)) return false;
  if (typeof c.createdAt !== "number" || typeof c.updatedAt !== "number") return false;
  return true;
}

/** Normalizes a raw input to a valid RpChatV1. Returns null on failure. */
export function normalizeChat(input: unknown): RpChatV1 | null {
  if (!isValidChat(input)) return null;
  return input as RpChatV1;
}

/** Lists all RP chats (capped). */
export async function listRpChats(): Promise<RpChatV1[]> {
  if (isElectron()) {
    const res = await desktopRpChats.list();
    if (!res.ok) throw new Error(res.error ?? "Failed to list RP chats.");
    return (res.chats ?? [])
      .map(normalizeChat)
      .filter((c): c is RpChatV1 => c !== null)
      .slice(0, MAX_LIST_CHATS);
  }
  const records = await StorageService.getItems<RpChatV1>(STORE);
  return records
    .map(normalizeChat)
    .filter((c): c is RpChatV1 => c !== null)
    .slice(0, MAX_LIST_CHATS);
}

/** Reads a single RP chat by id, or returns null. */
export async function readRpChat(id: string): Promise<RpChatV1 | null> {
  if (!ID_RE(id)) return null;
  if (isElectron()) {
    const res = await desktopRpChats.get(id);
    if (!res.ok) return null;
    return res.chat ? normalizeChat(res.chat) : null;
  }
  const record = await StorageService.getItem<RpChatV1>(STORE, id);
  return record ? normalizeChat(record) : null;
}

/** Saves a chat atomically. Generates an id if missing.
 *  Runs `assessRpContext` so persisted content is gated by the safety guard.
 *  Both `saveRpChat` and `appendMessage` call `assessRpContext` against the
 *  full chat content + the latest user turn — every public write path runs
 *  the guard. `_unsafeWriteChat` is the unguarded internal helper used only
 *  after one of the public functions has already gated the payload. */
export async function saveRpChat(chat: RpChatV1): Promise<RpChatV1> {
  const now = Date.now();
  const id = chat.id && ID_RE(chat.id) ? chat.id : generateId();
  const next: RpChatV1 = {
    ...chat,
    id,
    schema: "RpChatV1",
    createdAt: chat.createdAt ?? now,
    updatedAt: now,
  };
  if (next.characterIds.length > MAX_ACTIVE_CHARACTERS) {
    throw new Error(`At most ${MAX_ACTIVE_CHARACTERS} characters can be active in a chat.`);
  }
  const normalized = normalizeChat(next);
  if (!normalized) throw new Error("Invalid RP chat.");
  // VERIFY-014 / B1 fix: gate the save with the safety guard. The `userMessage`
  // is the most recent user message (or empty on a brand-new chat) — the guard
  // also walks the full `messages` array so historical content is checked.
  const lastUser = [...normalized.messages].reverse().find((m) => m.role === "user");
  const safety = assessRpContext({
    rpChat: normalized,
    characters: [], // character card bodies are assessed at character-save time (B1)
    userMessage: lastUser?.content ?? "",
  }, getEffectiveRendererLocalFamilySafeModeEnabled());
  if (!safety.allow || safety.action === "block") {
    throw new SafetyGuardBlockedError(safety);
  }
  return _unsafeWriteChat(normalized);
}

/** Internal: write a chat to the underlying store without running the safety
 *  guard. Caller must guarantee the content has been vetted via the public
 *  `saveRpChat` or `appendMessage` entry points. */
async function _unsafeWriteChat(chat: RpChatV1): Promise<RpChatV1> {
  if (isElectron()) {
    const res = await desktopRpChats.save(chat);
    if (!res.ok) throw new Error(res.error ?? "Failed to save RP chat.");
    return res.chat ? normalizeChat(res.chat) ?? chat : chat;
  }
  await StorageService.saveItem(STORE, chat as unknown as Record<string, unknown>);
  return chat;
}

/** Deletes a chat by id. Returns true when removed. */
export async function deleteRpChat(id: string): Promise<boolean> {
  if (!ID_RE(id)) return false;
  if (isElectron()) {
    const res = await desktopRpChats.delete(id);
    return Boolean(res.ok);
  }
  return StorageService.deleteItem(STORE, id);
}

/** Appends a message to a chat, returns the updated chat.
 *  Re-runs `assessRpContext` against the new tail of the conversation so a
 *  blocked turn never reaches storage. The first save is also guarded (see
 *  `saveRpChat`); this call re-validates on every append. */
export async function appendMessage(chat: RpChatV1, message: RpMessageV1): Promise<RpChatV1> {
  if (!message || !isValidRole(message.role)) {
    throw new Error("Invalid message role.");
  }
  if (message.role === "character" && !ID_RE(message.characterId ?? "")) {
    throw new Error("Character-role messages require a valid characterId.");
  }
  if (typeof message.content !== "string" || message.content.length === 0) {
    throw new Error("Message content is required.");
  }
  const next: RpChatV1 = {
    ...chat,
    messages: [...chat.messages, message],
    updatedAt: Date.now(),
  };
  const normalized = normalizeChat(next);
  if (!normalized) throw new Error("Invalid RP chat after append.");
  // Gate on the appended tail. The user-message content (if any) is the last
  // element of `messages`; we re-evaluate the full chat so historical context
  // is still scored together with the new turn.
  const lastUser = [...normalized.messages].reverse().find((m) => m.role === "user");
  const safety = assessRpContext({
    rpChat: normalized,
    characters: [],
    userMessage: lastUser?.content ?? "",
  }, getEffectiveRendererLocalFamilySafeModeEnabled());
  if (!safety.allow || safety.action === "block") {
    throw new SafetyGuardBlockedError(safety);
  }
  return _unsafeWriteChat(normalized);
}

/** Generates a new id that satisfies `VALID_ID_RE`. */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
