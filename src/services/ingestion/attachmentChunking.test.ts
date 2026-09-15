import { describe, expect, it } from "vitest";
import {
  extractAttachmentChunks,
  selectAttachmentChunks,
} from "./attachmentChunking";

describe("attachmentChunking", () => {
  it("preserves order, provenance, and Unicode boundaries", () => {
    const sourceText = `${"alpha 😀\n".repeat(20)}omega`;
    const result = extractAttachmentChunks(sourceText, {
      attachmentId: "att-1",
      name: "notes.txt",
      mimeType: "text/plain",
    }, { chunkChars: 32, maxChars: sourceText.length });

    expect(result.extractionTruncated).toBe(false);
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.map((chunk) => chunk.text).join("")).toBe(sourceText);
    expect(result.chunks.every((chunk) => chunk.provenance.name === "notes.txt")).toBe(true);
    expect(result.chunks.every((chunk) => chunk.attachmentId === "att-1")).toBe(true);
    expect(result.chunks.every((chunk) => chunk.text.includes("�") === false)).toBe(true);
  });

  it("marks resource-bounded extraction as partial without losing chunk metadata", () => {
    const result = extractAttachmentChunks("0123456789".repeat(100), {
      attachmentId: "att-2",
      name: "large.ts",
      mimeType: "text/plain",
    }, { chunkChars: 256, maxChars: 300 });

    expect(result.extractionTruncated).toBe(true);
    expect(result.chunks.map((chunk) => chunk.text).join("").length).toBeLessThan(1000);
    expect(result.chunks[0]).toMatchObject({
      attachmentId: "att-2",
      chunkIndex: 0,
      startOffset: 0,
      provenance: { name: "large.ts", mimeType: "text/plain" },
    });
  });

  it.each([
    [128_000, 128_000],
    [200_000, 200_000],
    [1_000_000, 1_000_000],
  ])("selects ordered chunks within a %s-token model budget", (allowance, expected) => {
    const chunks = [0, 1, 2].map((chunkIndex) => ({
      attachmentId: "att",
      chunkIndex,
      startOffset: chunkIndex * 10,
      endOffset: (chunkIndex + 1) * 10,
      tokenEstimate: expected / 3,
      text: `chunk-${chunkIndex}`,
      provenance: { name: "a.txt", mimeType: "text/plain" },
    }));
    const selection = selectAttachmentChunks([chunks], allowance);
    expect(selection.usedTokens).toBeLessThanOrEqual(allowance);
    expect(selection.chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1, 2]);
  });

  it("omits later chunks truthfully when the remaining context is small", () => {
    const chunks = [0, 1, 2].map((chunkIndex) => ({
      attachmentId: "att",
      chunkIndex,
      startOffset: chunkIndex * 5,
      endOffset: (chunkIndex + 1) * 5,
      tokenEstimate: 100,
      text: "x".repeat(5),
      provenance: { name: "a.txt", mimeType: "text/plain" },
    }));
    expect(selectAttachmentChunks([chunks], 150)).toMatchObject({
      usedTokens: 100,
      omittedChunkCount: 2,
      omittedCharacterCount: 10,
    });
  });
});
