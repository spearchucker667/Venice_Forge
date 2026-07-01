import { IngestedAttachment } from "../../types/ingestion";
import { classifyFile } from "./fileClassifier";
import { ingestTextFile } from "./textIngestion";
import { ingestCodeFile } from "./codeIngestion";
import { ingestPdfFile } from "./pdfIngestion";
import { ingestDocxFile } from "./docxIngestion";
import { ingestImageFile } from "./imageIngestion";
import { parseWithVeniceTextParser } from "./veniceTextParserIngestion";
import { UnsupportedFileTypeError } from "./ingestionErrors";

/**
 * Assembles and ingests a single file by routing it to the appropriate processor
 * based on its classification.
 */
export async function processFileAttachment(file: File, options?: { providerSupportsVision?: boolean }): Promise<IngestedAttachment> {
  const classified = classifyFile(file);

  switch (classified.kind) {
    case "text":
    case "markdown":
      return ingestTextFile(file);
    case "spreadsheet":
      if (classified.extension === "csv") {
        return ingestTextFile(file);
      }
      return parseWithVeniceTextParser(file);
    case "code":
      return ingestCodeFile(file);
    case "pdf":
      return ingestPdfFile(file);
    case "docx":
      return ingestDocxFile(file);
    case "doc":
      return parseWithVeniceTextParser(file);
    case "image":
      if (options?.providerSupportsVision === false) {
        return parseWithVeniceTextParser(file);
      }
      return ingestImageFile(file);
    case "url":
    case "unknown":
    default:
      throw new UnsupportedFileTypeError(file.name);
  }
}
