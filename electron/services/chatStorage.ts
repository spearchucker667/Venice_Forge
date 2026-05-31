/** @fileoverview Durable filesystem-backed chat history storage for the Electron
 *  main process.  Stores one JSON file per conversation under the app's userData
 *  directory.  Writes are atomic (temp + rename) and corruption is handled by
 *  backing up the bad file and starting fresh. */

import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import type { Conversation, ConversationFile } from "../../src/types/conversation";
import { logError, logInfo, logWarn } from "./logger";

/** Sub-directory inside userData where conversation files live. */
const CHAT_DIR = "chat-history";

/** Current on-disk schema version. */
const FILE_VERSION = 1;

/** Valid conversation ID pattern: UUID v4 or URL-safe base64-ish strings. */
const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

/** Maximum number of conversations to load into memory at once.
 *  Prevents unbounded memory growth if the chat-history directory
 *  accumulates an exceptional number of files. */
const MAX_LIST_CONVERSATIONS = 2000;
const MAX_CONVERSATION_FILES_TO_SCAN = MAX_LIST_CONVERSATIONS * 2;
const LIST_BATCH_SIZE = 50;

/** Returns the absolute path to the chat-history directory. */
export function getChatHistoryDir(): string {
  return path.join(app.getPath("userData"), CHAT_DIR);
}

/** Ensures the chat-history directory exists. */
async function ensureDir(): Promise<void> {
  await fs.mkdir(getChatHistoryDir(), { recursive: true });
}

/** Builds the filesystem path for a conversation file.
 *  @param id The conversation identifier.
 *  @returns Absolute path to the JSON file.
 */
function conversationPath(id: string): string {
  return path.join(getChatHistoryDir(), `${id}.json`);
}

/** Validates that an id is safe to use as a filename (no path traversal). */
function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

/** Reads and validates a conversation file from disk.
 *  If the file is corrupt, it is renamed to `.backup` and `null` is returned.
 */
async function readConversationFile(filePath: string): Promise<Conversation | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConversationFile(parsed)) {
      throw new Error("Schema validation failed");
    }
    return parsed.conversation;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    logError("Chat history file corrupt or unreadable", { path: filePath, error: String(err) });
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const backupPath = `${filePath}.backup.${timestamp}.${randomSuffix}`;
      await fs.rename(filePath, backupPath);
      logInfo("Corrupt chat file backed up", backupPath);
    } catch {
      // Best-effort backup; ignore failure.
    }
    return null;
  }
}

async function listConversationFileNames(dir: string): Promise<string[]> {
  const names: string[] = [];
  let handle: Awaited<ReturnType<typeof fs.opendir>>;
  try {
    handle = await fs.opendir(dir);
  } catch {
    return names;
  }

  try {
    for await (const entry of handle) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        names.push(entry.name);
        if (names.length >= MAX_CONVERSATION_FILES_TO_SCAN) {
          logWarn(
            `chat-history directory scan reached ${MAX_CONVERSATION_FILES_TO_SCAN} JSON files; remaining files were skipped. Consider archiving old conversations.`
          );
          break;
        }
      }
    }
  } catch {
    return names;
  }

  return names;
}

/** Type-guard for the on-disk conversation file schema. */
function isValidConversationFile(value: unknown): value is ConversationFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== FILE_VERSION) return false;
  return isValidConversation(v.conversation);
}

/** Type-guard for a Conversation object. */
function isValidConversation(value: unknown): value is Conversation {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (!isValidId(c.id)) return false;
  if (typeof c.title !== "string") return false;
  if (typeof c.createdAt !== "number") return false;
  if (typeof c.updatedAt !== "number") return false;
  if (typeof c.model !== "string") return false;
  if (c.systemPrompt !== undefined && typeof c.systemPrompt !== "string") return false;
  if (!Array.isArray(c.messages)) return false;
  return c.messages.every(isValidMessage);
}

/** Type-guard for a ConversationMessage object. */
function isValidMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (!isValidId(m.id)) return false;
  if (typeof m.role !== "string" || !["system", "user", "assistant", "tool"].includes(m.role)) return false;
  if (typeof m.content !== "string" && !Array.isArray(m.content)) return false;
  if (typeof m.timestamp !== "number") return false;
  return true;
}

/** Lists all persisted conversations, sorted by updatedAt descending. */
export async function listConversations(): Promise<Conversation[]> {
  await ensureDir();
  const dir = getChatHistoryDir();
  const jsonFiles = await listConversationFileNames(dir);

  const conversations: Conversation[] = [];
  for (let i = 0; i < jsonFiles.length; i += LIST_BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + LIST_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (name) => {
        const filePath = path.join(dir, name);
        return readConversationFile(filePath);
      })
    );
    for (const conv of batchResults) {
      if (conv) conversations.push(conv);
      if (conversations.length >= MAX_LIST_CONVERSATIONS) {
        logWarn(
          `chat-history directory contains more than ${MAX_LIST_CONVERSATIONS} valid conversations; truncating list. Consider archiving old conversations.`
        );
        break;
      }
    }
    if (conversations.length >= MAX_LIST_CONVERSATIONS) break;
  }

  conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  return conversations;
}

/** Retrieves a single conversation by id. */
export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isValidId(id)) return null;
  await ensureDir();
  const filePath = conversationPath(id);
  return readConversationFile(filePath);
}

/** Atomically writes a conversation to disk.
 *  @returns An ok flag and optional error message.
 */
export async function saveConversation(conversation: Conversation): Promise<{ ok: boolean; error?: string }> {
  if (!isValidConversation(conversation)) {
    return { ok: false, error: "Invalid conversation schema" };
  }
  await ensureDir();
  const filePath = conversationPath(conversation.id);
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const payload: ConversationFile = { version: FILE_VERSION, conversation };
  try {
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf-8");
    await fs.rename(tempPath, filePath);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("Failed to write conversation file", { path: filePath, error: message });
    return { ok: false, error: message };
  }
}

/** Deletes a conversation file by id.
 *  @returns An ok flag.
 */
export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  if (!isValidId(id)) return { ok: false };
  await ensureDir();
  const filePath = conversationPath(id);
  try {
    await fs.unlink(filePath);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
