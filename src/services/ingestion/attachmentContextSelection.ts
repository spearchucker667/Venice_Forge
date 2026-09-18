import type { AttachmentChunk, IngestedAttachment } from "../../types/ingestion";
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

/**
 * VF-AUD-20260916-P2-002 — selector↔compiler envelope-overhead invariant.
 *
 * Estimates the token cost of the envelope wrapper that surrounds a chunk
 * in the rendered provider context (open tag + metadata + body separators +
 * close tag + the inter-envelope `\n\n` separator). The selector budgets
 * against this so the rendered representation — not just the raw chunk
 * text — fits the model allowance. Without this, selection can report
 * "fits" while the compiler's rendered envelope is later truncated.
 */
function estimateEnvelopeOverheadTokens(chunk: AttachmentChunk): number {
  const wrapper = `\n\n${buildExternalAttachmentEnvelope({
    id: chunk.attachmentId,
    name: chunk.provenance.name,
    mimeType: chunk.provenance.mimeType,
    // Empty text — we want the wrapper-only overhead (open tag, body
    // separator, close tag, inter-envelope separator). The chunk body
    // itself is counted by the selector's chunk.tokenEstimate.
    text: "",
  })}`;
  return estimateTokenCount(wrapper).count;
}

/** Augments each chunk's `tokenEstimate` with its envelope overhead so the
 * selector budgets against the rendered provider context, not just the raw
 * chunk text. Returns a new list (no input mutation). */
function augmentChunksWithEnvelopeOverhead(
  chunks: AttachmentChunk[],
): AttachmentChunk[] {
  return chunks.map((chunk) => ({
    ...chunk,
    tokenEstimate: chunk.tokenEstimate + estimateEnvelopeOverheadTokens(chunk),
  }));
}

/** Selects ordered chunks across attachments for a known model budget. Images
 * remain outside this text path. Attachments without chunk metadata use their
 * existing text as a compatibility fallback and are still bounded by the
 * caller's model allowance.
 *
 * VF-AUD-20260916-P2-002: the selector budgets against the rendered envelope
 * representation (chunk text + opening/closing tags + metadata + separators),
 * not just the raw chunk text. The returned `usedTokens` therefore matches
 * the actual rendered provider-context token count to within the
 * {@link estimateTokenCount} tolerance, so the prompt compiler will not
 * immediately truncate solely because the selector previously ignored
 * envelope overhead. */
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
  // VF-AUD-20260916-P2-002: budget against the rendered envelope, not raw text.
  const augmentedLists = lists.map(augmentChunksWithEnvelopeOverhead);
  const selection: AttachmentChunkSelection = selectAttachmentChunks(augmentedLists, allowanceTokens);
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
    // selection.usedTokens is the sum of augmented tokenEstimates for the
    // admitted chunks — i.e. the selector's view of the rendered cost.
    usedTokens: selection.usedTokens,
  };
}
