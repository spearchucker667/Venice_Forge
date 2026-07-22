# Venice Forge Theme Engine, Border System, and Theme Portability Audit and Remediation Report

**Date:** July 21, 2026  
**Repository Path:** `/Users/super_user/Projects/Venice_Forge`  
**GitHub Repository:** `spearchucker667/Venice_Forge`  
**Version:** 3.0.0-beta.1  
**Status:** Audit & Remediation Complete — All Verification Contracts Passing  

---

## 1. Title and Metadata

| Attribute | Value |
|---|---|
| **Audit Scope** | Theme Engine, Border & Separator System, Focus Rings, Theme Persistence & Migration, Multi-Custom Theme System, Import & Export Safety, IPC Boundary Integrity |
| **Target Commit / Branch** | `main` |
| **Node.js Environment** | `v22.13.0` |
| **Build & Test Engine** | Vite 5, Vitest 4, TypeScript 5.3+, Tailwind v4 |
| **Contract Verifiers** | `verify:theme-tokens`, `test:unit:theme`, `typecheck`, `lint:eslint`, `verify:contracts` |

---

## 2. Executive Summary

This audit and remediation addressed the Venice Forge theme engine, border visibility system, keyboard focus indicator pipeline, and theme persistence & portability architecture. Prior to this remediation, component styling suffered from washed-out border opacity caused by blanket `color-mix` low-opacity washes in `components.css`, a single-slot custom theme persistence limit (`customTheme: Theme | null`) in Zustand `useSettingsStore`, strict custom theme ID validation rejection (`isValidPersistedTheme` rejecting non-`custom` IDs), and a lack of structured import previewing before persisting user YAML files.

The remediation accomplished:
1. **Border System Strengthening:** Replaced washed-out 24%–28% opacity `color-mix` border declarations in `src/styles/components.css` with solid `--color-border` and `--color-border-strong` CSS variables across cards, panels, inputs, sidebars, headers, and separators.
2. **Multi-Custom Theme Engine & Persistence:** Enhanced `useSettingsStore` with a version 12 migration supporting a `customThemes: Theme[]` array, enabling users to create, name, duplicate, edit, and delete multiple user custom themes with stable IDs (`user-theme-${timestamp}`).
3. **Drafting, Real-time Preview & Transactional Rollback:** Upgraded `src/components/ThemeMaker.tsx` to handle live preview (`applyTheme(draft)`) with unsaved dirty tracking ("Unsaved Draft Changes" badge), explicit "Save Theme", "Cancel / Reset" rollback, and emergency "Restore Default Theme".
4. **Structured Token Categories:** Reorganized the 29 semantic tokens into 5 logical editor sections: Surfaces & Backgrounds, Typography & Text, Borders & Focus, Controls & Buttons, and Status & Feedback.
5. **Interactive Theme Import Preview Modal:** Built a modal in `ThemeMaker.tsx` that previews theme metadata, mode, layout preview, contrast ratios, and collision detection before confirming "Import & Apply", "Import as Copy", or "Replace Existing".
6. **Main-Process Owned IPC File Operations:** Preserved main-process owned dialogs (`app:saveYamlFile`, `app:loadYamlFile`) enforcing maximum file size limits (10 MiB) and strict sanitization of export filenames.

---

## 3. Verification Methodology & Tools Used

Verification was conducted using a multi-tiered static and dynamic analysis suite:
- **Static Token Verifier:** `scripts/verify-theme-tokens.cjs` (`npm run verify:theme-tokens`) scanning 139+ UI components for hardcoded color bypasses.
- **Unit & System Test Suite:** `vitest run src/theme` (118 passed) and `ThemeMaker` test suites (`ThemeMaker.test.ts`, `ThemeMaker.ui.test.tsx`, `ThemeMaker.custom.test.tsx` — 47 passed).
- **TypeScript Type Checker:** `npm run typecheck` (`tsc --noEmit` across main and renderer tsconfigs).
- **ESLint Quality & Style Gate:** `npm run lint:eslint` (`eslint --max-warnings=0`).
- **Workspace Contracts Suite:** `npm run verify:contracts` verifying all repository contract sub-verifiers.

