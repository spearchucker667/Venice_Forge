import { create } from 'zustand'
import type { AgentPermissionPreset } from '../agent/contracts/capabilities'

export interface WorkspaceGrantView {
  id: string
  workspaceId: string
  displayName: string
  allowedOperations: string[]
  allowedExtensions: string[]
}

interface DocumentAgentState {
  agentSessionId: string
  preset: AgentPermissionPreset
  workspaceGrant: WorkspaceGrantView | null
  setPreset: (preset: AgentPermissionPreset) => void
  setWorkspaceGrant: (grant: WorkspaceGrantView | null) => void
}

export const useDocumentAgentStore = create<DocumentAgentState>()((set) => ({
  agentSessionId: crypto.randomUUID(),
  preset: 'limited_documents',
  workspaceGrant: null,
  setPreset: (preset) => set({ preset }),
  setWorkspaceGrant: (workspaceGrant) => set({ workspaceGrant }),
}))
