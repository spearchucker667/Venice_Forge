import path from "node:path";
import { randomUUID } from "node:crypto";

import type { DocumentBlock, DocumentFormat, DocumentRevision, ManagedDocument } from "../../../src/agent/contracts/documents";
import { ManagedDocumentService } from "./managed-document-service";
import { redactSecrets } from "../../../src/shared/redaction";

const ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

function assertId(value: string, label: string): void {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw new Error(`${label} must match ${ID_RE.source}.`);
  }
}

export const MAX_ATTACHMENT_IMPORT_BYTES = 1_048_576;
export const MAX_ATTACHMENT_TEXT_LINES = 200;
export const MAX_ATTACHMENT_TEXT_LENGTH = 200_000;

const TEXT_MIME_PATTERN = /^text\/(plain|csv|markdown|xml|yaml|json|javascript|typescript|css|html|x-shellscript|x-c|cpp|java|kotlin|swift|go|rust|python|ruby|php|sql)$/i;
const TEXT_MIME_BLOCKLIST = [/^text\/html$/i];
const SUPPORTED_BINARY_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/octet-stream",
  "application/zip",
  "application/x-msdownload",
];

export interface AttachmentImportRequest {
  attachmentId: string;
  projectId: string;
  relativePath: string;
  displayName?: string;
  mimeType: string;
  bodyB64: string;
}

export interface AttachmentImportResult {
  document: ManagedDocument;
  revision: DocumentRevision;
  mode: "text" | "metadata-only";
  format: DocumentFormat;
  bytesReceived: number;
  bytesRedacted: number;
}

export class AttachmentImportService {
  constructor(private readonly documents: ManagedDocumentService) {}

  async promote(profileId: string, request: AttachmentImportRequest): Promise<AttachmentImportResult> {
    assertId(request.attachmentId, "attachmentId");
    assertId(request.projectId, "projectId");
    this.assertRelativePath(request.relativePath);

    const decoded = decodeBase64(request.bodyB64);
    if (decoded.byteLength > MAX_ATTACHMENT_IMPORT_BYTES) {
      throw new Error(`Attachment exceeds the ${MAX_ATTACHMENT_IMPORT_BYTES}-byte import limit.`);
    }

    const classification = classifyMime(request.mimeType);
    if (classification === "reject") {
      throw new Error(`Attachment mimeType ${JSON.stringify(request.mimeType)} is not supported.`);
    }

    const format = detectFormat(request.relativePath);

    if (classification === "text") {
      const rawText = decoded.toString("utf8");
      const bounded = boundText(rawText, MAX_ATTACHMENT_TEXT_LENGTH);
      const lines = bounded.split(/\r?\n/);
      const truncatedLines = lines.slice(0, MAX_ATTACHMENT_TEXT_LINES);
      const redacted = redactSecrets(truncatedLines.join("\n"));
      const bytesRedacted = countRedactedBytes(rawText, redacted);
      const blocks = splitParagraphs(redacted);
      const result = await this.documents.create(profileId, {
        projectId: request.projectId,
        relativePath: request.relativePath,
        format,
        blocks,
        displayName: request.displayName,
        metadata: {
          sourceAttachmentId: request.attachmentId,
          mimeType: request.mimeType,
          sizeBytes: decoded.byteLength,
          importedAt: new Date().toISOString(),
        },
        createdBy: "import",
      });
      return { document: result.document, revision: result.revision, mode: "text", format, bytesReceived: decoded.byteLength, bytesRedacted };
    }

    const placeholder = buildBinaryPlaceholder(request);
    const result = await this.documents.create(profileId, {
      projectId: request.projectId,
      relativePath: request.relativePath,
      format: "txt",
      blocks: placeholder.blocks,
      displayName: request.displayName,
      metadata: {
        sourceAttachmentId: request.attachmentId,
        mimeType: request.mimeType,
        sizeBytes: decoded.byteLength,
        importedAt: new Date().toISOString(),
        ...placeholder.metadata,
      },
      createdBy: "import",
    });
    return { document: result.document, revision: result.revision, mode: "metadata-only", format: "txt", bytesReceived: decoded.byteLength, bytesRedacted: 0 };
  }

  private assertRelativePath(value: string): void {
    if (typeof value !== "string" || value.length === 0 || value.length > 500) {
      throw new Error("Attachment relativePath must be 1-500 characters.");
    }
    if (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)) {
      throw new Error("Attachment relativePath must be relative.");
    }
    if (value.includes("\0") || value.includes("..") || path.isAbsolute(value)) {
      throw new Error("Attachment relativePath must not contain traversal sequences.");
    }
  }
}

function decodeBase64(value: string): Buffer {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Attachment body is empty.");
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
    throw new Error("Attachment body is not valid base64.");
  }
  const cleaned = value.replace(/[\r\n]/g, "");
  return Buffer.from(cleaned, "base64");
}

function classifyMime(mime: string): "text" | "binary" | "reject" {
  if (typeof mime !== "string" || mime.length === 0 || mime.length > 255) return "reject";
  if (TEXT_MIME_BLOCKLIST.some((pattern) => pattern.test(mime))) return "reject";
  if (mime === "application/json" || mime === "application/xml" || mime === "application/x-yaml") return "text";
  if (TEXT_MIME_PATTERN.test(mime)) return "text";
  if (SUPPORTED_BINARY_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return "binary";
  if (/\+json$|\+xml$|\+yaml$/.test(mime)) return "text";
  return "reject";
}

function detectFormat(relativePath: string): DocumentFormat {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pdf")) return "pdf";
  return "txt";
}

function boundText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function splitParagraphs(value: string): DocumentBlock[] {
  if (value.length === 0) return [makeParagraph("")];
  const paragraphs = value.split(/\n{2,}/g).map((p) => p.trim()).filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [makeParagraph(value)];
  return paragraphs.map(makeParagraph);
}

function makeParagraph(text: string): DocumentBlock {
  return { id: `blk_${randomUUID().replace(/-/g, "").slice(0, 16)}`, type: "paragraph", text };
}

function buildBinaryPlaceholder(request: AttachmentImportRequest): { blocks: DocumentBlock[]; metadata: Record<string, string | number | boolean | null> } {
  const display = request.displayName ?? path.basename(request.relativePath);
  const metadata: Record<string, string | number | boolean | null> = {
    contentKind: "binary",
    contentNote: "Binary content was not extracted. The original file bytes were discarded after import.",
  };
  const blocks: DocumentBlock[] = [
    makeParagraph(`Imported attachment "${display}" (${request.mimeType}).`),
    makeParagraph("Binary content was not extracted into this document. The original bytes were discarded after import so secrets are not retained."),
  ];
  return { blocks, metadata };
}

function countRedactedBytes(original: string, redacted: string): number {
  return Math.max(0, original.length - redacted.length);
}
