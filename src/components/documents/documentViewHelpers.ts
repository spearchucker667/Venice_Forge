import type { DocumentBlock } from '../../agent/contracts/documents'

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