---

## 4. Current Theme System Architecture

The theme engine translates high-level theme definitions into 29 semantic CSS custom properties applied to `document.documentElement`:
- **Core Types (`src/theme/themeTypes.ts`):** Defines `SemanticThemeTokens` (29 tokens), `ThemeTokens` (combining legacy and semantic tokens), `Theme`, and `ThemeState`.
- **Application Logic (`src/theme/applyTheme.ts`):** `applyTheme()` sets CSS root variables (`--bg`, `--surface`, `--surface-elevated`, `--surface-muted`, `--border`, `--border-strong`, `--foreground`, `--foreground-muted`, `--foreground-subtle`, `--accent`, `--accent-hover`, `--accent-fg`, `--focus-ring`, `--button-primary-bg`, `--button-secondary-bg`, `--input-bg`, `--input-fg`, `--selection-bg`, `--selection-fg`, etc.) and dispatches an `applyTheme:complete` DOM event.
- **Theme Resolver (`resolveInitialTheme`):** Resolves themes in priority order: active custom theme from `customThemes` / `customTheme`, YAML themes from `configStore`, built-in themes from `THEME_REGISTRY`, and fallback to `DEFAULT_THEME` (`builtin-venice`).
- **Tailwind v4 Integration (`src/styles/theme.css`):** Maps CSS root variables into Tailwind theme tokens via `@theme`.

---

## 5. Border System Audit

### Pre-Remediation Finding
In `src/styles/components.css`, component containers (`.mesh-card`, `.mesh-panel`, `.mesh-input`, `.mesh-sidebar`, `.mesh-header`) applied `border-color: color-mix(in srgb, var(--color-border) 28%, transparent)` and `border: 1px solid color-mix(in srgb, var(--color-border) 24%, transparent)`. This reduced border opacity to 24%–28%, rendering panel dividers and card borders faint or invisible on low-contrast themes.

### Remediation
Replaced all low-opacity `color-mix` washes in `src/styles/components.css` with direct, sharp references to `--color-border` and `--color-border-strong`. Inputs and panels now render crisp 1px borders using `var(--color-border)` that respond directly to user theme choices.

---

## 6. Divider and Separator Audit

### Pre-Remediation Finding
Soft separators (`.soft-separator-x`, `.soft-separator-y`) used blurred 2px pseudos with low-opacity linear gradients (`color-mix(in srgb, var(--color-border) 24%, transparent)`), causing subtle visual artifacts and double-width borders when placed adjacent to panel edges.

### Remediation
Updated separator pseudo-elements to crisp 1px linear gradients running directly from transparent through `var(--color-border)`. Adjacent panes now align cleanly without overlapping separator lines.

---

## 7. Outline, Hover, Active, Disabled, Selected, Warning, Error, and Success Audit

### Findings & Remediation
- **Button System (`src/styles/components.css`):** Verified secondary buttons (`.btn`), primary buttons (`.btn.primary`), danger buttons (`.btn.danger`), and ghost buttons (`.btn.ghost`). Hover states update background and border cleanly (`var(--surface-muted)`, `var(--border-strong)`).
- **Selection States:** `::selection` maps to `var(--selection-bg)` and `var(--selection-fg)`. Table and list row selections map to `selectionBackground` and `selectionForeground`.
- **Status Borders & Feedback:** Alert cards map `--preview-danger`, `--preview-warning`, `--preview-success` foreground and background mixes cleanly, ensuring high legibility across dark and light modes.

---

## 8. Focus Ring and Accessibility Audit

### Findings & Remediation
- **Keyboard Focus Ring (`src/styles/theme.css`):** Global focus rule set to `*:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 6px; }`.
- **Theme Maker Focus Controls:** Dedicated "Borders & Focus" section in `ThemeMaker.tsx` allows editing `focusRing`, `border`, `borderStrong`, `selectionBackground`, and `selectionForeground` with real-time feedback.
- **Theme Preview focus display:** `ThemePreview.tsx` renders a dedicated "Focused control" mock demonstrating the active `--focus-ring` outline and offset.

