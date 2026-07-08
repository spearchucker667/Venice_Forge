// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProfileStore } from './profile-store'
import { setActiveProfileId } from '../services/activeProfile'
import { purgeProfileData } from '../services/profilePurge'

vi.mock('../services/activeProfile', () => ({
  setActiveProfileId: vi.fn(),
  DEFAULT_PROFILE_ID: 'default',
  getActiveProfileId: vi.fn(() => 'default'),
  subscribeActiveProfile: vi.fn(() => vi.fn()),
  broadcastActiveProfileChange: vi.fn(),
  isDefaultProfileActive: vi.fn(() => true),
}))

vi.mock('../services/profilePurge', () => ({
  purgeProfileData: vi.fn(),
}))

vi.mock('../services/desktopBridge', () => ({
  isElectron: vi.fn(() => true),
  desktopProfilePassword: {
    verify: vi.fn(),
    clear: vi.fn(),
    isSet: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('../utils/profileIdValidation', () => ({
  assertValidProfileId: vi.fn((id: string) => {
    if (!id || typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid profile id')
    }
  }),
  assertUserCreatableProfileId: vi.fn((id: string) => {
    if (!id || typeof id !== 'string' || id.length === 0 || id === 'default') {
      throw new Error('Invalid profile id')
    }
  }),
  generateProfileId: vi.fn(() => 'generated-id'),
  isValidProfileId: vi.fn((id: string) => typeof id === 'string' && id.length > 0),
  isValidProfileStorageId: vi.fn((id: string) => typeof id === 'string' && id.length > 0),
  isUserCreatableProfileId: vi.fn((id: string) => typeof id === 'string' && id.length > 0 && id !== 'default'),
}))

describe('profile-store broadcast deduplication', () => {
  beforeEach(() => {
    useProfileStore.setState({
      profiles: [
        { id: 'default', name: 'Default Profile', onboardingCompleted: false },
        { id: 'work', name: 'Work', onboardingCompleted: false },
      ],
      activeProfileId: 'default',
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
    })
    vi.mocked(setActiveProfileId).mockClear()
    vi.mocked(purgeProfileData).mockResolvedValue({} as never)
  })

  it('requestSwitchProfile calls setActiveProfileId exactly once', async () => {
    const { desktopProfilePassword } = await import('../services/desktopBridge')
    vi.mocked(desktopProfilePassword.verify).mockResolvedValue({ ok: true, verified: true })

    const result = await useProfileStore.getState().requestSwitchProfile('work')
    expect(result.ok).toBe(true)
    expect(setActiveProfileId).toHaveBeenCalledTimes(1)
    expect(setActiveProfileId).toHaveBeenCalledWith('work')
  })

  it('deleteProfile calls setActiveProfileId exactly once when deleting active profile', async () => {
    useProfileStore.setState({ activeProfileId: 'work' })
    await useProfileStore.getState().deleteProfile('work')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(setActiveProfileId).toHaveBeenCalledTimes(1)
    expect(setActiveProfileId).toHaveBeenCalledWith('default')
  })

  it('deleteProfile does not call setActiveProfileId when deleting inactive profile', async () => {
    useProfileStore.setState({ activeProfileId: 'default' })
    await useProfileStore.getState().deleteProfile('work')
    expect(setActiveProfileId).not.toHaveBeenCalled()
  })
})
