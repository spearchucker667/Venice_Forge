/**
 * @fileoverview Electron main-process storage for `RpChatV1`.
 *
 * Persists one JSON file per chat under `<userData>/rp-chats/<id>.json`.
 * Writes are atomic (temp + rename), corruption is handled by backing up
 * the bad file. All ids MUST pass the strict id regex (must start alphanumeric;
 * rejects "." and "..").
 */

import { app } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { RpChatV1, RpMessageV1 } from "../../src/types/rp";
import { MAX_ACTIVE_CHARACTERS } from "../../src/types/rp";
import { logError, logInfo } from "./logger";

const RP_CHATS_DIR = "rp-chats";
const TMP_SUFFIX = ".tmp";
const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const MAX_LIST_RP_CHATS = 2000;
const MAX_SCAN_FILES = MAX_LIST_RP_CHATS * 2;

export function getRpChatsDir(): string {
  return path.join(app.getPath("userData"), RP_CHATS_DIR);
}

export function rpChatPath(id: string): string {
  return path.join(getRpChatsDir(), `${id}.json`);
}

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

function isStringArrayOfIds(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && VALID_ID_RE.test(x));
}

function isRpMessage(m: unknown): m is RpMessageV1 {
  if (!m || typeof m !== "object") return false;
  const mm = m as Record<string, unknown>;
  if (typeof mm.id !== "string") return false;
  if (typeof mm.content !== "string") return false;
  if (typeof mm.createdAt !== "number") return false;
  if (mm.role !== "system" && mm.role !== "user" && mm.role !== "character" && mm.role !== "narrator" && mm.role !== "tool") return false;
  if (mm.role === "character" && (typeof mm.characterId !== "string" || !VALID_ID_RE.test(mm.characterId))) return false;
  return true;
}

function isValidChat(obj: unknown): obj is RpChatV1 {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Record<string, unknown>;
  if (c.schema !== "RpChatV1") return false;
  if (!isValidId(c.id)) return false;
  if (typeof c.title !== "string") return false;
  if (!isStringArrayOfIds(c.characterIds)) return false;
  if (c.characterIds.length > MAX_ACTIVE_CHARACTERS) return false;
  if (!isStringArrayOfIds(c.lorebookIds)) return false;
  if (typeof c.modelId !== "string" && typeof c.model !== "string") return false;
  if (typeof c.adult !== "boolean") return false;
  if (!Array.isArray(c.messages) || !c.messages.every(isRpMessage)) return false;
  if (typeof c.createdAt !== "number" || typeof c.updatedAt !== "number") return false;
  if (c.personaId !== undefined && !isValidId(c.personaId)) return false;
  if (c.scenario !== undefined && typeof c.scenario !== "string") return false;
  if (c.metadata) {
    const meta = c.metadata as Record<string, unknown>;
    if (typeof meta.pinned !== "boolean" || typeof meta.archived !== "boolean" || !Array.isArray(meta.tags)) return false;
  }
  return true;
}

export async function listRpChats(): Promise<{ chats: RpChatV1[]; truncated: boolean; totalScanned: number }> {
  const dir = getRpChatsDir();
  const names: string[] = [];
  let handle: Awaited<ReturnType<typeof fs.opendir>>;
  try {
    handle = await fs.opendir(dir);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { chats: [], truncated: false, totalScanned: 0 };
    }
    throw err;
  }
  try {
    for await (const entry of handle) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        const id = entry.name.slice(0, -".json".length);
        if (isValidId(id)) {
          names.push(id);
          if (names.length >= MAX_SCAN_FILES) {
            logInfo(`rp-chats directory scan reached ${MAX_SCAN_FILES}; further files skipped`);
            break;
          }
        }
      }
    }
  } finally {
    // for-await handles cleanup
  }

  const chats: RpChatV1[] = [];
  for (const id of names) {
    const chat = await readRpChat(id);
    if (chat) chats.push(chat);
  }
  chats.sort((a, b) => b.updatedAt - a.updatedAt);
  return { chats: chats.slice(0, MAX_LIST_RP_CHATS), truncated: chats.length > MAX_LIST_RP_CHATS, totalScanned: names.length };
}

