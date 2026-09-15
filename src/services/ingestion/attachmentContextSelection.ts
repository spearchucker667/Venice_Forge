import type { IngestedAttachment } from "../../types/ingestion";
import { estimateTokenCount } from "../chatContextBudget";
import {
  selectAttachmentChunks,
  type AttachmentChunkSelection,
} from "./attachmentChunking";
import { buildExternalAttachmentEnvelope } from "./xmlEscape";

export interface SelectedAttachmentContext {
  providerContextText: string;
  selectedAttachmentIds: Set<string>;
  omittedAttachmentIds: Set<string>;
  omittedChunkCount: number;
  usedTokens: number;
  extractionTruncatedAttachmentIds: Set<string>;
}

/** Selects ordered chunks across attachments for a known model budget. Images
 * remain outside this text path. Attachments without chunk metadata use their
 * existing text as a compatibility fallback and are still bounded by the
 * caller's model allowance. */
export function selectAttachmentContext(
  attachments: IngestedAttachment[],
  allowanceTokens: number,
): SelectedAttachmentContext {
  const textAttachments = attachments.filter((attachment) => Boolean(attachment.text));
  const lists = textAttachments.map((attachment) => {
    if (attachment.chunks?.length) return attachment.chunks;
    const text = attachment.text ?? "";
    return [{
      attachmentId: attachment.id,
      chunkIndex: 0,
      startOffset: 0,
      endOffset: text.length,
      tokenEstimate: estimateTokenCount(text).count,
      text,
      provenance: { name: attachment.name, mimeType: attachment.mimeType },
    }];
  });
  const selection: AttachmentChunkSelection = selectAttachmentChunks(lists, allowanceTokens);
  const selectedIds = new Set(selection.chunks.map((chunk) => chunk.attachmentId));
  const omittedIds = new Set<string>();
  for (const attachment of textAttachments) {
    const all = attachment.chunks?.length ?? 1;
    const selected = selection.chunks.filter((chunk) => chunk.attachmentId === attachment.id).length;
    if (selected < all) omittedIds.add(attachment.id);
  }

  const providerContextText = selection.chunks
    .map((chunk) => `\n\n${buildExternalAttachmentEnvelope({
      id: chunk.attachmentId,
      name: chunk.provenance.name,
      mimeType: chunk.provenance.mimeType,
      text: chunk.text,
    })}`)
    .join("");

  return {
    providerContextText,
    selectedAttachmentIds: selectedIds,
    omittedAttachmentIds: omittedIds,
    omittedChunkCount: selection.omittedChunkCount,
    usedTokens: selection.usedTokens,
    extractionTruncatedAttachmentIds: new Set(
      textAttachments
        .filter((attachment) => attachment.extraction.truncated)
        .map((attachment) => attachment.id),
    ),
  };
}
