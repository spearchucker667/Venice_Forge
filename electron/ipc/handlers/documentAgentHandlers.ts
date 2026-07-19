import { app, BrowserWindow, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DocumentBlock, DocumentEditOperation, DocumentFormat } from "../../../src/agent/contracts/documents";
import type { WorkspaceGrant } from "../../../src/agent/contracts/capabilities";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { ApprovalCoordinator } from "../../agent/approvals/approval-coordinator";
import { DocumentAgentAuditService } from "../../agent/audit/document-agent-audit-service";
import { ManagedDocumentService } from "../../agent/documents/managed-document-service";
import { AttachmentImportService } from "../../agent/documents/attachment-import-service";
import { serializeDocument } from "../../agent/documents/document-serializer-service";
import { WorkspaceGrantService } from "../../agent/policy/workspace-grant-service";
import { WorkspaceFilesystemService } from "../../agent/workspace/workspace-filesystem-service";
import { getProfileSessionId } from "../../services/profileSession";
import { registerIpcChannel } from "./common";

import { getAgentServices, RUNTIME_SESSION_ID } from "../../agent/runtime/agent-services";

const DOCUMENT_FORMATS = new Set<DocumentFormat>(["txt", "md", "json", "csv", "html", "docx", "pdf"]);

type DocumentEditPlan = {
  kind: "document_edit";
  profileId: string;
  documentId: string;
  baseRevisionId: string;
  summary: string;
  operations: DocumentEditOperation[];
};

type WorkspaceChangesetPlan = {
  kind: "workspace_changeset";
  profileId: string;
  grantId: string;
  agentSessionId?: string;
  workspaceId: string;
  summary: string;
  changes: import("../../../src/agent/contracts/workspace").WorkspaceChange[];
};
type WorkspaceMovePlan = {
  kind: "workspace_move";
  profileId: string;
  grantId: string;
  agentSessionId?: string;
  workspaceId: string;
  sourcePath: string;
  destinationPath: string;
};
type WorkspaceTrashPlan = {
  kind: "workspace_trash";
  profileId: string;
  grantId: string;
  agentSessionId?: string;
  workspaceId: string;
  relativePath: string;
};

function isWorkspaceChangesetPlan(value: unknown): value is WorkspaceChangesetPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<WorkspaceChangesetPlan>;
  return plan.kind === "workspace_changeset" && typeof plan.profileId === "string" && typeof plan.grantId === "string" && typeof plan.workspaceId === "string" && typeof plan.summary === "string" && Array.isArray(plan.changes);
}
function isWorkspaceMovePlan(value: unknown): value is WorkspaceMovePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<WorkspaceMovePlan>;
  return plan.kind === "workspace_move" && typeof plan.profileId === "string" && typeof plan.grantId === "string" && typeof plan.workspaceId === "string" && typeof plan.sourcePath === "string" && typeof plan.destinationPath === "string";
}
function isWorkspaceTrashPlan(value: unknown): value is WorkspaceTrashPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<WorkspaceTrashPlan>;
  return plan.kind === "workspace_trash" && typeof plan.profileId === "string" && typeof plan.grantId === "string" && typeof plan.workspaceId === "string" && typeof plan.relativePath === "string";
}

type DocumentRestorePlan = {
  kind: "document_restore";
  profileId: string;
  documentId: string;
  currentRevisionId: string;
  restoreRevisionId: string;
  reason: string;
};

function rendererSession(senderId: number, agentSessionId?: string): string {
  if (agentSessionId && !/^[a-zA-Z0-9_.-]{1,128}$/.test(agentSessionId)) throw new Error("Invalid agent session id.");
  return `${RUNTIME_SESSION_ID}:renderer_${senderId}${agentSessionId ? `:agent_${agentSessionId}` : ""}`;
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid document-agent payload.");
  return input as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string, max = 500): string {
  if (typeof value[key] !== "string" || value[key].length === 0 || value[key].length > max) throw new Error(`Invalid ${key}.`);
  return value[key];
}

function optionalString(value: Record<string, unknown>, key: string): string | null {
  if (value[key] === undefined || value[key] === null) return null;
  return stringField(value, key);
}

function documentFormat(value: Record<string, unknown>): DocumentFormat {
  const format = stringField(value, "format", 10) as DocumentFormat;
  if (!DOCUMENT_FORMATS.has(format)) throw new Error("Unsupported document format.");
  return format;
}

