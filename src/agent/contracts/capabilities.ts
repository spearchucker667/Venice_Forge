export type AgentPermissionPreset =
  | "off"
  | "read_attachments"
  | "limited_documents"
  | "workspace_with_approval"
  | "workspace_autonomous";

export type Capability =
  | "attachment:read"
  | "attachment:promote"
  | "document:read"
  | "document:create"
  | "document:propose-update"
  | "document:export"
  | "document:read-revision"
  | "document:restore-revision"
  | "workspace:list"
  | "workspace:read"
  | "workspace:search"
  | "workspace:create-file"
  | "workspace:create-directory"
  | "workspace:propose-update"
  | "workspace:move"
  | "workspace:trash"
  | "media:generate-image";

export interface CapabilityGrant {
  id: string;
  sessionId: string;
  preset: AgentPermissionPreset;
  capabilities: Capability[];
  projectId?: string;
  workspaceId?: string;
  issuedAt: string;
  expiresAt?: string;
  userInitiated: boolean;
}

export type WorkspaceOperation =
  | "list"
  | "read"
  | "search"
  | "create"
  | "update"
  | "rename"
  | "move"
  | "trash";

export interface WorkspaceGrant {
  id: string;
  sessionId: string;
  workspaceId: string;
  rootPath: string;
  displayName: string;
  allowedOperations: WorkspaceOperation[];
  allowedExtensions: string[];
  maxReadBytes: number;
  maxWriteBytes: number;
  maxFilesPerOperation: number;
  maxTotalChangeBytes: number;
  includeHiddenFiles: boolean;
  followSymlinks: false;
  issuedAt: string;
  expiresAt?: string;
}

const PRESET_CAPABILITIES: Record<AgentPermissionPreset, readonly Capability[]> = {
  off: [],
  read_attachments: ["attachment:read"],
  limited_documents: [
    "attachment:read",
    "attachment:promote",
    "document:read",
    "document:create",
    "document:propose-update",
    "document:export",
    "document:read-revision",
    "document:restore-revision",
  ],
  workspace_with_approval: [
    "attachment:read",
    "attachment:promote",
    "document:read",
    "document:create",
    "document:propose-update",
    "document:export",
    "document:read-revision",
    "document:restore-revision",
    "workspace:list",
    "workspace:read",
    "workspace:search",
    "workspace:create-file",
    "workspace:create-directory",
    "workspace:propose-update",
    "workspace:move",
    "workspace:trash",
  ],
  workspace_autonomous: [
    "attachment:read",
    "attachment:promote",
    "document:read",
    "document:create",
    "document:propose-update",
    "document:export",
    "document:read-revision",
    "document:restore-revision",
    "workspace:list",
    "workspace:read",
    "workspace:search",
    "workspace:create-file",
    "workspace:create-directory",
    "workspace:propose-update",
    "workspace:move",
    "workspace:trash",
  ],
};

export function capabilitiesForPreset(preset: AgentPermissionPreset): Capability[] {
  return [...PRESET_CAPABILITIES[preset]];
}

export function isGrantActive(grant: CapabilityGrant, sessionId: string, now = Date.now()): boolean {
  return grant.sessionId === sessionId
    && grant.userInitiated
    && (!grant.expiresAt || Date.parse(grant.expiresAt) > now);
}
