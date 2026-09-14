# Remediation Plan: Venice Forge

**Total findings addressed:** 2

## Findings

| ID | Title | Severity | Effort | Status |
| :--- | :--- | :--- | :--- | :--- |
| HQE-DOC-001 | Release workflow blocks on strict i18n placeholders for newly added theme tokens and actions | HIGH | M | OPEN |
| HQE-DEBT-001 | Preload and test warnings regarding missing act(...) wrappers in asynchronous UI tests | LOW | S | OPEN |

## Phases

### Phase 1: Containment / Safety

**Objective:** Stop exploitation paths and prevent regression.

**Actions:**
- [ ] Address all CRITICAL findings
- [ ] Add regression tests for HIGH findings

**Exit criteria:**
- [ ] No CRITICAL findings remain OPEN
- [ ] CI passes

### Phase 2: Minimal Fixes

**Objective:** Resolve HIGH/MEDIUM findings with smallest safe change.

**Actions:**
- [ ] Apply patch actions
**Exit criteria:**
- [ ] All HIGH findings transition to VERIFIED or DEFERRED

### Phase 3: Verification

**Objective:** Prove fixes work and no regressions introduced.

**Actions:**
- [ ] Run validation commands from each finding

**Exit criteria:**
- [ ] All validation commands pass

## Patch Actions

See `PATCH_ACTIONS.md`.

## Verification Commands

### HQE-DEBT-001
- `npx vitest run src/components/OnboardingSplash.test.tsx`

### HQE-DOC-001
- `npm run verify:release-readiness`

