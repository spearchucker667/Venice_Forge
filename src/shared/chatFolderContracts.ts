export type ChatFolderKind = "standard" | "character";

export interface ChatFolder {
  id: string;
  profileId: string;
  kind: ChatFolderKind;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  lockState: "unlocked" | "locked";
  lockedAt?: string | null;
  lockVersion?: number;
  schemaVersion: number;
}

export interface CreateChatFolderInput {
  name: string;
  kind: ChatFolderKind;
}

export interface RenameChatFolderInput {
  folderId: string;
  name: string;
}

export interface ReorderChatFoldersInput {
  folderIds: string[];
  kind: ChatFolderKind;
}

export interface MoveConversationToFolderInput {
  conversationId: string;
  folderId: string | null; // null means Unfiled
}

export interface MoveConversationsToFolderInput {
  conversationIds: string[];
  folderId: string | null; // null means Unfiled
}

export interface ChatFolderMutationResult {
  committedIds: string[];
  rolledBack: boolean;
  recoveryRequired?: boolean;
}

export interface DeleteChatFolderInput {
  folderId: string;
  deleteConversations: boolean;
}

export interface LockFolderInput {
  folderId: string;
  passphrase: string;
  rememberOnDevice?: boolean;
}

export interface UnlockFolderInput {
  folderId: string;
  passphrase?: string;
  useRememberedUnlock?: boolean;
}

export interface FolderLockState {
  folderId: string;
  locked: boolean;
  rememberedUnlockAvailable: boolean;
  failedAttempts: number;
  retryAfter?: string;
}

export interface FolderBackupPreviewInput {
  folderId: string;
}

export interface FolderBackupPreview {
  folderName: string;
  kind: ChatFolderKind;
  chatCount: number;
  messageCount: number;
  attachmentReferencesCount: number;
  mediaBlobsCount: number;
  mediaBlobsTotalBytes: number;
  includesMedia: boolean;
  excludedSecrets: string[];
}

export interface ExportFolderBackupInput {
  folderId: string;
  includeMedia: boolean;
  /**
   * User-supplied passphrase used to derive the Argon2id KEK that wraps the
   * random folder-level data-encryption key. The passphrase is never written
   * to the backup file in any form. The caller is responsible for surfacing a
   * confirmation dialog so the user records the passphrase offline before
   * disposing of the export.
   */
  passphrase: string;
  /**
   * Optional confirmation token returned by the renderer-side "this is the
   * passphrase I want to use" dialog. The token is checked against the
   * server-side confirmation store to ensure the user actually re-typed the
   * passphrase after seeing it. Defaults to true for backward compatibility
   * when no confirmation UI exists yet; production UI must require explicit
   * confirmation.
   */
  passphraseConfirmed?: boolean;
}

export interface ExportFolderBackupResult {
  ok: boolean;
  error?: string;
  /** Neutral basename only. Absolute paths never cross into the renderer. */
  fileName?: string;
  canceled?: boolean;
}

export interface PreviewFolderImportInput {
  /** Opaque, short-lived capability issued by the native file picker. */
  fileCapability: string;
}

export interface PickFolderImportFileResult {
  ok: boolean;
  fileCapability?: string;
  fileName?: string;
  byteCount?: number;
  canceled?: boolean;
  error?: string;
}

export interface FolderImportPreview {
  sourceFolderName: string;
  sourceFolderKind: ChatFolderKind;
  newFolders: number;
  newConversations: number;
  changedConversations: number;
  conflicts: number;
  tombstones: number;
  missingBlobs: number;
  includedBlobs: number;
  sourceAppVersion: string;
  sourceProfileId: string;
  backupCreatedAt: string;
}

export interface ImportFolderBackupInput {
  /** Opaque, one-time capability issued by the native file picker. */
  fileCapability: string;
  mode: "new-folder" | "merge";
  /**
   * User-supplied passphrase that was used when exporting this backup. Never
   * persisted by the importer — required strictly to derive the KEK and
   * unwrap the data-encryption key from the backup header.
   */
  passphrase: string;
  targetFolderId?: string; // required if mode is merge
}

export interface FolderImportConversationResult {
  /** Source conversation id from the encrypted manifest. */
  sourceId: string;
  /** Final on-disk conversation id (may be remapped on merge conflicts). */
  importedId: string;
  /** True when the saveConversation call succeeded. */
  ok: boolean;
  /** Stable error code when `ok` is false; never raw message text. */
  error?: string;
}

export interface FolderImportResult {
  ok: boolean;
  error?: string;
  folderId?: string;
  /** Per-conversation import results — empty array if no conversations were carried. */
  imported?: FolderImportConversationResult[];
  /** Number of source conversations that conflicted with an existing local one. */
  conflictCount?: number;
  /** Number of imported conversations whose save failed and were rolled back. */
  rollbackCount?: number;
  /** True when a rollback occurred; the folder itself is preserved. */
  rolledBack?: boolean;
}
