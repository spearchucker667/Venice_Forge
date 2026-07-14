import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import { DEFAULT_PROFILE_ID, setActiveProfileId } from '../services/activeProfile'
import { purgeProfileData } from '../services/profilePurge'
import { isElectron, desktopProfilePassword } from '../services/desktopBridge'
import {
  assertUserCreatableProfileId,
  generateProfileId,
  isUserCreatableProfileId,
  isValidProfileStorageId,
} from '../utils/profileIdValidation'

export interface UserProfile {
  id: string
  name: string
  avatarUrl?: string
  onboardingCompleted: boolean
  hasPassword?: boolean
}

export interface ProfileState {
  profiles: UserProfile[]
  activeProfileId: string
  masterPasswordSet: boolean
  globalOnboardingCompleted: boolean
  setGlobalOnboardingCompleted: (val: boolean) => void

  addProfile: (name: string, id?: string) => UserProfile
  /** Gated profile switch. Password is required when the target profile is protected. */
  requestSwitchProfile: (id: string, password?: string) => Promise<{ ok: boolean; error?: string }>
  updateProfile: (id: string, data: Partial<UserProfile>) => void
  /** Deletes a profile and purges its scoped data. Resolves when purge is complete. */
  deleteProfile: (id: string) => Promise<void>
  setMasterPasswordSet: (set: boolean) => void
}

/** Internal raw switch: updates active id, broadcasts, and reloads. */
function performRawProfileSwitch(id: string): void {
  if (typeof window !== 'undefined') {
    setActiveProfileId(id)
    window.location.reload()
  }
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [
        { id: 'default', name: 'Default Profile', onboardingCompleted: false }
      ],
      activeProfileId: 'default',
      masterPasswordSet: false,
      globalOnboardingCompleted: false,
      setGlobalOnboardingCompleted: (val) => set({ globalOnboardingCompleted: val }),

      addProfile: (name, id) => {
        const safeName = name.trim()
        if (safeName.length === 0) {
          throw new Error('Profile name cannot be empty.')
        }
        const newId = id ? id.trim() : generateProfileId()
        assertUserCreatableProfileId(newId)
        const newProfile: UserProfile = {
          id: newId,
          name: safeName,
          onboardingCompleted: false,
        }
        set((state) => ({ profiles: [...state.profiles, newProfile] }))
        return newProfile
      },

      requestSwitchProfile: async (id, password) => {
        if (!isValidProfileStorageId(id)) return { ok: false, error: "Invalid profile id." }
        const { profiles, activeProfileId } = get()
        const target = profiles.find(p => p.id === id)
        if (!target) return { ok: false, error: "Profile not found." }

        // Electron switches always activate a main-process profile session.
        // The main process checks the live password verifier even if renderer
        // metadata is stale, so unprotected and protected switches share one gate.
        if (isElectron()) {
          const result = await desktopProfilePassword.activate(id, password)
          if (!result.ok || !result.verified) {
            const lockoutMsg = result.lockedOutSeconds && result.lockedOutSeconds > 0
              ? ` Locked out. Try again in ${result.lockedOutSeconds}s.`
              : ''
            return { ok: false, error: result.error || `Incorrect password.${lockoutMsg}` }
          }
        } else if (target.hasPassword) {
            return {
              ok: false,
              error: "Password-protected profiles require the desktop secure bridge.",
            }
        }

        if (id === activeProfileId) return { ok: true }

        performRawProfileSwitch(id)
        return { ok: true }
      },

      updateProfile: (id, data) => {
        assertUserCreatableProfileId(id)
        if (data.id !== undefined) {
          throw new Error('Profile id cannot be changed.')
        }
        set((state) => ({
          profiles: state.profiles.map(p => p.id === id ? { ...p, ...data } : p)
        }))
      },

      deleteProfile: async (id) => {
        if (id === DEFAULT_PROFILE_ID) return
        if (!isUserCreatableProfileId(id)) return
        // Desktop credential/password purge is session-authoritative. Require
        // the target profile to be activated before its destructive cleanup.
        if (isElectron() && id !== get().activeProfileId) return

        // Purge all renderer-reachable profile-scoped data before removing
        // the metadata record. Failures are best-effort and logged by the
        // purge service; we always proceed with metadata removal.
        await purgeProfileData(id)

        set((state) => {
          const profiles = state.profiles.filter(p => p.id !== id)
          let activeId = state.activeProfileId
          if (activeId === id) {
            activeId = 'default'
            if (typeof window !== 'undefined') {
              setActiveProfileId(activeId)
              setTimeout(() => window.location.reload(), 0)
            }
          }
          return { profiles, activeProfileId: activeId }
        })
      },

      setMasterPasswordSet: (setVal) => {
        set({ masterPasswordSet: setVal })
      }
    }),
    {
      name: 'venice-profiles',
      storage: createJSONStorage(() => createSafeStorage()),
      onRehydrateStorage: (state) => {
        // Reject invalid profile ids that may have been imported or corrupted.
        if (!state || typeof state !== 'object') return
        const persisted = state as Partial<ProfileState>
        // Use the storage validator so the 'default' system profile is preserved.
        const validProfiles = (persisted.profiles || []).filter((p): p is UserProfile => {
          if (!p || typeof p !== 'object') return false
          return isValidProfileStorageId(p.id)
        })
        if (validProfiles.length === 0 || !validProfiles.some(p => p.id === DEFAULT_PROFILE_ID)) {
          // Ensure the 'default' system profile always exists.
          const hasDefault = validProfiles.some(p => p.id === DEFAULT_PROFILE_ID)
          if (!hasDefault) {
            validProfiles.unshift({ id: DEFAULT_PROFILE_ID, name: 'Default Profile', onboardingCompleted: false })
          }
        }
        let activeId = persisted.activeProfileId || DEFAULT_PROFILE_ID
        if (!isValidProfileStorageId(activeId) || !validProfiles.some(p => p.id === activeId)) {
          activeId = DEFAULT_PROFILE_ID
        }
        persisted.profiles = validProfiles
        persisted.activeProfileId = activeId
      },
    }
  )
)

if (typeof window !== 'undefined') {
  // Sync the localStorage active-profile flag with the persisted store state.
  // If the persisted active profile is password-protected we cannot verify the
  // password automatically at startup, so we fall back to the default profile
  // until the user explicitly unlocks it via the profile switcher.
  const state = useProfileStore.getState()
  let profileId = state.activeProfileId
  const activeProfile = state.profiles.find(p => p.id === profileId)
  if (activeProfile?.hasPassword) {
    profileId = DEFAULT_PROFILE_ID
    useProfileStore.setState({ activeProfileId: DEFAULT_PROFILE_ID })
  }
  setActiveProfileId(profileId)
  if (isElectron()) {
    // Queue main-process activation during module initialization so later IPC
    // calls from this renderer are ordered after the restored profile binding.
    void desktopProfilePassword.activate(profileId).then((result) => {
      if (result.ok && result.verified) return
      if (profileId === DEFAULT_PROFILE_ID) return
      useProfileStore.setState({ activeProfileId: DEFAULT_PROFILE_ID })
      setActiveProfileId(DEFAULT_PROFILE_ID)
      window.location.reload()
    })
  }
}
