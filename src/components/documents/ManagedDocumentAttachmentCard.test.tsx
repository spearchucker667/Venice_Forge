import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ManagedDocumentAttachmentCard } from './ManagedDocumentAttachmentCard'
import type { ChatDocumentRef } from '../../types/chatDocument'
import { useSettingsStore } from '../../stores/settings-store'
import { useDocumentAgentStore } from '../../stores/document-agent-store'

describe('ManagedDocumentAttachmentCard', () => {
  it('renders document title and format badge', () => {
    const docRef: ChatDocumentRef = {
      documentId: 'doc_123',
      projectId: 'proj_abc',
      relativePath: 'reports/summary.md',
      displayName: 'Summary Report',
      format: 'md',
      revisionId: 'rev_1',
    }

    render(<ManagedDocumentAttachmentCard docRef={docRef} />)
    expect(screen.getByText('Summary Report')).toBeInTheDocument()
    expect(screen.getByText('md')).toBeInTheDocument()
    expect(screen.getByText('reports/summary.md')).toBeInTheDocument()
  })

  it('triggers navigation and store selection on click', () => {
    const docRef: ChatDocumentRef = {
      documentId: 'doc_123',
      projectId: 'proj_abc',
      relativePath: 'reports/summary.md',
      displayName: 'Summary Report',
      format: 'md',
      revisionId: 'rev_1',
    }

    render(<ManagedDocumentAttachmentCard docRef={docRef} />)
    fireEvent.click(screen.getByRole('button'))

    expect(useSettingsStore.getState().activeTab).toBe('documents')
    expect(useDocumentAgentStore.getState().selectedDocumentId).toBe('doc_123')
  })
})
