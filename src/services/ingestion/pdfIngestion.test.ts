import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingestPdfFile } from "./pdfIngestion";
import { MAX_PDF_FILE_BYTES } from "./ingestionLimits";
import { FileTooLargeError, UnsupportedFileTypeError, PdfExtractionError } from "./ingestionErrors";
import * as pdfParserService from "../pdfParserService";

vi.mock("../pdfParserService", () => ({
  extractPdfText: vi.fn(),
}));

describe("pdfIngestion", () => {
  const createPdfFile = (sizeBytes: number = 100) => {
    return {
      name: "test.pdf",
      size: sizeBytes,
      type: "application/pdf",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ingests a valid PDF and wraps text", async () => {
    vi.mocked(pdfParserService.extractPdfText).mockResolvedValueOnce({
      text: "PDF Content here",
      pageCount: 3,
      isImageOnly: false,
      truncated: false,
    });

    const file = createPdfFile();
    const result = await ingestPdfFile(file);

    expect(result.kind).toBe("pdf");
    expect(result.pageCount).toBe(3);
    expect(result.text).toContain("PDF Content here");
    expect(result.text).toContain("<attached_file name=\"test.pdf\" kind=\"pdf\">");
    expect(result.extraction.route).toBe("local-pdf-text-layer");
    expect(result.extraction.truncated).toBe(false);
    expect(result.modelRequirements.requiresVision).toBe(false);
  });

  it("marks as requiresVision if PDF is image-only", async () => {
    vi.mocked(pdfParserService.extractPdfText).mockResolvedValueOnce({
      text: "",
      pageCount: 1,
      isImageOnly: true,
      truncated: false,
    });

    const file = createPdfFile();
    const result = await ingestPdfFile(file);

    expect(result.modelRequirements.requiresVision).toBe(true);
    expect(result.modelRequirements.canFallbackToText).toBe(false);
    expect(result.extraction.warnings[0]).toContain("scanned image with no text layer");
  });

  it("adds warning if truncated", async () => {
    vi.mocked(pdfParserService.extractPdfText).mockResolvedValueOnce({
      text: "Truncated",
      pageCount: 10,
      isImageOnly: false,
      truncated: true,
    });

    const file = createPdfFile();
    const result = await ingestPdfFile(file);

    expect(result.extraction.truncated).toBe(true);
    expect(result.extraction.warnings[0]).toContain("truncated");
  });

  it("throws FileTooLargeError if file size exceeds MAX_PDF_FILE_BYTES", async () => {
    const file = createPdfFile(MAX_PDF_FILE_BYTES + 1);
    await expect(ingestPdfFile(file)).rejects.toThrow(FileTooLargeError);
  });

  it("throws UnsupportedFileTypeError for non-PDF files", async () => {
    const file = new File(["binary"], "test.exe", { type: "application/x-msdownload" });
    await expect(ingestPdfFile(file)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("wraps pdfParserService errors in PdfExtractionError", async () => {
    vi.mocked(pdfParserService.extractPdfText).mockRejectedValueOnce(new Error("Corrupt PDF"));
    const file = createPdfFile();
    await expect(ingestPdfFile(file)).rejects.toThrow(PdfExtractionError);
  });
});
