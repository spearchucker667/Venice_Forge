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
  sourcePath?: string;
  language?: string;
}

export interface AttachmentChunkSelection {
  chunks: AttachmentChunk[];
  usedTokens: number;
  omittedChunkCount: number;
  omittedCharacterCount: number;
  partiallySelectedAttachmentIds: Set<string>;
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

/** Renderer-safe SHA-256 over UTF-8 bytes via Web Crypto. */
export async function computeChunkContentHash(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 1-based line number containing `offset`, given sorted line-start offsets. */
function lineNumberAt(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  let answer = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lineStarts[middle] <= offset) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer + 1;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) count += 1;
  }
  return count;
}

/** Extract a bounded, ordered chunk list. The returned chunks remain plain
 * text wrapped by the existing untrusted-attachment boundary at send time. */
export async function extractAttachmentChunks(
  text: string,
  source: AttachmentChunkSource,
  options: {
    chunkChars?: number;
    maxChars?: number;
  } = {},
): Promise<{ chunks: AttachmentChunk[]; extractionTruncated: boolean }> {
  const chunkChars = Math.max(256, Math.floor(options.chunkChars ?? ATTACHMENT_CHUNK_CHARS));
  const maxChars = Math.max(chunkChars, Math.floor(options.maxChars ?? MAX_ATTACHMENT_CHUNK_CHARS));
  const retainedLength = Math.min(text.length, maxChars);
  const chunks: AttachmentChunk[] = [];
  const lineStarts: number[] = [0];
  for (let i = 0; i < retainedLength; i++) {
    if (text.charCodeAt(i) === 0x0a) lineStarts.push(i + 1);
  }
  let start = 0;
  let chunkIndex = 0;

  while (start < retainedLength) {
    const end = safeChunkEnd(text, start, Math.min(start + chunkChars, retainedLength));
    const chunkText = text.slice(start, end);
    if (!chunkText) break;
    const lineStart = lineNumberAt(lineStarts, start);
    const lineEnd = Math.max(
      lineStart,
      lineStart + countNewlines(chunkText) - (chunkText.endsWith("\n") ? 1 : 0),
    );
    chunks.push({
      attachmentId: source.attachmentId,
      chunkIndex,
      startOffset: start,
      endOffset: end,
      lineStart,
      lineEnd,
      tokenEstimate: estimateTokenCount(chunkText).count,
      text: chunkText,
      contentHash: await computeChunkContentHash(chunkText),
      provenance: {
        name: source.name,
        mimeType: source.mimeType,
        ...(source.sourcePath !== undefined ? { sourcePath: source.sourcePath } : {}),
        ...(source.language !== undefined ? { language: source.language } : {}),
      },
    });
    chunkIndex += 1;
    start = end;
  }

  return { chunks, extractionTruncated: text.length > retainedLength };
}

/** Return the largest prefix whose estimate fits the remaining budget. */
function fitChunkToTokenBudget(
  chunk: AttachmentChunk,
  allowanceTokens: number,
): AttachmentChunk | null {
  if (allowanceTokens <= 0 || chunk.text.length === 0) return null;
  if (chunk.tokenEstimate <= allowanceTokens) return chunk;

  let low = 1;
  let high = chunk.text.length;
  let bestEnd = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = safeChunkEnd(chunk.text, 0, middle);
    const estimate = estimateTokenCount(chunk.text.slice(0, candidate)).count;
    if (estimate <= allowanceTokens) {
      bestEnd = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (bestEnd === 0) return null;
  const text = chunk.text.slice(0, bestEnd);
  const lineStart = chunk.lineStart ?? 1;
  const lineEnd = Math.max(
    lineStart,
    lineStart + countNewlines(text) - (text.endsWith("\n") ? 1 : 0),
  );
  return {
    ...chunk,
    endOffset: chunk.startOffset + bestEnd,
    lineStart,
    lineEnd,
    tokenEstimate: estimateTokenCount(text).count,
    text,
  };
}

/** Select ordered chunks in attachment order, fitting a safe prefix of the
 * first chunk that exceeds the remaining model budget. */
export function selectAttachmentChunks(
  chunkLists: AttachmentChunk[][],
  allowanceTokens: number,
): AttachmentChunkSelection {
  const selected: AttachmentChunk[] = [];
  const limit = Math.max(0, Math.floor(allowanceTokens));
  let usedTokens = 0;
  let omittedChunkCount = 0;
  let omittedCharacterCount = 0;
  const partiallySelectedAttachmentIds = new Set<string>();

  for (const chunks of chunkLists) {
    for (const chunk of chunks) {
      const remaining = limit - usedTokens;
      const admitted = fitChunkToTokenBudget(chunk, remaining);
      if (admitted) {
        selected.push(admitted);
        usedTokens += admitted.tokenEstimate;
        if (admitted.text.length < chunk.text.length) {
          partiallySelectedAttachmentIds.add(chunk.attachmentId);
          omittedChunkCount += 1;
          omittedCharacterCount += chunk.text.length - admitted.text.length;
        }
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
    partiallySelectedAttachmentIds,
  };
}
