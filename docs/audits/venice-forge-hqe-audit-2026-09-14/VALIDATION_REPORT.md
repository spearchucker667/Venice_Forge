# Validation Report: Venice Forge

## Summary

Validation results for findings with explicit verification commands.

## Findings Validated

| Finding ID | Status | Commands | Expected | Actual | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| HQE-BUG-001 | NOT_VERIFIED | `npx vitest run src/components/layout/sidebar.test.tsx; npm run test:ui:layout` | Fix verified | (run commands) | FACT |
| HQE-DEBT-001 | NOT_VERIFIED | `npx vitest run src/components/OnboardingSplash.test.tsx` | Fix verified | (run commands) | FACT |
| HQE-DOC-001 | NOT_VERIFIED | `npm run verify:release-readiness` | Fix verified | (run commands) | FACT |
