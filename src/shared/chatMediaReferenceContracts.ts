/** @fileoverview Canonical ChatMediaReference contract shared across renderer + main
 *  boundaries (work-order § "Shared Type and IPC Contract Requirements", Phase 6 row).
 *  Phase 6 widens `ChatMediaReference` from a thin `{mediaId, mimeType, width, height}`
 *  to a full schema, and this file is the canonical home for the TypeScript types
 *  + runtime predicates. The renderer-side schemas in
 *  `src/types/conversationVault.ts` and `src/types/conversation.ts` are
 *  thin re-exports of this contract so shared/preload/handler/service/input/output
 *  never disagree. */

export type ChatMediaType = "image" | "video" | "audio";
export type ChatMediaOperation = "generate" | "edit" | "upscale" | "transcribe" | "audio";

export const CHAT_MEDIA_TYPES: ReadonlyArray<ChatMediaType> = ["image", "video", "audio"];

export const CHAT_MEDIA_OPERATIONS: ReadonlyArray<ChatMediaOperation> = [
  "generate",
  "edit",
  "upscale",
  "transcribe",
  "audio",
];

/** `^[a-zA-Z0-9_.-]{1,128}$` — matches the vault `VALID_ID_RE` so renderer + main
 *  agree on the id grammar and concatenation is safe across boundaries. */
export const CHAT_MEDIA_REF_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

export const CHAT_MEDIA_MEDIA_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

/** Canonical wire shape. New fields MUST be appended (not reordered) to keep
 *  serialized JSON backward-compatible with prior renderer builds.
 *  Note: `createdAt` and `deletedFromChatAt` are millisecond epoch numbers
 *  (same convention as the renderer-side `ChatMediaReference`). */
export interface ChatMediaReferenceContract {
  id: string;
  mediaId: string;
  mediaType: ChatMediaType;
  operation: ChatMediaOperation;
  displayUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  modelId?: string;
  createdAt: number; // millisecond epoch
  deletedFromChatAt?: number | null;
  orphanedFromChat?: boolean;
}

export interface CreateChatMediaReferenceInputContract {
  /** Optional override; otherwise a deterministic id is generated. */
  id?: string;
  mediaId: string;
  mediaType: ChatMediaType;
  operation: ChatMediaOperation;
  displayUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  modelId?: string;
  createdAt?: number; // defaults to Date.now()
}

export const MAX_CHAT_MEDIA_REF_FIELDS = 11;

const fieldCount = (record: Record<string, unknown>): number => {
  let n = 0;
  for (const k in record) {
    if (Object.prototype.hasOwnProperty.call(record, k)) n += 1;
  }
  return n;
};

export const isChatMediaReferenceContract = (value: unknown): value is ChatMediaReferenceContract => {
  if (typeof value !== "object" || value == null) return false;
  const r = value as Record<string, unknown>;
  if (fieldCount(r) > MAX_CHAT_MEDIA_REF_FIELDS) return false;
  if (typeof r.id !== "string" || !CHAT_MEDIA_REF_ID_RE.test(r.id)) return false;
  if (typeof r.mediaId !== "string" || !CHAT_MEDIA_MEDIA_ID_RE.test(r.mediaId)) return false;
  if (typeof r.mediaType !== "string" || !CHAT_MEDIA_TYPES.includes(r.mediaType as ChatMediaType)) return false;
  if (typeof r.operation !== "string" || !CHAT_MEDIA_OPERATIONS.includes(r.operation as ChatMediaOperation)) return false;
  if (typeof r.displayUrl !== "string" || r.displayUrl.length === 0 || r.displayUrl.length > 4096) return false;
  if (r.thumbnailUrl != null && (typeof r.thumbnailUrl !== "string" || r.thumbnailUrl.length === 0)) return false;
  if (r.altText != null && typeof r.altText !== "string") return false;
  if (r.modelId != null && typeof r.modelId !== "string") return false;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return false;
  if (r.deletedFromChatAt != null && typeof r.deletedFromChatAt !== "number") return false;
  if (r.orphanedFromChat != null && typeof r.orphanedFromChat !== "boolean") return false;
  return true;
};

export const isChatMediaReferenceArrayContract = (
  value: unknown,
): value is ReadonlyArray<ChatMediaReferenceContract> => {
  if (!Array.isArray(value)) return false;
  if (value.length > 512) return false;
  for (const item of value) {
    if (!isChatMediaReferenceContract(item)) return false;
  }
  return true;
};
