import type { DocumentFormat } from "./documents";

export type WorkspaceChange =
  | { type: "create_file"; relativePath: string; expectedAbsent: true; format: DocumentFormat; content: string }
  | { type: "replace_file"; relativePath: string; expectedContentHash: string; format: DocumentFormat; content: string }
  | { type: "patch_text_file"; relativePath: string; expectedContentHash: string; replacements: Array<{ expectedText: string; replacementText: string; occurrence: number }> }
  | { type: "create_directory"; relativePath: string; expectedAbsent: true };

export interface WorkspaceChangeProposal {
  workspaceId: string;
  baseSnapshotId: string;
  summary: string;
  changes: WorkspaceChange[];
}

export interface WorkspaceRecoveryRecord {
  id: string;
  workspaceId: string;
  originalRelativePath: string;
  stagedName: string;
  createdAt: string;
  restoredAt?: string;
}
