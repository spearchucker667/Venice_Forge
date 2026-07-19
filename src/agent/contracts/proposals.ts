export type ProposalType =
  | "document_edit"
  | "document_restore"
  | "document_export"
  | "workspace_changeset"
  | "workspace_move"
  | "workspace_trash";

export interface PendingApproval {
  id: string;
  sessionId: string;
  grantId: string;
  proposalType: ProposalType;
  proposalHash: string;
  baseRevisionIds: string[];
  affectedResources: string[];
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  rejectedAt?: string;
}

export interface ApproveProposalRequest {
  pendingApprovalId: string;
  proposalHash: string;
  decision: "approve" | "reject";
}