export async function readRpChat(id: string): Promise<RpChatV1 | null> {
  if (!isValidId(id)) return null;
  const file = rpChatPath(id);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidChat(parsed)) throw new Error("schema validation failed");
    return parsed;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    logError("rp-chat file corrupt or unreadable", { path: file, error: String(err) });
    try {
      const backupPath = `${file}.backup.${Date.now()}.${crypto.randomUUID()}`;
      await fs.rename(file, backupPath);
      logInfo("Corrupt rp-chat backed up", backupPath);
    } catch {
      // best effort
    }
    return null;
  }
}

export type SaveRpChatOutcome = { ok: true } | { ok: false; error: string };

export async function saveRpChat(input: unknown): Promise<SaveRpChatOutcome> {
  if (!input || typeof input !== "object") return { ok: false, error: "chat must be an object" };
  const c = input as Record<string, unknown>;
  if (!isValidId(c.id)) return { ok: false, error: "invalid chat id" };
  if (typeof c.title !== "string" || c.title.length === 0) return { ok: false, error: "title is required" };
  if (!isStringArrayOfIds(c.characterIds) || c.characterIds.length === 0) {
    return { ok: false, error: "at least one active character id is required" };
  }
  if (c.characterIds.length > MAX_ACTIVE_CHARACTERS) {
    return { ok: false, error: `too many active characters (max ${MAX_ACTIVE_CHARACTERS})` };
  }
  if (!isStringArrayOfIds(c.lorebookIds)) return { ok: false, error: "lorebookIds must be string ids" };
  if (typeof c.model !== "string" || c.model.length === 0) {
    if (typeof c.modelId !== "string" || c.modelId.length === 0) {
      return { ok: false, error: "model is required" };
    }
  }
  if (!Array.isArray(c.messages) || !c.messages.every(isRpMessage)) {
    return { ok: false, error: "messages must be RpMessage[]" };
  }
  const adult = c.adult === true;
  const personaId = c.personaId === undefined ? undefined : (isValidId(c.personaId) ? c.personaId : null);
  if (personaId === null) return { ok: false, error: "invalid personaId" };
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const metadata = {
    pinned: meta.pinned === true,
    archived: meta.archived === true,
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === "string") : [],
  };
  const now = Date.now();
  const createdAt = typeof c.createdAt === "number" ? c.createdAt : now;
  const updatedAt = typeof c.updatedAt === "number" ? c.updatedAt : now;
  const modelId = typeof c.modelId === "string" && c.modelId.length > 0
    ? c.modelId
    : (typeof c.model === "string" && c.model.length > 0 ? c.model : null);
  if (modelId === null) return { ok: false, error: "model is required" };

  const chat: RpChatV1 = {
    schema: "RpChatV1",
    id: c.id,
    title: c.title,
    characterIds: c.characterIds,
    personaId: personaId ?? undefined,
    scenario: typeof c.scenario === "string" ? c.scenario : undefined,
    lorebookIds: c.lorebookIds,
    modelId,
    messages: c.messages as RpMessageV1[],
    adult,
    metadata,
    createdAt,
    updatedAt,
  };

  await fs.mkdir(getRpChatsDir(), { recursive: true });
  const target = rpChatPath(chat.id);
  const tmp = `${target}${TMP_SUFFIX}`;
  await fs.writeFile(tmp, JSON.stringify(chat, null, 2), { mode: 0o600 });
  await fs.rename(tmp, target);
  return { ok: true };
}

export async function deleteRpChat(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidId(id)) return { ok: false, error: "invalid id" };
  try {
    await fs.unlink(rpChatPath(id));
    return { ok: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
