/**
 * @fileoverview IPC handlers for the Character Roleplay Studio.
 *
 * Channels:
 *   - characterCards:{list,get,save,delete}
 *   - personas:{list,get,save,delete}
 *   - lorebooks:{list,get,save,delete}
 *   - rpChats:{list,get,save,delete}
 *   - rpAssets:{list,get,save,delete}
 *
 * The renderer never touches the filesystem directly; all writes go through
 * these handlers, which in turn call the validated storage services.
 *
 * No new HTTP endpoints are exposed — the RP studio is local-first and
 * relies on the existing safety guards at the `venice:request` boundary
 * for any Venice calls (e.g. scene generation).
 */

import { ipcMain } from "electron";
import { rateLimitIpcHandler } from "../utils/rateLimit";
import { emitSyncPacket, emitSyncTombstone } from "../services/syncBridge";
import {
  listCharacterCards,
  readCharacterCard,
  saveCharacterCard,
  deleteCharacterCard,
} from "../services/characterCardStorage";
import {
  listRpChats,
  readRpChat,
  saveRpChat,
  deleteRpChat,
} from "../services/rpChatStorage";
import {
  personaStore,
  lorebookStore,
  rpAssetStore,
  scenarioStore,
} from "../services/rpStores";
import { isValidId } from "../../src/utils/idValidation";
import type { UserPersonaV1, LorebookV1, RpAssetV1, ScenarioV1 } from "../../src/types/rp";
import { redactErrorMessage } from "../../src/shared/redaction";
import { logError } from "../services/logger";
import { validateMutationOrigin } from "./validation";

/** Parses a delete payload from the renderer. Accepts the shape `{ id, origin }`
 *  introduced in Task 6 and defaults missing origins to `"local-user"` for
 *  back-compat.
 *  @returns A tuple `[error, payload]` where exactly one entry is defined. */
function parseDeletePayload(raw: unknown): [string, null] | [null, { id: string; origin: import("../../src/types/sync").MutationOrigin }] {
  if (!raw || typeof raw !== "object") {
    return ["Invalid payload", null];
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || !isValidId(p.id)) {
    return ["Invalid id", null];
  }
  try {
    const origin = validateMutationOrigin(p.origin);
    return [null, { id: p.id, origin }];
  } catch (err) {
    return [err instanceof Error ? err.message : "Invalid origin", null];
  }
}

/** Extracts and validates an optional mutation origin from a save payload.
 *  Defaults missing origins to `"local-user"` for back-compat.
 *  @returns A tuple `[error, origin]` where exactly one entry is defined. */
function parseSaveOrigin(raw: unknown): [string, null] | [null, import("../../src/types/sync").MutationOrigin] {
  if (!raw || typeof raw !== "object") {
    return [null, "local-user"];
  }
  const p = raw as Record<string, unknown>;
  try {
    return [null, validateMutationOrigin(p.origin)];
  } catch (err) {
    return [err instanceof Error ? err.message : "Invalid origin", null];
  }
}

/** Coerces a chatId param from IPC into a validated string, or returns null. */
function chatIdFilter(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) return undefined;
  return raw;
}

