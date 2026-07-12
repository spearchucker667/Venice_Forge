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
    render(<PromptCreateModal onClose={vi.fn()} onCreate={onCreate} allTags={[]} />)

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
})
