import { IngestedAttachment } from "../../types/ingestion";
import { classifyFile } from "./fileClassifier";
import { ingestTextFile } from "./textIngestion";
import { ingestCodeFile } from "./codeIngestion";
import { ingestPdfFile } from "./pdfIngestion";
import { ingestDocxFile } from "./docxIngestion";
import { ingestImageFile } from "./imageIngestion";
import { parseWithVeniceTextParser } from "./veniceTextParserIngestion";
import { sniffFilePrefix } from "./textSniffing";

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
      if (classified.extension === "csv" || classified.extension === "tsv") {
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
    default: {
      // Extensionless/unknown files still get a chance: sniff a bounded prefix
      // and ingest clean text as plain text (with shebang language hints).
      // Binary-looking content is rejected with a typed error by the sniffer.
      const sniffed = await sniffFilePrefix(file);
      return ingestTextFile(file, {
        allowSniffedPlainText: true,
        languageHint: sniffed.languageHint,
      });
    }
  }
}