export function registerRpIpcHandlers(): void {
  const handleIpc = (channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.handle(channel, rateLimitIpcHandler(channel, handler));
  };

  // ── Character cards ──
  handleIpc("characterCards:list", async () => {
    try {
      const { cards, truncated, totalScanned } = await listCharacterCards();
      return { ok: true, cards, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("characterCards:list failed", message);
      return { ok: false, error: message, cards: [], truncated: false, totalScanned: 0 };
    }
  });

  handleIpc("characterCards:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") return { ok: false, error: "Invalid id", card: null };
      const card = await readCharacterCard(id);
      return { ok: true, card };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("characterCards:get failed", message);
      return { ok: false, error: message, card: null };
    }
  });

  handleIpc("characterCards:save", async (_event, card: unknown) => {
    try {
      const [originError, origin] = parseSaveOrigin(card);
      if (originError) {
        return { ok: false, error: originError, card: null };
      }
      const result = await saveCharacterCard(card);
      if (!result.ok) return { ok: false, error: result.error, card: null };
      // Read back the persisted card (with avatar hydrated) for the renderer.
      const id = (card as { id?: unknown })?.id;
      const persisted = typeof id === "string" ? await readCharacterCard(id) : null;
      if (persisted && origin === "local-user") {
        await emitSyncPacket("character_cards", persisted.id, persisted, origin);
      }
      return { ok: true, card: persisted };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("characterCards:save failed", message);
      return { ok: false, error: message, card: null };
    }
  });

  handleIpc("characterCards:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      const result = await deleteCharacterCard(id);
      if (result.ok && origin === "local-user") {
        await emitSyncTombstone("character_cards", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("characterCards:delete failed", message);
      return { ok: false, error: message };
    }
  });

  // ── Personas ──
  handleIpc("personas:list", async () => {
    try {
      const { items, truncated, totalScanned } = await personaStore.list();
      return { ok: true, personas: items, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("personas:list failed", message);
      return { ok: false, error: message, personas: [], truncated: false, totalScanned: 0 };
    }
  });

  handleIpc("personas:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") return { ok: false, error: "Invalid id", persona: null };
      const persona = await personaStore.read(id);
      return { ok: true, persona: persona as UserPersonaV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("personas:get failed", message);
      return { ok: false, error: message, persona: null };
    }
  });

  handleIpc("personas:save", async (_event, persona: unknown) => {
    try {
      const [originError, origin] = parseSaveOrigin(persona);
      if (originError) {
        return { ok: false, error: originError, persona: null };
      }
      const { origin: _personaOrigin, ...record } = persona as Record<string, unknown>;
      const result = await personaStore.save(record);
      if (!result.ok) return { ok: false, error: result.error ?? "Save failed", persona: null };
      const id = record.id;
      const persisted = typeof id === "string" ? await personaStore.read(id) : null;
      if (persisted && origin === "local-user") {
        await emitSyncPacket("personas", persisted.id, persisted, origin);
      }
      return { ok: true, persona: persisted as UserPersonaV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("personas:save failed", message);
      return { ok: false, error: message, persona: null };
    }
  });

  handleIpc("personas:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      const result = await personaStore.remove(id);
      if (result.ok && origin === "local-user") {
        await emitSyncTombstone("personas", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("personas:delete failed", message);
      return { ok: false, error: message };
    }
  });

  // ── Lorebooks ──
  handleIpc("lorebooks:list", async () => {
    try {
      const { items, truncated, totalScanned } = await lorebookStore.list();
      return { ok: true, lorebooks: items, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("lorebooks:list failed", message);
      return { ok: false, error: message, lorebooks: [], truncated: false, totalScanned: 0 };
    }
  });

  handleIpc("lorebooks:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") return { ok: false, error: "Invalid id", lorebook: null };
      const lorebook = await lorebookStore.read(id);
      return { ok: true, lorebook: lorebook as LorebookV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("lorebooks:get failed", message);
      return { ok: false, error: message, lorebook: null };
    }
  });

  handleIpc("lorebooks:save", async (_event, lorebook: unknown) => {
    try {
      const [originError, origin] = parseSaveOrigin(lorebook);
      if (originError) {
        return { ok: false, error: originError, lorebook: null };
      }
      const { origin: _lorebookOrigin, ...record } = lorebook as Record<string, unknown>;
      const result = await lorebookStore.save(record);
      if (!result.ok) return { ok: false, error: result.error ?? "Save failed", lorebook: null };
      const id = record.id;
      const persisted = typeof id === "string" ? await lorebookStore.read(id) : null;
      if (persisted && origin === "local-user") {
        await emitSyncPacket("lorebooks", persisted.id, persisted, origin);
      }
      return { ok: true, lorebook: persisted as LorebookV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("lorebooks:save failed", message);
      return { ok: false, error: message, lorebook: null };
    }
  });

  handleIpc("lorebooks:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      const result = await lorebookStore.remove(id);
      if (result.ok && origin === "local-user") {
        await emitSyncTombstone("lorebooks", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("lorebooks:delete failed", message);
      return { ok: false, error: message };
    }
  });

  // ── RP Chats ──
  handleIpc("rpChats:list", async () => {
    try {
      const { chats, truncated, totalScanned } = await listRpChats();
      return { ok: true, chats, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpChats:list failed", message);
      return { ok: false, error: message, chats: [], truncated: false, totalScanned: 0 };
    }
  });

  handleIpc("rpChats:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") return { ok: false, error: "Invalid id", chat: null };
      const chat = await readRpChat(id);
      return { ok: true, chat };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpChats:get failed", message);
      return { ok: false, error: message, chat: null };
    }
  });

  handleIpc("rpChats:save", async (_event, chat: unknown) => {
    try {
      const [originError, origin] = parseSaveOrigin(chat);
      if (originError) {
        return { ok: false, error: originError, chat: null };
      }
      const result = await saveRpChat(chat);
      if (!result.ok) return { ok: false, error: result.error, chat: null };
      const id = (chat as { id?: unknown })?.id;
      const persisted = typeof id === "string" ? await readRpChat(id) : null;
      if (persisted && origin === "local-user") {
        await emitSyncPacket("rp_chats", persisted.id, persisted, origin);
      }
      return { ok: true, chat: persisted };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpChats:save failed", message);
      return { ok: false, error: message, chat: null };
    }
  });

  handleIpc("rpChats:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      const result = await deleteRpChat(id);
      if (result.ok && origin === "local-user") {
        await emitSyncTombstone("rp_chats", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpChats:delete failed", message);
      return { ok: false, error: message };
    }
  });

  // ── RP Assets ──
  handleIpc("rpAssets:list", async (_event, chatIdRaw: unknown) => {
    try {
      const { items, truncated, totalScanned } = await rpAssetStore.list();
      const chatId = chatIdFilter(chatIdRaw);
      const filtered = chatId ? items.filter((a) => a.chatId === chatId) : items;
      return { ok: true, assets: filtered, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpAssets:list failed", message);
      return { ok: false, error: message, assets: [], truncated: false, totalScanned: 0 };
    }
  });

  handleIpc("rpAssets:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") return { ok: false, error: "Invalid id", asset: null };
      const asset = await rpAssetStore.read(id);
      return { ok: true, asset: asset as RpAssetV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpAssets:get failed", message);
      return { ok: false, error: message, asset: null };
    }
  });

  handleIpc("rpAssets:save", async (_event, asset: unknown) => {
    try {
      const [originError, origin] = parseSaveOrigin(asset);
      if (originError) {
        return { ok: false, error: originError, asset: null };
      }
      const { origin: _assetOrigin, ...record } = asset as Record<string, unknown>;
      const result = await rpAssetStore.save(record);
      if (!result.ok) return { ok: false, error: result.error ?? "Save failed", asset: null };
      const id = record.id;
      const persisted = typeof id === "string" ? await rpAssetStore.read(id) : null;
      if (persisted && origin === "local-user") {
        await emitSyncPacket("rp_assets", persisted.id, persisted, origin);
      }
      return { ok: true, asset: persisted as RpAssetV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpAssets:save failed", message);
      return { ok: false, error: message, asset: null };
    }
  });

  handleIpc("rpAssets:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      const result = await rpAssetStore.remove(id);
      if (result.ok && origin === "local-user") {
        await emitSyncTombstone("rp_assets", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("rpAssets:delete failed", message);
      return { ok: false, error: message };
    }
  });

  // ── Scenarios (Phase 2F) ──
  handleIpc("scenarios:list", async () => {
    try {
      const { items, truncated, totalScanned } = await scenarioStore.list();
      return { ok: true, scenarios: items, truncated, totalScanned };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("scenarios:list failed", message);
      return { ok: false, error: message, scenarios: [], truncated: false, totalScanned: 0 };
    }
  });

  handleIpc("scenarios:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") return { ok: false, error: "Invalid id", scenario: null };
      const scenario = await scenarioStore.read(id);
      return { ok: true, scenario: scenario as ScenarioV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("scenarios:get failed", message);
      return { ok: false, error: message, scenario: null };
    }
  });

  handleIpc("scenarios:save", async (_event, scenario: unknown) => {
    try {
      const [originError, origin] = parseSaveOrigin(scenario);
      if (originError) {
        return { ok: false, error: originError, scenario: null };
      }
      const { origin: _scenarioOrigin, ...record } = scenario as Record<string, unknown>;
      const result = await scenarioStore.save(record);
      if (!result.ok) return { ok: false, error: result.error ?? "Save failed", scenario: null };
      const id = record.id;
      const persisted = typeof id === "string" ? await scenarioStore.read(id) : null;
      if (persisted && origin === "local-user") {
        await emitSyncPacket("rpScenarios", persisted.id, persisted, origin);
      }
      return { ok: true, scenario: persisted as ScenarioV1 | null };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("scenarios:save failed", message);
      return { ok: false, error: message, scenario: null };
    }
  });

  handleIpc("scenarios:delete", async (_event, payload: unknown) => {
    try {
      const [error, parsed] = parseDeletePayload(payload);
      if (error || !parsed) {
        return { ok: false, error: error ?? "Invalid payload" };
      }
      const { id, origin } = parsed;
      const result = await scenarioStore.remove(id);
      if (result.ok && origin === "local-user") {
        await emitSyncTombstone("rpScenarios", id, origin);
      }
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("scenarios:delete failed", message);
      return { ok: false, error: message };
    }
  });
}
