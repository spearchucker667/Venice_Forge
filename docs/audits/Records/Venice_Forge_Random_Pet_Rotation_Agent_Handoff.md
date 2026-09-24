# Venice Forge — Random Pet / Mascot Rotation Agent Handoff

## Mission

Implement deterministic, testable **random mascot rotation** in Venice Forge using the seven supplied Codex-style pet assets. The visible mascot must change to a randomly selected different pet whenever the user navigates between primary screens or menu destinations.

The change must be integrated into the existing Venice Forge application shell/navigation architecture rather than implemented as scattered per-page effects.

### Required repository

Local repository root:

```text
/Users/super_user/Projects/Venice_Forge
```

Expected branch:

```text
main
```

Work only on the local `main` worktree. Do not create a feature branch, worktree, PR, tag, or force-push. Do not commit or push unless the user explicitly requests it.

---

# 1. User Intent

The application has seven supplied visual companion assets. The intended behavior is:

1. Venice Forge displays one active pet/mascot using the existing pet renderer if one already exists.
2. When the user changes from one meaningful screen/menu destination to another, select a pet randomly from the configured catalogue.
3. The newly selected pet should be different from the currently displayed pet whenever at least two valid pets are available.
4. The change must happen exactly once per semantic navigation transition.
5. Ordinary React rerenders, asynchronous updates, form changes, loading-state changes, modal/dialog activity, dropdown activity, background tasks, and other non-navigation state changes must **not** rotate the pet.
6. The system must work in both Electron development and packaged Electron builds. It must not depend on absolute local filesystem paths at runtime.
7. The feature must preserve the application's existing security, CSP, renderer/main-process boundaries, theming, localization, and accessibility behavior.

Interpret “rotation” as **random non-repeating selection**: each navigation transition chooses uniformly from all currently valid pets except the active one. This maintains randomness while ensuring the user sees a visible change instead of randomly receiving the same pet again.

---

# 2. Supplied Asset Catalogue

The canonical source folders supplied by the user are:

```text
/Users/super_user/Projects/Venice_Forge/assets/0781-klee/
/Users/super_user/Projects/Venice_Forge/assets/0028-frieren/
/Users/super_user/Projects/Venice_Forge/assets/0455-diana/
/Users/super_user/Projects/Venice_Forge/assets/0471-palantir-patrick/
/Users/super_user/Projects/Venice_Forge/assets/0688-plana/
/Users/super_user/Projects/Venice_Forge/assets/0694-icebell/
/Users/super_user/Projects/Venice_Forge/assets/0780-powerpet/
```

Each supplied bundle contains exactly:

```text
pet.json
spritesheet.webp
```

Observed asset contract:

| Folder | Manifest `id` | Display name | Atlas |
|---|---|---|---|
| `0781-klee` | `klee` | `Klee可莉` | `1536×1872` RGBA WebP |
| `0028-frieren` | `frieren` | `Frieren` | `1536×1872` RGBA WebP |
| `0455-diana` | `diana` | `Diana` | `1536×1872` RGBA WebP |
| `0471-palantir-patrick` | `palantir-patrick` | `Palantir Patrick` | `1536×1872` RGBA WebP |
| `0688-plana` | `plana` | `Plana` | `1536×1872` RGBA WebP |
| `0694-icebell` | `icebell` | `Azuma Seren` | `1536×1872` RGBA WebP |
| `0780-powerpet` | `powerpet` | `PowerPet` | `1536×1872` RGBA WebP |

Total spritesheet payload is approximately 14.7 MiB before build/packaging overhead.

### Manifest inconsistencies that must not break loading

Do not assume every manifest has identical optional fields.

Observed examples:

- `0455-diana/pet.json` has no `kind` field.
- `0694-icebell/pet.json` uses id `icebell` but display name `Azuma Seren`.
- `0781-klee/pet.json` declares `kind: "object"` even though the atlas contains a character.
- Other packages use `kind: "person"` or omit it.

