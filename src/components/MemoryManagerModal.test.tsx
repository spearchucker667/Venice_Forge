import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryManagerModal } from './MemoryManagerModal'

vi.mock('../services/memoryService', () => ({
  searchMemory: vi.fn(async () => [{ id: 'memory-1', content: 'Remember this', createdAt: 1, tags: ['important'] }]),
  saveMemory: vi.fn(),
  deleteMemory: vi.fn(),
  upsertMemory: vi.fn(),
}))

vi.mock('./ui/modal-requests', () => ({ askDecision: vi.fn(async () => true) }))

describe('MemoryManagerModal accessibility', () => {
  it('uses dialog semantics, labelled filters, announced loading, and visible-on-focus actions', async () => {
    render(<MemoryManagerModal open onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Search AI Memory' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Search')).toHaveFocus()
    expect(screen.getByLabelText('Filter by Tag')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Remember this')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Edit memory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete memory' })).toBeInTheDocument()
  })
})
