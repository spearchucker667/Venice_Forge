// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingSplash } from './OnboardingSplash'
import { useProfileStore } from '../stores/profile-store'
import { useSettingsStore } from '../stores/settings-store'

describe('OnboardingSplash', () => {
  beforeEach(() => {
    useProfileStore.setState({
      profiles: [{ id: 'default', name: 'Default Profile', onboardingCompleted: false }],
      activeProfileId: 'default',
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    })
    useSettingsStore.setState({
      activeTab: 'chat',
      pendingSettingsSection: null,
    } as any)
  })

  afterEach(() => {
    useProfileStore.setState({
      profiles: [{ id: 'default', name: 'Default Profile', onboardingCompleted: false }],
      activeProfileId: 'default',
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    })
    useSettingsStore.setState({
      activeTab: 'chat',
      pendingSettingsSection: null,
    } as any)
  })

  it('renders the first step on first launch', () => {
    render(<OnboardingSplash />)
    expect(screen.getByRole('heading', { level: 3, name: 'Welcome to Venice Forge' })).toBeInTheDocument()
    expect(screen.getAllByText(/sends requests to the remote providers you configure/)).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Welcome to Venice Forge' })).toHaveAttribute('aria-modal', 'true')
  })

  it('advances through steps when Continue is clicked', () => {
    render(<OnboardingSplash />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('heading', { level: 3, name: 'Profiles' })).toBeInTheDocument()
    expect(screen.getAllByText(/shared caches remain machine-level/)).toHaveLength(2)
  })

  it('marks onboarding complete on the last step', async () => {
    render(<OnboardingSplash />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))
    await waitFor(() => {
      expect(useProfileStore.getState().globalOnboardingCompleted).toBe(true)
    })
    expect(screen.queryByText('Welcome to Venice Forge')).not.toBeInTheDocument()
  })

  it('does not render when onboarding is already completed', () => {
    useProfileStore.setState({ globalOnboardingCompleted: true })
    render(<OnboardingSplash />)
    expect(screen.queryByText('Welcome to Venice Forge')).not.toBeInTheDocument()
  })

  it('uses accessible copy for the family-safe step', () => {
    render(<OnboardingSplash />)
    // Advance to Family Safe Mode step
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('heading', { level: 3, name: 'Family Safe Mode' })).toBeInTheDocument()
    // Accurate copy: master password gates FSM toggling (not generic settings protection).
    expect(screen.getAllByText(/master password is required before Family Safe Mode/)).toHaveLength(2)
  })

  it('shows both Get Started and Create Profile CTAs on the last step', () => {
    render(<OnboardingSplash />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create profile/i })).toBeInTheDocument()
  })

  // Audit 2026-07-08 #4: Create Profile must deep-link to Settings → Profiles,
  // not just land on Settings → API Keys as the default landing section.
  it('Create Profile opens Settings and requests the Profiles section', () => {
    render(<OnboardingSplash />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

    expect(useProfileStore.getState().globalOnboardingCompleted).toBe(true)
    expect(useSettingsStore.getState().activeTab).toBe('settings')
    expect(useSettingsStore.getState().pendingSettingsSection).toBe('profiles')
  })
})