`kind` is therefore not a valid discriminator for whether a pet can participate in rotation. Treat it as optional metadata only unless the current Venice Forge implementation already has a documented reason to use it.

Do not rewrite user-supplied manifests merely to make the rotation feature work unless an existing schema validator requires normalization. Prefer normalization in the catalogue layer.

---

# 3. Sprite Atlas Contract

These assets use the standard Codex pet V1 atlas geometry:

```text
Atlas width:   1536 px
Atlas height:  1872 px
Columns:       8
Rows:          9
Frame width:   192 px
Frame height:  208 px
Transparency:  required
```

Standard row/state layout:

| Row | State | Expected used frames |
|---:|---|---:|
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

If Venice Forge already contains a pet/sprite renderer, **reuse its established animation mapping** and only change the asset source/catalogue and navigation-driven selection.

If no pet renderer exists, do not display the entire atlas as an `<img>` and do not invent arbitrary crop coordinates. Implement or reuse a small fixed-grid sprite renderer based on the geometry above, with `idle` as the safe default state. Keep animation-state selection separate from pet selection.

Do not add extra animation behavior beyond current product behavior simply because rows exist. In particular, navigation rotation does not require automatically triggering waving/jumping unless the existing mascot implementation already has an activation animation.

---

# 4. Mandatory Repository Bootstrap

Before editing, execute and verify the repository state:

```bash
set -euo pipefail

cd /Users/super_user/Projects/Venice_Forge

EXPECTED_ROOT="/Users/super_user/Projects/Venice_Forge"
EXPECTED_BRANCH="main"
ACTUAL_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
ACTUAL_BRANCH="$(git branch --show-current 2>/dev/null || true)"

printf 'root:   %s\n' "$ACTUAL_ROOT"
printf 'branch: %s\n' "$ACTUAL_BRANCH"

[[ "$(cd "$ACTUAL_ROOT" && pwd -P)" == "$EXPECTED_ROOT" ]]
[[ "$ACTUAL_BRANCH" == "$EXPECTED_BRANCH" ]]

git status --short
node --version
npm --version
```

Do not reset, clean, checkout over, or discard existing user changes.

Read in this order before implementation:

```text
AGENTS.md
AGENT_REINITIALIZATION.md
docs/summary_of_work.md
docs/DOCS_INDEX.md
docs/ROADMAP.md
src/config/tabs.ts
```

Then locate the current navigation owner, application shell, mascot/pet renderer if present, animation state code, and tests.

Useful discovery commands:

```bash
rg -n --hidden --glob '!node_modules' \
  'activeTab|activeRoute|selectedTab|navigation|tabs\.ts|menu|sidebar' \
  src electron tests

rg -n --hidden --glob '!node_modules' \
  'pet|mascot|companion|sprite|spritesheet|background-position|192|208' \
  src electron tests public assets

find assets -maxdepth 2 \
  \( -name 'pet.json' -o -name 'spritesheet.webp' \) \
  -print | sort
```

Do not assume filenames or symbols in this handoff exist. Verify them against the current worktree and follow the repository's current architecture.

---

# 5. Architecture Requirement

There must be **one canonical owner** for pet selection.

Preferred ownership:

```text
canonical navigation state
        │
        ▼
normalized navigation key
        │
        ▼
useNavigationPetRotation / equivalent controller
        │
        ├── current pet id
        └── pickNextPet(...)
                │
                ▼
          pet catalogue
                │
                ▼
         existing pet renderer
```

Do not add one `useEffect()` per page or menu item.

Do not put `Math.random()` directly inside component render logic.

Do not derive the selected pet from unrelated state such as loading status, message count, theme, API task state, timers, or animation frame state.

Do not persist a new selected pet to global durable storage on every navigation transition unless persistence already exists for the mascot system. Random rotation is session/UI state, not user data.

---

# 6. Navigation Trigger Contract

## Rotate when

Rotation should occur when the application's **primary content destination changes**, for example:

