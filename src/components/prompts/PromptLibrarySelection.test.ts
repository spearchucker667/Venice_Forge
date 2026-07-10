import { describe, expect, it } from 'vitest'
import type { PromptLibraryItem } from '../../types/prompt-library'
import { reconcileSelectedPrompt } from './PromptLibraryView'

const item = (id: string) => ({ id } as PromptLibraryItem)

describe('reconcileSelectedPrompt', () => {
  it('keeps a visible selection', () => expect(reconcileSelectedPrompt('b', [item('a'), item('b')])).toBe('b'))
  it('selects the first visible prompt when filtering hides the selection', () => expect(reconcileSelectedPrompt('b', [item('a')])).toBe('a'))
  it('clears the selection for an empty list', () => expect(reconcileSelectedPrompt('b', [])).toBeNull())
  it('clears the selection when the selected id is null', () => expect(reconcileSelectedPrompt(null, [item('a')])).toBe('a'))
  it('returns the first item after a deletion that removes the previous selection', () => expect(reconcileSelectedPrompt('deleted', [item('a'), item('b')])).toBe('a'))
})
