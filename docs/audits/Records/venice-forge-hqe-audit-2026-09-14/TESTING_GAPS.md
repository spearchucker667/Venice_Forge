# Testing Gaps & Verification Debt: Venice Forge

## Required Verification Suites
### HQE-BUG-001: Sidebar width mutated into persistent store on high-frequency drag events instead of pointer completion
- `npx vitest run src/components/layout/sidebar.test.tsx`
- `npm run test:ui:layout`

### HQE-DEBT-001: Preload and test warnings regarding missing act(...) wrappers in asynchronous UI tests
- `npx vitest run src/components/OnboardingSplash.test.tsx`

### HQE-DOC-001: Release workflow blocks on strict i18n placeholders for newly added theme tokens and actions
- `npm run verify:release-readiness`

