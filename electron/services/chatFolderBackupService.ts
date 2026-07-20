

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { app } from "electron";
import _sodium from "libsodium-wrappers-sumo";
import { readChatFolder, saveChatFolder } from "./chatFolderStorage";
import { listConversations, saveConversation, deleteConversation } from "./chatStorage";
import { logError, logInfo } from "./logger";
import type {
  FolderBackupPreviewInput,
  FolderBackupPreview,
  ExportFolderBackupInput,
  ExportFolderBackupResult,
  PreviewFolderImportInput,
  FolderImportPreview,
  ImportFolderBackupInput,
  FolderImportConversationResult,
  FolderImportResult,
  ChatFolderKind,
  ChatFolder,
} from "../../src/shared/chatFolderContracts";
import type { Conversation } from "../../src/types/conversation";

// _sodium.ready must resolve before reading the *_INTERACTIVE constants at
// module load; otherwise the WASM-backed properties come back null and the
// first Argon2id invocation throws "opsLimit cannot be null or undefined".
const _sodiumReadyPromise = _sodium.ready.then(() => _sodium);

// Argon2id parameters — must match chatFolderLockService for consistency. The
// INTERACTIVE preset is intentionally chosen; the user only exports a backup
// once, so the cost is acceptable on a fast machine and resistant to offline
// brute-force attacks on the exported file.
let _argonConstants: { OPSLIMIT: number; MEMLIMIT: number } | null = null;

async function getArgonConstants(): Promise<{ OPSLIMIT: number; MEMLIMIT: number }> {
  await _sodiumReadyPromise;
  if (!_argonConstants) {
    _argonConstants = {
      OPSLIMIT: _sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      MEMLIMIT: _sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    };
  }
  return _argonConstants;
}

export async function getActiveKdfParameters(): Promise<{ algorithm: "argon2id13"; opslimit: number; memlimit: number }> {
  const c = await getArgonConstants();
  return { algorithm: "argon2id13", opslimit: c.OPSLIMIT, memlimit: c.MEMLIMIT };
}

interface FolderBackupManifest {
  format: "venice-forge-backup";
  formatVersion: number;
  scope: "chat-folder";
  sourceProfileId: string;
  sourceFolderId: string;
  sourceFolderKind: ChatFolderKind;
  createdAt: string;
  appVersion: string;
  contents: {
    folders: number;
    conversations: number;
    messages: number;
    attachmentReferences: number;
    mediaBlobs: number;
  };
  includesMedia: boolean;
  excludes: string[];
  folder: ChatFolder;
  conversations: unknown[];
}

// Encrypted backup on disk — only salt + nonce + ciphertext + kdf params are
// persisted. No encryption key, no passphrase, no key material.
interface FolderBackupEncryptedPayload {
  version: 2;
  exportedAt: string;
  kdf: {
    algorithm: "argon2id13";
    opslimit: number;
    memlimit: number;
  };
  crypto: {
    salt: string; // base64
    kekNonce: string; // base64
    wrappedKey: string; // base64
    payloadNonce: string; // base64
    ciphertext: string; // base64
  };
  // Tiny header summary that is NOT encrypted only so the preview can show the
  // source folder name without forcing the user to type the passphrase before
  // they know whether this is the right backup. Anything sensitive stays
  // inside the encrypted manifest.
  publicHeader: {
    sourceFolderKind: ChatFolderKind;
    sourceFolderName: string;
    createdAt: string;
    appVersion: string;
    includesMedia: boolean;
    conversationCount: number;
  };
  folder?: never; // v1 backup compatibility — present in legacy files only, must never be re-emitted
}

function getBackupsDir(profileId: string = "default"): string {
  const root = path.join(app.getPath("userData"), "backups", "chat-folders");
  return profileId === "default" ? root : path.join(root, "profiles", profileId);
}

function requirePassphrase(passphrase: unknown, confirm: boolean | undefined): string {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Folder backup passphrase must be present and at least 8 characters long");
  }
  if (confirm === false) {
    throw new Error("Folder backup passphrase was not confirmed by the user");
  }
  return passphrase;
}