- `Chat` → `Image Studio`
- `Image Studio` → `Media Studio`
- `Media Studio` → `Documents`
- `Config` → `Status`
- one canonical sidebar/menu destination → another canonical destination
- a nested screen transition that the current app explicitly models as a navigation destination and that replaces the primary workspace view

Use the current canonical tab/menu definitions rather than maintaining a second list.

## Do not rotate when

The following must not trigger rotation unless the current navigation model explicitly treats them as a different primary screen:

- React rerender
- network response arrival
- streaming token update
- background media progress update
- store hydration
- form input change
- tab content internal state update
- opening/closing a modal
- opening/closing a select/dropdown/context menu
- tooltip/popover
- mouse hover/focus
- toast/notification
- resize
- theme change
- locale change
- image generation progress
- document autosave
- a navigation dispatch that resolves to the already active destination

## Canonical navigation key

Create or reuse a stable navigation key representing the actual destination.

Conceptually:

```ts
type NavigationKey = string;
```

Examples only:

```ts
const navigationKey = activeTab;
```

or, if the app has real nested navigation:

```ts
const navigationKey = `${activeGroup}:${activeTab}:${activeSubview}`;
```

Only include fields that actually define the primary screen. Do not include transient state.

The pet rotation effect must depend on this key and only this key plus the catalogue/controller dependencies needed for correctness.

---

# 7. Random Selection Contract

Implement the selection rule as a pure function so it can be tested without React.

Recommended interface:

```ts
export type RandomSource = () => number;

export function pickNextPet<T extends { id: string }>(
  pets: readonly T[],
  currentPetId: string | null,
  random: RandomSource = Math.random,
): T | null;
```

Required behavior:

1. `[]` → `null`.
2. One valid pet → return that pet.
3. Two or more valid pets → exclude the current pet when possible.
4. Select uniformly from the remaining valid candidates.
5. Clamp/defend against an injected random source returning unexpected values outside normal `[0,1)` in tests, or clearly constrain the helper's contract and test its boundary behavior.
6. Never mutate the catalogue.
7. Never use array sort-with-random-comparator.
8. Never use security-sensitive randomness; this is visual UI behavior and `Math.random` is sufficient.

Example implementation shape, adapted to project style:

```ts
export function pickNextPet<T extends { id: string }>(
  pets: readonly T[],
  currentPetId: string | null,
  random: RandomSource = Math.random,
): T | null {
  if (pets.length === 0) return null;
  if (pets.length === 1) return pets[0] ?? null;

  const candidates = pets.filter((pet) => pet.id !== currentPetId);
  const pool = candidates.length > 0 ? candidates : pets;

  const sample = Math.min(Math.max(random(), 0), 0.9999999999999999);
  const index = Math.floor(sample * pool.length);
  return pool[index] ?? pool[0] ?? null;
}
```

Follow the repository's lint/style conventions rather than copying this verbatim if they differ.

---

# 8. Pet Catalogue Contract

Create one typed catalogue containing these seven pets. Prefer a focused feature directory such as:

```text
src/features/mascot/
```

or the nearest existing pet/mascot directory if one already exists.

A reasonable new-file layout if no equivalent exists:

```text
src/features/mascot/petCatalog.ts
src/features/mascot/pickNextPet.ts
src/features/mascot/useNavigationPetRotation.ts
src/features/mascot/pickNextPet.test.ts
src/features/mascot/useNavigationPetRotation.test.tsx
```

If an existing pet feature already owns these concerns, extend that feature instead of creating a competing subsystem.

## Runtime asset resolution

Do **not** use these absolute paths in renderer code:

```text
/Users/super_user/Projects/Venice_Forge/assets/...
```

Those are development/bootstrap paths only.

Use Vite/Electron-safe build-time asset imports so the images are emitted into the production renderer bundle.

Preferred pattern when compatible with the existing Vite configuration:

```ts
import frierenSpritesheetUrl from '../../../assets/0028-frieren/spritesheet.webp?url';
```

The exact relative path depends on the final source-file location.

If the project already has a canonical static-asset helper or generated asset registry, use that instead.

