// @vitest-environment jsdom
/**
 * Unit tests for src/services/pdfParserService.ts
 *
 * pdfjs-dist is mocked so tests run without a DOM worker or actual PDF parsing.
 * Tests cover:
 * - Normal extraction (multi-page, truncation per-page + total)
 * - Image-only PDF (empty text layer)
 * - Corrupt/unreadable PDF (getDocument rejection)
 * - pdfExtractionSummary formatting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock pdfjs-dist before importing the module under test
// ---------------------------------------------------------------------------

const mockGetPage = vi.fn();
const mockGetTextContent = vi.fn();
const mockDestroy = vi.fn();

const mockDoc = {
  numPages: 2,
  getPage: mockGetPage,
  destroy: mockDestroy,
};

const mockTask = {
  promise: Promise.resolve(mockDoc),
  destroy: mockDestroy,
};

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => mockTask),
}));

// Re-import after mock is set up
const { extractPdfText, pdfExtractionSummary } = await import("./pdfParserService");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextContent(items: Array<{ str: string; hasEOL?: boolean }>) {
  return { items };
}

function makeFileLike(size = 100): File {
  return { size, arrayBuffer: async () => new ArrayBuffer(size) } as unknown as File;
}

// ---------------------------------------------------------------------------

describe("extractPdfText()", () => {
  beforeEach(() => {
    mockDoc.numPages = 2;
    mockGetPage.mockReset();
    mockGetTextContent.mockReset();
    mockDestroy.mockReset();

    // Default: each page returns a small amount of text
    mockGetPage.mockImplementation(async (pageNum: number) => ({
      getTextContent: async () => makeTextContent([
        { str: `Page ${pageNum} text.`, hasEOL: true },
        { str: " More content.", hasEOL: false },
      ]),
    }));
  });

  it("extracts text from all pages and joins with double newlines", async () => {
    const result = await extractPdfText(makeFileLike());
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("Page 1 text.");
    expect(result.text).toContain("Page 2 text.");
    expect(result.isImageOnly).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it("returns isImageOnly=true when all pages have empty text", async () => {
    mockGetPage.mockImplementation(async () => ({
      getTextContent: async () => makeTextContent([]),
    }));
    const result = await extractPdfText(makeFileLike());
    expect(result.isImageOnly).toBe(true);
    expect(result.text.trim()).toBe("");
  });

  it("truncates per-page at MAX_CHARS_PER_PAGE (4000)", async () => {
    const longStr = "A".repeat(5000);
    mockGetPage.mockImplementation(async () => ({
      getTextContent: async () => makeTextContent([{ str: longStr, hasEOL: false }]),
    }));
    const result = await extractPdfText(makeFileLike());
    // Each page should be capped at 4000 + ellipsis
    for (const part of result.text.split("\n\n")) {
      expect(part.length).toBeLessThanOrEqual(4001 + 1); // 4000 chars + "…"
    }
    expect(result.text).toContain("…");
  });

  it("marks truncated=true when total chars exceed MAX_TOTAL_CHARS (100k)", async () => {
    // 60 pages × 2000 chars = 120k total — should truncate
    mockDoc.numPages = 60;
    mockGetPage.mockImplementation(async (n: number) => ({
      getTextContent: async () =>
        makeTextContent([{ str: `Page${n}_${"B".repeat(1990)}`, hasEOL: true }]),
    }));
    const result = await extractPdfText(makeFileLike());
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(100_100); // small buffer for ellipsis
  });

  it("throws on corrupt PDFs (getDocument rejects)", async () => {
    const { getDocument } = await import("pdfjs-dist");
    vi.mocked(getDocument).mockReturnValueOnce({
      promise: Promise.reject(new Error("Invalid PDF structure")),
    } as ReturnType<typeof getDocument>);

    await expect(extractPdfText(makeFileLike())).rejects.toThrow("Failed to parse PDF");
  });

  it("accepts ArrayBuffer as input", async () => {
    const buf = new ArrayBuffer(100);
    const result = await extractPdfText(buf);
    expect(result.pageCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe("pdfExtractionSummary()", () => {
  it("formats a normal single-page result", () => {
    const r = { text: "hello", pageCount: 1, isImageOnly: false, truncated: false };
    expect(pdfExtractionSummary(r, "doc.pdf")).toBe('[PDF: "doc.pdf", 1 page]');
  });

  it("formats a multi-page truncated result", () => {
    const r = { text: "x", pageCount: 5, isImageOnly: false, truncated: true };
    expect(pdfExtractionSummary(r, "big.pdf")).toContain("truncated");
    expect(pdfExtractionSummary(r, "big.pdf")).toContain("5 pages");
  });

  it("formats an image-only result with guidance", () => {
    const r = { text: "", pageCount: 3, isImageOnly: true, truncated: false };
    const summary = pdfExtractionSummary(r, "scan.pdf");
    expect(summary).toContain("no text layer");
    expect(summary).toContain("scan.pdf");
  });
});
