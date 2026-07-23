import type { DocumentBlock, DocumentFormat, ManagedDocument } from '../../agent/contracts/documents'

export function blockText(block: DocumentBlock): string {
  switch (block.type) {
    case 'heading': return `${'#'.repeat(block.level)} ${block.text}`
    case 'paragraph':
    case 'code':
    case 'quote': return block.text
    case 'list': return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${item.text}`).join('\n')
    case 'table': return block.rows.map((row) => row.cells.map((cell) => cell.text).join(' | ')).join('\n')
    case 'image': return `[Image: ${block.altText ?? block.caption ?? 'managed image'}]`
    case 'pageBreak': return '— page break —'
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]))
  }
  return value
}

export async function browserCanonicalHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonicalize(value))))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function formatBadgeColor(format: DocumentFormat): string {
  switch (format) {
    case 'md': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    case 'json': return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'csv': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'html': return 'bg-orange-500/10 text-orange-400 border-orange-500/30'
    case 'pdf': return 'bg-red-500/10 text-red-400 border-red-500/30'
    case 'docx': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
    case 'txt':
    default: return 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30'
  }
}

export function filterDocumentsByQuery(documents: ManagedDocument[], query: string): ManagedDocument[] {
  const q = query.trim().toLowerCase()
  if (!q) return documents
  return documents.filter((doc) =>
    doc.displayName.toLowerCase().includes(q) ||
    doc.libraryRelativePath.toLowerCase().includes(q) ||
    doc.originalFormat.toLowerCase().includes(q)
  )
}