Do not move assets to `public/` merely to bypass a path-resolution problem unless the project's existing asset policy already requires it. Do not create runtime `file://` access from the renderer as a workaround.

## Manifest loading

If the current TypeScript/Vite setup supports JSON imports cleanly, the catalogue may import and normalize `pet.json` data at build time.

If it does not, define the minimal normalized metadata in the TypeScript catalogue and reference the existing `pet.json` files as source metadata. Do not add a new dependency or build generator solely to parse seven tiny manifests unless it fits an existing repository pattern.

Recommended normalized type:

```ts
export interface PetAsset {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
  sprite: {
    columns: 8;
    rows: 9;
    frameWidth: 192;
    frameHeight: 208;
  };
}
```

Optional manifest fields such as `kind` must not be required for rendering.

---

# 9. React / Application-Shell Integration

Locate the highest-level renderer component that already receives or observes canonical navigation state and renders persistent UI surrounding the current screen.

Integrate rotation there.

Conceptual pattern:

```tsx
const navigationKey = getCanonicalNavigationKey(...);
const activePet = useNavigationPetRotation({
  navigationKey,
  pets: PET_CATALOG,
});

return (
  <AppShellLayout>
    <PrimaryView />
    <ExistingPetRenderer pet={activePet} />
  </AppShellLayout>
);
```

The hook/controller should:

1. choose an initial pet once for the session/mount;
2. remember the previous navigation key;
3. rotate only when the canonical key actually changes;
4. use a functional state update or ref where necessary to avoid stale-current-pet bugs;
5. avoid duplicate rotations under React Strict Mode development behavior;
6. avoid timers unless the existing visual-transition system requires one;
7. clean up any timers/animation handles if used.

### React Strict Mode requirement

A naive `useEffect(() => setPet(randomPet()), [navigationKey])` may be invoked in development in ways that expose unstable or duplicate behavior.

Design the controller so the visible transition corresponds to one logical navigation change. Tests must cover remount/effect behavior relevant to the project's current React mode.

### Renderer remount behavior

If switching the selected pet requires resetting the sprite animation state, use a stable key at the **pet renderer boundary**, not at the whole application-shell boundary:

```tsx
<PetRenderer key={activePet.id} pet={activePet} />
```

Only do this if necessary. Do not remount expensive screen content just to reset mascot animation.

---

# 10. Sprite Renderer Requirements If Venice Forge Does Not Already Have One

Only add a renderer if repository inspection confirms there is no existing implementation capable of consuming these assets.

The renderer must:

- render one `192×208` atlas frame at the intended visual scale;
- use the fixed `8×9` atlas geometry;
- animate frames using `requestAnimationFrame`, CSS steps, or the application's existing animation primitive;
- stop/pause work when hidden/unmounted where practical;
- support at least `idle` reliably;
- preserve transparency;
- not decode/reload the same atlas every animation frame;
- avoid a canvas implementation unless the existing UI already uses canvas for mascots;
- be non-interactive and `aria-hidden` if the pet is decorative;
- preserve pointer interaction with underlying controls (`pointer-events: none`) if the pet is purely visual;
- respect `prefers-reduced-motion` by showing a stable frame or using the project's established reduced-motion policy.

If a renderer already exists, do **not** replace it merely because another implementation seems cleaner.

---

# 11. UI Placement and Transition Rules

Preserve the current mascot location, scale, z-index, and interaction model if one already exists.

Do not redesign the navigation shell as part of this task.

If there is currently no transition between pet assets and an instantaneous atlas swap produces an obvious visual flash, a short opacity crossfade may be added using existing motion tokens/utilities. Keep it subtle and respect reduced motion.

Do not introduce:

- large entrance animations;
- layout shifts;
- a new floating panel;
- extra controls;
- a pet picker;
- a settings page;
- persistence preferences;
- sound effects;
- clickable mascot behavior;

unless equivalent functionality already exists and merely needs to be wired to the new catalogue.

---

