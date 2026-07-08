# DONE — onboarding-comments-scanner scope

## Scope items completed

| Handoff # | Item | Change | File(s) |
|---|---|---|---|
| #7 | Onboarding splash mounted | Imported `OnboardingSplash` and rendered it in `App.tsx` gated by `firstRunAcked` so the age gate is acknowledged first. | `src/App.tsx` |
| #12 | Onboarding copy | Changed Family Safe Mode step from “requires this password to bypass” to “You can turn Family Safe Mode on or off from Settings.” | `src/components/OnboardingSplash.tsx` |
| #11 / #13 | Stale comments/docs | Updated secureStore comment saying profile password UI was “NOT wired” to reflect the wired `ProfilePanel` flow; updated matching test comment; renamed sidebar “Developer controls” comment to “Traffic Inspector controls”; changed scene-generation “bypassed” to “skipped”. | `electron/services/secureStore.ts`, `electron/services/secureStore.test.ts`, `src/components/layout/sidebar.tsx`, `src/services/rp/sceneGenerationService.ts` |
| #10 | Scanner false positives | Refined `scripts/clean-repo-zip.sh` secret scan: removed bare `token` from the generic keyword pattern and added a targeted `token-assignment` pattern so YAML keys like `tokens:` no longer flood `POSSIBLE_SECRET_WARNINGS.tsv`. Real high-risk patterns (bearer, `sk-`, `vn-`, GitHub, AWS) remain. | `scripts/clean-repo-zip.sh` |
| #14 | Duplicate broadcast path | Removed redundant `broadcastActiveProfileChange(...)` calls after `setActiveProfileId(...)` in `performRawProfileSwitch` and `deleteProfile`; `setActiveProfileId` already writes localStorage and fires the broadcast. | `src/stores/profile-store.ts` |

## Tests added/updated

- `src/components/OnboardingSplash.test.tsx` — first-launch render, step navigation, completion persistence, skip-when-completed, and copy regression for Family Safe Mode.
- `src/App.onboarding.test.ts` — source-level regression guard verifying `App.tsx` imports and conditionally renders `OnboardingSplash`.
- `src/services/activeProfile.test.ts` — verifies `setActiveProfileId` broadcasts once per change and `broadcastActiveProfileChange` dedupes identical ids.
- `src/stores/profile-store.broadcast.test.ts` — regression guard verifying `requestSwitchProfile` / `deleteProfile` call `setActiveProfileId` exactly once and do not redundantly call `broadcastActiveProfileChange`.
- `src/components/settings/ProfilePanel.test.tsx` — fixed jsdom `window.location.reload` mock to use `vi.stubGlobal` so the existing password-lock flow tests pass with the new profile-store implementation.

## Cross-scope cleanup performed

`electron/services/secureStore.ts` is shared with the `security-profile-hardening` subagent. After their refactor, ESLint reported unused verifier aliases and an empty interface. Because this file is in my scope and the lint failure blocked the required `npm run lint:eslint` gate, I performed a minimal non-behavioral cleanup:

- Removed the unused `PROFILE_PASSWORD_VERIFIER_VERSION` / `PROFILE_PASSWORD_ALGORITHM` / `PROFILE_PASSWORD_ITERATIONS` / `PROFILE_PASSWORD_SALT_BYTES` / `PROFILE_PASSWORD_DIGEST_BYTES` aliases.
- Replaced `interface ProfilePasswordVerifierRecord extends PasswordVerifierRecord {}` with `type ProfilePasswordVerifierRecord = PasswordVerifierRecord;`.

`electron/services/secureStore.test.ts` passes (30/30).

## Validation results

Commands run for this scope (all passed):

```bash
npm run lint:eslint
npm run typecheck
npm test -- src/components/OnboardingSplash.test.tsx src/App.onboarding.test.ts \
            src/stores/profile-store.broadcast.test.ts src/services/activeProfile.test.ts \
            src/components/settings/ProfilePanel.test.tsx \
            electron/services/secureStore.test.ts \
            src/hooks/useProfileVolatileReset.test.tsx   # 51/51 passed
npm test                                          # 3603 passed, 1 skipped
npm run verify:contracts                          # 102 passes
npm run build
npm run verify:dist
npm run verify:bundle-budget
npm run verify:archive-clean
npm run verify:repo-handoff-hygiene
npm run verify:markdown-links
npm run verify:safety-guard
npm run verify:image-policy
npm run verify:network-boundaries
npm run verify:work-orders
npm run verify:contracts:static
npm run verify:theme-tokens
npm run verify:storage-policy
npm test -- src/theme                              # 114/114 passed
```

The earlier cross-scope blockers (`profilePurge.ts` signature mismatch, theme contrast/count failures, untagged localStorage references) were resolved by the concurrent `security-profile-hardening` and `theme-system` subagents before final validation.

## Git status summary

Files touched by this scope:

- `src/App.tsx`
- `src/components/OnboardingSplash.tsx`
- `src/components/OnboardingSplash.test.tsx` (new)
- `src/App.onboarding.test.ts` (new)
- `src/stores/profile-store.ts`
- `src/stores/profile-store.broadcast.test.ts` (new)
- `src/services/activeProfile.test.ts` (new)
- `src/services/rp/sceneGenerationService.ts`
- `src/components/layout/sidebar.tsx`
- `src/components/settings/ProfilePanel.test.tsx` (test-only mock fix)
- `electron/services/secureStore.ts` (comment update + lint cleanup)
- `electron/services/secureStore.test.ts` (comment update)
- `scripts/clean-repo-zip.sh`

Other modified/untracked files in the working tree belong to the concurrent `security-profile-hardening` and `theme-system` scopes.
