import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DocumentBlock,
  DocumentEditOperation,
  DocumentFormat,
  DocumentReadResult,
  DocumentRevision,
  DocumentWarning,
  ManagedDocument,
} from "../../../src/agent/contracts/documents";
import { applyDocumentEdits, canonicalHash, validateDocumentBlocks } from "./document-patch-engine";
import { assertRelativeWorkspacePath } from "../workspace/path-policy";

interface DocumentIndex {
  version: 1;
  documents: ManagedDocument[];
  revisions: DocumentRevision[];
}

interface CreateDocumentInput {
  projectId: string;
  relativePath: string;
  format: DocumentFormat;
  blocks: DocumentBlock[];
  displayName?: string;
  warnings?: DocumentWarning[];
  metadata?: ManagedDocument["metadata"];
  createdBy?: "user" | "import";
}

const ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;
const MAX_BLOCKS_PER_READ = 100;
const MAX_TOTAL_BLOCKS = 20_000;

function assertId(value: string, label: string): void {
  if (!ID_RE.test(value)) throw new Error(`Invalid ${label}.`);
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { v?: unknown; offset?: unknown };
    if (parsed.v !== 1 || !Number.isSafeInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error();
    return Number(parsed.offset);
  } catch {
    throw new Error("Invalid document cursor.");
  }
}

function emptyIndex(): DocumentIndex {
  return { version: 1, documents: [], revisions: [] };
}

