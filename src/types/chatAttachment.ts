/** @fileoverview Durable, structured attachment reference type.
 *
 * A `ChatAttachmentRef` is a bounded, safe, path-free record describing a
 * file the user attached to a chat message. It is persisted in
 * `ConversationMessage.metadata.attachmentRefs` alongside the message.
 *
 * Key invariants:
 *  - Contains NO raw extracted text, file bytes, or local filesystem paths.
 *  - Contains NO API keys, secrets, or credential fragments.
 *  - Is safe to store in encrypted IndexedDB and conversation JSON files.
 *  - `providerContext` (on the parent metadata) carries extracted text for
 *    the provider payload only; it is compiled separately and never rendered
 *    as part of the visible transcript.
 *
 * Backwards-compat: historical records may have `metadata.attachments` as a
 * plain `string[]` (legacy). Consumers should check for either shape.
 */

import type { IngestedAttachmentKind, IngestionExtractionRoute } from './ingestion';
import type { IngestedAttachment } from './ingestion';

/** How a composer attachment reaches the provider (FEAT-006).
 *
 *  - `context` — the existing local extraction / Documents pipeline
 *    (default; extracted text competes for the model context window).
 *  - `native-file` — the original file bytes are sent as a provider-native
 *    `file` content part (`file_data` data URL or public https URL).
 *  - `native-video` — a validated https/video URL is sent as a provider-
 *    native `video_url` content part. */
export type ChatAttachmentSendMode = 'context' | 'native-file' | 'native-video';

/** Composer-level extension of the ingestion pipeline's attachment record.
 *  These fields exist only in the composer's runtime state (and the send
 *  path) — they are NEVER persisted into conversation records. The durable
 *  message keeps only {@link NativeContentPartRef} records and expands the
 *  actual parts from the runtime registry at send time. */
export interface ComposerAttachment extends IngestedAttachment {
  /** Selected transport mode; omitted means `context`. */
  sendMode?: ChatAttachmentSendMode;
  /** Runtime-only native file payload (data URL or https URL). */
  nativeFileDataUrl?: string;
  /** Runtime-only video URL for `video_url` parts. */
  nativeVideoUrl?: string;
  /** Localized per-attachment validation annotation (runtime-only). */
  validationError?: string;
}

/** Durable, path-free reference to a provider-native content part
 *  (`file` / `video_url`). Persisted in
 *  `ConversationMessage.metadata.nativeParts`. The actual part payload
 *  (e.g. a base64 data URL) lives ONLY in the renderer runtime registry
 *  (`src/services/nativeContentPartRegistry.ts`) and is expanded into the
 *  outgoing request at compile time; after an app restart the reference
 *  remains for display but the part is omitted from new requests. */
export interface NativeContentPartRef {
  /** Stable id matching the runtime-registry entry at send time. */
  id: string;
  type: 'file' | 'video_url';
  /** Original filename for `file` parts (display only). */
  filename?: string;
  /** Byte size of the original file (display only). */
  sizeBytes?: number;
  /** MIME type of the original file (display only). */
  mimeType?: string;
}

export interface ChatAttachmentRef {
  /** Stable attachment ID (matches the IngestedAttachment.id at send time). */
  id: string;

  /** Original filename as supplied by the user. */
  name: string;

  /** Kind of the original attachment. */
  kind: IngestedAttachmentKind;

  /** MIME type of the original file. */
  mimeType: string;

  /** File extension (without leading dot). */
  extension: string;

  /** Byte size of the original file. */
  sizeBytes: number;

  /** ISO-8601 creation timestamp from the IngestedAttachment. */
  createdAt: string;

  /** How the attachment content was extracted. */
  extractionRoute: IngestionExtractionRoute;

  /** True when the attachment content exceeded the context budget and was
   *  partially or fully omitted from the provider payload. */
  truncated: boolean;

  /** True when the attachment requires a vision-capable model. */
  requiresVision: boolean;

  /**
   * When this attachment was promoted to a managed document, the stable
   * document ID is stored here. Subsequent tool calls reference this ID.
   */
  managedDocumentId?: string;

  /**
   * The revision ID at the time of the last tool interaction with this
   * managed document.
   */
  managedRevisionId?: string;
}