---

## 9. Theme Editor Audit

### Pre-Remediation Finding
`ThemeMaker.tsx` displayed an un-categorized flat list of token color inputs, making it difficult to locate specific controls for borders, inputs, or buttons.

### Remediation
Organized token inputs into 5 logical categories:
1. **Surfaces & Backgrounds** (`background`, `surface`, `surfaceElevated`, `surfaceMuted`, `overlay`, `glow`)
2. **Typography & Text** (`foreground`, `foregroundMuted`, `foregroundSubtle`, `placeholder`, `disabledForeground`, `link`)
3. **Borders & Focus** (`border`, `borderStrong`, `focusRing`, `selectionBackground`, `selectionForeground`)
4. **Controls & Buttons** (`accent`, `accentHover`, `accentForeground`, `buttonPrimaryBackground`, `buttonPrimaryForeground`, `buttonSecondaryBackground`, `buttonSecondaryForeground`, `inputBackground`, `inputForeground`)
5. **Status & Feedback** (`success`, `successForeground`, `warning`, `warningForeground`, `danger`, `dangerForeground`, `info`)

Each token is equipped with a native `<input type="color" />` picker, hex text input, and inline `aria-invalid` error badge.

---

## 10. Theme Preview, Draft, and Rollback Audit

### Remediation
`ThemeMaker.tsx` maintains an explicit `draft` state separate from the committed theme in `useSettingsStore`:
- Live modifications update `draft` and trigger `applyTheme(draft)`.
- `isDraftDirty` compares `draft` against stored theme state and displays an "Unsaved Draft Changes" pill.
- **"Save Theme":** Commits `draft` to `customThemes` store and sets `selectedThemeId`.
- **"Cancel / Reset":** Instantly rolls back live preview and draft to the committed theme state.
- **"Restore Default Theme":** Emergency reset to `BUILTIN_VENICE`.

---

## 11. Theme Persistence and Bootstrapping Audit

### Pre-Remediation Finding
`useSettingsStore` stored only a single custom theme (`customTheme: Theme | null`) under `selectedThemeId = "custom"`.

### Remediation
Updated `useSettingsStore` (`src/stores/settings-store.ts`):
- Added `customThemes: Theme[]` array to store state.
- Added `saveCustomTheme(theme)`, `deleteCustomTheme(id)`, and `setCustomThemes(themes)`.
- Added **version 12 schema migration** in `migrate()` to automatically preserve existing single `customTheme` objects into `customThemes: [state.customTheme]`.
- Updated `isValidPersistedTheme` in `src/theme/applyTheme.ts` to allow any valid non-empty string `theme.id` (such as `user-theme-1721500000000`).

---

## 12. Theme Import Audit

### Remediation
Implemented structured theme import in `ThemeMaker.tsx`:
1. `handleImportClick()` calls main-process IPC `desktopFiles.importYamlString()`.
2. `yamlToTheme(yaml)` parses versioned or legacy YAML definitions into a completed `Theme` object.
3. Checks for theme ID or name collision in `customThemes`.
4. Opens **Import Preview Modal** displaying:
   - Theme Name, Mode, Override Count.
   - Collision alert if a theme with the same name already exists.
   - Interactive `ThemePreview` component rendered inside the modal.
5. Confirmation actions:
   - **"Import & Apply":** Saves to `customThemes` and sets as active theme.
   - **"Import as Copy":** Generates a new unique ID and appends `(Imported)` to theme name.
   - **"Replace Existing":** Overwrites matching custom theme.
   - **"Cancel":** Closes modal without mutating workspace state.

---

## 13. Theme Export Audit

### Remediation
`handleExport()` converts active draft or selected theme into versioned YAML via `themeToYaml(theme)`. The filename is sanitized (`theme.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").theme.yaml`) and written via main-process IPC `desktopFiles.exportYaml(yaml, defaultPath)`.

---

## 14. Schema Versioning and Migration Audit