# 12. Failure Handling

The application must remain usable if a pet asset cannot load.

Required behavior:

1. Do not crash the application shell.
2. If the newly selected asset fails, retain or fall back to a known-good pet if possible.
3. Prevent a permanently failing asset from causing an infinite rapid reselection loop.
4. Log only safe diagnostic information such as the pet id and normalized error class.
5. Do not log absolute private filesystem paths.
6. Do not expose raw file access to the renderer.

Do not use remote/CDN fallbacks. These are bundled local assets.

---

# 13. Required Tests

Use TDD for the feature. Add focused tests before implementation where practical.

At minimum cover the following.

## Pure selection tests

```text
pickNextPet([]) returns null
one candidate returns that candidate
current candidate is excluded when 2+ candidates exist
random sample 0 selects first candidate
sample near 1 selects last candidate
catalogue is not mutated
current id not present still selects from all candidates
```

## Rotation-controller tests

```text
initial mount chooses one pet
same navigation key does not rotate
primary navigation key change rotates exactly once
new pet differs from old pet with 2+ candidates
rerender with unrelated props/state does not rotate
rapid A → B → C navigation produces one choice per logical destination change
unmount does not leave timers/listeners behind
```

## Application integration tests

Use the current navigation test utilities to prove representative transitions, for example:

```text
Chat → Image Studio rotates
Image Studio → Media Studio rotates
Config → Status rotates
modal open/close does not rotate
background task/progress update does not rotate
```

Do not hardcode those exact labels in a new test helper if the canonical tab definitions expose ids/constants. Use current tab identifiers.

## Asset catalogue tests

Verify:

- exactly seven intended catalogue entries;
- unique ids;
- all expected ids present;
- asset imports resolve during test/build;
- frame geometry is the expected V1 geometry.

If an image-dimension library is already installed, add a build/test assertion for `1536×1872`. Do not introduce a heavyweight dependency solely for that assertion.

---

# 14. Manual QA Matrix

Run the Electron application and exercise actual navigation.

Required manual checks:

| Scenario | Expected result |
|---|---|
| Launch app | one valid pet appears |
| Chat → Image Studio | pet changes once |
| Image Studio → Media Studio | pet changes once |
| Navigate through 10+ screens | each transition chooses a different current pet; choices remain random |
| Reopen same menu/screen | no duplicate rotation if destination did not change |
| Open/close modal | no rotation |
| Change theme | no rotation |
| Change locale | no rotation unless locale switch itself intentionally navigates to another screen |
| Start streaming chat | token updates do not rotate |
| Start media generation | progress updates do not rotate |
| Resize window | no rotation |
| Rapid navigation | no crashes, stale timers, or multiple swaps per destination |
| Reduced motion | stable/non-disruptive mascot behavior |
| Dev Electron | assets render |
| Production build / packaged renderer | assets render; no broken file URLs |

Watch DevTools console for failed asset paths, CSP errors, duplicate key warnings, effect-loop warnings, and state-update-after-unmount warnings.

---

# 15. Packaging Verification

This feature is incomplete if it works only under the Vite dev server.

Verify emitted assets after production build.

Run the repository's current relevant gates, beginning with focused tests, then broader checks.

Typical sequence, after confirming scripts in `package.json`:

```bash
npm run lint:eslint
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts
npm run build
npm run verify:release-packaging-hardening
npm run verify:dist
npm run verify:i18n
npm run verify:i18n-hardcoded-regressions
npm run test:ci
```

Do not claim a command passed unless it actually ran successfully in the current worktree.

Inspect the production output or packaged app to confirm all seven WebP files are included and referenced by valid renderer URLs.

The runtime must not contain any absolute `/Users/<user>/...` asset path.

Useful checks after build, adapted to the actual output structure:

```bash
find dist -type f \( -name '*.webp' -o -name '*.png' \) -print | sort

rg -n '/Users/super_user/Projects/Venice_Forge/assets' \
  dist out release build 2>/dev/null || true
```