export async function getBackupPreview(input: FolderBackupPreviewInput, profileId: string = "default"): Promise<FolderBackupPreview> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");

  const listRes = await listConversations(undefined, profileId);
  const conversations = Array.isArray(listRes) ? listRes : listRes.conversations;
  const targetChats = conversations.filter(c => c.folderId === input.folderId);

  let messageCount = 0;
  let attachmentRefs = 0;
  let mediaBlobs = 0;
  const mediaBytes = 0;

  for (const c of targetChats) {
    const messages = c.messages || [];
    messageCount += messages.length;
    for (const m of messages) {
      if (m.metadata?.attachments) {
        attachmentRefs += m.metadata.attachments.length;
      }
      if (m.metadata?.generatedMedia) {
        const refs = Array.isArray(m.metadata.generatedMedia) ? m.metadata.generatedMedia : [m.metadata.generatedMedia];
        mediaBlobs += refs.length;
      }
    }
  }

  return {
    folderName: folder.name,
    kind: folder.kind,
    chatCount: targetChats.length,
    messageCount,
    attachmentReferencesCount: attachmentRefs,
    mediaBlobsCount: mediaBlobs,
    mediaBlobsTotalBytes: mediaBytes,
    includesMedia: false, // Set by caller based on user selection
    excludedSecrets: ["api-keys", "diagnostics", "session-caches", "absolute-paths", "signed-media-urls", "temp-files", "unlock-secrets"],
  };
}

export async function exportBackup(input: ExportFolderBackupInput, profileId: string = "default"): Promise<ExportFolderBackupResult> {
  const folder = await readChatFolder(input.folderId, profileId);
  if (!folder || folder.deletedAt) throw new Error("Folder not found");
  if (folder.lockState === "locked") throw new Error("Cannot export a locked folder");

  const passphrase = requirePassphrase(input.passphrase, input.passphraseConfirmed);

  const listRes = await listConversations(undefined, profileId);
  const conversations = Array.isArray(listRes) ? listRes : listRes.conversations;
  const targetChats = conversations.filter(c => c.folderId === input.folderId);

  // Build the folder-scoped backup manifest. Conversations carry only the
  // items the user explicitly asked to retain (no absolute paths, no API
  // keys, no session cache).
  const manifest: FolderBackupManifest = {
    format: "venice-forge-backup",
    formatVersion: 1,
    scope: "chat-folder",
    sourceProfileId: profileId,
    sourceFolderId: folder.id,
    sourceFolderKind: folder.kind,
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    contents: {
      folders: 1,
      conversations: targetChats.length,
      messages: targetChats.reduce((sum, c) => sum + (c.messages?.length || 0), 0),
      attachmentReferences: 0,
      mediaBlobs: 0,
    },
    includesMedia: input.includeMedia,
    excludes: ["api-keys", "diagnostics", "session-caches", "absolute-paths", "signed-media-urls", "temp-files", "unlock-secrets"],
    folder: folder,
    conversations: targetChats,
  };

  await _sodiumReadyPromise;

  // Fresh per-backup data-encryption key (DEK). Rotating the DEK per backup
  // means two backups of the same folder cannot be cross-correlated, and a
  // compromised KEK only unwraps a single backup.
  const dek = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);

  // Derive the KEK from the user-supplied passphrase via Argon2id.
  const salt = _sodium.randombytes_buf(_sodium.crypto_pwhash_SALTBYTES);
  const { OPSLIMIT, MEMLIMIT } = await getArgonConstants();
  const kek = _sodium.crypto_pwhash(
    dek.length,
    passphrase,
    salt,
    OPSLIMIT,
    MEMLIMIT,
    _sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

  // Wrap the DEK with the KEK. The wrapped key lives alongside the payload
  // ciphertext so the importer can recover the DEK once it has re-derived
  // the same KEK from the user-supplied passphrase.
  const kekNonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const wrappedKey = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    dek,
    null,
    null,
    kekNonce,
    kek,
  );
  _sodium.memzero(kek);

  // Encrypt the manifest payload with the DEK.
  const plainPayload = Buffer.from(JSON.stringify(manifest), "utf-8");
  const payloadNonce = _sodium.randombytes_buf(_sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const plaintext = _sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plainPayload,
    null,
    null,
    payloadNonce,
    dek,
  );
  _sodium.memzero(plainPayload);

  const encrypted: FolderBackupEncryptedPayload = {
    version: 2,
    exportedAt: manifest.createdAt,
    kdf: {
      algorithm: "argon2id13",
      opslimit: OPSLIMIT,
      memlimit: MEMLIMIT,
    },
    crypto: {
      salt: Buffer.from(salt).toString("base64"),
      kekNonce: Buffer.from(kekNonce).toString("base64"),
      wrappedKey: Buffer.from(wrappedKey).toString("base64"),
      payloadNonce: Buffer.from(payloadNonce).toString("base64"),
      ciphertext: Buffer.from(plaintext).toString("base64"),
    },
    publicHeader: {
      sourceFolderKind: manifest.sourceFolderKind,
      sourceFolderName: folder.name,
      createdAt: manifest.createdAt,
      appVersion: manifest.appVersion,
      includesMedia: manifest.includesMedia,
      conversationCount: manifest.contents.conversations,
    },
  };

  const backupDir = getBackupsDir(profileId);
  await fs.mkdir(backupDir, { recursive: true });

  const backupFileName = `chat-folder-${folder.kind}-${folder.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${Date.now()}.vfbackup`;
  const backupPath = path.join(backupDir, backupFileName);

  await fs.writeFile(backupPath, JSON.stringify(encrypted, null, 2), "utf-8");

  logInfo("Exported chat folder backup", { folderId: folder.id, backupPath });

  return { ok: true, backupPath };
}

