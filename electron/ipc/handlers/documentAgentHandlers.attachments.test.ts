// VERIFY-154 regression guard
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const auditRecord = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const attachmentsPromote = vi.hoisted(() => vi.fn(async () => ({
  document: { id: "doc_1", projectId: "project_alpha" },
  revision: { id: "rev_1", documentId: "doc_1", createdBy: "import" },
  mode: "text" as const,
  format: "txt" as const,
  bytesReceived: 11,
  bytesRedacted: 0,
})));
const attachmentsPromoteError = vi.hoisted(() => vi.fn(async () => {
  throw new Error("Attachment exceeds the 1048576-byte import limit.");
}));
const getProfileSessionId = vi.hoisted(() => vi.fn(() => "profile_default"));

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) },
  app: { getPath: vi.fn(() => "/tmp/vf-doc-agent-test") },
  BrowserWindow: class {},
  dialog: { showSaveDialog: vi.fn(async () => ({ canceled: true })) },
}));

vi.mock("../../services/profileSession", () => ({ getProfileSessionId }));

vi.mock("../../agent/documents/managed-document-service", () => ({
  ManagedDocumentService: class {
    create = vi.fn(async () => ({
      document: { id: "doc_unused", metadata: {} },
      revision: { id: "rev_unused" },
    }));
  },
}));
vi.mock("../../agent/documents/workspace-grant-service", () => ({
  WorkspaceGrantService: class {
    choose = vi.fn();
    revoke = vi.fn();
    list = vi.fn();
  },
}));
vi.mock("../../agent/workspace/workspace-filesystem-service", () => ({
  WorkspaceFilesystemService: class {
    list = vi.fn();
    read = vi.fn();
    search = vi.fn();
  },
}));
vi.mock("../../agent/approvals/approval-coordinator", () => ({
  ApprovalCoordinator: class {
    list = vi.fn();
    decide = vi.fn();
  },
}));
vi.mock("../../agent/audit/document-agent-audit-service", () => ({
  DocumentAgentAuditService: class {
    record = auditRecord;
  },
}));
vi.mock("../../agent/documents/attachment-import-service", () => ({
  AttachmentImportService: class {
    promote = attachmentsPromote;
  },
}));

import { registerDocumentAgentHandlers } from "./documentAgentHandlers";
import { clearRegisteredChannelsForTesting } from "./common";

function resetMocks(): void {
  attachmentsPromote.mockClear();
  attachmentsPromote.mockImplementation(async () => ({
    document: { id: "doc_1", projectId: "project_alpha" },
    revision: { id: "rev_1", documentId: "doc_1", createdBy: "import" },
    mode: "text" as const,
    format: "txt" as const,
    bytesReceived: 11,
    bytesRedacted: 0,
  }));
  attachmentsPromoteError.mockClear();
  auditRecord.mockClear();
  handlers.clear();
  clearRegisteredChannelsForTesting();
}

describe("documentAgent:attachments:promote channel", () => {
  it("VERIFY-154 returns ok envelope, forwards profile authority, and audits execution with resourceId + metadata", async () => {
    resetMocks();
    registerDocumentAgentHandlers();
    const handler = handlers.get("documentAgent:attachments:promote");
    expect(handler).toBeTypeOf("function");

    const event = { sender: { id: 42 } } as unknown as Electron.IpcMainInvokeEvent;
    const envelope = await handler!(event, {
      attachmentId: "att_001",
      projectId: "project_alpha",
      relativePath: "promoted/notes.txt",
      mimeType: "text/plain",
      bodyB64: Buffer.from("hello world", "utf8").toString("base64"),
    });

    expect(getProfileSessionId).toHaveBeenCalledWith(event.sender);
    expect(attachmentsPromote).toHaveBeenCalledTimes(1);
    const callArgs = attachmentsPromote.mock.calls[0];
    expect(callArgs[0]).toBe("profile_default");
    expect(callArgs[1]).toMatchObject({
      attachmentId: "att_001",
      projectId: "project_alpha",
      relativePath: "promoted/notes.txt",
      mimeType: "text/plain",
    });

    expect(envelope.ok).toBe(true);
    expect(envelope.document.id).toBe("doc_1");
    expect(envelope.mode).toBe("text");
    expect(envelope.format).toBe("txt");

    expect(auditRecord).toHaveBeenCalledTimes(1);
    const auditInput = auditRecord.mock.calls[0][0];
    expect(auditInput.toolName).toBe("document.promoteAttachment");
    expect(auditInput.outcome).toBe("execution");
    expect(auditInput.resourceIds).toEqual(["doc_1"]);
    expect(auditInput.metadata).toMatchObject({
      attachmentId: "att_001",
      mimeType: "text/plain",
      sizeBytes: 11,
      format: "txt",
      mode: "text",
      bytesRedacted: 0,
    });
    expect(auditInput.sessionId).toMatch(/^runtime_/);
  });

  it("returns an ok:false envelope without leaking raw Error.message on failure", async () => {
    resetMocks();
    attachmentsPromote.mockImplementationOnce(attachmentsPromoteError);
    registerDocumentAgentHandlers();

    const handler = handlers.get("documentAgent:attachments:promote")!;
    const envelope = await handler({ sender: { id: 7 } } as unknown as Electron.IpcMainInvokeEvent, {
      attachmentId: "att_big",
      projectId: "project_alpha",
      relativePath: "promoted/big.bin",
      mimeType: "application/octet-stream",
      bodyB64: Buffer.alloc(2_000_000, "x").toString("base64"),
    });

    expect(envelope.ok).toBe(false);
    expect(typeof envelope.error).toBe("string");
    expect(envelope.error.length).toBeGreaterThan(0);
    // No raw Error.message leaks
    expect(envelope.error).not.toContain("attachment import limit");
    // Audit should NOT be recorded for failed execution
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("returns an ok:false envelope for unsupported mime and missing attachmentId without invoking import service", async () => {
    resetMocks();
    registerDocumentAgentHandlers();
    const handler = handlers.get("documentAgent:attachments:promote")!;

    const unsupported = await handler({ sender: { id: 7 } } as unknown as Electron.IpcMainInvokeEvent, {
      attachmentId: "att_x",
      projectId: "project_alpha",
      relativePath: "promoted/file.bin",
      mimeType: "application/x-bogus",
      bodyB64: Buffer.from("data", "utf8").toString("base64"),
    });
    expect(unsupported.ok).toBe(false);
    expect(attachmentsPromote).toHaveBeenCalledTimes(1);
    expect(unsupported.error).not.toContain("Error:");

    const missing = await handler({ sender: { id: 7 } } as unknown as Electron.IpcMainInvokeEvent, {
      projectId: "project_alpha",
      relativePath: "promoted/file.txt",
      mimeType: "text/plain",
      bodyB64: Buffer.from("data", "utf8").toString("base64"),
    });
    expect(missing.ok).toBe(false);
  });
});
