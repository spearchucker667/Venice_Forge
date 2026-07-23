import type { DocumentFormat } from '../agent/contracts/documents'

export interface ChatDocumentRef {
  documentId: string
  projectId: string
  relativePath: string
  displayName: string
  format: DocumentFormat
  revisionId: string
}

export function isChatDocumentRef(value: unknown): value is ChatDocumentRef {
  if (!value || typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.documentId === 'string' &&
    candidate.documentId.length > 0 &&
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    typeof candidate.relativePath === 'string' &&
    candidate.relativePath.length > 0 &&
    typeof candidate.displayName === 'string' &&
    candidate.displayName.length > 0 &&
    typeof candidate.format === 'string' &&
    ['txt', 'md', 'json', 'csv', 'html', 'docx', 'pdf'].includes(candidate.format) &&
    typeof candidate.revisionId === 'string' &&
    candidate.revisionId.length > 0
  )
}
