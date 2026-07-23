import type { DocumentBlock, DocumentFormat } from '../contracts/documents'

let idCounter = 0
function nextBlockId(): string {
  idCounter += 1
  return `blk_${Date.now().toString(36)}_${idCounter.toString(36)}`
}

export function serializableDocumentToBlocks(document: unknown, format: DocumentFormat): DocumentBlock[] {
  if (!document) return []
  if (Array.isArray(document)) {
    return document.filter((b): b is DocumentBlock => Boolean(b && typeof b === 'object' && 'type' in b))
  }
  if (typeof document === 'object' && document !== null) {
    const obj = document as Record<string, unknown>
    if (Array.isArray(obj.blocks)) {
      return obj.blocks.filter((b): b is DocumentBlock => Boolean(b && typeof b === 'object' && 'type' in b))
    }
    if (typeof obj.text === 'string') {
      return documentSourceToBlocks(obj.text, format)
    }
    if (typeof obj.content === 'string') {
      return documentSourceToBlocks(obj.content, format)
    }
    try {
      return documentSourceToBlocks(JSON.stringify(document, null, 2), format)
    } catch {
      return []
    }
  }
  if (typeof document === 'string') {
    return documentSourceToBlocks(document, format)
  }
  return []
}

export function documentSourceToBlocks(source: string, format: DocumentFormat): DocumentBlock[] {
  if (!source || typeof source !== 'string') return []
  const text = source.trim()
  if (!text) return []

  if (format === 'csv') {
    return parseCsvToBlocks(text)
  }

  if (format === 'json') {
    return [{ id: nextBlockId(), type: 'code', language: 'json', text }]
  }

  if (format === 'html') {
    return [{ id: nextBlockId(), type: 'code', language: 'html', text }]
  }

  if (format === 'md') {
    return parseMarkdownToBlocks(text)
  }

  // Fallback for txt, docx, pdf extracted text
  const lines = text.split(/\r?\n/)
  const blocks: DocumentBlock[] = []
  let currentPara: string[] = []

  for (const line of lines) {
    if (line.trim() === '') {
      if (currentPara.length > 0) {
        blocks.push({ id: nextBlockId(), type: 'paragraph', text: currentPara.join(' ') })
        currentPara = []
      }
    } else {
      currentPara.push(line.trim())
    }
  }
  if (currentPara.length > 0) {
    blocks.push({ id: nextBlockId(), type: 'paragraph', text: currentPara.join(' ') })
  }
  return blocks.length > 0 ? blocks : [{ id: nextBlockId(), type: 'paragraph', text }]
}

