import { BrowserWindow, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DocumentBlock, DocumentEditOperation, DocumentFormat } from "../../../src/agent/contracts/documents";
import type { AgentPermissionPreset, WorkspaceGrant } from "../../../src/agent/contracts/capabilities";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { serializeDocument } from "../../agent/documents/document-serializer-service";
import { getProfileSessionId } from "../../services/profileSession";
import { classifyMime } from "../../agent/documents/attachment-import-service";
import { registerPrivilegedIpcChannel } from "./common";
import { setEffectiveAgentPermissionPreset } from "../../agent/runtime/agent-permission-state";

import { getAgentServices, RUNTIME_SESSION_ID } from "../../agent/runtime/agent-services";
import {
  buildDocumentEditPlan,
  buildDocumentExportPlan,
  buildDocumentRestorePlan,
  buildWorkspaceChangesetPlan,
  buildWorkspaceMovePlan,
  buildWorkspaceTrashPlan,
  isDocumentEditPlan,
  isDocumentExportPlan,
  isDocumentRestorePlan,
  isGenerateImagePlan,
  isWorkspaceChangesetPlan,
  isWorkspaceMovePlan,
  isWorkspaceTrashPlan,
  type DocumentExportPlan,
} from "../../agent/approvals/plan-factories";
import { executeApprovedGenerateImagePlan } from "../../agent/runtime/approved-media-executor";

