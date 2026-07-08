// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingSplash } from './OnboardingSplash'
import { useProfileStore } from '../stores/profile-store'

describe('OnboardingSplash', () => {
  beforeEach(() => {
    useProfileStore.setState({
      profiles: [{ id: 'default', name: 'Default Profile', onboardingCompleted: false }],
      activeProfileId: 'default',
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    })
  })

  afterEach(() => {
    useProfileStore.setState({
      profiles: [{ id: 'default', name: 'Default Profile', onboardingCompleted: false }],
      activeProfileId: 'default',
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    })
  })

  it('renders the first step on first launch', () => {
    render(<OnboardingSplash />)
    expect(screen.getByText('Welcome to Venice Forge')).toBeInTheDocument()
    expect(screen.getByText(/secure, local AI workbench/)).toBeInTheDocument()
  })

  it('advances through steps when Next is clicked', () => {
    render(<OnboardingSplash />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Profiles')).toBeInTheDocument()
  })

  it('marks onboarding complete on the last step', async () => {
    render(<OnboardingSplash />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Family Safe Mode')).toBeInTheDocument()
    expect(screen.getByText(/turn Family Safe Mode on or off/)).toBeInTheDocument()
  })
})
