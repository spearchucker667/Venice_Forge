import { describe, expect, it } from "vitest";
import {
  extractAttachmentChunks,
  selectAttachmentChunks,
} from "./attachmentChunking";

describe("attachmentChunking", () => {
  it("preserves order, provenance, and Unicode boundaries", async () => {
    const sourceText = `${"alpha 😀\n".repeat(20)}omega`;
    const result = await extractAttachmentChunks(sourceText, {
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

  it("marks resource-bounded extraction as partial without losing chunk metadata", async () => {
    const result = await extractAttachmentChunks("0123456789".repeat(100), {
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

  it("computes correct 1-based line ranges for multi-line content", async () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line-${String(i + 1).padStart(2, "0")}: const value${i} = ${i};`);
    const sourceText = lines.join("\n");
    const result = await extractAttachmentChunks(sourceText, {
      attachmentId: "att-lines",
      name: "lines.ts",
      mimeType: "text/plain",
    }, { chunkChars: 256, maxChars: sourceText.length });

    expect(result.chunks.length).toBeGreaterThan(1);
    for (const chunk of result.chunks) {
      const expectedText = sourceText.slice(chunk.startOffset, chunk.endOffset);
      const linesBefore = sourceText.slice(0, chunk.startOffset).split("\n").length - 1;
      const chunkLines = expectedText.split("\n").length - (expectedText.endsWith("\n") ? 1 : 0);
      expect(chunk.lineStart).toBe(linesBefore + 1);
      expect(chunk.lineEnd).toBe(linesBefore + Math.max(1, chunkLines));
    }
    expect(result.chunks[0].lineStart).toBe(1);
    expect(result.chunks[result.chunks.length - 1].lineEnd).toBe(40);
  });

  it("carries language, sourcePath, and a content hash on every chunk", async () => {
    const result = await extractAttachmentChunks("const x = 1;\nconst y = 2;\n", {
      attachmentId: "att-prov",
      name: "app.ts",
      mimeType: "text/plain",
      sourcePath: "app.ts",
      language: "typescript",
    }, { maxChars: 100 });

    expect(result.chunks.length).toBeGreaterThan(0);
    for (const chunk of result.chunks) {
      expect(chunk.provenance.sourcePath).toBe("app.ts");
      expect(chunk.provenance.language).toBe("typescript");
      expect(chunk.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("preserves chunk order within the token allowance", () => {
    const chunks = [0, 1, 2].map((chunkIndex) => ({
      attachmentId: "att",
      chunkIndex,
      startOffset: chunkIndex * 10,
      endOffset: (chunkIndex + 1) * 10,
      tokenEstimate: 4,
      text: `chunk-${chunkIndex}`,
      provenance: { name: "a.txt", mimeType: "text/plain" },
    }));
    const selection = selectAttachmentChunks([chunks], 8);
    expect(selection.usedTokens).toBe(8);
    expect(selection.chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
  });

  it("fits a safe prefix before omitting later chunks", () => {
    const chunks = [0, 1, 2].map((chunkIndex) => ({
      attachmentId: "att",
      chunkIndex,
      startOffset: chunkIndex * 400,
      endOffset: (chunkIndex + 1) * 400,
      tokenEstimate: 100,
      text: "x".repeat(400),
      provenance: { name: "a.txt", mimeType: "text/plain" },
    }));
    const selection = selectAttachmentChunks([chunks], 150);
    expect(selection.usedTokens).toBe(150);
    expect(selection.chunks).toHaveLength(2);
    expect(selection.chunks[1].text.length).toBeGreaterThan(0);
    expect(selection.chunks[1].text.length).toBeLessThan(400);
    expect(selection.omittedChunkCount).toBe(2);
    expect(selection.omittedCharacterCount).toBe(600);
    expect(selection.partiallySelectedAttachmentIds).toEqual(new Set(["att"]));
  });

  it("does not admit a partial Unicode surrogate", () => {
    const chunk = {
      attachmentId: "att",
      chunkIndex: 0,
      startOffset: 0,
      endOffset: 16,
      tokenEstimate: 2,
      text: "😀😀😀😀😀😀😀😀",
      provenance: { name: "a.txt", mimeType: "text/plain" },
    };
    const selection = selectAttachmentChunks([[chunk]], 1);
    expect(selection.chunks[0]?.text).toBe("😀😀😀😀");
    expect(selection.chunks[0]?.text).not.toContain("�");
  });
});
