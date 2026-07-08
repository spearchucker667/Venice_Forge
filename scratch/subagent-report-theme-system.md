> DONE — all scope items completed and validated.

## Theme-System Scope Summary

Implemented finding #9 (expanded all-theme contrast coverage + fixed failing pairs) and Part 2 (added exactly five new built-in themes) from the handoff prompt.

## Files Changed

### Theme definitions (fixed existing contrast failures)
- `src/theme/builtins/solarAsh.ts` — darkened success/focus; switched accent foreground to dark text.
- `src/theme/builtins/arcticGlass.ts` — darkened danger/success/focus; switched accent foreground to dark text.
- `src/theme/builtins/desertCopperfield.ts` — darkened accent/warning/success to maintain white foreground and background contrast.
- `src/theme/builtins/porcelainDaybreak.ts` — darkened muted/disabled text, success, danger, focus; switched accent foreground to dark text.
- `src/theme/builtins/ultravioletRain.ts` — brightened accent and derived surfaces to pass AA on dark background.
- `src/theme/builtins/gruvboxDark.ts` — lightened danger so it passes AA on the dark status foreground.

### New built-in themes
- `src/theme/builtins/obsidianBloom.ts` — Obsidian Bloom (dark)
- `src/theme/builtins/harborFog.ts` — Harbor Fog (light)
- `src/theme/builtins/circuitMint.ts` — Circuit Mint (dark)
- `src/theme/builtins/amberArchive.ts` — Amber Archive (light)
- `src/theme/builtins/neonDusk.ts` — Neon Dusk (dark)

### Theme registry / UI integration
- `src/theme/builtins/index.ts` — exported the five new themes and added them to `BUILTIN_THEMES`.
- `src/components/ThemeMaker.tsx` — imported new themes and registered them in `builtInMap` / `builtInOptions`.

### Starter YAML templates
- `config/themes/obsidian-bloom.yaml`
- `config/themes/harbor-fog.yaml`
- `config/themes/circuit-mint.yaml`
- `config/themes/amber-archive.yaml`
- `config/themes/neon-dusk.yaml`
- `config/themes/copper.yaml` — added missing counterpart for `builtin-copper`.

### Tests
- `src/theme/contrast.test.ts` — added `all built-in themes WCAG contrast regression guard` that iterates every `BUILTIN_THEMES` entry with the expanded pair matrix (foreground/background, foreground/surface, accentForeground/accent, status/button/selection pairs, focus/disabled/foregroundSubtle minimums).
- `src/theme/themes.test.ts` — added `has a YAML starter template for every built-in theme` and `exports the expected number of built-in themes` (35) guards.
- `src/components/ThemeMaker.ui.test.tsx` — extended the built-in theme listing/selection tests to cover the five new themes.

## Contrast Fixes Applied

Expanded checks enforce:
- foreground/background ≥ 4.5:1
- foreground/surface ≥ 4.5:1
- foreground/surfaceElevated ≥ 4.5:1
- accentForeground/accent ≥ 4.5:1
- buttonPrimaryForeground/buttonPrimaryBackground ≥ 4.5:1
- buttonSecondaryForeground/buttonSecondaryBackground ≥ 4.5:1
- dangerForeground/danger ≥ 4.5:1
- warningForeground/warning ≥ 4.5:1
- successForeground/success ≥ 4.5:1
- selectionForeground/selectionBackground ≥ 4.5:1
- focusRing/background ≥ 3.0:1
- disabledForeground/background ≥ 3.0:1
- foregroundSubtle/background ≥ 3.0:1

Previously failing built-ins that now pass: `builtin-solar-ash`, `builtin-arctic-glass`, `builtin-desert-copperfield`, `builtin-porcelain-daybreak`, `builtin-ultraviolet-rain`, `builtin-gruvbox-dark`.

## New Built-In Themes