### Verification
- **YAML Schema Version 1:** Output produced by `themeToYaml` emits `version: 1` with snake_case token mapping (`background`, `button_primary_background`, `focus_ring`, `selection_background`).
- **Legacy Fallback Handling:** `yamlToTheme` retains full backward compatibility for legacy terminal color mappings (`terminal_colors`, `details`, `background`, `foreground`, `accent`) and luminance mode inference.

---

## 15. Immutability & Access Control Audit (Built-in vs User Themes)

### Verification
- Built-in theme definitions in `src/theme/builtins/` and `src/theme/themes.ts` are immutable code assets (`BUILTIN_THEMES`).
- Clicking "Delete Theme" in `ThemeMaker.tsx` is only available for user-created custom themes (`customThemesMap[selector]`). Built-in themes cannot be modified or deleted.

---

## 16. Unsafe Formatting & Escape Bypasses Audit

### Verification
- `isValidColorValue(v)` checks token input against strict CSS color syntax (hex `#rgb`/`#rrggbb`/`#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`).
- HTML tags, scripts, `@import`, `url()`, or invalid CSS strings are rejected by `importedTokens` and `isValidPersistedTheme`.

---

## 17. Diagnostic Snapshot & System Telemetry Audit

### Verification
- Theme configuration state (`selectedThemeId`, `appearanceMode`) is included in `computeAppStatusSnapshot()` and `computeSafeDiagnosticsSnapshot()` in `src/services/diagnosticsService.ts`.
- Diagnostic snapshots strip raw prompt texts and private paths, confirming zero leak of sensitive user context.

---

## 18. Test Coverage & Safety Contract Audit

### Test Verification Results
- `src/theme/contrast.test.ts` — 68 tests passed
- `src/theme/themes.test.ts` — 23 tests passed
- `src/theme/applyTheme.test.ts` — 15 tests passed
- `src/theme/yamlTheme.test.ts` — 6 tests passed
- `src/theme/validateColor.test.ts` — 5 tests passed
- `src/theme/fallbacks.test.ts` — 1 test passed
- `src/components/ThemeMaker.test.ts` — 27 tests passed
- `src/components/ThemeMaker.ui.test.tsx` — 16 tests passed
- `src/components/ThemeMaker.custom.test.tsx` — 4 tests passed

---

## 19. Identified Vulnerabilities, Risks, and Functional Deficiencies

| ID | Issue | Severity | Status |
|---|---|---|---|
| **DEF-01** | Faint border visibility caused by blanket 24%–28% opacity `color-mix` washes in `components.css` | Medium | **REMEDIATED** |
| **DEF-02** | Single custom theme slot limit (`customTheme: Theme | null`) overwriting user themes | High | **REMEDIATED** |
| **DEF-03** | `isValidPersistedTheme` rejecting custom themes with IDs other than `"custom"` | High | **REMEDIATED** |
| **DEF-04** | Immediate draft mutation of active theme on edit without cancel/rollback capability | Medium | **REMEDIATED** |
| **DEF-05** | Unvalidated theme YAML import applying immediately without preview or conflict detection | Medium | **REMEDIATED** |

---

## 20. Remediation Architecture & Design

```
+-----------------------------------------------------------------------+
|                              Theme Engine                             |
+-----------------------------------------------------------------------+
                                   |
         +-------------------------+-------------------------+
         |                                                   |
         v                                                   v
+------------------+                              +--------------------+
|  builtins/*.ts   |                              | settings-store.ts  |
| (Immutable Assets)                              | customThemes: []   |
+------------------+                              | (Zustand Store v12)|
         |                                        +--------------------+
         |                                                   |
         +-------------------------+-------------------------+
                                   |
                                   v
                      +-------------------------+
                      |     applyTheme.ts       |
                      | resolveInitialTheme()   |
                      | applyTheme(Theme)       |
                      +-------------------------+
                                   |
                                   v
                      +-------------------------+
                      | document.documentElement|
                      | --bg, --border, etc.    |
                      +-------------------------+
```

---

## 21. Step-by-Step Code Changes Implemented

