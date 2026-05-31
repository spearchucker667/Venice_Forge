/** @fileoverview Type definitions for chat message attachments. */

/** Discriminated attachment types. */
export type AttachmentType = "file" | "url" | "image";

/** A single attachment item queued for a message. */
export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  content: string;
  size: number;
}

/** Result of assembling attachments into an injectable context block. */
export interface AssembledAttachmentContext {
  text: string;
  images: Array<{ name: string; dataUrl: string }>;
  truncated: boolean;
  notices: string[];
}
