import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentPermissionPreset } from '../../agent/contracts/capabilities'
import type { DocumentBlock, DocumentRevision, ManagedDocument, DocumentReadResult } from '../../agent/contracts/documents'
import type { PendingApproval } from '../../agent/contracts/proposals'
import { blockText, browserCanonicalHash } from './documentViewHelpers'
import { useProjectStore } from '../../stores/project-store'

import { useSettingsStore } from '../../stores/settings-store'
import { toast } from '../../stores/toast-store'
import { useDocumentAgentStore, type WorkspaceGrantView } from '../../stores/document-agent-store'
import { desktopDocumentAgent, isElectron } from '../../services/desktopBridge'
import { Card, ErrorText, GhostButton, PrimaryButton, TextArea } from '../ui/shared'
import { ChatView } from '../chat/chat-view'

interface ProposalView {
  pendingApproval: PendingApproval
  preview: { before: DocumentBlock[]; after: DocumentBlock[]; resultingContentHash: string }
}

function restoredProposal(value: { approval: PendingApproval; publicView: unknown }): ProposalView | null {
  if (!value.publicView || typeof value.publicView !== 'object') return null
  const view = value.publicView as Record<string, unknown>
  if (value.approval.proposalType === 'document_restore' && Array.isArray(view.blocks)) {
    return { pendingApproval: value.approval, preview: { before: [], after: view.blocks as DocumentBlock[], resultingContentHash: '' } }
  }
  if (value.approval.proposalType !== 'document_edit') return null
  if (!Array.isArray(view.before) || !Array.isArray(view.after) || typeof view.resultingContentHash !== 'string') return null
  return { pendingApproval: value.approval, preview: { before: view.before as DocumentBlock[], after: view.after as DocumentBlock[], resultingContentHash: view.resultingContentHash } }
}

function DocumentAccessControl({ preset, onPresetChange, workspaceGrant, onChooseWorkspace, onRevoke }: {
  preset: AgentPermissionPreset
  onPresetChange: (preset: AgentPermissionPreset) => void
  workspaceGrant: WorkspaceGrantView | null
  onChooseWorkspace: () => void
  onRevoke: () => void
}) {
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-[14px] font-semibold text-foreground">Agent Access</h2>
        <p className="text-[12px] text-foreground-muted mt-1">Limited Documents is the safe default. Workspace access is restricted to one directory and never includes shell, Git, network, keychain, or OS control.</p>
      </div>
      <label className="block text-[12px] text-foreground-muted" htmlFor="document-agent-access">Access preset</label>
      <select
        id="document-agent-access"
        value={preset}
        onChange={(event) => onPresetChange(event.target.value as AgentPermissionPreset)}
        className="w-full rounded-lg border border-border bg-input-bg px-3 py-2 text-[13px] text-input-fg"
      >
        <option value="off">Off</option>
        <option value="read_attachments">Read attachments only</option>
        <option value="limited_documents">Limited Documents</option>
        <option value="workspace_with_approval">Manage selected workspace</option>
      </select>
      {preset === 'workspace_with_approval' && (
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          {workspaceGrant ? (
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[13px] font-medium text-foreground">{workspaceGrant.displayName}</div><div className="text-[12px] text-foreground-muted">Session-only grant · {workspaceGrant.allowedExtensions.join(', ')}</div></div>
              <GhostButton onClick={onRevoke}>Revoke</GhostButton>
            </div>
          ) : <GhostButton onClick={onChooseWorkspace}>Select workspace…</GhostButton>}
        </div>
      )}
    </Card>
  )
}

