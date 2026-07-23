import { describe, it, expect } from 'vitest'
import { blockText, filterDocumentsByQuery, formatBadgeColor } from './documentViewHelpers'
import type { ManagedDocument } from '../../agent/contracts/documents'

describe('documentViewHelpers', () => {
  it('formats block text for different block types', () => {
    expect(blockText({ id: '1', type: 'heading', level: 2, text: 'Subhead' })).toBe('## Subhead')
    expect(blockText({ id: '2', type: 'paragraph', text: 'Para' })).toBe('Para')
  })

  it('filters documents by search query', () => {
    const docs: ManagedDocument[] = [
      {
        id: '1',
        projectId: 'p1',
        displayName: 'Report 2026',
        libraryRelativePath: 'docs/report.md',
        originalFormat: 'md',
        currentRevisionId: 'r1',
        createdAt: '2026-07-23',
        updatedAt: '2026-07-23',
        metadata: {},
        sensitivity: 'normal',
      },
      {
        id: '2',
        projectId: 'p1',
        displayName: 'Data CSV',
        libraryRelativePath: 'data.csv',
        originalFormat: 'csv',
        currentRevisionId: 'r2',
        createdAt: '2026-07-23',
        updatedAt: '2026-07-23',
        metadata: {},
        sensitivity: 'normal',
      },
    ]

    expect(filterDocumentsByQuery(docs, 'report')).toHaveLength(1)
    expect(filterDocumentsByQuery(docs, 'report')[0].id).toBe('1')
    expect(filterDocumentsByQuery(docs, 'csv')).toHaveLength(1)
    expect(filterDocumentsByQuery(docs, '')).toHaveLength(2)
  })

  it('returns badge colors by format', () => {
    expect(formatBadgeColor('md')).toContain('blue')
    expect(formatBadgeColor('csv')).toContain('emerald')
  })
})
