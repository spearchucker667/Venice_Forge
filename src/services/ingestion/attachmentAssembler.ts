import { IngestedAttachment } from "../../types/ingestion";
import { classifyFile } from "./fileClassifier";
import { ingestTextFile } from "./textIngestion";
import { ingestCodeFile } from "./codeIngestion";
import { ingestPdfFile } from "./pdfIngestion";
import { ingestDocxFile, ingestDocFile } from "./docxIngestion";
import { ingestImageFile } from "./imageIngestion";
import { UnsupportedFileTypeError } from "./ingestionErrors";

/**
 * Assembles and ingests a single file by routing it to the appropriate processor
 * based on its classification.
 */
export async function processFileAttachment(file: File): Promise<IngestedAttachment> {
  const classified = classifyFile(file);

  switch (classified.kind) {
    case "text":
    case "markdown":
    case "spreadsheet":
      return ingestTextFile(file);
    case "code":
      return ingestCodeFile(file);
    case "pdf":
      return ingestPdfFile(file);
    case "docx":
      return ingestDocxFile(file);
    case "doc":
      return ingestDocFile(file);
    case "image":
      return ingestImageFile(file);
    case "url":
    case "unknown":
    default:
      throw new UnsupportedFileTypeError(file.name);
  }
}