export class ManagedDocumentService {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storageRoot: string) {}

  private profileDirectory(profileId: string): string {
    assertId(profileId, "profile id");
    return path.join(this.storageRoot, profileId);
  }

  private indexPath(profileId: string): string {
    return path.join(this.profileDirectory(profileId), "documents.json");
  }

  private async readIndex(profileId: string): Promise<DocumentIndex> {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.indexPath(profileId), "utf8")) as DocumentIndex;
      if (parsed.version !== 1 || !Array.isArray(parsed.documents) || !Array.isArray(parsed.revisions)) throw new Error();
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyIndex();
      throw new Error("Managed document storage is corrupt or unreadable.");
    }
  }

  private async writeIndex(profileId: string, index: DocumentIndex): Promise<void> {
    const directory = this.profileDirectory(profileId);
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    const target = this.indexPath(profileId);
    const temporary = path.join(directory, `.documents.json.vf-tmp-${randomUUID()}`);
    try {
      const handle = await fs.promises.open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(index), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.promises.rename(temporary, target);
    } finally {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release = () => {};
    this.operationQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async create(profileId: string, input: CreateDocumentInput): Promise<{ document: ManagedDocument; revision: DocumentRevision }> {
    return this.mutate(async () => {
      assertId(input.projectId, "project id");
      const relativePath = assertRelativeWorkspacePath(input.relativePath);
      if (input.blocks.length > MAX_TOTAL_BLOCKS) throw new Error("Document contains too many blocks.");
      validateDocumentBlocks(input.blocks);
      const index = await this.readIndex(profileId);
      if (index.documents.some((document) => document.projectId === input.projectId && document.libraryRelativePath === relativePath)) {
        throw new Error("A managed document already exists at that library path.");
      }
      const now = new Date().toISOString();
      const documentId = `doc_${randomUUID()}`;
      const revisionId = `rev_${randomUUID()}`;
      const blocks = structuredClone(input.blocks);
      const revision: DocumentRevision = {
        id: revisionId,
        documentId,
        createdAt: now,
        createdBy: input.createdBy ?? "user",
        summary: "Created document",
        contentHash: canonicalHash(blocks),
        blocks,
        sourceFormat: input.format,
        warnings: structuredClone(input.warnings ?? []),
      };
      const document: ManagedDocument = {
        id: documentId,
        projectId: input.projectId,
        displayName: (input.displayName || path.basename(relativePath)).slice(0, 255),
        libraryRelativePath: relativePath,
        originalFormat: input.format,
        currentRevisionId: revisionId,
        createdAt: now,
        updatedAt: now,
        metadata: structuredClone(input.metadata ?? {}),
        sensitivity: "normal",
      };
      index.documents.push(document);
      index.revisions.push(revision);
      await this.writeIndex(profileId, index);
      return { document: structuredClone(document), revision: structuredClone(revision) };
    });
  }

  async list(profileId: string, projectId: string): Promise<ManagedDocument[]> {
    assertId(projectId, "project id");
    const index = await this.readIndex(profileId);
    return index.documents.filter((document) => document.projectId === projectId).map((document) => structuredClone(document));
  }

  async read(profileId: string, documentId: string, revisionId?: string | null, cursor?: string | null): Promise<DocumentReadResult> {
    assertId(documentId, "document id");
    const index = await this.readIndex(profileId);
    const document = index.documents.find((entry) => entry.id === documentId);
    if (!document) throw new Error("Managed document not found.");
    const selectedRevisionId = revisionId || document.currentRevisionId;
    assertId(selectedRevisionId, "revision id");
    const revision = index.revisions.find((entry) => entry.id === selectedRevisionId && entry.documentId === documentId);
    if (!revision) throw new Error("Document revision not found.");
    const offset = decodeCursor(cursor);
    if (offset > revision.blocks.length) throw new Error("Document cursor is out of range.");
    const blocks = revision.blocks.slice(offset, offset + MAX_BLOCKS_PER_READ);
    const nextOffset = offset + blocks.length;
    return {
      documentId,
      revisionId: revision.id,
      displayName: document.displayName,
      format: revision.sourceFormat,
      blocks: structuredClone(blocks),
      nextCursor: nextOffset < revision.blocks.length ? encodeCursor(nextOffset) : null,
      totalBlocks: revision.blocks.length,
      contentHash: revision.contentHash,
      warnings: structuredClone(revision.warnings),
    };
  }

  async listRevisions(profileId: string, documentId: string): Promise<Array<Omit<DocumentRevision, "blocks">>> {
    assertId(documentId, "document id");
    const index = await this.readIndex(profileId);
    return index.revisions
      .filter((revision) => revision.documentId === documentId)
      .map(({ blocks: _blocks, ...revision }) => structuredClone(revision));
  }

  async prepareEdits(profileId: string, input: { documentId: string; baseRevisionId: string; operations: DocumentEditOperation[] }): Promise<{ before: DocumentBlock[]; after: DocumentBlock[]; resultingContentHash: string }> {
    assertId(input.documentId, "document id");
    assertId(input.baseRevisionId, "revision id");
    const index = await this.readIndex(profileId);
    const document = index.documents.find((entry) => entry.id === input.documentId);
    if (!document) throw new Error("Managed document not found.");
    if (document.currentRevisionId !== input.baseRevisionId) throw new Error("STALE_REVISION");
    const base = index.revisions.find((revision) => revision.id === input.baseRevisionId && revision.documentId === input.documentId);
    if (!base) throw new Error("Document revision not found.");
    const after = applyDocumentEdits(base.blocks, input.operations);
    return { before: structuredClone(base.blocks), after, resultingContentHash: canonicalHash(after) };
  }

  async getRevisionForSerialization(profileId: string, documentId: string, revisionId?: string | null): Promise<{ document: ManagedDocument; revision: DocumentRevision }> {
    assertId(documentId, "document id");
    const index = await this.readIndex(profileId);
    const document = index.documents.find((entry) => entry.id === documentId);
    if (!document) throw new Error("Managed document not found.");
    const selectedRevisionId = revisionId || document.currentRevisionId;
    const revision = index.revisions.find((entry) => entry.id === selectedRevisionId && entry.documentId === documentId);
    if (!revision) throw new Error("Document revision not found.");
    return { document: structuredClone(document), revision: structuredClone(revision) };
  }

  async applyEdits(profileId: string, input: { documentId: string; baseRevisionId: string; summary: string; operations: DocumentEditOperation[] }): Promise<DocumentRevision> {
    return this.mutate(async () => {
      assertId(input.documentId, "document id");
      assertId(input.baseRevisionId, "revision id");
      if (!input.summary || input.summary.length > 500) throw new Error("Invalid edit summary.");
      const index = await this.readIndex(profileId);
      const document = index.documents.find((entry) => entry.id === input.documentId);
      if (!document) throw new Error("Managed document not found.");
      if (document.currentRevisionId !== input.baseRevisionId) throw new Error("STALE_REVISION");
      const base = index.revisions.find((revision) => revision.id === input.baseRevisionId && revision.documentId === input.documentId);
      if (!base) throw new Error("Document revision not found.");
      const blocks = applyDocumentEdits(base.blocks, input.operations);
      const now = new Date().toISOString();
      const revision: DocumentRevision = {
        id: `rev_${randomUUID()}`,
        documentId: document.id,
        parentRevisionId: base.id,
        createdAt: now,
        createdBy: "agent",
        summary: input.summary,
        contentHash: canonicalHash(blocks),
        blocks,
        sourceFormat: base.sourceFormat,
        warnings: structuredClone(base.warnings),
      };
      index.revisions.push(revision);
      document.currentRevisionId = revision.id;
      document.updatedAt = now;
      await this.writeIndex(profileId, index);
      return structuredClone(revision);
    });
  }

  async restore(profileId: string, input: { documentId: string; currentRevisionId: string; restoreRevisionId: string; reason: string }): Promise<DocumentRevision> {
    return this.mutate(async () => {
      assertId(input.documentId, "document id");
      assertId(input.currentRevisionId, "revision id");
      assertId(input.restoreRevisionId, "restore revision id");
      const index = await this.readIndex(profileId);
      const document = index.documents.find((entry) => entry.id === input.documentId);
      if (!document) throw new Error("Managed document not found.");
      if (document.currentRevisionId !== input.currentRevisionId) throw new Error("STALE_REVISION");
      const source = index.revisions.find((revision) => revision.id === input.restoreRevisionId && revision.documentId === input.documentId);
      if (!source) throw new Error("Document revision not found.");
      const now = new Date().toISOString();
      const revision: DocumentRevision = {
        ...structuredClone(source),
        id: `rev_${randomUUID()}`,
        parentRevisionId: document.currentRevisionId,
        createdAt: now,
        createdBy: "restore",
        summary: input.reason.slice(0, 500),
      };
      index.revisions.push(revision);
      document.currentRevisionId = revision.id;
      document.updatedAt = now;
      await this.writeIndex(profileId, index);
      return structuredClone(revision);
    });
  }
}