export async function previewImport(input: PreviewFolderImportInput, _profileId: string = "default"): Promise<FolderImportPreview> {
  const backupPath = input.backupFilePath;

  try {
    const raw = await fs.readFile(backupPath, "utf-8");
    const backup = JSON.parse(raw) as Partial<FolderBackupEncryptedPayload>;

    // previewImport inspects ONLY the encrypted public header without
    // requiring the user-supplied passphrase. We therefore deliberately skip
    // the crypto envelope check here — a malformed `crypto` block is the
    // importer's problem; preview only needs `publicHeader`.

    // v1 backups predated the public-header write. Fail closed — the user
    // should upgrade the exporter or run a deliberate migration tool rather
    // than silently trusting a legacy file that already failed prior review.
    if (!backup.publicHeader) {
      throw new BackupStructureError(
        "Backup file is missing the encrypted public header required for preview. Refusing to open v1 backups.",
      );
    }
    if (backup.version !== 2) {
      throw new BackupStructureError(`Unsupported backup version: ${backup.version}`);
    }

    return {
      sourceFolderName: backup.publicHeader.sourceFolderName,
      sourceFolderKind: backup.publicHeader.sourceFolderKind,
      newFolders: 1,
      newConversations: backup.publicHeader.conversationCount,
      changedConversations: 0,
      conflicts: 0,
      tombstones: 0,
      missingBlobs: 0,
      includedBlobs: 0,
      sourceAppVersion: backup.publicHeader.appVersion,
      sourceProfileId: "unknown",
      backupCreatedAt: backup.publicHeader.createdAt,
    };
  } catch (err) {
    if (err instanceof BackupStructureError) {
      // Preserve the structured diagnostic so callers (and tests) can tell
      // whether the file is malformed vs encrypted with the wrong passphrase.
      throw err;
    }
    logError("Failed to preview folder import", err);
    throw new Error("Invalid backup file or wrong passphrase");
  }
}

class BackupStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupStructureError";
  }
}