export function DocumentAgentView() {
  const activeProjectId = useSettingsStore((state) => state.activeProjectId)
  const projects = useProjectStore((state) => state.projects)
  const preset = useDocumentAgentStore((state) => state.preset)
  const setPreset = useDocumentAgentStore((state) => state.setPreset)
  const agentSessionId = useDocumentAgentStore((state) => state.agentSessionId)
  const workspaceGrant = useDocumentAgentStore((state) => state.workspaceGrant)
  const setWorkspaceGrant = useDocumentAgentStore((state) => state.setWorkspaceGrant)
  const [documents, setDocuments] = useState<ManagedDocument[]>([])
  const [selected, setSelected] = useState<DocumentReadResult | null>(null)
  const [revisions, setRevisions] = useState<Array<Omit<DocumentRevision, 'blocks'>>>([])
  const [draftName, setDraftName] = useState('New document.md')
  const [draftText, setDraftText] = useState('')
  const [editText, setEditText] = useState('')
  const [proposal, setProposal] = useState<ProposalView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ relativePath: string; type: string }>>([])
  const bridge = desktopDocumentAgent
  const projectId = activeProjectId ?? projects.find((project) => !project.archivedAt)?.id ?? null

  const refreshWorkspace = useCallback(async () => {
    if (!workspaceGrant) {
      setWorkspaceFiles([])
      return
    }
    const result = await bridge.workspace.list({
      grantId: workspaceGrant.id,
      agentSessionId,
      relativeDirectory: '',
      recursive: true,
      maxDepth: 3,
      offset: 0
    })
    if (result.ok && result.result && typeof result.result === 'object' && 'entries' in result.result) {
      setWorkspaceFiles((result.result as { entries: Array<{ relativePath: string; type: string }> }).entries)
    }
  }, [workspaceGrant, agentSessionId, bridge.workspace])

  useEffect(() => { void refreshWorkspace() }, [refreshWorkspace])

  const selectedText = useMemo(() => selected?.blocks.map(blockText).join('\n\n') ?? '', [selected])

  const refresh = useCallback(async () => {
    if (!projectId) return
    const result = await bridge.documents.list(projectId)
    if (!result.ok) throw new Error(result.error || 'Could not load managed documents.')
    setDocuments(result.documents ?? [])
  }, [projectId, bridge.documents])

  useEffect(() => { refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load documents.')) }, [refresh])
  useEffect(() => {
    if (!isElectron()) return
    bridge.approvals.list().then((result) => {
      if (!result.ok || !('pending' in result)) return
      const recovered = result.pending?.map(restoredProposal).find((item): item is ProposalView => item !== null)
      if (recovered) setProposal(recovered)
    }).catch(() => undefined)
  }, [bridge.approvals])

  const readDocument = async (documentId: string) => {
    setError(null)
    const result = await bridge.documents.read({ documentId })
    if (!result.ok || !result.result) { setError(result.error || 'Could not read document.'); return }
    setSelected(result.result)
    setEditText(result.result.blocks.length === 1 && result.result.blocks[0].type === 'paragraph' ? result.result.blocks[0].text : result.result.blocks.map(blockText).join('\n\n'))
    setProposal(null)
    const history = await bridge.documents.listRevisions(documentId)
    setRevisions(history.ok ? history.revisions ?? [] : [])
  }

  const createDocument = async () => {
    if (!projectId || !draftName.trim()) return
    setError(null)
    const relativePath = draftName.trim().endsWith('.md') ? draftName.trim() : `${draftName.trim()}.md`
    const result = await bridge.documents.create({
      projectId,
      relativePath,
      format: 'md',
      displayName: relativePath,
      blocks: [{ id: `block_${crypto.randomUUID()}`, type: 'paragraph', text: draftText }],
      overwrite: false,
    })
    if (!result.ok) { setError(result.error || 'Could not create document.'); return }
    setDraftText('')
    await refresh()
    toast.success('Managed document created')
  }

  const prepareEdit = async () => {
    if (!selected || selected.blocks.length !== 1 || selected.blocks[0].type !== 'paragraph') {
      setError('The initial editor supports a single paragraph. Complex documents remain readable and exportable.')
      return
    }
    const current = selected.blocks[0]
    const hash = await browserCanonicalHash(current)
    const result = await bridge.documents.proposeEdits({
      documentId: selected.documentId,
      baseRevisionId: selected.revisionId,
      summary: 'Update document text',
      operations: [{ operation: 'replace_block', blockId: current.id, expectedBlockHash: hash, block: { ...current, text: editText } }],
    })
    if (!result.ok || !result.pendingApproval || !result.preview) { setError(result.error || 'Could not prepare edit.'); return }
    setProposal({ pendingApproval: result.pendingApproval, preview: result.preview as ProposalView['preview'] })
  }

  const decide = async (decision: 'approve' | 'reject') => {
    if (!proposal) return
    const result = await bridge.approvals.decide({ pendingApprovalId: proposal.pendingApproval.id, proposalHash: proposal.pendingApproval.proposalHash, decision })
    if (!result.ok) { setError(result.error || 'Could not decide proposal.'); return }
    setProposal(null)
    if (decision === 'approve' && selected) await readDocument(selected.documentId)
    toast.success(decision === 'approve' ? 'Approved edit applied as a new revision' : 'Proposal rejected without changes')
  }

  const prepareRestore = async (restoreRevisionId: string) => {
    if (!selected) return
    const result = await bridge.documents.proposeRestore({ documentId: selected.documentId, currentRevisionId: selected.revisionId, restoreRevisionId, reason: 'Restore selected prior revision' })
    if (!result.ok || !result.pendingApproval || !result.preview || typeof result.preview !== 'object') { setError(result.error || 'Could not prepare restoration.'); return }
    const preview = result.preview as { blocks?: DocumentBlock[] }
    if (!Array.isArray(preview.blocks)) { setError('The restoration preview was invalid.'); return }
    setProposal({ pendingApproval: result.pendingApproval, preview: { before: selected.blocks, after: preview.blocks, resultingContentHash: '' } })
  }

  const changePreset = async (next: AgentPermissionPreset) => {
    if (workspaceGrant && next !== 'workspace_with_approval') await bridge.workspace.revoke({ grantId: workspaceGrant.id, agentSessionId })
    if (next !== 'workspace_with_approval') setWorkspaceGrant(null)
    setPreset(next)
  }

  if (!isElectron()) return <div className="p-6"><ErrorText>Document Agent tools require the hardened Electron desktop bridge.</ErrorText></div>

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden bg-surface-base">
      <div className="flex-1 lg:w-[45%] min-w-0 soft-separator-x flex flex-col relative bg-surface-base">
        <ChatView />
      </div>
      <div className="flex-1 lg:w-[55%] min-w-0 h-full overflow-y-auto p-5 space-y-4">
        <DocumentAccessControl
          preset={preset}
          onPresetChange={(next) => { void changePreset(next) }}
          workspaceGrant={workspaceGrant}
          onChooseWorkspace={() => { void bridge.workspace.choose({ agentSessionId }).then((result) => { if (result.ok && 'grant' in result && result.grant) setWorkspaceGrant(result.grant); else if (!(('canceled' in result) && result.canceled)) setError(result.error || 'Workspace selection failed.') }) }}
          onRevoke={() => { if (workspaceGrant) void bridge.workspace.revoke({ grantId: workspaceGrant.id, agentSessionId }).then(() => setWorkspaceGrant(null)) }}
        />

        {error && <ErrorText>{error}</ErrorText>}
        <div className="grid gap-4 2xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <h2 className="text-[14px] font-semibold text-foreground">Managed Vault</h2>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {documents.map((document) => <button key={document.id} type="button" onClick={() => { void readDocument(document.id) }} className="w-full rounded-lg border border-border px-3 py-2 text-left text-[13px] text-foreground hover:bg-surface-muted">{document.displayName}<span className="block text-[11px] text-foreground-muted">{document.originalFormat.toUpperCase()}</span></button>)}
                {documents.length === 0 && <p className="text-[12px] text-foreground-muted">No documents in the active project.</p>}
              </div>
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="New document name" className="w-full rounded-lg border border-border bg-input-bg px-3 py-2 text-[13px] text-input-fg" />
              <TextArea value={draftText} onChange={setDraftText} ariaLabel="New document content" rows={4} />
              <PrimaryButton onClick={() => { void createDocument() }} disabled={!projectId || preset === 'off'}>Create document</PrimaryButton>
            </Card>

            {workspaceGrant && (
              <Card className="p-4 space-y-3">
                <h2 className="text-[14px] font-semibold text-foreground">Workspace Files</h2>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {workspaceFiles.map((file: { relativePath: string; type: string }) => (
                    <div key={file.relativePath} className="text-[12px] text-foreground soft-separator-x py-1">
                      {file.type === 'directory' ? '📁 ' : '📄 '}{file.relativePath}
                    </div>
                  ))}
                  {workspaceFiles.length === 0 && <p className="text-[12px] text-foreground-muted">No files found.</p>}
                </div>
              </Card>
            )}
          </div>

          <Card className="p-4 space-y-3 flex flex-col min-h-[400px]">
            <h2 className="text-[14px] font-semibold text-foreground flex-shrink-0">{selected?.displayName ?? 'Select a document'}</h2>
            {selected ? (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                <div className="rounded-lg border border-border bg-surface-muted p-3 whitespace-pre-wrap text-[13px] text-foreground overflow-y-auto max-h-[200px] flex-shrink-0">{selectedText}</div>
                <div className="flex-1 min-h-[150px] flex flex-col">
                  <TextArea value={editText} onChange={setEditText} ariaLabel="Proposed document text" rows={8} />
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0"><GhostButton onClick={() => { void prepareEdit() }}>Prepare proposal</GhostButton><GhostButton onClick={() => { void bridge.documents.export({ documentId: selected.documentId, revisionId: selected.revisionId, format: 'md', suggestedFileName: selected.displayName }) }}>Export…</GhostButton></div>
                {revisions.length > 1 && <div className="space-y-2 flex-shrink-0"><h3 className="text-[12px] font-semibold uppercase tracking-wide text-foreground-muted">Immutable revisions</h3><div className="max-h-[150px] overflow-y-auto space-y-2">{revisions.map((revision) => <div key={revision.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"><span className="text-[12px] text-foreground">{revision.summary}<span className="block text-[11px] text-foreground-muted">{new Date(revision.createdAt).toLocaleString()}</span></span>{revision.id !== selected.revisionId && <GhostButton onClick={() => { void prepareRestore(revision.id) }}>Restore as new</GhostButton>}</div>)}</div></div>}
              </div>
            ) : <p className="text-[13px] text-foreground-muted flex-shrink-0">Read, revise, restore, and export app-managed documents without exposing arbitrary paths to the model.</p>}
            {proposal && (
              <div className="rounded-xl border border-border-strong bg-surface-elevated p-4 space-y-3 flex-shrink-0 mt-4" role="region" aria-label="Document change proposal">
                <div><h3 className="text-[13px] font-semibold text-foreground">Review exact proposal</h3><p className="text-[12px] text-foreground-muted">Approval is bound to hash {proposal.pendingApproval.proposalHash.slice(0, 12)}… and the current base revision.</p></div>
                <div className="grid gap-2 md:grid-cols-2"><pre className="overflow-auto rounded-lg bg-surface-muted p-3 text-[12px] text-foreground max-h-[200px]">{proposal.preview.before.map(blockText).join('\n\n')}</pre><pre className="overflow-auto rounded-lg bg-surface-muted p-3 text-[12px] text-foreground max-h-[200px]">{proposal.preview.after.map(blockText).join('\n\n')}</pre></div>
                <div className="flex gap-2"><GhostButton onClick={() => { void decide('reject') }}>Reject</GhostButton><GhostButton onClick={() => { void decide('approve') }}>Approve exact change</GhostButton></div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
