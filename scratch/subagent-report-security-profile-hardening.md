# Subagent Report — security-profile-hardening

**Status:** DONE — all scope items completed and validated.

**Scope:** findings #1–#6 from `scratch/agent-handoff-prompt.md` (master password IPC hardening, profile password main-process lockout, profile deletion purge, centralized profile switch gate, generic credential bridge denylist, profile ID validation).

---

## Critical/Major Bugs Fixed

### 1. Master password verifier exposed to renderer (#1)
- Replaced the generic `desktopCredentials.get/set('master_password', …)` flow with typed IPC channels:
  - `masterPassword:isSet`
  - `masterPassword:set`
  - `masterPassword:verify`
  - `masterPassword:clear`
- The salted PBKDF2-SHA256 verifier is now derived, stored, and verified **only in the main process** (`electron/services/secureStore.ts`).
- Added main-process failed-attempt lockout: 5 wrong attempts → 60-second lockout; clears only on success or cooldown.
- `MasterPasswordDialog.tsx` now sends the plaintext over the typed IPC bridge and never touches the verifier record.
- Added regression tests proving the verifier is not written in plaintext and that lockout/cooldown work.

### 2. Profile password lockout was renderer-only (#2)
- Moved per-profile lockout/rate-limiting into the main process (`verifyProfilePassword` in `electron/services/secureStore.ts`).
- Lockout state is keyed by `profileId` so one profile’s lockout does not affect another.
- The IPC `profilePassword:verify` response now includes `lockedOutSeconds` so the UI can show remaining time without exposing whether the profile exists.
- Renderer `ProfilePanel.tsx` still has a UI dialog, but the authoritative gate is now in the main process.

### 3. Profile deletion did not purge profile-scoped data (#3)
- Added `src/services/profilePurge.ts`, which deletes:
  - Venice and Jina API keys for the profile (`desktopApiKey.delete(profileId)`, `desktopJinaApiKey.delete(profileId)`).
  - The profile password verifier (`desktopProfilePassword.clear(profileId)`).
  - Profile-scoped `localStorage` keys (known Zustand stores plus any key ending in `_${profileId}`).
  - IndexedDB records tagged with the profile id across all stores (`StorageService.deleteRecordsForProfile`).
- `profile-store.ts` `deleteProfile()` now awaits `purgeProfileData(id)` before removing the metadata record.
- If the deleted profile is active, the store switches safely to `default` and reloads.
- Updated the delete confirmation copy to accurately describe the purge scope: isolated settings, API keys, and encrypted records are removed; filesystem chat history and shared caches remain.
- Added tests verifying that deleting profile A does not touch profile B data and that purge removes the expected surfaces.

### 4. Profile switch gate centralized (#4)
- Replaced the raw public `switchProfile(id)` store action with an async gated `requestSwitchProfile(id, password?)`.
- The raw switch logic (`performRawProfileSwitch`) is now an internal helper, not part of the store’s public interface.
- `requestSwitchProfile` verifies the target exists and, when the profile is password-protected and running in Electron, requires a successful `desktopProfilePassword.verify()` before performing the switch.
- Updated `ProfilePanel.tsx` to route all switches through `requestSwitchProfile`.
- Added tests proving a password-protected profile cannot be activated without the correct password via the public store API.

### 5. Generic credential bridge too broad (#5)
- Added a denylist in `electron/ipc/handlers/apiKeyHandlers.ts` for the generic `credential:set/get/delete` channels.
- Blocked names include: `password`, `master_password`, `profile_password`, `profile_password:*`, `profile_password_*`, any `*_password` key, and unlock-secret name patterns.
- Non-reserved API-key-like keys still work.
- Added regression tests for each blocked pattern and for a non-reserved key.

### 6. Profile ID validation (#6)
- Added `src/utils/profileIdValidation.ts` with `isValidProfileId`, `assertValidProfileId`, and `generateProfileId` (uses `crypto.randomUUID()`).
- Valid IDs are lowercase alphanumeric + hyphen, max 64 chars, and cannot contain storage separators (`_`, `:`, `/`) or reserved ids like `default`.
- `activeProfile.ts` now validates the persisted active id on read/write and falls back to `default` for invalid values.
- `profile-store.ts` validates ids on `addProfile`, `updateProfile`, `requestSwitchProfile`, and `deleteProfile`; persisted state is sanitized on rehydrate.
- Added tests for valid/invalid IDs and generator output.

