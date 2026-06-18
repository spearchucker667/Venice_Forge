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

export interface IngestedAttachment {
  id: string;
  kind: IngestedAttachmentKind;
  name: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;

  text?: string;
  markdown?: string;
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
