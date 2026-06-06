import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MediaDetailDialog } from './media-detail-dialog'
import type { MediaItem } from '../../types/media'

const item: MediaItem = {
  id: 'media-1', image: 'data:image/png;base64,abc', prompt: 'Test image', model: 'flux-dev', timestamp: 1,
  mediaType: 'image', operation: 'generate', parentId: null, childrenIds: [], tags: [], note: '', favorite: false,
}

describe('MediaDetailDialog accessibility', () => {
  it('focuses Close, traps Tab, handles Escape, and restores trigger focus', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const { unmount } = render(
      <MediaDetailDialog item={item} allItems={[item]} onClose={onClose} onNavigate={vi.fn()} onToggleFavorite={vi.fn()} onDelete={vi.fn()} onSelect={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Close (Esc)' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
