import type { AttachmentChunk } from "../../types/ingestion";
import { estimateTokenCount } from "../chatContextBudget";

/** Maximum characters held in one extracted chunk. This is a resource bound,
 * not a model-context limit. */
export const ATTACHMENT_CHUNK_CHARS = 32_000;

/** Maximum total characters retained by one attachment's chunk list. The
 * extractor may stop here, but it does not silently claim the full file was
 * selected for a provider request. */
export const MAX_ATTACHMENT_CHUNK_CHARS = 8 * 1024 * 1024;

export interface AttachmentChunkSource {
  attachmentId: string;
  name: string;
  mimeType: string;
}

export interface AttachmentChunkSelection {
  chunks: AttachmentChunk[];
  usedTokens: number;
  omittedChunkCount: number;
  omittedCharacterCount: number;
  extractionTruncated: boolean;
}

/** Move a boundary away from a UTF-16 surrogate pair and, when possible, to a
 * nearby line/word boundary. This keeps chunks readable without scanning the
 * whole source repeatedly. */
function safeChunkEnd(text: string, start: number, proposedEnd: number): number {
  let end = Math.min(text.length, proposedEnd);
  if (end < text.length && end > start && /[\uDC00-\uDFFF]/.test(text[end])) end -= 1;

  const minimum = Math.min(end, start + Math.floor((proposedEnd - start) * 0.75));
  const newline = text.lastIndexOf("\n", end);
  if (newline >= minimum) return newline + 1;
  const whitespace = text.lastIndexOf(" ", end);
  if (whitespace >= minimum) return whitespace + 1;
  return Math.max(start + 1, end);
}

/** Extract a bounded, ordered chunk list. The returned chunks remain plain
 * text wrapped by the existing untrusted-attachment boundary at send time. */
export function extractAttachmentChunks(
  text: string,
  source: AttachmentChunkSource,
  options: {
    chunkChars?: number;
    maxChars?: number;
  } = {},
): { chunks: AttachmentChunk[]; extractionTruncated: boolean } {
  const chunkChars = Math.max(256, Math.floor(options.chunkChars ?? ATTACHMENT_CHUNK_CHARS));
  const maxChars = Math.max(chunkChars, Math.floor(options.maxChars ?? MAX_ATTACHMENT_CHUNK_CHARS));
  const retainedLength = Math.min(text.length, maxChars);
  const chunks: AttachmentChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < retainedLength) {
    const end = safeChunkEnd(text, start, Math.min(start + chunkChars, retainedLength));
    const chunkText = text.slice(start, end);
    if (!chunkText) break;
    chunks.push({
      attachmentId: source.attachmentId,
      chunkIndex,
      startOffset: start,
      endOffset: end,
      tokenEstimate: estimateTokenCount(chunkText).count,
      text: chunkText,
      provenance: { name: source.name, mimeType: source.mimeType },
    });
    chunkIndex += 1;
    start = end;
  }

  return { chunks, extractionTruncated: text.length > retainedLength };
}

/** Select chunks in attachment order until the selected model's remaining
 * token allowance is exhausted. Whole chunks are admitted; no chunk is split
 * at this stage, and omitted metadata is explicit for truthful UI state. */
export function selectAttachmentChunks(
  chunkLists: AttachmentChunk[][],
  allowanceTokens: number,
): AttachmentChunkSelection {
  const selected: AttachmentChunk[] = [];
  const limit = Math.max(0, Math.floor(allowanceTokens));
  let usedTokens = 0;
  let omittedChunkCount = 0;
  let omittedCharacterCount = 0;
  const extractionTruncated = false;

  for (const chunks of chunkLists) {
    for (const chunk of chunks) {
      if (usedTokens + chunk.tokenEstimate <= limit) {
        selected.push(chunk);
        usedTokens += chunk.tokenEstimate;
      } else {
        omittedChunkCount += 1;
        omittedCharacterCount += chunk.text.length;
      }
    }
  }

  return {
    chunks: selected,
    usedTokens,
    omittedChunkCount,
    omittedCharacterCount,
    extractionTruncated,
  };
}