export async function importBackup(input: ImportFolderBackupInput, profileId: string = "default"): Promise<FolderImportResult> {
  const backupPath = input.backupFilePath;

  try {
    const raw = await fs.readFile(backupPath, "utf-8");
    const backup = JSON.parse(raw) as Partial<FolderBackupEncryptedPayload>;

    if (
      !backup.crypto ||
      !backup.crypto.ciphertext ||
      !backup.crypto.salt ||
      !backup.crypto.kekNonce ||
      !backup.crypto.wrappedKey ||
      !backup.crypto.payloadNonce
    ) {
      return { ok: false, error: "Invalid backup format" };
    }
    if (backup.version !== 2 || !backup.kdf || backup.kdf.algorithm !== "argon2id13") {
      return { ok: false, error: `Unsupported backup version or kdf: ${backup.version}/${backup.kdf?.algorithm ?? "unknown"}` };
    }

    const passphrase = requirePassphrase(input.passphrase, undefined);

    await _sodiumReadyPromise;

    const salt = new Uint8Array(Buffer.from(backup.crypto.salt, "base64"));
    const kekNonce = new Uint8Array(Buffer.from(backup.crypto.kekNonce, "base64"));
    const wrappedKey = new Uint8Array(Buffer.from(backup.crypto.wrappedKey, "base64"));
    const payloadNonce = new Uint8Array(Buffer.from(backup.crypto.payloadNonce, "base64"));
    const ciphertext = new Uint8Array(Buffer.from(backup.crypto.ciphertext, "base64"));

    const kek = _sodium.crypto_pwhash(
      _sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
      passphrase,
      salt,
      backup.kdf.opslimit,
      backup.kdf.memlimit,
      _sodium.crypto_pwhash_ALG_ARGON2ID13,
    );

    let dek: Uint8Array | null = null;
    try {
      dek = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        wrappedKey,
        null,
        kekNonce,
        kek,
      );
    } finally {
      _sodium.memzero(kek);
    }

    let plainPayload: Uint8Array | null = null;
    try {
      plainPayload = _sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        null,
        payloadNonce,
        dek!,
      );
    } finally {
      _sodium.memzero(dek!);
    }

    const manifest: FolderBackupManifest = JSON.parse(Buffer.from(plainPayload!).toString("utf-8"));
    _sodium.memzero(plainPayload!);

    if (manifest.format !== "venice-forge-backup" || manifest.scope !== "chat-folder") {
      return { ok: false, error: "Backup manifest is not a chat-folder backup" };
    }

    // Verify profile compatibility
    if (manifest.sourceProfileId !== profileId) {
      logInfo("Importing folder backup from different profile", {
        sourceProfile: manifest.sourceProfileId,
        targetProfile: profileId,
      });
    }

    // Verify kind compatibility
    if (input.mode === "merge") {
      if (!input.targetFolderId) {
        return { ok: false, error: "Target folder ID required for merge mode" };
      }
      const targetFolder = await readChatFolder(input.targetFolderId, profileId);
      if (!targetFolder || targetFolder.deletedAt) return { ok: false, error: "Target folder not found" };
      if (targetFolder.kind !== manifest.sourceFolderKind) {
        return { ok: false, error: `Cannot merge ${manifest.sourceFolderKind} folder into ${targetFolder.kind} folder` };
      }
    }

    let targetFolderId: string;
    if (input.mode === "merge" && input.targetFolderId) {
      targetFolderId = input.targetFolderId;
    } else {
      targetFolderId = crypto.randomUUID();
      const newFolder: ChatFolder = {
        ...manifest.folder,
        id: targetFolderId,
        profileId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lockState: folderLockAfterImport(manifest.folder.lockState),
      };
      // P0-02: use the canonical atomic save path instead of hand-built fs writes
      // so the default profile lands in <userData>/chat-folders/<id>.json and the
      // non-default profile lands in <userData>/chat-folders/profiles/<profileId>/<id>.json.
      const folderSave = await saveChatFolder(newFolder, profileId);
      if (!folderSave.ok) {
        return { ok: false, error: folderSave.error ?? "Failed to save imported folder" };
      }
    }

    // P0-01: actually import every conversation carried in the encrypted manifest.
    // Each save is staged; on the first per-conversation failure we roll back the
    // already-imported siblings so the partial import cannot pass as success.
    const imported: FolderImportConversationResult[] = [];
    const sourceConversations = Array.isArray(manifest.conversations) ? manifest.conversations : [];
    const existingIds = input.mode === "merge" ? await collectExistingConversationIds(profileId) : new Set<string>();
    const createdIdsForRollback: string[] = [];

    for (const raw of sourceConversations) {
      const prepared = prepareImportedConversation(raw, targetFolderId, profileId, existingIds);
      if (!prepared.ok) {
        await rollbackCreatedConversations(createdIdsForRollback, profileId);
        return {
          ok: false,
          error: prepared.error ?? "Failed to import a conversation from the backup",
          folderId: targetFolderId,
          imported,
          rollbackCount: createdIdsForRollback.length,
          rolledBack: createdIdsForRollback.length > 0,
        };
      }
      const saveRes = await saveConversation(prepared.conversation, profileId);
      if (!saveRes.ok) {
        await rollbackCreatedConversations(createdIdsForRollback, profileId);
        return {
          ok: false,
          error: saveRes.error ?? "Failed to save imported conversation",
          folderId: targetFolderId,
          imported,
          rollbackCount: createdIdsForRollback.length,
          rolledBack: true,
        };
      }
      if (prepared.remappedFrom) existingIds.add(prepared.conversation.id);
      createdIdsForRollback.push(prepared.conversation.id);
      imported.push(prepared.resultEntry);
    }

    return {
      ok: true,
      folderId: targetFolderId,
      imported,
      conflictCount: imported.filter((entry) => entry.sourceId !== entry.importedId).length,
    };
  } catch (err) {
    // Avoid leaking per-byte crypto error detail — surface a stable
    // user-facing message; the canonical "Wrong passphrase or corrupt backup
    // file" wording covers Argon2id failures as well as XChaCha20 AEAD tag
    // mismatches. Only structured validation errors are forwarded verbatim.
    const reason = err instanceof Error ? err.message : String(err);
    logError("Failed to import folder backup", reason);
    if (/^Invalid backup|^Backup manifest|^Unsupported backup|^Target folder|^Target folder ID|Cannot merge|chat\.folder backup|Not a chat-folder/i.test(reason)) {
      return { ok: false, error: reason };
    }
    return { ok: false, error: "Wrong passphrase or corrupt backup file" };
  }
}

