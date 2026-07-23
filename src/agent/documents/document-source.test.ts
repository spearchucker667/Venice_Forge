import { describe, it, expect } from 'vitest'
import { documentSourceToBlocks, blocksToDocumentSource, serializableDocumentToBlocks } from './document-source'
import type { DocumentBlock } from '../contracts/documents'

describe('documentSourceToBlocks & blocksToDocumentSource', () => {
  it('parses Markdown text into structured blocks', () => {
    const md = `# Title\n\nSome paragraph text.\n\n- Item 1\n- Item 2\n\n> A quote`
    const blocks = documentSourceToBlocks(md, 'md')
    expect(blocks.length).toBeGreaterThanOrEqual(4)
    expect(blocks[0].type).toBe('heading')
    expect(blocks[1].type).toBe('paragraph')
    expect(blocks[2].type).toBe('list')
    expect(blocks[3].type).toBe('quote')
  })

  it('parses CSV into table blocks', () => {
    const csv = `Header1,Header2\nValue1,Value2`
    const blocks = documentSourceToBlocks(csv, 'csv')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
    if (blocks[0].type === 'table') {
      expect(blocks[0].rows).toHaveLength(2)
      expect(blocks[0].rows[0].cells[0].text).toBe('Header1')
    }
  })

  it('converts blocks back to Markdown source', () => {
    const blocks: DocumentBlock[] = [
      { id: '1', type: 'heading', level: 1, text: 'Hello' },
      { id: '2', type: 'paragraph', text: 'World' },
    ]
    const source = blocksToDocumentSource(blocks, 'md')
    expect(source).toBe('# Hello\n\nWorld')
  })

  it('converts serializable document objects safely', () => {
    const docObj = { text: 'Some text document' }
    const blocks = serializableDocumentToBlocks(docObj, 'txt')
    expect(blocks.length).toBe(1)
    expect(blocks[0].type).toBe('paragraph')
  })
})
