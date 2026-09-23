export type IngestedAttachmentKind =
  | "text"
  | "markdown"
  | "code"
  | "pdf"
  | "docx"
  | "doc"
  | "image"
  | "spreadsheet"
  | "url"
  | "unknown";

export type IngestionExtractionRoute =
  | "local-text"
  | "local-code"
  | "local-markdown"
  | "local-pdf-text-layer"
  | "local-docx"
  | "browser-image-decode"
  | "venice-text-parser"
  | "vision-model"
  | "unsupported";

export interface AttachmentChunk {
  attachmentId: string;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  /** 1-based source line range for this chunk, when line info was computed. */
  lineStart?: number;
  lineEnd?: number;
  tokenEstimate: number;
  text: string;
  /** SHA-256 hex digest of the chunk text, when hashing was performed. */
  contentHash?: string;
  provenance: {
    name: string;
    mimeType: string;
    /** Original source path when available; renderer File objects only expose
     *  the basename, so this is typically the file name. */
    sourcePath?: string;
    /** Language hint (extension- or shebang-derived) when known. */
    language?: string;
  };
}

export interface IngestedAttachment {
  id: string;
  /** Optional main-process registry id enabling Document Agent promotion. */
  attachmentId?: string;
  kind: IngestedAttachmentKind;
  name: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;

  text?: string;
  markdown?: string;
  /** Ordered extracted chunks retained separately from the provider-selected
   *  `text` envelope. Chunks are bounded by resource limits and may be
   *  selected later according to the active model context window. */
  chunks?: AttachmentChunk[];
  dataUrl?: string;
  objectUrl?: string;

  language?: string;
  pageCount?: number;
  image?: {
    width?: number;
    height?: number;
    animated?: boolean;
    originalMimeType: string;
    normalizedMimeType?: string;
  };

  extraction: {
    route: IngestionExtractionRoute;
    local: boolean;
    truncated: boolean;
    warnings: string[];
    errors: string[];
  };

  modelRequirements: {
    requiresVision: boolean;
    canFallbackToText: boolean;
  };

  security: {
    untrusted: true;
    macrosExecuted: false;
    scriptsExecuted: false;
    htmlSanitized: boolean;
  };
}

export interface AssembledIngestionContext {
  text: string;
  images: Array<{
    id: string;
    name: string;
    dataUrl: string;
    mimeType: string;
  }>;
  notices: string[];
  truncated: boolean;
}
