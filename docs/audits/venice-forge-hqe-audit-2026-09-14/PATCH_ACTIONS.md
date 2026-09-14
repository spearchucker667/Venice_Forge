# Patch Actions: Venice Forge

One patch per finding with exact intended change, diff, validation, and rollback.

## HQE-DEBT-001 — Preload and test warnings regarding missing act(...) wrappers in asynchronous UI tests
**Files:** `src/components/OnboardingSplash.test.tsx`
**Exact Intended Change:** Wrap state transitions in await act(async () => ...) or use waitFor.
**Patch:**
```diff
# TODO: append minimal diff once change is implemented
```
**Validation:** ['npx vitest run src/components/OnboardingSplash.test.tsx']
**Expected Result:** Finding transitions to VERIFIED; no regressions.
**Rollback:** Revert the diff and re-run validation.

## HQE-DOC-001 — Release workflow blocks on strict i18n placeholders for newly added theme tokens and actions
**Files:** `src/i18n/resources/*/common.json`
**Exact Intended Change:** Translate missing theme strings or run node scripts/translate-missing.cjs --write and synchronize docs/i18n/translation-status.json.
**Patch:**
```diff
# TODO: append minimal diff once change is implemented
```
**Validation:** ['npm run verify:release-readiness']
**Expected Result:** Finding transitions to VERIFIED; no regressions.
**Rollback:** Revert the diff and re-run validation.