---

## Medium Bugs Fixed

- `desktopApiKey.delete` and `desktopJinaApiKey.delete` now accept an optional `profileId` so profile purge can target a specific profile instead of always deleting the active profile’s key.
- `electron/preload.ts` and `src/types/desktop.ts` updated with the new `masterPassword` typed bridge and the `lockedOutSeconds` field on profile password verify.
- `src/services/storageService.ts` gained `deleteRecordsForProfile(profileId)` to purge IndexedDB rows by profile tag without decrypting them.
- `MasterPasswordDialog.tsx` no longer derives/ stores the verifier in the renderer; UI lockout state removed in favor of main-process lockout feedback.

---

## Minor Bugs Fixed

- Updated stale comments in `src/hooks/useProfileVolatileReset.ts` and `src/App.tsx` to reference the new `requestSwitchProfile` name.
- Tagged new `localStorage` access in `src/services/profilePurge.ts` with `localStorage-allowed: profile purge …` so `verify:storage-policy` passes.

---

## Files Added

- `src/utils/profileIdValidation.ts`
- `src/utils/profileIdValidation.test.ts`
- `src/services/profilePurge.ts`
- `src/services/profilePurge.test.ts`
- `src/stores/profile-store.test.ts`

## Files Modified (security-profile-hardening only)

- `electron/services/secureStore.ts`
- `electron/services/secureStore.test.ts`
- `electron/ipc/handlers/apiKeyHandlers.ts`
- `electron/ipc/handlers.test.ts`
- `electron/preload.ts`
- `src/services/desktopBridge.ts`
- `src/types/desktop.ts`
- `src/services/activeProfile.ts`
- `src/services/storageService.ts`
- `src/stores/profile-store.ts`
- `src/components/settings/MasterPasswordDialog.tsx`
- `src/components/settings/ProfilePanel.tsx`
- `src/components/settings/ProfilePanel.test.tsx`
- `src/hooks/useProfileVolatileReset.ts`
- `src/App.tsx`

---

## Tests and Validation

### Targeted tests
```bash
npm test -- electron/services/secureStore.test.ts electron/ipc/handlers.test.ts src/components/settings/ProfilePanel.test.tsx src/utils/profileIdValidation.test.ts src/stores/profile-store.test.ts src/services/profilePurge.test.ts
```
Result: **6 files, 97 tests passed**.

### Full test suite
```bash
npm test
```
Result: **288 test files passed | 1 skipped, 3603 tests passed | 1 skipped**.

### Static / contract validation
```bash
npm run lint:eslint          # pass
npm run typecheck            # pass
npm run build                # pass
npm run verify:dist          # pass
npm run verify:safety-guard  # pass
npm run verify:storage-policy # pass
npm run verify:repo-handoff-hygiene # pass
npm run verify:archive-clean # pass
npm run verify:bundle-budget # pass
npm run verify:image-policy  # pass
npm run verify:network-boundaries # pass
npm run verify:work-orders   # pass
npm run verify:contracts:static # pass
npm run verify:contracts:features # pass
npm run verify:contracts:release # pass
npm run verify:markdown-links # pass
npm run verify:theme-tokens  # pass
```

All commands completed successfully.

---

## Git Status Summary

Unrelated modifications from the parallel `theme-system` and `onboarding-comments-scanner` scopes are present in the working tree (theme files, `OnboardingSplash.tsx`, `ThemeMaker.tsx`, `clean-repo-zip.sh`, etc.). Those were not touched by this subagent and are outside the `security-profile-hardening` scope.

Files added/modified by this scope are listed above. No forbidden archive metadata, patch files, or generated logs were staged.

---

## Known Remaining Risks / Notes

- **Profile deletion is best-effort, not forensic.** Desktop filesystem chat history under `userData/chat-history/` is not keyed by profile id, so it cannot be safely purged per profile without risking other profiles’ data. The UI copy now accurately states that filesystem chat history remains.
- **Master password plaintext crosses in-process IPC.** The renderer sends the user-typed master password to the main process over Electron’s `ipcRenderer.invoke`, which stays within the same application process; the verifier never leaves the main process.
- **Generic credential bridge still allows non-password keys.** This is intentional: the denylist blocks password/unlock-secret names while preserving API-key-like generic credentials.

---

## Blockers

None.
