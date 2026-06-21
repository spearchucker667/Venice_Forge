import { describe, it, expect, vi, beforeEach } from "vitest";
import { processFileAttachment } from "./attachmentAssembler";

import * as textIngestion from "./textIngestion";
import * as codeIngestion from "./codeIngestion";
import * as pdfIngestion from "./pdfIngestion";
import * as docxIngestion from "./docxIngestion";
import * as imageIngestion from "./imageIngestion";
import { UnsupportedFileTypeError } from "./ingestionErrors";

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

  it("rejects legacy doc files until a parser is available", async () => {
    const file = new File([""], "test.doc");
    await expect(processFileAttachment(file)).rejects.toThrow(UnsupportedFileTypeError);
    expect(docxIngestion.ingestDocFile).not.toHaveBeenCalled();
  });

  it("rejects binary Excel files instead of routing them through text ingestion", async () => {
    await expect(processFileAttachment(new File([""], "test.xls"))).rejects.toThrow(UnsupportedFileTypeError);
    await expect(processFileAttachment(new File([""], "test.xlsx"))).rejects.toThrow(UnsupportedFileTypeError);
    expect(textIngestion.ingestTextFile).not.toHaveBeenCalled();
  });

  it("routes image files", async () => {
    const file = new File([""], "test.png", { type: "image/png" });
    await processFileAttachment(file);
    expect(imageIngestion.ingestImageFile).toHaveBeenCalledWith(file);
  });

  it("throws UnsupportedFileTypeError for unknown", async () => {
    const file = new File([""], "test.bin");
    await expect(processFileAttachment(file)).rejects.toThrow(UnsupportedFileTypeError);
  });
});
