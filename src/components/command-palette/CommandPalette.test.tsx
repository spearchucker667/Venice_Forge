/** @fileoverview VERIFY-042 mounted Command Palette contracts. */

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAB_REGISTRY } from '../../config/tabs'
import { useProjectStore } from '../../stores/project-store'
import { useSettingsStore } from '../../stores/settings-store'
import { CommandPalette } from './CommandPalette'

function PaletteHarness() {
  const [open, setOpen] = React.useState(false)
  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      onToggle={() => setOpen((current) => !current)}
    />
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    useSettingsStore.setState({ activeTab: 'chat', activeProjectId: null } as never)
    useProjectStore.setState({ projects: [], loaded: true, loading: false, lastError: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens with macOS or non-macOS shortcuts and closes with Escape', () => {
    render(<PaletteHarness />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('routes tab commands through canonical TAB_REGISTRY ids', () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    const image = TAB_REGISTRY.find((tab) => tab.id === 'image')
    expect(image).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${image!.label}\\s*${image!.group}$`, 'i') }))
    expect(useSettingsStore.getState().activeTab).toBe('image')
  })

  it('creates and activates a project through the project-store contract', async () => {
    const project = { id: 'project-new', name: 'New Project', createdAt: 1, updatedAt: 1, archivedAt: null }
    vi.spyOn(window, 'prompt').mockReturnValue('New Project')
    const createProject = vi.spyOn(useProjectStore.getState(), 'createProject').mockResolvedValue(project)
    const setActiveProject = vi.spyOn(useProjectStore.getState(), 'setActiveProject')
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    await vi.waitFor(() => expect(createProject).toHaveBeenCalledWith('New Project'))
    expect(setActiveProject).toHaveBeenCalledWith('project-new')
  })

  it('does not present recipe placeholders without selected recipe context', () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.queryByText(/selected recipe/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/same seed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/copy recipe/i)).not.toBeInTheDocument()
  })

  it('removes its global keyboard listener on unmount', () => {
    const onToggle = vi.fn()
    const view = render(<CommandPalette open={false} onClose={vi.fn()} onToggle={onToggle} />)
    view.unmount()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(onToggle).not.toHaveBeenCalled()
  })
})
