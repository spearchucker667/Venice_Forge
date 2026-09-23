import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '../../stores/project-store'
import { PromptCreateModal } from './PromptCreateModal'

describe('PromptCreateModal accessibility', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [] })
  })

  it('labels fields, starts on title, and preserves multi-word comma-separated tags', async () => {
    const onCreate = vi.fn(async () => undefined)
    const onClose = vi.fn()
    render(<PromptCreateModal onClose={onClose} onCreate={onCreate} />)

    expect(screen.getByRole('dialog', { name: 'Create New Prompt' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Title *')).toHaveFocus()
    await userEvent.type(screen.getByLabelText('Title *'), 'Portrait')
    await userEvent.type(screen.getByLabelText('Tags'), 'dark fantasy, portrait lighting')
    await userEvent.type(screen.getByLabelText('Content *'), 'A dramatic portrait')
    await userEvent.click(screen.getByRole('button', { name: 'Create Prompt' }))

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['dark fantasy', 'portrait lighting'],
    }))
  })

  it('bounds the prompt editors with a max height, vertical resize, and internal scroll (VF-20260923-P1-022)', () => {
    render(<PromptCreateModal onClose={vi.fn()} onCreate={vi.fn(async () => undefined)} />)

    for (const label of ['Content *', 'Negative Content']) {
      const el = screen.getByLabelText(label)
      expect(el.className).toContain('max-h-[min(40vh,420px)]')
      expect(el.className).toContain('resize-y')
      expect(el.className).toContain('overflow-y-auto')
      expect(el.className).toContain('min-h-')
    }
  })
})
