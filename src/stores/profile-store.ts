import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import { broadcastActiveProfileChange, setActiveProfileId } from '../services/activeProfile'

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
  switchProfile: (id: string) => void
  updateProfile: (id: string, data: Partial<UserProfile>) => void
  deleteProfile: (id: string) => void
  setMasterPasswordSet: (set: boolean) => void
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
        const newProfile: UserProfile = {
          id: id || Math.random().toString(36).substring(2, 9),
          name,
          onboardingCompleted: false,
        }
        set((state) => ({ profiles: [...state.profiles, newProfile] }))
        return newProfile
      },

      switchProfile: (id) => {
        const { profiles, activeProfileId } = get()
        if (id === activeProfileId) return
        if (!profiles.find(p => p.id === id)) return

        set({ activeProfileId: id })
        // Clear active volatile state by reloading the window
        // safeStorage uses venice-active-profile-id synchronously on load
        if (typeof window !== 'undefined') {
          setActiveProfileId(id)
          broadcastActiveProfileChange(id)
          window.location.reload()
        }
      },

      updateProfile: (id, data) => {
        set((state) => ({
          profiles: state.profiles.map(p => p.id === id ? { ...p, ...data } : p)
        }))
      },

      deleteProfile: (id) => {
        if (id === 'default') return // Cannot delete default
        set((state) => {
          const profiles = state.profiles.filter(p => p.id !== id)
          let activeId = state.activeProfileId
          if (activeId === id) {
             activeId = 'default'
             if (typeof window !== 'undefined') {
                setActiveProfileId(activeId)
                broadcastActiveProfileChange(activeId)
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
    }
  )
)

if (typeof window !== 'undefined') {
  // Ensure the local storage flag is in sync with the persisted state on load
  const state = useProfileStore.getState()
  setActiveProfileId(state.activeProfileId)
}