A match for the private absolute path in emitted runtime code is a release blocker for this task.

---

# 16. Performance Requirements

Do not decode all seven atlases repeatedly on each navigation event.

Acceptable approaches include browser caching of imported URLs or one-time preload after the shell becomes idle if the current application already has an asset-preload mechanism.

Do not add eager base64 embedding of ~14.7 MiB of sprites into JavaScript state/bundles.

Do not store spritesheets in Zustand, IndexedDB, localStorage, task records, diagnostics, or backup payloads.

The catalogue should contain URLs/metadata, not binary image payloads.

If preloading is added, it must:

- happen once;
- use the normal bundled asset URLs;
- tolerate failure;
- not block first paint or initial navigation;
- not create seven redundant decoded copies.

YAGNI: if normal browser image caching provides smooth switching, do not add a custom preloader.

---

# 17. Security and Architecture Constraints

This is a renderer UI feature and should not require a new Electron IPC channel.

Do not:

- enable `nodeIntegration`;
- expose filesystem APIs to the renderer;
- read `/Users/<user>/...` at runtime;
- use unrestricted `file://` URLs;
- weaken CSP;
- add network access;
- add a remote asset host;
- add raw path handling to preload;
- alter Venice request/safety behavior;
- modify API-key storage;
- touch unrelated safeguards or provider code.

If implementation appears to require any of those changes, stop and re-evaluate the design; the asset packaging approach is wrong.

---

# 18. Localization and Accessibility

No new visible prose should be necessary for the basic rotation feature.

If visible user-facing copy is added for an existing pet UI surface, route it through the canonical i18n system and update all required catalogues according to repository rules.

If the mascot is decorative:

```text
aria-hidden="true"
not keyboard focusable
pointer-events: none
```

If an existing mascot is interactive, preserve its current accessibility contract instead of making it decorative.

Do not expose manifest descriptions as untranslated new UI copy unless the existing pet UI already does so and that behavior is intentional.

---

# 19. Definition of Done

The task is complete only when all of the following are true:

- [ ] All seven supplied pet assets are represented by one canonical typed catalogue.
- [ ] No runtime code depends on the user's absolute local asset path.
- [ ] One canonical controller owns the active pet.
- [ ] Rotation is triggered by semantic navigation changes only.
- [ ] Immediate repeats are prevented whenever 2+ valid pets are available.
- [ ] Selection helper is deterministic under injected test RNG.
- [ ] React rerenders do not cause rotation.
- [ ] Background task/store updates do not cause rotation.
- [ ] Modal/dropdown activity does not cause rotation.
- [ ] Existing pet animation behavior is preserved.
- [ ] If a renderer had to be added, it correctly implements the `1536×1872`, `8×9`, `192×208` atlas contract.
- [ ] Asset failure cannot crash the shell.
- [ ] Dev Electron displays the assets correctly.
- [ ] Production build/package displays the assets correctly.
- [ ] No CSP or file URL errors are present.
- [ ] Focused unit/integration tests pass.
- [ ] Required repository validation commands were run and truthfully recorded.
- [ ] `docs/summary_of_work.md` is updated with the implementation and actual validation results.
- [ ] `docs/ROADMAP.md` is updated only if remaining work is genuinely introduced or deferred.
- [ ] `docs/DOCS_INDEX.md` is updated only if documentation authority/files changed.
- [ ] No unrelated code, safety behavior, data migrations, or user settings were changed.

---

# 20. Expected File Scope

The exact paths must follow the current repository, but the change should remain approximately within this scope:

```text
assets/0028-frieren/**
assets/0455-diana/**
assets/0471-palantir-patrick/**
assets/0688-plana/**
assets/0694-icebell/**
assets/0780-powerpet/**
assets/0781-klee/**

src/...existing application shell/navigation owner...
src/...existing pet renderer...                  # if present
src/features/mascot/petCatalog.ts                 # if no existing catalogue
src/features/mascot/pickNextPet.ts                # if no existing selector
src/features/mascot/useNavigationPetRotation.ts   # if no existing controller
src/features/mascot/*.test.ts[x]

docs/summary_of_work.md
```

