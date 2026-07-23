import type { ChatDocumentRef } from '../../types/chatDocument'
import { useSettingsStore } from '../../stores/settings-store'
import { useProjectStore } from '../../stores/project-store'
import { formatBadgeColor } from './documentViewHelpers'
import { useDocumentAgentStore } from '../../stores/document-agent-store'

export function ManagedDocumentAttachmentCard({ docRef }: { docRef: ChatDocumentRef }) {
  const handleClick = () => {
    // 1. Switch to Documents tab
    useSettingsStore.getState().setActiveTab('documents')
    // 2. Select project if matching
    if (docRef.projectId) {
      useProjectStore.getState().setActiveProject(docRef.projectId)
    }
    // 3. Set target selected document in document agent store
    useDocumentAgentStore.getState().setSelectedDocumentId?.(docRef.documentId)
  }

  return (
    <div
      onClick={handleClick}
      className="mt-2 mb-1 w-full max-w-sm rounded-lg border border-border bg-surface-elevated/40 hover:bg-surface-elevated/80 p-3 transition-colors cursor-pointer group"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick()
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-surface border border-border/60 text-accent group-hover:scale-105 transition-transform">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[13px] text-foreground truncate">{docRef.displayName || docRef.relativePath}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider ${formatBadgeColor(docRef.format)}`}>
              {docRef.format}
            </span>
          </div>
          <div className="text-[11px] text-foreground-muted truncate mt-0.5 font-mono">
            {docRef.relativePath}
          </div>
        </div>
        <div className="text-foreground-muted group-hover:text-foreground transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      </div>
    </div>
  )
}