function publicGrant(grant: WorkspaceGrant) {
  return {
    id: grant.id,
    workspaceId: grant.workspaceId,
    displayName: grant.displayName,
    allowedOperations: grant.allowedOperations,
    allowedExtensions: grant.allowedExtensions,
    limits: {
      maxReadBytes: grant.maxReadBytes,
      maxWriteBytes: grant.maxWriteBytes,
      maxFilesPerOperation: grant.maxFilesPerOperation,
      maxTotalChangeBytes: grant.maxTotalChangeBytes,
    },
    expiresAt: grant.expiresAt,
  };
}

function isDocumentEditPlan(value: unknown): value is DocumentEditPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<DocumentEditPlan>;
  return plan.kind === "document_edit" && typeof plan.profileId === "string" && typeof plan.documentId === "string"
    && typeof plan.baseRevisionId === "string" && typeof plan.summary === "string" && Array.isArray(plan.operations);
}

function isDocumentRestorePlan(value: unknown): value is DocumentRestorePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<DocumentRestorePlan>;
  return plan.kind === "document_restore" && typeof plan.profileId === "string" && typeof plan.documentId === "string"
    && typeof plan.currentRevisionId === "string" && typeof plan.restoreRevisionId === "string" && typeof plan.reason === "string";
}

async function atomicExternalWrite(target: string, bytes: Uint8Array): Promise<void> {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.vf-tmp-${randomUUID()}`);
  try {
    const handle = await fs.promises.open(temporary, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await fs.promises.rename(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export function registerDocumentAgentHandlers(): void {
  const { documents, attachments, approvals, audit, workspaceGrants, workspaceFiles, workspaceMutations } = getAgentServices();

  registerIpcChannel("documentAgent:documents:create", async (event, input: unknown) => {
    try {
      const value = record(input);
      if (value.overwrite !== false || !Array.isArray(value.blocks)) throw new Error("Managed document creation requires overwrite=false and normalized blocks.");
      const result = await documents.create(getProfileSessionId(event.sender), {
        projectId: stringField(value, "projectId", 128),
        relativePath: stringField(value, "relativePath"),
        format: documentFormat(value),
        blocks: value.blocks as DocumentBlock[],
        displayName: typeof value.displayName === "string" ? value.displayName : undefined,
      });
      await audit.record({ sessionId: rendererSession(event.sender.id), toolName: "document.create", outcome: "execution", resourceIds: [result.document.id] });
      return { ok: true, result };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:documents:list", async (event, projectId: unknown) => {
    try { return { ok: true, documents: await documents.list(getProfileSessionId(event.sender), typeof projectId === "string" ? projectId : "") }; }
    catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:documents:read", async (event, input: unknown) => {
    try {
      const value = record(input);
      return { ok: true, result: await documents.read(getProfileSessionId(event.sender), stringField(value, "documentId", 128), optionalString(value, "revisionId"), optionalString(value, "cursor")) };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:documents:revisions", async (event, documentId: unknown) => {
    try { return { ok: true, revisions: await documents.listRevisions(getProfileSessionId(event.sender), typeof documentId === "string" ? documentId : "") }; }
    catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:documents:proposeEdits", async (event, input: unknown) => {
    try {
      const value = record(input);
      if (!Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > 200) throw new Error("Invalid edit operations.");
      const profileId = getProfileSessionId(event.sender);
      const documentId = stringField(value, "documentId", 128);
      const baseRevisionId = stringField(value, "baseRevisionId", 128);
      const summary = stringField(value, "summary");
      const operations = structuredClone(value.operations) as DocumentEditOperation[];
      const preview = await documents.prepareEdits(profileId, { documentId, baseRevisionId, operations });
      const pending = await approvals.prepare({
        grantId: `limited:${profileId}`,
        proposalType: "document_edit",
        canonicalToolName: "document.proposeEdits",
        validatedArguments: { documentId, baseRevisionId, summary, operations },
        baseRevisionIds: [baseRevisionId],
        affectedResources: [documentId],
        publicSummary: { summary, before: preview.before, after: preview.after, resultingContentHash: preview.resultingContentHash },
        privateExecutionPlan: { kind: "document_edit", profileId, documentId, baseRevisionId, summary, operations } satisfies DocumentEditPlan,
      });
      await audit.record({ sessionId: rendererSession(event.sender.id), toolName: "document.proposeEdits", outcome: "proposal", resourceIds: [documentId] });
      return { ok: true, pendingApproval: pending, preview };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:approvals:decide", async (event, input: unknown) => {
    try {
      const value = record(input);
      const decision = stringField(value, "decision", 10);
      if (decision !== "approve" && decision !== "reject") throw new Error("Invalid approval decision.");
      const decided = await approvals.decide({ pendingApprovalId: stringField(value, "pendingApprovalId", 128), proposalHash: stringField(value, "proposalHash", 128), decision });
      if (decision === "reject") return { ok: true, rejected: true };
      const plan = decided.privateExecutionPlan;
      if (!isDocumentEditPlan(plan) && !isDocumentRestorePlan(plan) && !isWorkspaceChangesetPlan(plan) && !isWorkspaceMovePlan(plan) && !isWorkspaceTrashPlan(plan)) throw new Error("Invalid stored execution plan.");
      if (plan.profileId !== getProfileSessionId(event.sender)) throw new Error("APPROVAL_MISMATCH");
      
      if (isDocumentEditPlan(plan) || isDocumentRestorePlan(plan)) {
        const revision = await approvals.withResourceLocks([plan.documentId], () => isDocumentEditPlan(plan)
          ? documents.applyEdits(plan.profileId, plan)
          : documents.restore(plan.profileId, plan));
        await audit.record({ sessionId: rendererSession(event.sender.id), toolName: isDocumentEditPlan(plan) ? "document.applyApprovedEdits" : "document.restoreRevision", outcome: "execution", resourceIds: [plan.documentId] });
        return { ok: true, revision };
      }
      
      const session = rendererSession(event.sender.id, plan.agentSessionId);
      const grant = workspaceGrants.get(plan.grantId, session);
      if (!grant || grant.workspaceId !== plan.workspaceId) throw new Error("CAPABILITY_DENIED");
      
      if (isWorkspaceChangesetPlan(plan)) {
        const result = await workspaceMutations.applyChangeset({ grant, sessionId: session, changes: plan.changes, proposalId: decided.approval.id });
        await audit.record({ sessionId: session, toolName: "workspace.applyApprovedChangeset", outcome: "execution", resourceIds: result.committed });
        return { ok: true, committed: result.committed };
      } else if (isWorkspaceMovePlan(plan)) {
        await workspaceMutations.move({ grant, sessionId: session, sourcePath: plan.sourcePath, destinationPath: plan.destinationPath });
        await audit.record({ sessionId: session, toolName: "workspace.move", outcome: "execution", resourceIds: [plan.sourcePath, plan.destinationPath] });
        return { ok: true };
      } else if (isWorkspaceTrashPlan(plan)) {
        const recovery = await workspaceMutations.trash({ grant, sessionId: session, relativePath: plan.relativePath });
        await audit.record({ sessionId: session, toolName: "workspace.trash", outcome: "execution", resourceIds: [plan.relativePath], metadata: { recoveryId: recovery.id } });
        return { ok: true, recovery };
      }
      return { ok: false };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:documents:proposeRestore", async (event, input: unknown) => {
    try {
      const value = record(input);
      const profileId = getProfileSessionId(event.sender);
      const documentId = stringField(value, "documentId", 128);
      const currentRevisionId = stringField(value, "currentRevisionId", 128);
      const restoreRevisionId = stringField(value, "restoreRevisionId", 128);
      const reason = stringField(value, "reason");
      const source = await documents.getRevisionForSerialization(profileId, documentId, restoreRevisionId);
      const pending = await approvals.prepare({
        grantId: `limited:${profileId}`,
        proposalType: "document_restore",
        canonicalToolName: "document.restoreRevision",
        validatedArguments: { documentId, currentRevisionId, restoreRevisionId, reason },
        baseRevisionIds: [currentRevisionId, restoreRevisionId],
        affectedResources: [documentId],
        publicSummary: { reason, restoreRevisionId, blocks: source.revision.blocks, warnings: source.revision.warnings },
        privateExecutionPlan: { kind: "document_restore", profileId, documentId, currentRevisionId, restoreRevisionId, reason } satisfies DocumentRestorePlan,
      });
      return { ok: true, pendingApproval: pending, preview: { blocks: source.revision.blocks, warnings: source.revision.warnings } };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:approvals:list", async (event) => {
    try {
      const grantId = `limited:${getProfileSessionId(event.sender)}`;
      return { ok: true, pending: (await approvals.listPendingWithViews()).filter((entry: any) => entry.approval.grantId === grantId) };
    }
    catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:documents:export", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) throw new Error("Export sender was rejected.");
      const value = record(input);
      const format = documentFormat(value);
      const source = await documents.getRevisionForSerialization(getProfileSessionId(event.sender), stringField(value, "documentId", 128), optionalString(value, "revisionId"));
      const output = await serializeDocument(format, { kind: "blocks", title: source.document.displayName, blocks: source.revision.blocks });
      if (!output.validation.valid) throw new Error("Serialized output failed validation.");
      const suggested = path.basename(stringField(value, "suggestedFileName", 255));
      // verify-no-native-dialogs: allow — Document Agent export is explicitly user-mediated.
      const selected = await dialog.showSaveDialog(owner, { title: "Export managed document", defaultPath: suggested, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (selected.canceled || !selected.filePath) return { ok: true, canceled: true };
      await atomicExternalWrite(selected.filePath, output.bytes);
      await audit.record({ sessionId: rendererSession(event.sender.id), toolName: "document.export", outcome: "execution", resourceIds: [source.document.id], metadata: { format, sizeBytes: output.bytes.byteLength } });
      return { ok: true, exported: true, displayName: path.basename(selected.filePath), format, sizeBytes: output.bytes.byteLength, warnings: output.warnings };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:attachments:promote", async (event, input: unknown) => {
    try {
      const value = record(input);
      const attachmentId = stringField(value, "attachmentId", 128);
      const mimeType = stringField(value, "mimeType", 255).toLowerCase();
      const result = await attachments.promote(getProfileSessionId(event.sender), {
        attachmentId,
        projectId: stringField(value, "projectId", 128),
        relativePath: stringField(value, "relativePath"),
        displayName: typeof value.displayName === "string" ? value.displayName : undefined,
        mimeType,
        bodyB64: stringField(value, "bodyB64"),
      });
      await audit.record({
        sessionId: rendererSession(event.sender.id),
        toolName: "document.promoteAttachment",
        outcome: "execution",
        resourceIds: [result.document.id],
        metadata: {
          attachmentId,
          mimeType,
          sizeBytes: result.bytesReceived,
          format: result.format,
          mode: result.mode,
          bytesRedacted: result.bytesRedacted,
        },
      });
      return {
        ok: true,
        document: result.document,
        revision: result.revision,
        mode: result.mode,
        format: result.format,
        bytesReceived: result.bytesReceived,
        bytesRedacted: result.bytesRedacted,
      };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:workspace:choose", async (event, input: unknown) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) throw new Error("Workspace picker sender was rejected.");
      // verify-no-native-dialogs: allow — explicit workspace grant selection.
      const selected = await dialog.showOpenDialog(owner, { title: "Select one workspace", properties: ["openDirectory"] });
      if (selected.canceled || !selected.filePaths[0]) return { ok: true, canceled: true };
      const value = record(input);
      const grant = await workspaceGrants.issue({ sessionId: rendererSession(event.sender.id, stringField(value, "agentSessionId", 128)), rootPath: selected.filePaths[0] });
      return { ok: true, grant: publicGrant(grant) };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  
  registerIpcChannel("documentAgent:workspace:proposeChangeset", async (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = optionalString(value, "agentSessionId") ?? undefined;
      const session = rendererSession(event.sender.id, agentSessionId);
      const grantId = stringField(value, "grantId", 128);
      const grant = workspaceGrants.get(grantId, session);
      if (!grant) throw new Error("CAPABILITY_DENIED");
      
      const changes = value.changes as import("../../../src/agent/contracts/workspace").WorkspaceChange[];
      if (!Array.isArray(changes) || changes.length === 0) throw new Error("Invalid changes.");
      const summary = stringField(value, "summary");
      
      const preview = await workspaceMutations.prepareChangeset({ grant, sessionId: session, changes });
      const pending = await approvals.prepare({
        grantId,
        proposalType: "workspace_changeset",
        canonicalToolName: "workspace.proposeChangeset",
        validatedArguments: { summary, changes },
        baseRevisionIds: [],
        affectedResources: preview.affectedPaths,
        publicSummary: { summary, affectedPaths: preview.affectedPaths, totalBytes: preview.totalBytes },
        privateExecutionPlan: { kind: "workspace_changeset", profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, summary, changes } satisfies WorkspaceChangesetPlan,
      });
      await audit.record({ sessionId: session, toolName: "workspace.proposeChangeset", outcome: "proposal", resourceIds: preview.affectedPaths });
      return { ok: true, pendingApproval: pending, preview: { affectedPaths: preview.affectedPaths, totalBytes: preview.totalBytes } };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:workspace:proposeMove", async (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = optionalString(value, "agentSessionId") ?? undefined;
      const session = rendererSession(event.sender.id, agentSessionId);
      const grantId = stringField(value, "grantId", 128);
      const grant = workspaceGrants.get(grantId, session);
      if (!grant) throw new Error("CAPABILITY_DENIED");
      
      const sourcePath = stringField(value, "sourcePath");
      const destinationPath = stringField(value, "destinationPath");
      
      const pending = await approvals.prepare({
        grantId,
        proposalType: "workspace_move",
        canonicalToolName: "workspace.move",
        validatedArguments: { sourcePath, destinationPath },
        baseRevisionIds: [],
        affectedResources: [sourcePath, destinationPath],
        publicSummary: { sourcePath, destinationPath },
        privateExecutionPlan: { kind: "workspace_move", profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, sourcePath, destinationPath } satisfies WorkspaceMovePlan,
      });
      await audit.record({ sessionId: session, toolName: "workspace.move", outcome: "proposal", resourceIds: [sourcePath, destinationPath] });
      return { ok: true, pendingApproval: pending };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:workspace:proposeTrash", async (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = optionalString(value, "agentSessionId") ?? undefined;
      const session = rendererSession(event.sender.id, agentSessionId);
      const grantId = stringField(value, "grantId", 128);
      const grant = workspaceGrants.get(grantId, session);
      if (!grant) throw new Error("CAPABILITY_DENIED");
      
      const relativePath = stringField(value, "relativePath");
      
      const pending = await approvals.prepare({
        grantId,
        proposalType: "workspace_trash",
        canonicalToolName: "workspace.trash",
        validatedArguments: { relativePath },
        baseRevisionIds: [],
        affectedResources: [relativePath],
        publicSummary: { relativePath },
        privateExecutionPlan: { kind: "workspace_trash", profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, relativePath } satisfies WorkspaceTrashPlan,
      });
      await audit.record({ sessionId: session, toolName: "workspace.trash", outcome: "proposal", resourceIds: [relativePath] });
      return { ok: true, pendingApproval: pending };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:workspace:revoke", async (event, input: unknown) => {
    try {
      const value = record(input);
      return { ok: workspaceGrants.revoke(stringField(value, "grantId", 128), rendererSession(event.sender.id, stringField(value, "agentSessionId", 128))) };
    } catch { return { ok: false }; }
  });

  for (const [channel, operation] of [["list", "list"], ["read", "read"], ["search", "search"]] as const) {
    registerIpcChannel(`documentAgent:workspace:${channel}`, async (event, input: unknown) => {
      try {
        const value = record(input);
        const grant = workspaceGrants.get(stringField(value, "grantId", 128), rendererSession(event.sender.id, stringField(value, "agentSessionId", 128)));
        if (!grant) throw new Error("CAPABILITY_DENIED");
        if (operation === "list") return { ok: true, result: await workspaceFiles.list({ grant, sessionId: grant.sessionId, workspaceId: grant.workspaceId, relativeDirectory: typeof value.relativeDirectory === "string" ? value.relativeDirectory : "", recursive: value.recursive === true, maxDepth: typeof value.maxDepth === "number" ? value.maxDepth : 1, offset: typeof value.offset === "number" ? value.offset : undefined }) };
        if (operation === "read") return { ok: true, result: await workspaceFiles.readText({ grant, sessionId: grant.sessionId, workspaceId: grant.workspaceId, relativePath: stringField(value, "relativePath") }) };
        return { ok: true, result: await workspaceFiles.search({ grant, sessionId: grant.sessionId, workspaceId: grant.workspaceId, query: stringField(value, "query"), maxResults: typeof value.maxResults === "number" ? value.maxResults : 50 }) };
      } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
    });
  }
}
