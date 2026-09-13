import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createSafeStorage } from '../lib/safe-storage'
import { DEFAULT_PROFILE_ID, broadcastActiveProfileChange, setActiveProfileId } from '../services/activeProfile'
import { purgeProfileData } from '../services/profilePurge'
import { isElectron, desktopMasterPassword, desktopProfilePassword } from '../services/desktopBridge'
import { chatTtsController } from '../services/chatTtsController'
import { translateRuntime } from '../i18n/runtimeTranslator'
import {
  assertUserCreatableProfileId,
  generateProfileId,
  isUserCreatableProfileId,
  isValidProfileStorageId,
} from '../utils/profileIdValidation'
import { sanitizePersistedProfileState } from './profile-store-helpers/sanitizePersistedProfileState'

export const MAX_PROFILES = 20;

/** Result of an addProfile attempt. `ok: false` carries a localized reason so
 *  the caller can render a user-visible message instead of catching a thrown
 *  Error. (VF-AUD-20260912-N7) */
export type AddProfileResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; reason: "empty-name" | "limit-reached"; limit?: number; message: string };

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

  /** Adds a new profile. Returns a Result so the renderer can surface a
   *  localized message rather than catching a thrown Error. */
  addProfile: (name: string, id?: string) => AddProfileResult
  /** Gated profile switch. Password is required when the target profile is protected. */
  requestSwitchProfile: (id: string, password?: string) => Promise<{ ok: boolean; error?: string }>
  updateProfile: (id: string, data: Partial<UserProfile>) => void
  /** Deletes a profile and purges its scoped data. Resolves when purge is complete. */
  deleteProfile: (id: string) => Promise<{ ok: boolean; error?: string }>
  setMasterPasswordSet: (set: boolean) => void
}

/** Internal raw switch: updates active id, broadcasts, and reloads. */
function performRawProfileSwitch(id: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event("venice-forge:abort-in-flight"));
    try { chatTtsController.stop(); } catch { /* ignore */ }
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
          return {
            ok: false,
            reason: "empty-name",
            message: translateRuntime(
              "runtimeGenerated.stores.profileStore.notification.profileNameCannotBeEmpty",
              "Profile name cannot be empty.",
            ),
          };
        }
        if (get().profiles.length >= MAX_PROFILES) {
          return {
            ok: false,
            reason: "limit-reached",
            limit: MAX_PROFILES,
            message: translateRuntime(
              "runtimeGenerated.stores.profileStore.notification.maximumProfileLimitReached",
              `Maximum profile limit (${MAX_PROFILES}) reached. Delete an existing profile before adding a new one.`,
              { limit: MAX_PROFILES },
            ),
          };
        }
        const newId = id ? id.trim() : generateProfileId()
        assertUserCreatableProfileId(newId)
        const newProfile: UserProfile = {
          id: newId,
          name: safeName,
          onboardingCompleted: false,
        }
        set((state) => ({ profiles: [...state.profiles, newProfile] }))
        return { ok: true, profile: newProfile }
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
        if (id === DEFAULT_PROFILE_ID) return { ok: false, error: 'The default profile cannot be deleted.' }
        if (!isUserCreatableProfileId(id)) return { ok: false, error: 'Invalid profile id.' }
        // Desktop credential/password purge is session-authoritative. Require
        // the target profile to be activated before its destructive cleanup.
        if (isElectron() && id !== get().activeProfileId) return { ok: false, error: 'Activate the profile before deleting it.' }

        const purge = await purgeProfileData(id)
        if (isElectron() && !purge.mainProcessPurgeOk) {
          return { ok: false, error: 'Profile data could not be fully purged. The profile was retained so deletion can be retried.' }
        }

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
        return { ok: true }
      },

      setMasterPasswordSet: (setVal) => {
        set({ masterPasswordSet: setVal })
      }
    }),
    {
      name: 'venice-profiles',
      storage: createJSONStorage(() => createSafeStorage()),
      // `merge` runs AFTER storage hydration with both the persisted
      // payload and the current in-memory state. We must not spread the
      // untrusted persisted object across the store — that would let an
      // attacker-supplied JSON replace action methods, set arbitrary
      // fields, or substitute a non-default `activeProfileId`. Instead we
      // sanitize the persisted payload to a small allowlist and merge
      // only those fields onto the current state.
      merge: (persistedState, currentState) => {
        const safe = sanitizePersistedProfileState(persistedState)
        return {
          ...currentState,
          profiles: safe.profiles,
          activeProfileId: safe.activeProfileId,
          globalOnboardingCompleted: safe.globalOnboardingCompleted,
        }
      },
    }
  )
)

// On first hydration, the in-memory `currentState` reports the *initial*
// store defaults (activeProfileId = "default") before merge runs. If
// the persisted sanitizer substitutes a different id, downstream
// subscribers that key off the bootstrap value still need a change
// event. `setActiveProfileId` would write localStorage unnecessarily
// during bootstrap; `broadcastActiveProfileChange(prev, next)` is the
// read-only equivalent.
//
// Best-effort: skip when running outside a browser (SSR / test
// environments without localStorage) or when the id did not change.
if (typeof window !== "undefined") {
  // Defer one tick so the store fully resolves before broadcasting.
  Promise.resolve().then(() => {
    const state = useProfileStore.getState();
    const persistedId = state.activeProfileId;
    if (persistedId !== "default") {
      broadcastActiveProfileChange("default", persistedId);
    }
  });
}

/** Binds the restored renderer profile to trusted main-process state before
 * credential hydration or any profile-scoped request is allowed to run. */
export async function activateRestoredProfileSession(): Promise<void> {
  if (typeof window === 'undefined') return
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
    const [activation, masterPasswordSet] = await Promise.all([
      desktopProfilePassword.activate(profileId),
      desktopMasterPassword.isSet(),
    ])
    useProfileStore.setState({ masterPasswordSet })
    if (!activation.ok || !activation.verified) {
      if (profileId !== DEFAULT_PROFILE_ID) {
        profileId = DEFAULT_PROFILE_ID
        useProfileStore.setState({ activeProfileId: DEFAULT_PROFILE_ID })
        setActiveProfileId(DEFAULT_PROFILE_ID)
        const fallback = await desktopProfilePassword.activate(DEFAULT_PROFILE_ID)
        if (!fallback.ok || !fallback.verified) {
          throw new Error('The default profile session could not be activated.')
        }
      } else {
        throw new Error('The default profile session could not be activated.')
      }
    }
  }
}
