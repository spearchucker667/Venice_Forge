import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import { setActiveProfileId } from '../services/activeProfile'
import { purgeProfileData } from '../services/profilePurge'
import { isElectron, desktopProfilePassword } from '../services/desktopBridge'
import { assertValidProfileId, generateProfileId, isValidProfileId } from '../utils/profileIdValidation'

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
        assertValidProfileId(newId)
        const newProfile: UserProfile = {
          id: newId,
          name: safeName,
          onboardingCompleted: false,
        }
        set((state) => ({ profiles: [...state.profiles, newProfile] }))
        return newProfile
      },

      requestSwitchProfile: async (id, password) => {
        if (!isValidProfileId(id)) return { ok: false, error: "Invalid profile id." }
        const { profiles, activeProfileId } = get()
        if (id === activeProfileId) return { ok: true }
        const target = profiles.find(p => p.id === id)
        if (!target) return { ok: false, error: "Profile not found." }

        // Authorization gate: password-protected profiles require verification
        // in the main process before the raw switch is allowed.
        if (target.hasPassword && isElectron()) {
          const result = await desktopProfilePassword.verify(id, password || '')
          if (!result.ok || !result.verified) {
            const lockoutMsg = result.lockedOutSeconds && result.lockedOutSeconds > 0
              ? ` Locked out. Try again in ${result.lockedOutSeconds}s.`
              : ''
            return { ok: false, error: result.error || `Incorrect password.${lockoutMsg}` }
          }
        }

        performRawProfileSwitch(id)
        return { ok: true }
      },

      updateProfile: (id, data) => {
        assertValidProfileId(id)
        if (data.id !== undefined) {
          throw new Error('Profile id cannot be changed.')
        }
        set((state) => ({
          profiles: state.profiles.map(p => p.id === id ? { ...p, ...data } : p)
        }))
      },

      deleteProfile: async (id) => {
        if (id === 'default') return
        if (!isValidProfileId(id)) return

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
        const validProfiles = (persisted.profiles || []).filter((p): p is UserProfile => {
          if (!p || typeof p !== 'object') return false
          return isValidProfileId(p.id)
        })
        if (validProfiles.length === 0) {
          validProfiles.push({ id: 'default', name: 'Default Profile', onboardingCompleted: false })
        }
        let activeId = persisted.activeProfileId || 'default'
        if (!isValidProfileId(activeId) || !validProfiles.some(p => p.id === activeId)) {
          activeId = 'default'
        }
        persisted.profiles = validProfiles
        persisted.activeProfileId = activeId
      },
    }
  )
)

if (typeof window !== 'undefined') {
  // Ensure the local storage flag is in sync with the persisted state on load
  const state = useProfileStore.getState()
  setActiveProfileId(state.activeProfileId)
}
