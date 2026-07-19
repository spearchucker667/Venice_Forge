import { app } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ManagedDocumentService } from "../documents/managed-document-service";
import { AttachmentImportService } from "../documents/attachment-import-service";
import { ApprovalCoordinator } from "../approvals/approval-coordinator";
import { DocumentAgentAuditService } from "../audit/document-agent-audit-service";
import { WorkspaceGrantService } from "../policy/workspace-grant-service";
import { WorkspaceFilesystemService } from "../workspace/workspace-filesystem-service";
import { WorkspaceMutationService } from "../workspace/workspace-mutation-service";

export const RUNTIME_SESSION_ID = `runtime_${randomUUID()}`;

let documents: ManagedDocumentService;
let attachments: AttachmentImportService;
let approvals: ApprovalCoordinator;
let audit: DocumentAgentAuditService;
let workspaceGrants: WorkspaceGrantService;
let workspaceFiles: WorkspaceFilesystemService;
let workspaceMutations: WorkspaceMutationService;

export function initAgentServices(): void {
  if (documents) return;
  const storageRoot = path.join(app.getPath("userData"), "document-agent", "documents");
  documents = new ManagedDocumentService(storageRoot);
  attachments = new AttachmentImportService(documents);
  approvals = new ApprovalCoordinator(path.join(app.getPath("userData"), "document-agent", "pending-approvals.json"), RUNTIME_SESSION_ID);
  audit = new DocumentAgentAuditService(path.join(app.getPath("userData"), "document-agent", "audit.jsonl"));
  workspaceGrants = new WorkspaceGrantService();
  workspaceFiles = new WorkspaceFilesystemService();
  workspaceMutations = new WorkspaceMutationService(path.join(app.getPath("userData"), "document-agent", "workspace-recovery"));
}

export function getAgentServices() {
  if (!documents) initAgentServices();
  return { documents, attachments, approvals, audit, workspaceGrants, workspaceFiles, workspaceMutations };
}
