import type { IngestedAttachment } from "../../types/ingestion";
import type { SafetyPromptSegment } from "../../shared/safety/promptSegments";
import { estimateTokenCount } from "../chatContextBudget";
import {
  selectAttachmentChunks,
  type AttachmentChunkSelection,
} from "./attachmentChunking";
import { buildExternalAttachmentEnvelope } from "./xmlEscape";

export interface SelectedAttachmentContext {
  providerContextText: string;
  /** Typed provenance segments (one attachment segment per selected chunk).
   *  Consumed by the safety guard via the canonical payload provenance
   *  field — no regex reconstructs the trust boundary on the typed path. */
  safetySegments: SafetyPromptSegment[];
  selectedAttachmentIds: Set<string>;
  omittedAttachmentIds: Set<string>;
  omittedChunkCount: number;
  usedTokens: number;
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
  const omittedIds = new Set<string>(selection.partiallySelectedAttachmentIds);
  for (const attachment of textAttachments) {
    const all = attachment.chunks?.length ?? 1;
    const selected = selection.chunks.filter((chunk) => chunk.attachmentId === attachment.id).length;
    if (selected < all) omittedIds.add(attachment.id);
  }

  const safetySegments: SafetyPromptSegment[] = selection.chunks.map((chunk) => ({
    kind: "attachment",
    attachmentId: chunk.attachmentId,
    name: chunk.provenance.name,
    mimeType: chunk.provenance.mimeType,
    text: chunk.text,
    trust: "untrusted-quoted-data",
  }));

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
    safetySegments,
    selectedAttachmentIds: selectedIds,
    omittedAttachmentIds: omittedIds,
    omittedChunkCount: selection.omittedChunkCount,
    usedTokens: selection.usedTokens,
  };
}
