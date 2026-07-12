import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useInspectorStore } from '../../stores/inspector-store'
import { useSettingsStore } from '../../stores/settings-store'
import { InspectorPane } from './inspector-pane'

describe('InspectorPane', () => {
  beforeEach(() => {
    useInspectorStore.getState().clearLogs()
    useSettingsStore.setState({ showInspector: true })
  })

  it('clears the selected request and stale error display when logs are cleared', () => {
    useInspectorStore.getState().addLog({
      endpoint: '/image/generate',
      method: 'POST',
      transport: 'venice',
      requestHeaders: {},
      requestBody: {},
      status: 500,
      callOutcome: 'error',
      errorClass: 'server',
      error: 'provider failed safely',
    })

    render(<InspectorPane />)

    expect(screen.getByText('provider failed safely')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Clear all logs'))

    expect(screen.getAllByText(/No requests/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('provider failed safely')).not.toBeInTheDocument()
  })

  it('uses responsive drawer geometry, labelled controls, and closes on Escape', () => {
    render(<InspectorPane />)
    const inspector = screen.getByRole('complementary', { name: 'Developer traffic inspector' })
    expect(inspector.className).toContain('relative soft-separator-x mesh-surface')
    expect(screen.getByRole('button', { name: 'Clear all inspector logs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export redacted inspector logs as JSON' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useSettingsStore.getState().showInspector).toBe(false)
  })
})
