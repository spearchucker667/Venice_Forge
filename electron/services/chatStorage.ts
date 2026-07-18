/** @fileoverview Durable filesystem-backed chat history storage for the Electron
 *  main process.  Stores one JSON file per conversation under the app's userData
 *  directory.  Writes are atomic (temp + rename) and corruption is handled by
 *  backing up the bad file and starting fresh. */

import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import type { Conversation, ConversationFile } from "../../src/types/conversation";
import { logError, logInfo, logWarn } from "./logger";
import { redactErrorMessage } from "../../src/shared/redaction";
import { isValidId } from "../../src/utils/idValidation";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";

/** Sub-directory inside userData where conversation files live. */
const CHAT_DIR = "chat-history";

/** Current on-disk schema version. */
const FILE_VERSION = 1;

/** Maximum number of conversations to load into memory at once.
 *  Prevents unbounded memory growth if the chat-history directory
 *  accumulates an exceptional number of files. */
const MAX_LIST_CONVERSATIONS = 2000;
const MAX_CONVERSATION_FILES_TO_SCAN = MAX_LIST_CONVERSATIONS * 2;
const LIST_BATCH_SIZE = 50;

/** Returns the profile-owned chat directory. Historical unscoped files remain
 *  in the default directory; non-default profiles use isolated subdirectories. */
export function getChatHistoryDir(profileId: string = "default"): string {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  const root = path.join(app.getPath("userData"), CHAT_DIR);
  return profileId === "default" ? root : path.join(root, "profiles", profileId);
}

/** Ensures the chat-history directory exists. */
async function ensureDir(profileId: string): Promise<void> {
  await fs.mkdir(getChatHistoryDir(profileId), { recursive: true });
}

/** Builds the filesystem path for a conversation file.
 *  @param id The conversation identifier.
 *  @returns Absolute path to the JSON file.
 */
function conversationPath(id: string, profileId: string): string {
  return path.join(getChatHistoryDir(profileId), `${id}.json`);
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
      const randomSuffix = crypto.randomUUID();
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
  if (typeof c.id !== "string" || !isValidId(c.id)) return false;
  if (typeof c.title !== "string") return false;
  if (typeof c.createdAt !== "number") return false;
  if (typeof c.updatedAt !== "number") return false;
  if (typeof c.model !== "string") return false;
  if (c.profileId !== undefined && !isValidProfileStorageId(c.profileId)) return false;
  if (c.systemPrompt !== undefined && typeof c.systemPrompt !== "string") return false;
  if (!Array.isArray(c.messages)) return false;
  return c.messages.every(isValidMessage);
}

/** Type-guard for a message content part (OpenAI-style). */
function isValidMessagePart(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  if (p.type === "text") return typeof p.text === "string";
  if (p.type === "image_url") {
    const url = p.image_url;
    return (
      typeof url === "object" &&
      url !== null &&
      typeof (url as Record<string, unknown>).url === "string"
    );
  }
  return false;
}

/** Type-guard for a ConversationMessage object. */
function isValidMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string" || !isValidId(m.id)) return false;
  if (typeof m.role !== "string" || !["system", "user", "assistant", "tool"].includes(m.role))
    return false;

  if (typeof m.content === "string") {
    // ok
  } else if (Array.isArray(m.content)) {
    if (!m.content.every(isValidMessagePart)) return false;
  } else {
    return false;
  }

  if (typeof m.timestamp !== "number") return false;
  return true;
}

/** Result envelope for listConversations so callers can detect truncation
 *  and prompt the user to archive old chats. */
export interface ListConversationsResult {
  conversations: Conversation[];
  /** True when MAX_LIST_CONVERSATIONS or MAX_CONVERSATION_FILES_TO_SCAN was reached. */
  truncated: boolean;
  /** Total files on disk that matched the scan, before truncation. */
  totalScanned: number;
  /** Offset of the first conversation in `conversations` (0-based).
   *  Equal to the `offset` argument passed in, clamped to a valid value. */
  offset: number;
  /** Number of conversations actually returned in this page. */
  count: number;
}

/** Options for the paginated listConversations. */
export interface ListConversationsOptions {
  /** 0-based offset into the sorted conversation list. Defaults to 0. */
  offset?: number;
  /** Maximum number of conversations to return in this page. Defaults to MAX_LIST_CONVERSATIONS. */
  limit?: number;
}

/** Hard ceiling for any single page request. Prevents accidental OOM via a
 *  renderer-supplied `limit: 10_000_000`. */
const MAX_PAGE_LIMIT = 1000;

/** Lists all persisted conversations, sorted by updatedAt descending.
 *  When called with no arguments, returns the legacy union shape
 *  (Conversation[] for the no-truncation case, envelope otherwise) for
 *  backward compatibility with older callers. New callers should pass
 *  { offset, limit } and always receive the envelope shape. */
