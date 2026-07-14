/**
 * @fileoverview Main process service for the secure local Conversation Vault.
 * Handles OS-level key encryption, file-level AES-256-GCM cipher operations,
 * atomic writing (temp file + fsync + rename), and listing/archiving records.
 */

import { app, safeStorage } from "electron";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  ConversationRecordV1,
  EncryptedVaultFileV1,
  VaultKeyFileV1,
  ConversationSource,
} from "../../src/types/conversationVault";
import { logError, logInfo } from "./logger";
import { ConversationWriteQueue } from "./conversationWriteQueue";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";

export const CONVERSATIONS_DIR = path.join(app.getPath("userData"), "conversations");
const KEY_FILE = path.join(CONVERSATIONS_DIR, "vault-key.v1.json");
export const MANIFEST_FILE = path.join(CONVERSATIONS_DIR, "manifest.v1.json.enc");
export const MANIFEST_JOURNAL_FILE = path.join(CONVERSATIONS_DIR, "manifest.v1.journal.jsonl.enc");
export const INDEX_FILE = path.join(CONVERSATIONS_DIR, "memory-index.v1.json.enc");

export function getProfileConversationsDir(profileId = "default"): string {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  return profileId === "default"
    ? CONVERSATIONS_DIR
    : path.join(CONVERSATIONS_DIR, "profiles", profileId);
}

export function getManifestFile(profileId = "default"): string {
  return path.join(getProfileConversationsDir(profileId), "manifest.v1.json.enc");
}

export function getManifestJournalFile(profileId = "default"): string {
  return path.join(getProfileConversationsDir(profileId), "manifest.v1.journal.jsonl.enc");
}

export function getIndexFile(profileId = "default"): string {
  return path.join(getProfileConversationsDir(profileId), "memory-index.v1.json.enc");
}

function scopedEncryptionId(profileId: string, id: string): string {
  return profileId === "default" ? id : `profile:${profileId}:${id}`;
}

let cachedVaultKey: Buffer | null = null;
let keyId: string = "default-key-id";
const writeQueue = new ConversationWriteQueue();

const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export function isValidConversationId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

/** Ensures a resolved record path stays inside the conversations directory. */
function assertWithinConversationsDir(resolvedPath: string, profileId = "default"): void {
  const relative = path.relative(getProfileConversationsDir(profileId), resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved path escapes conversations directory");
  }
}

// In-memory manifest cache
export interface ManifestConversationV1 {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt?: string;
  metadata: {
    tags: string[];
    pinned: boolean;
    archived: boolean;
    source: string;
    messageCount: number;
    tokenEstimate?: number;
    lastSummaryAt?: number;
    migratedFrom?: {
      oldPath: string;
      oldId: string;
      migratedAt: number;
    };
  };
  memory: {
    summary: string;
    topics: string[];
    entities: string[];
    projectRefs: string[];
  };
}

export interface ManifestV1 {
  version: 1;
  updatedAt: number;
  conversations: ManifestConversationV1[];
}

type ManifestJournalOperationV1 =
  | { type: "upsert"; updatedAt: number; entry: ManifestConversationV1 }
  | { type: "delete"; updatedAt: number; id: string };

interface ManifestJournalLineV1 {
  version: 1;
  entryId: string;
  envelope: EncryptedVaultFileV1;
}

const cachedManifests = new Map<string, ManifestV1>();

/**
 * Gets or initializes the cryptographically secure 256-bit vault key.
 * On Windows/macOS, fails closed if safeStorage is unavailable.
 * On Linux, allows plaintext fallback if allowed by environment variable.
 */