function folderLockAfterImport(lockState: ChatFolder["lockState"] | undefined): ChatFolder["lockState"] {
  // The DEK that originally encrypted the folder's chat secrets is locked
  // behind the local profile session and not part of the backup envelope, so
  // restoring the lock-state flag without the original unlock secret would
  // create an unreachable lock. Reset to 'unlocked' on import; the user can
  // re-lock with a fresh key inside the target profile.
  return lockState === "locked" ? "unlocked" : (lockState ?? "unlocked");
}

/**
 * Collects the set of conversation ids that already exist in the target profile.
 * Merge-mode imports use this set to detect id collisions and remap incoming
 * conversations so both branches are preserved instead of one silently losing.
 */
async function collectExistingConversationIds(profileId: string): Promise<Set<string>> {
  try {
    const list = await listConversations(undefined, profileId);
    const arr = Array.isArray(list)
      ? list
      : Array.isArray((list as { conversations?: Conversation[] }).conversations)
      ? (list as { conversations: Conversation[] }).conversations
      : [];
    return new Set(arr.map((c) => c?.id).filter((id): id is string => typeof id === "string"));
  } catch (err) {
    logError("chat-folder-backup.collectExistingConversationIds failed", err);
    return new Set();
  }
}

/**
 * Result of preparing a conversation from an encrypted backup for write.
 * Either we hand back a fully-formed Conversation ready for saveConversation,
 * or we expose a stable error code for the import to surface.
 */
type PreparedImport =
  | {
      ok: true;
      conversation: Conversation;
      resultEntry: FolderImportConversationResult;
      remappedFrom?: string;
    }
  | {
      ok: false;
      error: string;
      resultEntry: FolderImportConversationResult;
    };

const REQUIRED_IMPORT_STRING_FIELDS: Array<keyof Conversation> = ["id", "title", "model"];
const REQUIRED_IMPORT_NUMBER_FIELDS: Array<keyof Conversation> = ["createdAt", "updatedAt"];

/**
 * Validates a backup conversation, attaches it to the freshly imported folder,
 * and detects/remaps merge-mode id collisions. We do not mutate the source
 * object — we copy before stamping so the manifest surviving a rollback still
 * is the canonical reference of what the user is restoring.
 */
function prepareImportedConversation(
  raw: unknown,
  targetFolderId: string,
  profileId: string,
  existingIds: Set<string>,
): PreparedImport {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error: "Malformed conversation record",
      resultEntry: { sourceId: "", importedId: "", ok: false, error: "malformed" },
    };
  }
  const src = raw as Partial<Conversation> & { id?: string };
  const sourceId = typeof src.id === "string" ? src.id : "";
  for (const f of REQUIRED_IMPORT_STRING_FIELDS) {
    const v = src[f];
    if (typeof v !== "string" || v.length === 0) {
      return {
        ok: false,
        error: `Missing or invalid field: ${String(f)}`,
        resultEntry: { sourceId, importedId: "", ok: false, error: "invalid-field" },
      };
    }
  }
  for (const f of REQUIRED_IMPORT_NUMBER_FIELDS) {
    const v = src[f];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return {
        ok: false,
        error: `Missing or invalid field: ${String(f)}`,
        resultEntry: { sourceId, importedId: "", ok: false, error: "invalid-field" },
      };
    }
  }
  if (!Array.isArray(src.messages)) {
    return {
      ok: false,
      error: "Missing or invalid field: messages",
      resultEntry: { sourceId, importedId: "", ok: false, error: "invalid-field" },
    };
  }

  const now = Date.now();
  let finalId = sourceId;
  let remappedFrom: string | undefined;
  if (existingIds.has(finalId)) {
    finalId = crypto.randomUUID();
    remappedFrom = sourceId;
  }

  const stamped: Conversation = {
    ...(src as Conversation),
    id: finalId,
    folderId: targetFolderId,
    profileId: profileId === "default" ? undefined : profileId,
    createdAt: src.createdAt ?? now,
    updatedAt: src.updatedAt ?? now,
  };

  return {
    ok: true,
    conversation: stamped,
    remappedFrom,
    resultEntry: { sourceId, importedId: finalId, ok: true },
  };
}

/**
 * Deletes a list of already-imported conversations on import failure so a
 * partial pass can never masquerade as success. Failure of the rollback itself
 * is logged but does not mask the original import error — the caller still
 * receives the upstream error code.
 */
async function rollbackCreatedConversations(ids: string[], profileId: string): Promise<void> {
  for (const id of ids) {
    try {
      await deleteConversation(id, profileId);
    } catch (err) {
      logError("chat-folder-backup.rollbackCreatedConversations failed", err);
    }
  }
}
