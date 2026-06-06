import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/desktopBridge', () => ({
  isElectron: () => false,
  desktopConfig: { writeSanitized: vi.fn() },
}))
vi.mock('../../stores/config-store', () => ({ reloadConfig: vi.fn() }))

import { Sidebar } from './sidebar'
import { useSettingsStore } from '../../stores/settings-store'

describe('Sidebar controls', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      sidebarOpen: true,
      activeTab: 'chat',
      redTeamMode: false,
      showInspector: false,
      localFamilySafeModeEnabled: true,
    })
  })

  it('exposes the Media Studio navigation item', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Media Studio' }))
    expect(useSettingsStore.getState().activeTab).toBe('gallery')
  })

  it('makes Red-Team Mode visible by opening the Inspector', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Red-Team Mode' }))
    expect(useSettingsStore.getState()).toMatchObject({ redTeamMode: true, showInspector: true })
  })

  it('places a working Family Safe Mode switch below Red-Team Mode', () => {
    render(<Sidebar />)
    const switches = screen.getAllByRole('switch')
    expect(switches.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Toggle Red-Team Mode',
      'Toggle Family Safe Mode',
    ])

    fireEvent.click(switches[1])
    expect(useSettingsStore.getState().localFamilySafeModeEnabled).toBe(false)
  })
})
