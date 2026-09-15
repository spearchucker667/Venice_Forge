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
    expect(inspector.className).toContain('relative bg-vf-shell-bg border-l border-vf-panel-border')
    expect(screen.getByRole('button', { name: 'Clear all inspector logs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export redacted inspector logs as JSON' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useSettingsStore.getState().showInspector).toBe(false)
  })

  it('renders Traffic Inspector capturing state with pulsing accent dot when enabled', () => {
    useSettingsStore.setState({ redTeamMode: true })
    const { container } = render(<InspectorPane />)
    const wrapper = container.querySelector('span[class*="text-accent"]') as HTMLElement
    expect(wrapper).toBeTruthy()
    expect(wrapper.querySelector('span[class*="bg-accent animate-pulse"]')).toBeTruthy()
    expect(screen.getByText('Traffic Inspector: Capturing')).toBeInTheDocument()
  })

  it('renders Traffic Inspector disabled state without pulse when disabled', () => {
    useSettingsStore.setState({ redTeamMode: false })
    const { container } = render(<InspectorPane />)
    const wrapper = container.querySelector('span[class*="text-text-muted"]') as HTMLElement
    expect(wrapper).toBeTruthy()
    const dot = wrapper.querySelector('span[class*="bg-border"]') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.className).not.toMatch(/animate-pulse/)
    expect(screen.getByText('Traffic Inspector: Disabled')).toBeInTheDocument()
  })

  it('shows live Traffic Inspector request counter that reflects filtered log count', () => {
    useSettingsStore.setState({ redTeamMode: true })
    useInspectorStore.getState().addLog({
      endpoint: '/chat/completions',
      method: 'POST',
      transport: 'venice',
      requestHeaders: {},
      requestBody: {},
      status: 200,
      callOutcome: 'success',
    })
    useInspectorStore.getState().addLog({
      endpoint: '/image/generate',
      method: 'POST',
      transport: 'venice',
      requestHeaders: {},
      requestBody: {},
      status: 500,
      callOutcome: 'error',
      errorClass: 'server',
      error: 'boom',
    })
    render(<InspectorPane />)
    expect(screen.getByText('Traffic Inspector requests: 2')).toBeInTheDocument()
  })
})