const DOCUMENT_FORMATS = new Set<DocumentFormat>(["txt", "md", "json", "csv", "html", "docx", "pdf"]);


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
  const { documents, attachments, attachmentRegistry, approvals, audit, workspaceGrants, workspaceFiles, workspaceMutations } = getAgentServices();

  registerPrivilegedIpcChannel("documentAgent:permissions:set", (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = stringField(value, "agentSessionId", 128);
      const preset = stringField(value, "preset", 64) as AgentPermissionPreset;
      return {
        ok: true,
        preset: setEffectiveAgentPermissionPreset(
          event.sender,
          getProfileSessionId(event.sender),
          agentSessionId,
          preset,
        ),
      };
    } catch (error) {
      return { ok: false, error: redactErrorMessage(error) };
    }
  });

  async function executeDocumentExport(
    sender: Electron.WebContents,
    senderFrame: Electron.WebFrameMain | null | undefined,
    plan: DocumentExportPlan,
  ): Promise<{ ok: true; canceled?: boolean; exported?: boolean; displayName?: string; format?: import("../../../src/agent/contracts/documents").DocumentFormat; sizeBytes?: number; warnings?: import("../../../src/agent/contracts/documents").DocumentWarning[] }> {
    const owner = BrowserWindow.fromWebContents(sender);
    if (!owner || !senderFrame || senderFrame !== sender.mainFrame) throw new Error("Export sender was rejected.");
    const source = await documents.getRevisionForSerialization(plan.profileId, plan.documentId, plan.revisionId ?? null);
    const output = await serializeDocument(plan.format, { kind: "blocks", title: source.document.displayName, blocks: source.revision.blocks });
    if (!output.validation.valid) throw new Error("Serialized output failed validation.");
    const suggested = path.basename(plan.suggestedFileName || `${source.document.displayName}.${plan.format}`);
    // verify-no-native-dialogs: allow — Document Agent export is explicitly user-mediated.
    const selected = await dialog.showSaveDialog(owner, { title: "Export managed document", defaultPath: suggested, filters: [{ name: plan.format.toUpperCase(), extensions: [plan.format] }] });
    if (selected.canceled || !selected.filePath) return { ok: true, canceled: true };
    await atomicExternalWrite(selected.filePath, output.bytes);
    await audit.record({ sessionId: rendererSession(sender.id), toolName: "document.export", outcome: "execution", resourceIds: [source.document.id], metadata: { format: plan.format, sizeBytes: output.bytes.byteLength } });
    return { ok: true, exported: true, displayName: path.basename(selected.filePath), format: plan.format, sizeBytes: output.bytes.byteLength, warnings: output.warnings };
  }

  registerPrivilegedIpcChannel("documentAgent:documents:create", async (event, input: unknown) => {
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

  registerPrivilegedIpcChannel("documentAgent:documents:list", async (event, projectId: unknown) => {
    try { return { ok: true, documents: await documents.list(getProfileSessionId(event.sender), typeof projectId === "string" ? projectId : "") }; }
    catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:documents:read", async (event, input: unknown) => {
    try {
      const value = record(input);
      return { ok: true, result: await documents.read(getProfileSessionId(event.sender), stringField(value, "documentId", 128), optionalString(value, "revisionId"), optionalString(value, "cursor")) };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:documents:revisions", async (event, documentId: unknown) => {
    try { return { ok: true, revisions: await documents.listRevisions(getProfileSessionId(event.sender), typeof documentId === "string" ? documentId : "") }; }
    catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:documents:delete", async (event, input: unknown) => {
    try {
      const value = record(input);
      const documentId = stringField(value, "documentId", 128);
      const deleted = await documents.delete(getProfileSessionId(event.sender), documentId);
      if (deleted) {
        await audit.record({
          sessionId: rendererSession(event.sender.id),
          toolName: "document.delete",
          outcome: "execution",
          resourceIds: [documentId],
        });
      }
      return { ok: true, deleted };
    } catch (error) {
      return { ok: false, deleted: false, error: redactErrorMessage(error) };
    }
  });

  registerPrivilegedIpcChannel("documentAgent:documents:proposeEdits", async (event, input: unknown) => {
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
        privateExecutionPlan: buildDocumentEditPlan({ profileId, documentId, baseRevisionId, summary, operations }),
      });
      await audit.record({ sessionId: rendererSession(event.sender.id), toolName: "document.proposeEdits", outcome: "proposal", resourceIds: [documentId] });
      return { ok: true, pendingApproval: pending, preview };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:approvals:decide", async (event, input: unknown) => {
    let consumedApprovalId: string | null = null;
    try {
      const value = record(input);
      const decision = stringField(value, "decision", 10);
      if (decision !== "approve" && decision !== "reject") throw new Error("Invalid approval decision.");
      const decided = await approvals.decide({ pendingApprovalId: stringField(value, "pendingApprovalId", 128), proposalHash: stringField(value, "proposalHash", 128), decision });
      if (decision === "reject") return { ok: true, rejected: true };
      consumedApprovalId = decided.approval.id;
      const plan = decided.privateExecutionPlan;
      if (!isDocumentEditPlan(plan) && !isDocumentRestorePlan(plan) && !isDocumentExportPlan(plan) && !isWorkspaceChangesetPlan(plan) && !isWorkspaceMovePlan(plan) && !isWorkspaceTrashPlan(plan) && !isGenerateImagePlan(plan)) throw new Error("Invalid stored execution plan.");
      if (plan.profileId !== getProfileSessionId(event.sender)) throw new Error("APPROVAL_MISMATCH");

      if (isGenerateImagePlan(plan)) {
        const result = await executeApprovedGenerateImagePlan(plan);
        if (!result.ok) {
          await approvals.restoreConsumed(consumedApprovalId).catch(() => undefined);
          return { ok: false, error: result.error };
        }
        await audit.record({ sessionId: rendererSession(event.sender.id), toolName: "media.generateImage", outcome: "execution", resourceIds: [result.chatRef.mediaId] });
        return { ok: true, chatRef: result.chatRef, task: result.task };
      }

      if (isDocumentEditPlan(plan) || isDocumentRestorePlan(plan)) {
        const revision = await approvals.withResourceLocks([plan.documentId], () => isDocumentEditPlan(plan)
          ? documents.applyEdits(plan.profileId, plan)
          : documents.restore(plan.profileId, plan));
        await audit.record({ sessionId: rendererSession(event.sender.id), toolName: isDocumentEditPlan(plan) ? "document.applyApprovedEdits" : "document.restoreRevision", outcome: "execution", resourceIds: [plan.documentId] });
        return { ok: true, revision };
      }

      if (isDocumentExportPlan(plan)) {
        const exported = await executeDocumentExport(event.sender, event.senderFrame, plan);
        if (exported.ok && exported.canceled) {
          await approvals.restoreConsumed(consumedApprovalId).catch(() => undefined);
        }
        return exported;
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
      await approvals.restoreConsumed(consumedApprovalId).catch(() => undefined);
      return { ok: false };
    } catch (error) {
      if (consumedApprovalId) await approvals.restoreConsumed(consumedApprovalId).catch(() => undefined);
      return { ok: false, error: redactErrorMessage(error) };
    }
  });

  registerPrivilegedIpcChannel("documentAgent:documents:proposeRestore", async (event, input: unknown) => {
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
        privateExecutionPlan: buildDocumentRestorePlan({ profileId, documentId, currentRevisionId, restoreRevisionId, reason }),
      });
      return { ok: true, pendingApproval: pending, preview: { blocks: source.revision.blocks, warnings: source.revision.warnings } };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:approvals:list", async (event) => {
    try {
      const profileId = getProfileSessionId(event.sender);
      const sessionFamily = rendererSession(event.sender.id);
      const pending = (await approvals.listPendingWithViews()).filter((entry) => {
        const grantId = entry.approval.grantId;
        return (
          grantId === `limited:${profileId}` ||
          grantId === `media:${profileId}` ||
          (grantId.startsWith("grant_") &&
            workspaceGrants.isOwnedBySessionFamily(grantId, sessionFamily))
        );
      });
      return { ok: true, pending };
    }
    catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:documents:export", async (event, input: unknown) => {
    try {
      const value = record(input);
      const plan = buildDocumentExportPlan({
        profileId: getProfileSessionId(event.sender),
        documentId: stringField(value, "documentId", 128),
        revisionId: optionalString(value, "revisionId") ?? undefined,
        format: documentFormat(value),
        suggestedFileName: stringField(value, "suggestedFileName", 255),
      });
      return executeDocumentExport(event.sender, event.senderFrame, plan);
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:attachments:promote", async (event, input: unknown) => {
    try {
      const value = record(input);
      const attachmentId = stringField(value, "attachmentId", 128);
      // Use the main-internal accessor that returns the body buffer; the
      // public resolve() intentionally never returns the body (P1-002).
      const resolved = attachmentRegistry.resolveWithBody(
        getProfileSessionId(event.sender),
        attachmentId,
        rendererSession(event.sender.id),
      );
      if (!resolved) throw new Error("Attachment not found.");
      const bodyB64 = resolved.body.toString("base64");
      const mimeType = resolved.mimeType.toLowerCase();
      if (classifyMime(mimeType) === "reject") {
        throw new Error(`Attachment mimeType ${JSON.stringify(mimeType)} is not supported.`);
      }
      const result = await attachments.promote(getProfileSessionId(event.sender), {
        attachmentId,
        projectId: stringField(value, "projectId", 128),
        relativePath: stringField(value, "relativePath"),
        displayName: typeof value.displayName === "string" ? value.displayName : undefined,
        mimeType,
        bodyB64,
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

  registerPrivilegedIpcChannel("documentAgent:attachments:register", async (event, input: unknown) => {
    try {
      const value = record(input);
      const attachmentRecord = attachmentRegistry.register({
        profileId: getProfileSessionId(event.sender),
        sessionId: rendererSession(event.sender.id),
        conversationId: typeof value.conversationId === "string" ? value.conversationId : undefined,
        mimeType: stringField(value, "mimeType", 255),
        displayName: stringField(value, "displayName", 255),
        bodyB64: stringField(value, "bodyB64", 2_000_000),
      });
      return { ok: true, attachmentId: attachmentRecord.id, sizeBytes: attachmentRecord.sizeBytes };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:workspace:choose", async (event, input: unknown) => {
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

  
  registerPrivilegedIpcChannel("documentAgent:workspace:proposeChangeset", async (event, input: unknown) => {
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
        privateExecutionPlan: buildWorkspaceChangesetPlan({ profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, summary, changes }),
      });
      await audit.record({ sessionId: session, toolName: "workspace.proposeChangeset", outcome: "proposal", resourceIds: preview.affectedPaths });
      return { ok: true, pendingApproval: pending, preview: { affectedPaths: preview.affectedPaths, totalBytes: preview.totalBytes } };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:workspace:proposeMove", async (event, input: unknown) => {
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
        privateExecutionPlan: buildWorkspaceMovePlan({ profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, sourcePath, destinationPath }),
      });
      await audit.record({ sessionId: session, toolName: "workspace.move", outcome: "proposal", resourceIds: [sourcePath, destinationPath] });
      return { ok: true, pendingApproval: pending };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:workspace:proposeTrash", async (event, input: unknown) => {
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
        privateExecutionPlan: buildWorkspaceTrashPlan({ profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, relativePath }),
      });
      await audit.record({ sessionId: session, toolName: "workspace.trash", outcome: "proposal", resourceIds: [relativePath] });
      return { ok: true, pendingApproval: pending };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerPrivilegedIpcChannel("documentAgent:workspace:revoke", async (event, input: unknown) => {
    try {
      const value = record(input);
      return { ok: workspaceGrants.revoke(stringField(value, "grantId", 128), rendererSession(event.sender.id, stringField(value, "agentSessionId", 128))) };
    } catch { return { ok: false }; }
  });

  for (const [channel, operation] of [["list", "list"], ["read", "read"], ["search", "search"]] as const) {
    registerPrivilegedIpcChannel(`documentAgent:workspace:${channel}`, async (event, input: unknown) => {
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