export async function listConversations(
  options?: ListConversationsOptions,
  profileId: string = "default",
): Promise<Conversation[] | ListConversationsResult> {
  if (!isValidProfileStorageId(profileId)) return [];
  await ensureDir(profileId);
  const dir = getChatHistoryDir(profileId);
  const jsonFiles = await listConversationFileNames(dir);
  const totalScanned = jsonFiles.length;

  // Resolve pagination params with bounds-checking.
  const requestedOffset = Math.max(0, Math.floor(options?.offset ?? 0));
  const requestedLimit = Math.max(
    1,
    Math.min(MAX_PAGE_LIMIT, Math.floor(options?.limit ?? MAX_LIST_CONVERSATIONS))
  );

  // Read up to (offset + limit) valid conversations, sorted by updatedAt.
  // We over-scan to know whether more pages exist beyond `limit`.
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
      const owned = profileId === "default"
        ? conv?.profileId === undefined || conv.profileId === "default"
        : conv?.profileId === profileId;
      if (conv && owned) conversations.push(conv);
    }
    if (conversations.length >= requestedOffset + requestedLimit + 1) break;
  }
  conversations.sort((a, b) => b.updatedAt - a.updatedAt);

  const totalValid = conversations.length;
  const page = conversations.slice(requestedOffset, requestedOffset + requestedLimit);
  // truncated = (more conversations exist beyond this page) OR
  //             (the file scan itself was capped at MAX_CONVERSATION_FILES_TO_SCAN).
  const truncated =
    totalScanned >= MAX_CONVERSATION_FILES_TO_SCAN ||
    requestedOffset + page.length < totalValid;

  // Legacy callers (no options) get the bare Conversation[] when no truncation.
  // The envelope is always returned when (a) options were passed, or
  // (b) truncation is detected.
  if (!options && !truncated) {
    return page;
  }
  return { conversations: page, truncated, totalScanned: totalValid, offset: requestedOffset, count: page.length };
}

/** Retrieves a single conversation by id. */
export async function getConversation(id: string, profileId: string = "default"): Promise<Conversation | null> {
  if (!isValidId(id) || !isValidProfileStorageId(profileId)) return null;
  await ensureDir(profileId);
  const filePath = conversationPath(id, profileId);
  const conversation = await readConversationFile(filePath);
  if (!conversation) return null;
  if (profileId === "default") {
    return conversation.profileId === undefined || conversation.profileId === "default" ? conversation : null;
  }
  return conversation.profileId === profileId ? conversation : null;
}

/** Atomically writes a conversation to disk.
 *  @returns An ok flag and optional error message.
 */
export async function saveConversation(conversation: Conversation, profileId: string = "default"): Promise<{ ok: boolean; error?: string }> {
  if (!isValidProfileStorageId(profileId)) {
    return { ok: false, error: "Invalid conversation profile" };
  }
  const storedConversation: Conversation = profileId === "default"
    ? { ...conversation, profileId: undefined }
    : { ...conversation, profileId };
  if (!isValidConversation(storedConversation)) {
    return { ok: false, error: "Invalid conversation schema" };
  }
  await ensureDir(profileId);
  const filePath = conversationPath(storedConversation.id, profileId);
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const payload: ConversationFile = { version: FILE_VERSION, conversation: storedConversation };
  try {
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempPath, filePath);
    return { ok: true };
  } catch (err) {
    await fs.unlink(tempPath).catch(() => undefined);
    const diagnostic = redactErrorMessage(err);
    logError("Failed to write conversation file", { path: path.basename(filePath), error: diagnostic });
    return { ok: false, error: "Failed to save conversation." };
  }
}

/** Deletes a conversation file by id.
 *  @returns An ok flag.
 */
export async function deleteConversation(id: string, profileId: string = "default"): Promise<{ ok: boolean }> {
  if (!isValidId(id) || !isValidProfileStorageId(profileId)) return { ok: false };
  await ensureDir(profileId);
  const filePath = conversationPath(id, profileId);
  try {
    await fs.unlink(filePath);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Purges all chat-history files owned by a non-default profile. The default
 *  profile's unscoped history is intentionally left intact. Idempotent.
 *  @returns Whether the profile directory existed before the purge. */
export async function purgeProfileChatHistory(
  profileId: string,
): Promise<{ ok: boolean; removed: boolean; error?: string }> {
  if (!isValidProfileStorageId(profileId)) {
    return { ok: false, removed: false, error: "Invalid profile id." };
  }
  if (profileId === "default") {
    return { ok: false, removed: false, error: "The default profile chat history cannot be purged." };
  }
  try {
    const profileDir = path.join(getChatHistoryDir("default"), "profiles", profileId);
    let removed = true;
    try {
      await fs.access(profileDir);
    } catch {
      removed = false;
    }
    await fs.rm(profileDir, { recursive: true, force: true });
    return { ok: true, removed };
  } catch (err) {
    logError("Failed to purge profile chat history", { profileId, error: redactErrorMessage(err) });
    return { ok: false, removed: false, error: "Failed to purge chat history." };
  }
}
