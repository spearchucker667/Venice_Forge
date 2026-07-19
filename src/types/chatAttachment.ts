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