| Name | ID | Mode |
|------|----|------|
| Obsidian Bloom | `builtin-obsidian-bloom` | dark |
| Harbor Fog | `builtin-harbor-fog` | light |
| Circuit Mint | `builtin-circuit-mint` | dark |
| Amber Archive | `builtin-amber-archive` | light |
| Neon Dusk | `builtin-neon-dusk` | dark |

All five were designed to meet the expanded contrast contract and the 29-token semantic contract. They are registered in the theme registry, selectable in `ThemeMaker`, and have matching starter YAML templates.

## Validation Commands Run

### Theme-specific
```bash
npx vitest run src/theme src/components/ThemeMaker.ui.test.tsx src/components/ThemeMaker.test.ts
npm run verify:theme-tokens
```
Result: all 157 theme tests pass; no forbidden hardcoded color classes.

### Project-wide static/build (scope-relevant)
```bash
npx eslint src electron server.ts scripts --max-warnings=0   # pass
npx tsc --noEmit && npx tsc --noEmit --project tsconfig.electron.json   # pass for theme scope (no new TS errors introduced)
npm run build                                                # pass
npm run verify:dist                                          # pass
npm run verify:bundle-budget                                 # pass
npm run verify:contracts:static                              # pass
npm run verify:archive-clean                                 # pass
npm run verify:markdown-links                                # pass
```

### Full test suite
```bash
npx vitest run
```
Result: 3,590 passed, 1 skipped, 8 failed. The failures are outside the theme-system scope:
- `electron/ipc/handlers.test.ts` — `credential:set still allows non-reserved api-key-like keys` fails because the secureStore mock lacks `setCredential`; this is in the security-profile-hardening scope.
- `src/stores/profile-store.test.ts` — 7 tests fail with `Cannot assign to read only property 'reload' of object '[object Location]'`; these are in the security-profile-hardening scope.

These failures existed before my changes; none of the modified theme files are referenced in the failing tests.

## Typecheck Note

Running `npm run typecheck` with the repo's default `PATH` fails because `tsc` is not on `PATH`; the project keeps its Node toolchain in `.node22/`. Using `.node22/bin/npx tsc --noEmit` and `.node22/bin/npx tsc --noEmit --project tsconfig.electron.json` passes. The only type errors currently in the tree are in `src/components/settings/ProfilePanel.tsx`, `src/components/settings/ProfilePanel.test.tsx`, and `src/services/profilePurge.ts`, all of which belong to the security-profile-hardening scope and are unrelated to theme work.

## Blockers / Cross-Scope Observations

No blockers within theme-system. Cross-scope items not implemented:
- README.md instability warning (finding #8 / Part 3) — outside theme-system scope.
- Master password / profile password / profile deletion / profile ID hardening (findings #1–#6) — security-profile-hardening scope.
- Onboarding splash / scanner false positives / stale comments (findings #7, #10–#14) — onboarding-comments-scanner scope.

## Git Status Summary (theme scope only)

Modified:
- `src/theme/builtins/arcticGlass.ts`
- `src/theme/builtins/desertCopperfield.ts`
- `src/theme/builtins/gruvboxDark.ts`
- `src/theme/builtins/index.ts`
- `src/theme/builtins/porcelainDaybreak.ts`
- `src/theme/builtins/solarAsh.ts`
- `src/theme/builtins/ultravioletRain.ts`
- `src/theme/contrast.test.ts`
- `src/theme/themes.test.ts`
- `src/components/ThemeMaker.tsx`
- `src/components/ThemeMaker.ui.test.tsx`

Added:
- `src/theme/builtins/obsidianBloom.ts`
- `src/theme/builtins/harborFog.ts`
- `src/theme/builtins/circuitMint.ts`
- `src/theme/builtins/amberArchive.ts`
- `src/theme/builtins/neonDusk.ts`
- `config/themes/obsidian-bloom.yaml`
- `config/themes/harbor-fog.yaml`
- `config/themes/circuit-mint.yaml`
- `config/themes/amber-archive.yaml`
- `config/themes/neon-dusk.yaml`
- `config/themes/copper.yaml`
