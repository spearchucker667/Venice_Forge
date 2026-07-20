export const toolNameMap = {
  "document.get": "document_get",
  "document.proposeEdits": "document_propose_edits",
  "document.create": "document_create",
  "document.export": "document_export",
  "document.getRevision": "document_get_revision",
  "document.restoreRevision": "document_restore_revision",
  "document.promoteAttachment": "document_promote_attachment",
  "workspace.list": "workspace_list",
  "workspace.read": "workspace_read",
  "workspace.search": "workspace_search",
  "workspace.createFile": "workspace_create_file",
  "workspace.createDirectory": "workspace_create_directory",
  "workspace.proposeChangeset": "workspace_propose_changeset",
  "workspace.move": "workspace_move",
  "workspace.trash": "workspace_trash",
  "media.generateImage": "media_generate_image",
  // Phase 5.2 — Video and audio tools are gated behind an environment flag and
  // are not registered in the canonical tool surface until their durable
  // approval-pipeline implementation lands (planned Phase 5C / 5D). Exposing
  // them while the executor returns "Not implemented yet" would violate the
  // "no exposed unimplemented video/audio tools during staged rollout" rule.
} as const;

export type InternalToolName = keyof typeof toolNameMap;
export type ProviderToolName = (typeof toolNameMap)[InternalToolName];

const internalByProvider = new Map<ProviderToolName, InternalToolName>(
  Object.entries(toolNameMap).map(([internalName, providerName]) => [
    providerName,
    internalName as InternalToolName,
  ]),
);

export function internalToolNameForProvider(providerName: string): InternalToolName | null {
  return internalByProvider.get(providerName as ProviderToolName) ?? null;
}
