import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentPermissionPreset } from '../../agent/contracts/capabilities'
import type { DocumentBlock, DocumentRevision, ManagedDocument, DocumentReadResult, DocumentFormat } from '../../agent/contracts/documents'
import type { PendingApproval } from '../../agent/contracts/proposals'
import { blockText, browserCanonicalHash, filterDocumentsByQuery, formatBadgeColor } from './documentViewHelpers'
import { useProjectStore } from '../../stores/project-store'
import { useSettingsStore } from '../../stores/settings-store'
import { toast } from '../../stores/toast-store'
import { useDocumentAgentStore, type WorkspaceGrantView } from '../../stores/document-agent-store'
import { desktopDocumentAgent, isElectron } from '../../services/desktopBridge'
import { Card, ErrorText, GhostButton, PrimaryButton, TextArea } from '../ui/shared'
import { DocumentRenderer } from './DocumentRenderer'
import { documentSourceToBlocks, blocksToDocumentSource } from '../../agent/documents/document-source'

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
        <h2 className="text-[14px] font-semibold text-foreground">Agent Access & Grant Controls</h2>
        <p className="text-[12px] text-foreground-muted mt-1">Limited Documents is the safe default. Workspace access is restricted to one user-granted directory and never includes shell, Git, network, keychain, or OS control.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="w-full sm:w-64 space-y-1">
          <label className="block text-[12px] text-foreground-muted" htmlFor="document-agent-access">Access preset</label>
          <select
            id="document-agent-access"
            value={preset}
            onChange={(event) => onPresetChange(event.target.value as AgentPermissionPreset)}
            className="w-full rounded-lg border border-border bg-input-bg px-3 py-1.5 text-[13px] text-input-fg"
          >
            <option value="off">Off</option>
            <option value="read_attachments">Read attachments only</option>
            <option value="limited_documents">Limited Documents</option>
            <option value="workspace_with_approval">Manage selected workspace</option>
          </select>
        </div>

        {preset === 'workspace_with_approval' && (
          <div className="flex-1 w-full rounded-lg border border-border bg-surface-muted p-2.5 flex items-center justify-between gap-3">
            {workspaceGrant ? (
              <div className="flex items-center justify-between gap-3 w-full">
                <div>
                  <div className="text-[13px] font-medium text-foreground">{workspaceGrant.displayName}</div>
                  <div className="text-[11px] text-foreground-muted">Session grant · {workspaceGrant.allowedExtensions.join(', ')}</div>
                </div>
                <GhostButton onClick={onRevoke}>Revoke</GhostButton>
              </div>
            ) : (
              <GhostButton onClick={onChooseWorkspace}>Select workspace directory…</GhostButton>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export function DocumentAgentView() {
  const activeProjectId = useSettingsStore((state) => state.activeProjectId)
  const projects = useProjectStore((state) => state.projects)
  const createProject = useProjectStore((state) => state.createProject)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)

  const preset = useDocumentAgentStore((state) => state.preset)
  const setPreset = useDocumentAgentStore((state) => state.setPreset)
  const agentSessionId = useDocumentAgentStore((state) => state.agentSessionId)
  const workspaceGrant = useDocumentAgentStore((state) => state.workspaceGrant)
  const setWorkspaceGrant = useDocumentAgentStore((state) => state.setWorkspaceGrant)
  const activeEnvironment = useDocumentAgentStore((state) => state.activeEnvironment)
  const setActiveEnvironment = useDocumentAgentStore((state) => state.setActiveEnvironment)
  const selectedDocumentId = useDocumentAgentStore((state) => state.selectedDocumentId)
  const setSelectedDocumentId = useDocumentAgentStore((state) => state.setSelectedDocumentId)

  const [documents, setDocuments] = useState<ManagedDocument[]>([])
  const [selected, setSelected] = useState<DocumentReadResult | null>(null)
  const [revisions, setRevisions] = useState<Array<Omit<DocumentRevision, 'blocks'>>>([])
  const [docSearchQuery, setDocSearchQuery] = useState('')
  const [editorTab, setEditorTab] = useState<'preview' | 'source' | 'revisions'>('preview')

  const [showNewDocModal, setShowNewDocModal] = useState(false)
  const [newDocName, setNewDocName] = useState('notes.md')
  const [newDocFormat, setNewDocFormat] = useState<DocumentFormat>('md')
  const [newDocContent, setNewDocContent] = useState('')

  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const [editText, setEditText] = useState('')
  const [proposal, setProposal] = useState<ProposalView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ relativePath: string; type: string }>>([])
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<Array<{ relativePath: string; line: number; snippet: string }>>([])
  const [workspaceFileContent, setWorkspaceFileContent] = useState<{ path: string; text: string } | null>(null)

  const bridge = desktopDocumentAgent
  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId && !p.archivedAt) ?? projects.find((p) => !p.archivedAt) ?? null, [projects, activeProjectId])
  const projectId = activeProject?.id ?? null

  const refreshWorkspace = useCallback(async () => {
    if (!workspaceGrant) {
      setWorkspaceFiles([])
      setWorkspaceSearchResults([])
      setWorkspaceFileContent(null)
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

  const searchWorkspace = async () => {
    if (!workspaceGrant || !workspaceQuery.trim()) return
    setError(null)
    const result = await bridge.workspace.search({ grantId: workspaceGrant.id, agentSessionId, query: workspaceQuery.trim() })
    if (result.ok && result.result) {
      setWorkspaceSearchResults(result.result)
    } else {
      setError(result.error || 'Workspace search failed.')
    }
  }

  const readWorkspaceFile = async (relativePath: string) => {
    if (!workspaceGrant) return
    setError(null)
    const result = await bridge.workspace.read({ grantId: workspaceGrant.id, agentSessionId, relativePath })
    if (result.ok && result.result) {
      setWorkspaceFileContent({ path: relativePath, text: result.result.content })
    } else {
      setError(result.error || 'Could not read workspace file.')
    }
  }

  useEffect(() => { void refreshWorkspace() }, [refreshWorkspace])

  const refreshDocuments = useCallback(async () => {
    if (!projectId) return
    const result = await bridge.documents.list(projectId)
    if (!result.ok) throw new Error(result.error || 'Could not load managed documents.')
    setDocuments(result.documents ?? [])
  }, [projectId, bridge.documents])

  useEffect(() => { refreshDocuments().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load documents.')) }, [refreshDocuments])

  useEffect(() => {
    if (!isElectron()) return
    bridge.approvals.list().then((result) => {
      if (!result.ok || !('pending' in result)) return
      const recovered = result.pending?.map(restoredProposal).find((item): item is ProposalView => item !== null)
      if (recovered) setProposal(recovered)
    }).catch(() => undefined)
  }, [bridge.approvals])

  const readDocument = useCallback(async (docId: string) => {
    setError(null)
    const result = await bridge.documents.read({ documentId: docId })
    if (!result.ok || !result.result) { setError(result.error || 'Could not read document.'); return }
    setSelected(result.result)
    setSelectedDocumentId(docId)
    setEditText(blocksToDocumentSource(result.result.blocks, result.result.format))
    setProposal(null)
    const history = await bridge.documents.listRevisions(docId)
    setRevisions(history.ok ? history.revisions ?? [] : [])
  }, [bridge.documents, setSelectedDocumentId])

  useEffect(() => {
    if (selectedDocumentId && (!selected || selected.documentId !== selectedDocumentId)) {
      void readDocument(selectedDocumentId)
    }
  }, [selectedDocumentId, selected, readDocument])

  const createDocument = async () => {
    if (!projectId || !newDocName.trim()) return
    setError(null)
    const relativePath = newDocName.trim()
    const blocks = documentSourceToBlocks(newDocContent, newDocFormat)
    const result = await bridge.documents.create({
      projectId,
      relativePath,
      format: newDocFormat,
      displayName: relativePath,
      blocks,
      overwrite: false,
    })
    if (!result.ok) { setError(result.error || 'Could not create document.'); return }
    setNewDocContent('')
    setShowNewDocModal(false)
    await refreshDocuments()
    if (result.result && typeof result.result === 'object' && 'document' in result.result) {
      const createdDoc = (result.result as { document: ManagedDocument }).document
      await readDocument(createdDoc.id)
    }
    toast.success('Managed document created')
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    try {
      const created = await createProject(newGroupName.trim())
      setActiveProject(created.id)
      setNewGroupName('')
      setShowNewGroupModal(false)
      toast.success(`Working Group "${created.name}" created`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create working group')
    }
  }

  const prepareEdit = async () => {
    if (!selected) return
    const updatedBlocks = documentSourceToBlocks(editText, selected.format)
    if (selected.blocks.length === 1 && selected.blocks[0].type === 'paragraph') {
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
    } else {
      // General editor update
      const currentHash = await browserCanonicalHash(selected.blocks)
      const result = await bridge.documents.proposeEdits({
        documentId: selected.documentId,
        baseRevisionId: selected.revisionId,
        summary: 'Update document content',
        operations: [{ operation: 'replace_block', blockId: selected.blocks[0]?.id || 'root', expectedBlockHash: currentHash, block: updatedBlocks[0] || { id: 'root', type: 'paragraph', text: editText } }],
      })
      if (!result.ok || !result.pendingApproval || !result.preview) {
        setError(result.error || 'Could not prepare edit proposal.')
        return
      }
      setProposal({ pendingApproval: result.pendingApproval, preview: result.preview as ProposalView['preview'] })
    }
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

  const filteredDocs = useMemo(() => filterDocumentsByQuery(documents, docSearchQuery), [documents, docSearchQuery])

  if (!isElectron()) return <div className="p-6"><ErrorText>Document Agent tools require the hardened Electron desktop bridge.</ErrorText></div>

  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface-base p-5 space-y-4">
      {/* Top Header: Access Controls, Working Group Selector, Environment Tabs */}
      <DocumentAccessControl
        preset={preset}
        onPresetChange={(next) => { void changePreset(next) }}
        workspaceGrant={workspaceGrant}
        onChooseWorkspace={() => { void bridge.workspace.choose({ agentSessionId }).then((result) => { if (result.ok && 'grant' in result && result.grant) setWorkspaceGrant(result.grant); else if (!(('canceled' in result) && result.canceled)) setError(result.error || 'Workspace selection failed.') }) }}
        onRevoke={() => { if (workspaceGrant) void bridge.workspace.revoke({ grantId: workspaceGrant.id, agentSessionId }).then(() => setWorkspaceGrant(null)) }}
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-border pb-3">
        {/* Working Group Selector */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">Working Group</span>
            <div className="flex items-center gap-2">
              <select
                value={projectId || ''}
                onChange={(e) => setActiveProject(e.target.value)}
                className="rounded-lg border border-border bg-input-bg px-3 py-1.5 text-[14px] font-semibold text-foreground"
              >
                {projects.filter((p) => !p.archivedAt).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <GhostButton onClick={() => setShowNewGroupModal(true)}>+ Group</GhostButton>
            </div>
          </div>
        </div>

        {/* Environment Selector Tabs */}
        <div className="flex items-center gap-1 bg-surface-elevated/40 p-1 rounded-lg border border-border">
          <button
            onClick={() => setActiveEnvironment('managed')}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${activeEnvironment === 'managed' ? 'bg-surface text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'}`}
          >
            Managed Library
          </button>
          <button
            onClick={() => setActiveEnvironment('workspace')}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${activeEnvironment === 'workspace' ? 'bg-surface text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'}`}
          >
            Connected Workspace
          </button>
        </div>
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* Main Workspace Body */}
      {activeEnvironment === 'managed' ? (
        <div className="flex-1 grid gap-4 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] min-h-0 overflow-hidden">
          {/* Left Panel: Managed Documents List */}
          <Card className="p-4 space-y-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">Documents ({filteredDocs.length})</h2>
              <PrimaryButton onClick={() => setShowNewDocModal(true)}>+ Document</PrimaryButton>
            </div>

            <input
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full rounded-lg border border-border bg-input-bg px-3 py-1.5 text-[12px] text-input-fg outline-none focus:border-accent"
            />

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => { void readDocument(doc.id) }}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selected?.documentId === doc.id ? 'border-accent bg-surface-elevated' : 'border-border hover:bg-surface-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[13px] text-foreground truncate">{doc.displayName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider ${formatBadgeColor(doc.originalFormat)}`}>
                      {doc.originalFormat}
                    </span>
                  </div>
                  <span className="block text-[11px] font-mono text-foreground-muted truncate mt-0.5">{doc.libraryRelativePath}</span>
                </button>
              ))}
              {filteredDocs.length === 0 && (
                <p className="text-[12px] text-foreground-muted italic py-4 text-center">No managed documents in this working group.</p>
              )}
            </div>
          </Card>

          {/* Right Panel: Selected Document Editor / Preview */}
          <Card className="p-4 space-y-3 flex flex-col min-h-0 overflow-hidden">
            {selected ? (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                {/* Document Header Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3 flex-shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[16px] font-semibold text-foreground">{selected.displayName}</h2>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider ${formatBadgeColor(selected.format)}`}>
                        {selected.format}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-foreground-muted mt-0.5">Revision: {selected.revisionId.slice(0, 10)}…</div>
                  </div>

                  {/* Mode Switcher & Export */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-surface-elevated/40 p-1 rounded-md border border-border text-[12px]">
                      <button
                        onClick={() => setEditorTab('preview')}
                        className={`px-2.5 py-1 rounded transition-colors ${editorTab === 'preview' ? 'bg-surface font-medium text-foreground' : 'text-foreground-muted hover:text-foreground'}`}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setEditorTab('source')}
                        className={`px-2.5 py-1 rounded transition-colors ${editorTab === 'source' ? 'bg-surface font-medium text-foreground' : 'text-foreground-muted hover:text-foreground'}`}
                      >
                        Source
                      </button>
                      <button
                        onClick={() => setEditorTab('revisions')}
                        className={`px-2.5 py-1 rounded transition-colors ${editorTab === 'revisions' ? 'bg-surface font-medium text-foreground' : 'text-foreground-muted hover:text-foreground'}`}
                      >
                        History ({revisions.length})
                      </button>
                    </div>

                    <GhostButton onClick={() => { void bridge.documents.export({ documentId: selected.documentId, revisionId: selected.revisionId, format: selected.format, suggestedFileName: selected.displayName }) }}>
                      Export…
                    </GhostButton>
                  </div>
                </div>

                {/* Editor Tab Content */}
                {editorTab === 'preview' && (
                  <div className="flex-1 overflow-y-auto p-3 rounded-lg border border-border bg-surface-muted min-h-0">
                    <DocumentRenderer blocks={selected.blocks} />
                  </div>
                )}

                {editorTab === 'source' && (
                  <div className="flex-1 flex flex-col min-h-0 space-y-3">
                    <TextArea
                      value={editText}
                      onChange={setEditText}
                      ariaLabel="Document source editor"
                      rows={12}
                    />
                    <div className="flex justify-end gap-2 flex-shrink-0">
                      <GhostButton onClick={() => { void prepareEdit() }}>Prepare edit proposal</GhostButton>
                    </div>
                  </div>
                )}

                {editorTab === 'revisions' && (
                  <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-foreground-muted">Immutable Revision Lineage</h3>
                    {revisions.map((rev) => (
                      <div key={rev.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 bg-surface-elevated/20">
                        <div>
                          <div className="text-[13px] font-medium text-foreground">{rev.summary}</div>
                          <div className="text-[11px] text-foreground-muted mt-0.5 font-mono">
                            {new Date(rev.createdAt).toLocaleString()} · By {rev.createdBy}
                          </div>
                        </div>
                        {rev.id !== selected.revisionId && (
                          <GhostButton onClick={() => { void prepareRestore(rev.id) }}>Restore as new revision</GhostButton>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Change Proposal Review */}
                {proposal && (
                  <div className="rounded-xl border border-border-strong bg-surface-elevated p-4 space-y-3 flex-shrink-0 mt-2" role="region" aria-label="Document change proposal">
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">Review Proposal</h3>
                      <p className="text-[12px] text-foreground-muted">Bound to hash {proposal.pendingApproval.proposalHash.slice(0, 12)}… against base revision.</p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <div className="text-[11px] font-semibold text-danger uppercase tracking-wider mb-1">Before</div>
                        <pre className="overflow-auto rounded-lg bg-surface-muted p-3 text-[12px] text-foreground max-h-[160px]">{proposal.preview.before.map(blockText).join('\n\n')}</pre>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">After</div>
                        <pre className="overflow-auto rounded-lg bg-surface-muted p-3 text-[12px] text-foreground max-h-[160px]">{proposal.preview.after.map(blockText).join('\n\n')}</pre>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <GhostButton onClick={() => { void decide('reject') }}>Reject</GhostButton>
                      <PrimaryButton onClick={() => { void decide('approve') }}>Approve exact change</PrimaryButton>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6 text-foreground-muted">
                <div>
                  <p className="text-[14px] font-medium">No Document Selected</p>
                  <p className="text-[12px] mt-1">Select a document from the left panel or create a new one to begin editing.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* Connected Workspace Environment */
        <div className="flex-1 grid gap-4 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] min-h-0 overflow-hidden">
          <Card className="p-4 space-y-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">Granted Workspace Directory</h2>
              <span className="text-[11px] text-foreground-muted">{workspaceFiles.length} item(s)</span>
            </div>

            {workspaceGrant ? (
              <>
                <div className="rounded-lg border border-border bg-surface-muted p-3 space-y-1">
                  <div className="text-[13px] font-medium text-foreground">{workspaceGrant.displayName}</div>
                  <div className="text-[11px] text-foreground-muted">Session grant · {workspaceGrant.allowedExtensions.join(', ')}</div>
                </div>

                <div className="flex gap-2">
                  <input
                    value={workspaceQuery}
                    onChange={(e) => setWorkspaceQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void searchWorkspace() }}
                    placeholder="Search workspace text…"
                    className="flex-1 rounded-lg border border-border bg-input-bg px-2.5 py-1.5 text-[12px] text-input-fg outline-none focus:border-accent"
                  />
                  <GhostButton onClick={() => { void searchWorkspace() }}>Search</GhostButton>
                </div>

                {workspaceSearchResults.length > 0 && (
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto rounded-lg border border-border bg-surface-muted p-2">
                    <div className="text-[11px] font-semibold text-foreground-muted">Search matches ({workspaceSearchResults.length})</div>
                    {workspaceSearchResults.map((res, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { void readWorkspaceFile(res.relativePath) }}
                        className="w-full text-left text-[11px] text-foreground hover:bg-surface-elevated p-1 rounded transition-colors"
                      >
                        <span className="font-mono text-accent">{res.relativePath}:{res.line}</span> — {res.snippet}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {workspaceFiles.map((file: { relativePath: string; type: string }) => (
                    <button
                      key={file.relativePath}
                      type="button"
                      onClick={() => { if (file.type !== 'directory') void readWorkspaceFile(file.relativePath) }}
                      className="w-full text-left text-[12px] text-foreground py-1.5 px-2 rounded hover:bg-surface-muted flex items-center justify-between transition-colors"
                    >
                      <span className="truncate">{file.type === 'directory' ? '📁 ' : '📄 '}{file.relativePath}</span>
                      {file.type !== 'directory' && <span className="text-[10px] text-foreground-muted">Read</span>}
                    </button>
                  ))}
                  {workspaceFiles.length === 0 && <p className="text-[12px] text-foreground-muted">No workspace files found.</p>}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6 text-foreground-muted">
                <div>
                  <p className="text-[13px] font-medium">No Workspace Granted</p>
                  <p className="text-[12px] mt-1">Select a workspace directory under Agent Access above to browse files.</p>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3 flex flex-col min-h-0 overflow-hidden">
            <h2 className="text-[14px] font-semibold text-foreground">{workspaceFileContent?.path ?? 'File Content Inspector'}</h2>
            {workspaceFileContent ? (
              <pre className="flex-1 overflow-auto rounded-lg bg-surface-muted p-4 text-[12px] font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                {workspaceFileContent.text}
              </pre>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-6 text-foreground-muted">
                <p className="text-[13px]">Select a file from the workspace list to view its contents.</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* New Document Modal */}
      {showNewDocModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"> {/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */}
          <div className="bg-surface-elevated border border-border rounded-xl p-5 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-[16px] font-semibold text-foreground">Create Managed Document</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-foreground-muted mb-1">Document Name / Path</label>
                <input
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g. notes.md"
                  className="w-full rounded-lg border border-border bg-input-bg px-3 py-2 text-[13px] text-input-fg"
                />
              </div>
              <div>
                <label className="block text-[12px] text-foreground-muted mb-1">Format</label>
                <select
                  value={newDocFormat}
                  onChange={(e) => setNewDocFormat(e.target.value as DocumentFormat)}
                  className="w-full rounded-lg border border-border bg-input-bg px-3 py-2 text-[13px] text-input-fg"
                >
                  <option value="md">Markdown (.md)</option>
                  <option value="txt">Text (.txt)</option>
                  <option value="json">JSON (.json)</option>
                  <option value="csv">CSV (.csv)</option>
                  <option value="html">HTML (.html)</option>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF (.pdf)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-foreground-muted mb-1">Initial Content</label>
                <TextArea
                  value={newDocContent}
                  onChange={setNewDocContent}
                  rows={5}
                  ariaLabel="Initial document content"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setShowNewDocModal(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={() => { void createDocument() }}>Create Document</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* New Working Group Modal */}
      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"> {/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */}
          <div className="bg-surface-elevated border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="text-[16px] font-semibold text-foreground">Create Working Group</h3>
            <div>
              <label className="block text-[12px] text-foreground-muted mb-1">Working Group Name</label>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Q3 Architecture"
                className="w-full rounded-lg border border-border bg-input-bg px-3 py-2 text-[13px] text-input-fg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setShowNewGroupModal(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={() => { void handleCreateGroup() }}>Create Group</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
