import { describe, it, expect, vi, beforeEach } from "vitest";
import { processFileAttachment } from "./attachmentAssembler";

import * as textIngestion from "./textIngestion";
import * as codeIngestion from "./codeIngestion";
import * as pdfIngestion from "./pdfIngestion";
import * as docxIngestion from "./docxIngestion";
import * as imageIngestion from "./imageIngestion";
import { BinaryContentError } from "./ingestionErrors";

vi.mock("./textIngestion", () => ({ ingestTextFile: vi.fn() }));
vi.mock("./codeIngestion", () => ({ ingestCodeFile: vi.fn() }));
vi.mock("./pdfIngestion", () => ({ ingestPdfFile: vi.fn() }));
vi.mock("./docxIngestion", () => ({ ingestDocxFile: vi.fn(), ingestDocFile: vi.fn() }));
vi.mock("./imageIngestion", () => ({ ingestImageFile: vi.fn() }));

describe("attachmentAssembler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("routes text files", async () => {
    const file = new File([""], "test.txt");
    await processFileAttachment(file);
    expect(textIngestion.ingestTextFile).toHaveBeenCalledWith(file);
  });

  it("routes code files", async () => {
    const file = new File([""], "test.ts");
    await processFileAttachment(file);
    expect(codeIngestion.ingestCodeFile).toHaveBeenCalledWith(file);
  });

  it("routes pdf files", async () => {
    const file = new File([""], "test.pdf", { type: "application/pdf" });
    await processFileAttachment(file);
    expect(pdfIngestion.ingestPdfFile).toHaveBeenCalledWith(file);
  });

  it("routes docx files", async () => {
    const file = new File([""], "test.docx");
    await processFileAttachment(file);
    expect(docxIngestion.ingestDocxFile).toHaveBeenCalledWith(file);
  });

  it("routes legacy doc files through venice text parser", async () => {
    const file = new File([""], "test.doc");
    // It should route to parseWithVeniceTextParser (which might fail in test without mock, but the error would be Venice text-parser failed)
    // Actually the mock for parseWithVeniceTextParser should handle it, but wait, it throws a Venice text-parser failed if no mock.
    // Let's assert it throws the venice text parser error, not UnsupportedFileTypeError.
    await expect(processFileAttachment(file)).rejects.toThrow(/Venice text-parser failed/);
  });

  it("routes binary Excel files through venice text parser", async () => {
    await expect(processFileAttachment(new File([""], "test.xls"))).rejects.toThrow(/Venice text-parser failed/);
    await expect(processFileAttachment(new File([""], "test.xlsx"))).rejects.toThrow(/Venice text-parser failed/);
    expect(textIngestion.ingestTextFile).not.toHaveBeenCalled();
  });

  it("routes image files", async () => {
    const file = new File([""], "test.png", { type: "image/png" });
    await processFileAttachment(file);
    expect(imageIngestion.ingestImageFile).toHaveBeenCalledWith(file);
  });

  it("sniffs and ingests unknown-extension text files as plain text", async () => {
    const file = new File(["#!/bin/bash\necho hello\n"], "deploy");
    await processFileAttachment(file);
    expect(textIngestion.ingestTextFile).toHaveBeenCalledWith(file, {
      allowSniffedPlainText: true,
      languageHint: "bash",
    });
  });

  it("rejects unknown-extension binary files with a typed error", async () => {
    const binaryBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const file = new File([binaryBytes], "payload.bin");
    await expect(processFileAttachment(file)).rejects.toThrow(BinaryContentError);
    expect(textIngestion.ingestTextFile).not.toHaveBeenCalled();
  });
});