Do not broaden the refactor beyond what is needed to give this behavior one clean owner.

---

# 21. Implementation Order

Execute in this order.

## Phase A — Inspect and prove current architecture

1. Verify root, branch, dirty state, Node/npm versions.
2. Read required agent/docs files.
3. Inspect canonical tabs/navigation state and the persistent app shell.
4. Search for existing mascot/pet/sprite code.
5. Confirm asset folders and manifests exist locally.
6. Confirm current build/packaging rules can include imported WebP assets.
7. Record the exact files/symbols that will own the change.

## Phase B — Add failing tests for selection semantics

1. Add pure `pickNextPet` tests.
2. Verify they fail for the expected missing implementation.
3. Implement the minimal pure selector.
4. Run focused tests until green.

## Phase C — Add catalogue

1. Define or extend the typed pet catalogue.
2. Add all seven assets.
3. Add catalogue uniqueness/completeness tests.
4. Verify imports resolve.

## Phase D — Add navigation-driven rotation

1. Add controller/hook tests.
2. Wire it to the canonical navigation key.
3. Ensure one logical key change produces one rotation.
4. Ensure unrelated rerenders do not rotate.
5. Ensure Strict Mode/dev behavior is stable.

## Phase E — Connect renderer

1. Reuse existing renderer if present.
2. If absent, add the smallest correct V1 atlas renderer.
3. Ensure selected-pet change resets only mascot animation state when needed.
4. Preserve layout/accessibility behavior.

## Phase F — Integration and packaging QA

1. Add representative navigation integration tests.
2. Run Electron manually.
3. Exercise navigation and non-navigation state changes.
4. Run production build.
5. Inspect emitted assets.
6. Test packaged/runtime asset loading where available.

## Phase G — Full validation and handoff docs

1. Run relevant repository gates.
2. Record exact pass/fail output honestly.
3. Update `docs/summary_of_work.md`.
4. Update roadmap/index only when required.
5. Produce the final report format below.

---

# 22. Required Final Agent Report

Return a report using this exact structure:

```markdown
# Work Summary

## Repository State
- Root:
- Branch:
- Starting SHA:
- Ending SHA:
- Dirty files before work:
- Dirty files after work:

## Scope

## Architecture Discovered
- Navigation owner:
- Canonical navigation key:
- Pet renderer owner:
- Asset loading strategy:

## Asset Catalogue
- frieren:
- diana:
- palantir-patrick:
- plana:
- icebell:
- powerpet:
- klee:

## Changes Made

## Files Changed

## Tests Added or Updated

## Commands Executed

## Validation Results

## Manual QA

## Packaging Verification

## Documentation Updated

## Remaining Risks

## Deferred Work
```

For each failed or skipped validation, state the exact reason. Do not claim success for checks that were not run.

---

# 23. Non-Negotiable “Do Not” Rules

Do not:

- randomize on every render;
- randomize from each screen independently;
- allow immediate repeats when another pet exists;
- create duplicate pet catalogues;
- hardcode seven switch statements into the navigation component;
- embed spritesheets as base64 in source/state;
- store binary pet data in Zustand/localStorage/IndexedDB;
- read the local absolute asset directories at runtime;
- add a new Electron filesystem capability for this feature;
- weaken CSP or sandboxing;
- alter safety/guard logic;
- rewrite unrelated navigation architecture;
- add unnecessary dependencies;
- move all assets merely to make imports easier without checking current packaging conventions;
- silently modify the source `pet.json` files to mask loader bugs;
- assume optional `kind` metadata is consistent;
- show the complete sprite atlas as the mascot;
- introduce visible strings without i18n;
- create branches or PRs;
- force-push;
- discard user changes;
- claim validation that was not executed.

The desired outcome is a small, centralized, testable navigation-to-mascot rotation feature with reliable production asset packaging and no impact on unrelated Venice Forge behavior.