export async function getOrInitVaultKey(): Promise<Buffer> {
  if (cachedVaultKey) return cachedVaultKey;

  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });

  let keyFileExists = false;
  try {
    await fs.access(KEY_FILE);
    keyFileExists = true;
  } catch {
    keyFileExists = false;
  }

  if (keyFileExists) {
    const raw = await fs.readFile(KEY_FILE, "utf-8");
    const envelope = JSON.parse(raw) as VaultKeyFileV1;
    keyId = envelope.keyId;

    if (envelope.wrappedWith === "electron.safeStorage") {
      if (!safeStorage.isEncryptionAvailable()) {
        if (process.platform === "win32" || process.platform === "darwin") {
          throw new Error("safeStorage is unavailable on Windows/macOS. Fail closed.");
        }
        const allowPlaintext = process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE === "true";
        if (!allowPlaintext) {
          throw new Error("safeStorage is unavailable on Linux and plaintext fallback is disabled.");
        }
        throw new Error("safeStorage is unavailable. Cannot decrypt key wrapped with safeStorage.");
      }
      const decryptedBase64 = safeStorage.decryptString(Buffer.from(envelope.wrappedKey, "base64"));
      cachedVaultKey = Buffer.from(decryptedBase64, "base64");
      return cachedVaultKey;
    } else if (envelope.wrappedWith as string === "plaintext") {
      if (process.platform === "win32" || process.platform === "darwin") {
        throw new Error("Plaintext key wrapping is prohibited on Windows/macOS.");
      }
      const allowPlaintext = process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE === "true";
      if (!allowPlaintext) {
        throw new Error("Plaintext fallback is disabled.");
      }
      cachedVaultKey = Buffer.from(envelope.wrappedKey, "base64");
      return cachedVaultKey;
    } else {
      throw new Error(`Unsupported key wrapper: ${envelope.wrappedWith}`);
    }
  } else {
    const newKey = crypto.randomBytes(32);
    keyId = "k_" + crypto.randomUUID();
    let payload: VaultKeyFileV1;

    if (safeStorage.isEncryptionAvailable()) {
      const wrapped = safeStorage.encryptString(newKey.toString("base64")).toString("base64");
      payload = {
        version: 1,
        keyId,
        wrappedKey: wrapped,
        wrappedWith: "electron.safeStorage",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      if (process.platform === "win32" || process.platform === "darwin") {
        throw new Error("safeStorage is unavailable on Windows/macOS. Fail closed.");
      }
      const allowPlaintext = process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE === "true";
      if (!allowPlaintext) {
        throw new Error("safeStorage is unavailable on Linux and plaintext fallback is disabled.");
      }
      payload = {
        version: 1,
        keyId,
        wrappedKey: newKey.toString("base64"),
        wrappedWith: "plaintext",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    await fs.writeFile(KEY_FILE, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
    cachedVaultKey = newKey;
    return cachedVaultKey;
  }
}

/**
 * Encrypts data with AES-256-GCM.
 */
export function encrypt(text: string, key: Buffer, fileType: string, id: string): EncryptedVaultFileV1 {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const aad = `venice-forge:vault:${fileType}:v1:${id}`;
  cipher.setAAD(Buffer.from(aad));

  let ciphertext = cipher.update(text, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    keyId,
    iv: iv.toString("base64"),
    authTag,
    ciphertext,
    aad,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Decrypts data with AES-256-GCM.
 */
export function decrypt(envelope: EncryptedVaultFileV1, key: Buffer, expectedFileType: string, expectedId: string): string {
  if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encryption envelope format or algorithm.");
  }
  const expectedAad = `venice-forge:vault:${expectedFileType}:v1:${expectedId}`;
  if (envelope.aad !== expectedAad) {
    throw new Error("Authenticated Additional Data (AAD) mismatch. Security verification failed.");
  }
  const iv = Buffer.from(envelope.iv, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(expectedAad));

  let decrypted = decipher.update(envelope.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Writes an encrypted file atomically (temp file + sync + rename).
 */
export async function writeEncryptedFile(filePath: string, text: string, fileType: string, id: string): Promise<void> {
  const key = await getOrInitVaultKey();
  const envelope = encrypt(text, key, fileType, id);
  const tempPath = `${filePath}.tmp-${crypto.randomUUID()}`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(envelope, null, 2), { encoding: "utf-8", mode: 0o600 });

  let filehandle: fs.FileHandle | null = null;
  try {
    filehandle = await fs.open(tempPath, "r+");
    await filehandle.sync();
  } catch (err) {
    logError("fsync failed for temp file", String(err));
  } finally {
    await filehandle?.close();
  }

  await fs.rename(tempPath, filePath);
}

/**
 * Reads and decrypts an encrypted file, supporting corruption backup.
 */
export async function readEncryptedFile(
  filePath: string,
  fileType: string,
  id: string,
  corruptRoot = CONVERSATIONS_DIR,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const envelope = JSON.parse(raw) as EncryptedVaultFileV1;
    const key = await getOrInitVaultKey();
    return decrypt(envelope, key, fileType, id);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    logError(`Decryption failed or file missing: ${filePath}`, String(err));
    // Corruption backup
    try {
      const corruptDir = path.join(corruptRoot, "corrupt");
      await fs.mkdir(corruptDir, { recursive: true });
      const filename = path.basename(filePath);
      const backupPath = path.join(corruptDir, `conv_corrupted_${Date.now()}_${filename}`);
      await fs.rename(filePath, backupPath);
      logInfo("Corrupt file backed up to corrupt/", backupPath);
    } catch (renameErr) {
      logError("Failed to rename corrupt file", String(renameErr));
    }
    return null;
  }
}

/**
 * Gets path for a conversation record.
 */
export function getRecordPath(id: string, createdAt: number, profileId = "default"): string {
  const date = new Date(createdAt);
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return path.join(getProfileConversationsDir(profileId), "records", year, month, `${id}.v1.json.enc`);
}

/**
 * Loads the manifest.
 */
export async function getOrLoadManifest(profileId = "default"): Promise<ManifestV1> {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  const cachedManifest = cachedManifests.get(profileId);
  if (cachedManifest) return cachedManifest;

  const profileRoot = getProfileConversationsDir(profileId);
  const decrypted = await readEncryptedFile(
    getManifestFile(profileId),
    "manifest",
    scopedEncryptionId(profileId, "global"),
    profileRoot,
  );
  if (decrypted) {
    try {
      const manifest = JSON.parse(decrypted) as ManifestV1;
      await applyManifestJournal(manifest, profileId);
      cachedManifests.set(profileId, manifest);
      return manifest;
    } catch {
      logError("Failed to parse manifest json.", "Resetting manifest.");
    }
  }

  const manifest: ManifestV1 = {
    version: 1,
    updatedAt: Date.now(),
    conversations: [],
  };
  await applyManifestJournal(manifest, profileId);
  cachedManifests.set(profileId, manifest);
  return manifest;
}

function applyManifestOperation(manifest: ManifestV1, operation: ManifestJournalOperationV1): void {
  manifest.updatedAt = Math.max(manifest.updatedAt, operation.updatedAt);

  if (operation.type === "upsert") {
    const existingIdx = manifest.conversations.findIndex((item) => item.id === operation.entry.id);
    if (existingIdx === -1) {
      manifest.conversations.push(operation.entry);
    } else {
      manifest.conversations[existingIdx] = operation.entry;
    }
    return;
  }

  manifest.conversations = manifest.conversations.filter((item) => item.id !== operation.id);
}

async function applyManifestJournal(manifest: ManifestV1, profileId: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(getManifestJournalFile(profileId), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  const key = await getOrInitVaultKey();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const journalLine = JSON.parse(trimmed) as ManifestJournalLineV1;
      if (journalLine.version !== 1 || typeof journalLine.entryId !== "string") {
        throw new Error("Unsupported manifest journal line");
      }
      const decryptedOperation = decrypt(
        journalLine.envelope,
        key,
        "manifest-journal",
        scopedEncryptionId(profileId, journalLine.entryId),
      );
      applyManifestOperation(manifest, JSON.parse(decryptedOperation) as ManifestJournalOperationV1);
    } catch (err) {
      logError("Failed to apply manifest journal line", String(err));
    }
  }
}

async function appendManifestOperation(operation: ManifestJournalOperationV1, profileId: string): Promise<void> {
  return writeQueue.enqueue(`${profileId}:manifest`, async () => {
    const key = await getOrInitVaultKey();
    const entryId = `journal_${crypto.randomUUID()}`;
    const envelope = encrypt(
      JSON.stringify(operation),
      key,
      "manifest-journal",
      scopedEncryptionId(profileId, entryId),
    );
    const line: ManifestJournalLineV1 = {
      version: 1,
      entryId,
      envelope,
    };

    const journalFile = getManifestJournalFile(profileId);
    await fs.mkdir(path.dirname(journalFile), { recursive: true });
    await fs.appendFile(journalFile, `${JSON.stringify(line)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
  });
}

/**
 * Saves the manifest.
 */
export async function saveManifest(manifest: ManifestV1, profileId = "default"): Promise<void> {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  cachedManifests.set(profileId, manifest);
  manifest.updatedAt = Date.now();
  return writeQueue.enqueue(`${profileId}:manifest`, async () => {
    await writeEncryptedFile(
      getManifestFile(profileId),
      JSON.stringify(manifest, null, 2),
      "manifest",
      scopedEncryptionId(profileId, "global"),
    );
    await fs.rm(getManifestJournalFile(profileId), { force: true }).catch(() => {});
  });
}

/**
 * Lists conversations with filter constraints.
 */
export async function listConversations(filter?: {
  archived?: boolean;
  pinned?: boolean;
  tags?: string[];
  model?: string;
  dateFrom?: number;
  dateTo?: number;
}, profileId = "default"): Promise<ConversationRecordV1[]> {
  const manifest = await getOrLoadManifest(profileId);
  let list = manifest.conversations;

  if (filter) {
    if (filter.archived !== undefined) {
      list = list.filter((c) => c.metadata.archived === filter.archived);
    }
    if (filter.pinned !== undefined) {
      list = list.filter((c) => c.metadata.pinned === filter.pinned);
    }
    if (filter.model !== undefined) {
      list = list.filter((c) => c.model === filter.model);
    }
    if (filter.dateFrom !== undefined) {
      list = list.filter((c) => c.createdAt >= filter.dateFrom!);
    }
    if (filter.dateTo !== undefined) {
      list = list.filter((c) => c.createdAt <= filter.dateTo!);
    }
    if (filter.tags && filter.tags.length > 0) {
      list = list.filter((c) =>
        filter.tags!.every((t) => c.metadata.tags.includes(t))
      );
    }
  }

  // Sort descending by updatedAt
  list.sort((a, b) => b.updatedAt - a.updatedAt);

  // Return full record representations by loading their decrypted records
  const loaded = await Promise.all(
    list.map(async (c) => {
      const record = await getConversation(c.id, profileId);
      if (record) return record;

      // Fallback placeholder if record file is missing/corrupted
      return {
        version: 1,
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        model: c.model,
        systemPrompt: c.systemPrompt,
        messages: [],
        metadata: {
          tags: c.metadata.tags,
          pinned: c.metadata.pinned,
          archived: c.metadata.archived,
          source: c.metadata.source as ConversationSource,
          messageCount: c.metadata.messageCount,
        },
        memory: {
          summary: c.memory.summary,
          topics: c.memory.topics,
          entities: c.memory.entities,
          userFacts: [],
          projectRefs: c.memory.projectRefs,
        },
      } as ConversationRecordV1;
    })
  );

  return loaded;
}

/**
 * Gets a single conversation by ID.
 */
export async function getConversation(id: string, profileId = "default"): Promise<ConversationRecordV1 | null> {
  if (!isValidConversationId(id) || !isValidProfileStorageId(profileId)) return null;

  const manifest = await getOrLoadManifest(profileId);
  const c = manifest.conversations.find((item) => item.id === id);
  if (!c) return null;

  const recordPath = getRecordPath(id, c.createdAt, profileId);
  assertWithinConversationsDir(recordPath, profileId);
  const decrypted = await readEncryptedFile(
    recordPath,
    "conversation-record",
    scopedEncryptionId(profileId, id),
    getProfileConversationsDir(profileId),
  );
  if (!decrypted) return null;

  try {
    return JSON.parse(decrypted) as ConversationRecordV1;
  } catch {
    return null;
  }
}

/**
 * Saves a conversation record securely.
 */
export async function saveConversation(
  record: ConversationRecordV1,
  profileId = "default",
): Promise<{ ok: boolean; id: string; error?: string }> {
  // Validate record schema basics
  if (!record || typeof record !== "object" || record.version !== 1 || !record.id) {
    return { ok: false, id: record?.id, error: "Invalid conversation record" };
  }
  if (!isValidConversationId(record.id)) {
    return { ok: false, id: record.id, error: "Invalid conversation id" };
  }
  if (!isValidProfileStorageId(profileId)) {
    return { ok: false, id: record.id, error: "Invalid profile id" };
  }

  return writeQueue.enqueue(`${profileId}:${record.id}`, async () => {
    try {
      const recordPath = getRecordPath(record.id, record.createdAt, profileId);
      assertWithinConversationsDir(recordPath, profileId);
      await writeEncryptedFile(
        recordPath,
        JSON.stringify(record, null, 2),
        "conversation-record",
        scopedEncryptionId(profileId, record.id),
      );

      // Update manifest
      const manifest = await getOrLoadManifest(profileId);
      const existingIdx = manifest.conversations.findIndex((c) => c.id === record.id);
      const manifestEntry: ManifestConversationV1 = {
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        model: record.model,
        systemPrompt: record.systemPrompt,
        metadata: {
          tags: record.metadata.tags || [],
          pinned: !!record.metadata.pinned,
          archived: !!record.metadata.archived,
          source: record.metadata.source || "chat",
          messageCount: record.messages.length,
          tokenEstimate: record.metadata.tokenEstimate,
          lastSummaryAt: record.metadata.lastSummaryAt,
          migratedFrom: record.metadata.migratedFrom,
        },
        memory: {
          summary: record.memory?.summary || "",
          topics: record.memory?.topics || [],
          entities: record.memory?.entities || [],
          projectRefs: record.memory?.projectRefs || [],
        },
      };

      const manifestUpdatedAt = Date.now();
      if (existingIdx !== -1) {
        manifest.conversations[existingIdx] = manifestEntry;
      } else {
        manifest.conversations.push(manifestEntry);
      }
      manifest.updatedAt = manifestUpdatedAt;

      await appendManifestOperation({
        type: "upsert",
        updatedAt: manifestUpdatedAt,
        entry: manifestEntry,
      }, profileId);

      // Trigger index update in memoryPuller
      const { updateIndexForRecord } = await import("./memoryPuller");
      await updateIndexForRecord(record, profileId);

      return { ok: true, id: record.id };
    } catch (err) {
      return { ok: false, id: record.id, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/**
 * Deletes a conversation record and its attachments.
 */
export async function deleteConversation(id: string, profileId = "default"): Promise<{ ok: boolean; error?: string }> {
  if (!isValidConversationId(id)) {
    return { ok: false, error: "Invalid conversation id" };
  }
  if (!isValidProfileStorageId(profileId)) return { ok: false, error: "Invalid profile id" };

  const manifest = await getOrLoadManifest(profileId);
  const c = manifest.conversations.find((item) => item.id === id);
  if (!c) return { ok: false, error: "Conversation not found" };

  return writeQueue.enqueue(`${profileId}:${id}`, async () => {
    try {
      const recordPath = getRecordPath(id, c.createdAt, profileId);
      assertWithinConversationsDir(recordPath, profileId);
      await fs.unlink(recordPath).catch(() => {});

      // Delete attachments folder
      const attachmentsDir = path.join(getProfileConversationsDir(profileId), "attachments", `conv_${id}`);
      await fs.rm(attachmentsDir, { recursive: true, force: true }).catch(() => {});

      // Remove from manifest
      const manifestUpdatedAt = Date.now();
      manifest.conversations = manifest.conversations.filter((item) => item.id !== id);
      manifest.updatedAt = manifestUpdatedAt;
      await appendManifestOperation({
        type: "delete",
        updatedAt: manifestUpdatedAt,
        id,
      }, profileId);

      // Remove from index
      const { removeRecordFromIndex } = await import("./memoryPuller");
      await removeRecordFromIndex(id, profileId);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/**
 * Archives a conversation record.
 */
export async function archiveConversation(id: string, profileId = "default"): Promise<{ ok: boolean; error?: string }> {
  const record = await getConversation(id, profileId);
  if (!record) return { ok: false, error: "Conversation not found" };

  record.metadata.archived = !record.metadata.archived;
  record.updatedAt = Date.now();

  const res = await saveConversation(record, profileId);
  return { ok: res.ok, error: res.error };
}

/**
 * Resets/Clears cached in-memory key and manifest (useful for test isolation).
 */
export function _resetVaultCache_TEST_ONLY(): void {
  cachedVaultKey = null;
  cachedManifests.clear();
}