export function blocksToDocumentSource(blocks: DocumentBlock[], format: DocumentFormat): string {
  if (!blocks || blocks.length === 0) return ''

  if (format === 'json') {
    const codeBlock = blocks.find((b) => b.type === 'code')
    if (codeBlock && codeBlock.type === 'code') return codeBlock.text
    return JSON.stringify(blocks, null, 2)
  }

  if (format === 'html') {
    const codeBlock = blocks.find((b) => b.type === 'code')
    if (codeBlock && codeBlock.type === 'code') return codeBlock.text
  }

  if (format === 'csv') {
    const tableBlock = blocks.find((b) => b.type === 'table')
    if (tableBlock && tableBlock.type === 'table') {
      return tableBlock.rows
        .map((row) => row.cells.map((cell) => `"${cell.text.replace(/"/g, '""')}"`).join(','))
        .join('\n')
    }
  }

  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return format === 'md' ? `${'#'.repeat(b.level)} ${b.text}` : b.text
        case 'paragraph':
          return b.text
        case 'code':
          return format === 'md' ? `\`\`\`${b.language || ''}\n${b.text}\n\`\`\`` : b.text
        case 'quote':
          return format === 'md' ? `> ${b.text}` : b.text
        case 'list':
          return b.items
            .map((item, idx) => (b.ordered ? `${idx + 1}. ${item.text}` : `- ${item.text}`))
            .join('\n')
        case 'table':
          if (format === 'md') {
            const rows = b.rows.map((r) => `| ${r.cells.map((c) => c.text).join(' | ')} |`)
            if (rows.length > 0) {
              const header = rows[0]
              const cellCount = b.rows[0]?.cells.length || 1
              const divider = `| ${Array(cellCount).fill('---').join(' | ')} |`
              return [header, divider, ...rows.slice(1)].join('\n')
            }
          }
          return b.rows.map((r) => r.cells.map((c) => c.text).join('\t')).join('\n')
        case 'pageBreak':
          return format === 'md' ? '---' : '\n--- PAGE BREAK ---\n'
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

function parseCsvToBlocks(text: string): DocumentBlock[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []

  const rows = lines.map((line) => {
    // Simple CSV parse considering quotes
    const cells: string[] = []
    let inQuotes = false
    let current = ''
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    cells.push(current.trim())
    return {
      id: nextBlockId(),
      cells: cells.map((cellText) => ({ id: nextBlockId(), text: cellText.replace(/^"|"$/g, '') })),
    }
  })

  return [
    {
      id: nextBlockId(),
      type: 'table',
      rows,
    },
  ]
}

function parseMarkdownToBlocks(text: string): DocumentBlock[] {
  const lines = text.split(/\r?\n/)
  const blocks: DocumentBlock[] = []
  let inCode = false
  let codeLang = ''
  let codeBuffer: string[] = []
  let tableBuffer: string[] = []
  let listBuffer: { ordered: boolean; items: Array<{ id: string; text: string }> } | null = null

  const flushList = () => {
    if (listBuffer && listBuffer.items.length > 0) {
      blocks.push({
        id: nextBlockId(),
        type: 'list',
        ordered: listBuffer.ordered,
        items: listBuffer.items,
      })
      listBuffer = null
    }
  }

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      const rows = tableBuffer
        .filter((line) => !line.match(/^\|?[\s:-|]+\|?$/)) // skip divider line
        .map((line) => {
          const cells = line
            .split('|')
            .slice(1, -1)
            .map((cell) => ({ id: nextBlockId(), text: cell.trim() }))
          return { id: nextBlockId(), cells }
        })
        .filter((r) => r.cells.length > 0)

      if (rows.length > 0) {
        blocks.push({ id: nextBlockId(), type: 'table', rows })
      }
      tableBuffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push({ id: nextBlockId(), type: 'code', language: codeLang || undefined, text: codeBuffer.join('\n') })
        inCode = false
        codeBuffer = []
        codeLang = ''
      } else {
        flushList()
        flushTable()
        inCode = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      continue
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      flushList()
      tableBuffer.push(line)
      continue
    } else {
      flushTable()
    }

    const headingMatch = /^#{1,6}\s+(.+)$/.exec(line)
    if (headingMatch) {
      flushList()
      const level = Math.min(6, Math.max(1, line.indexOf(' '))) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ id: nextBlockId(), type: 'heading', level, text: headingMatch[1].trim() })
      continue
    }

    if (line.trim() === '---' || line.trim() === '***') {
      flushList()
      blocks.push({ id: nextBlockId(), type: 'pageBreak' })
      continue
    }

    const quoteMatch = /^>\s+(.+)$/.exec(line)
    if (quoteMatch) {
      flushList()
      blocks.push({ id: nextBlockId(), type: 'quote', text: quoteMatch[1].trim() })
      continue
    }

    const listMatch = /^(\*|-|\+|\d+\.)\s+(.+)$/.exec(line.trim())
    if (listMatch) {
      const isOrdered = /^\d+\./.test(listMatch[1])
      if (!listBuffer || listBuffer.ordered !== isOrdered) {
        flushList()
        listBuffer = { ordered: isOrdered, items: [] }
      }
      listBuffer.items.push({ id: nextBlockId(), text: listMatch[2].trim() })
      continue
    } else {
      flushList()
    }

    if (line.trim() !== '') {
      blocks.push({ id: nextBlockId(), type: 'paragraph', text: line.trim() })
    }
  }

  flushList()
  flushTable()
  if (inCode) {
    blocks.push({ id: nextBlockId(), type: 'code', language: codeLang || undefined, text: codeBuffer.join('\n') })
  }

  return blocks.length > 0 ? blocks : [{ id: nextBlockId(), type: 'paragraph', text }]
}