1. **`src/styles/components.css`:** Replaced `color-mix` border opacity washes with `var(--color-border)` and `var(--color-border-strong)`.
2. **`src/styles/theme.css`:** Mapped root border custom properties cleanly into Tailwind theme variables.
3. **`src/theme/themeTypes.ts`:** Updated `ThemeState` to include `customThemes?: Theme[]`.
4. **`src/theme/applyTheme.ts`:** Updated `isValidPersistedTheme` to validate non-empty string IDs; updated `resolveInitialTheme` to query `customThemes`.
5. **`src/stores/settings-store.ts`:** Added `customThemes: Theme[]`, `saveCustomTheme`, `deleteCustomTheme`, `setCustomThemes`, and version 12 Zustand migration.
6. **`src/components/ThemePreview.tsx`:** Updated preview component to display borderStrong, focusRing, secondary button, selection, and alert mocks.
7. **`src/components/ThemeMaker.tsx`:** Implemented structured token categories, unsaved draft tracking, live preview rollback, multi-custom theme management, and Import Preview Modal.
8. **`src/components/ThemeMaker.custom.test.tsx`:** Created new test suite covering multi-custom theme saving, deletion, rollback, and import preview modal.

---

## 22. Verification Results & Test Evidence

```bash
npm run verify:theme-tokens
# Output: [verify:theme-tokens] OK: no forbidden hardcoded color classes in themeable UI (139 files scanned).

npm run test:unit:theme
# Output: 6 passed (6) | 118 passed (118)

npx vitest run src/components/ThemeMaker.test.ts src/components/ThemeMaker.ui.test.tsx src/components/ThemeMaker.custom.test.tsx
# Output: 3 passed (3) | 47 passed (47)

npm run typecheck
# Output: tsc --noEmit && tsc --noEmit --project tsconfig.electron.json (0 errors)

npm run lint:eslint
# Output: eslint src electron server.ts scripts --max-warnings=0 (0 warnings, 0 errors)

npm run verify:contracts
# Output: All workspace sub-verifiers passed cleanly (103/103 checks)
```

---

## 23. Cross-Check Against Initial Instructions

- [x] Border colors, widths, radii, and separators verified and remediated.
- [x] Focus rings and keyboard visibility enforced via `--focus-ring` and `focus-visible`.
- [x] Selected, active, hover, disabled, warning, error, and success outlines verified.
- [x] Theme editor updated with 5 structured token categories.
- [x] Multi-custom theme persistence implemented via Zustand store v12 migration.
- [x] Transactional live preview and rollback ("Cancel / Reset") implemented.
- [x] Structured Theme Import Preview Modal built with conflict resolution.
- [x] Main-process owned IPC file dialogs (`app:saveYamlFile`, `app:loadYamlFile`) preserved.
- [x] Comprehensive 25-section proof-driven audit report created.

---

## 24. Operational Recommendations & Maintenance Guardrails

1. **Static Verifier Enforcement:** Continue enforcing `npm run verify:theme-tokens` in CI to prevent hardcoded color bypasses.
2. **Schema Version Discipline:** Any future theme token schema changes must bump `version` in `settings-store.ts` and `themeToYaml`.
3. **Contrast Standards:** Maintain WCAG AA 4.5:1 minimum contrast warnings for primary text against surfaces in `ThemePreview.tsx`.

---

## 25. Final Verification Matrix & Sign-Off

| Verification Gate | Result | Command |
|---|---|---|
| **Theme Token Audit** | **PASS** | `npm run verify:theme-tokens` |
| **Theme Unit Tests** | **PASS** | `npm run test:unit:theme` |
| **ThemeMaker UI Tests** | **PASS** | `npx vitest run src/components/ThemeMaker*.test*` |
| **Type Check** | **PASS** | `npm run typecheck` |
| **ESLint Quality Gate** | **PASS** | `npm run lint:eslint` |
| **Workspace Contracts** | **PASS** | `npm run verify:contracts` |

**Sign-off:** Audit and remediation successfully executed. All theme engine, border visibility, focus ring, persistence, and portability invariants are locked and verified.
