import type { ContentPart } from '../types/venice'

/**
 * Converts message content (either a string or a ContentPart array)
 * into a single unified search string by extracting text components.
 */
export function contentToSearchText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text || '' : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}
