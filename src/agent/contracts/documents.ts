export type DocumentFormat = "txt" | "md" | "json" | "csv" | "html" | "docx" | "pdf";

export type DocumentBlock =
  | { id: string; type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "list"; ordered: boolean; items: Array<{ id: string; text: string }> }
  | { id: string; type: "table"; rows: Array<{ id: string; cells: Array<{ id: string; text: string }> }> }
  | { id: string; type: "code"; language?: string; text: string }
  | { id: string; type: "quote"; text: string }
  | { id: string; type: "image"; blobId: string; altText?: string; caption?: string }
  | { id: string; type: "pageBreak" };

export interface DocumentWarning {
  code:
    | "formatting_loss_possible"
    | "unsupported_embedded_object"
    | "external_link_removed"
    | "macro_removed"
    | "font_substitution"
    | "pdf_reflow"
    | "table_layout_changed";
  message: string;
}

export interface ManagedDocument {
  id: string;
  projectId: string;
  displayName: string;
  libraryRelativePath: string;
  originalFormat: DocumentFormat;
  sourceBlobId?: string;
  currentRevisionId: string;
  createdAt: string;
  updatedAt: string;
  importedAt?: string;
  metadata: Record<string, string | number | boolean | null>;
  sensitivity: "normal" | "sensitive";
}

export interface DocumentRevision {
  id: string;
  documentId: string;
  parentRevisionId?: string;
  createdAt: string;
  createdBy: "user" | "agent" | "import" | "restore";
  summary: string;
  contentHash: string;
  blocks: DocumentBlock[];
  sourceFormat: DocumentFormat;
  warnings: DocumentWarning[];
}

export type DocumentEditOperation =
  | { operation: "replace_block"; blockId: string; expectedBlockHash: string; block: DocumentBlock }
  | { operation: "replace_text"; blockId: string; expectedTextHash: string; searchText: string; replacementText: string; occurrence: number }
  | { operation: "insert_before"; blockId: string; expectedBlockHash: string; blocks: DocumentBlock[] }
  | { operation: "insert_after"; blockId: string; expectedBlockHash: string; blocks: DocumentBlock[] }
  | { operation: "delete_block"; blockId: string; expectedBlockHash: string }
  | { operation: "move_block"; blockId: string; expectedBlockHash: string; destinationBlockId: string; position: "before" | "after" };

export interface DocumentReadResult {
  documentId: string;
  revisionId: string;
  displayName: string;
  format: DocumentFormat;
  blocks: DocumentBlock[];
  nextCursor: string | null;
  totalBlocks: number;
  contentHash: string;
  warnings: DocumentWarning[];
}
