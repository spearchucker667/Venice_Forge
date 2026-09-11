# ChatGPT 5.6 Repository Audit Handoff — 2026-07-26

## Metadata

- **Repository:** `spearchucker667/Venice_Forge`
- **Default branch:** `main`
- **GitHub tip inspected:** `771d1d8c8064bedf86e43beff575cf0441e6f3c9`
- **ZIP inspected:** `Venice_Forge-clean-20260726-054446-dirty.zip`
- **Application version:** `3.0.0-beta.2`
- **Declared runtime:** Node `>=22.13.0 <23.0.0`
- **Audit environment:** Linux x86_64, Node 22.16.0, npm 10.9.2
- **Full audit report:** `docs/reports/CHATGPT_5_6_REPOSITORY_AUDIT_2026-07-26.md`
- **Status:** Implementation-ready unresolved work
- **No commit/push performed:** Required by `AGENTS.md` absent explicit user authorization

## Scope Inspected

The audit inspected the complete supplied source tree, live GitHub repository metadata/latest commit, package and lock files, Electron main/preload/IPC layers, renderer source, services, state stores, tests, scripts, workflows, release configuration, localization resources, themes, reports, work orders, and repository hygiene.

## Completed Fixes

1. Repaired `verify:safety-guard` false positives without weakening known bypass detection.
2. Made normal i18n verification read-only; added explicit status-write command.
3. Separated catalog structural completeness from native-language review.
4. Marked all non-English locales `first-pass-machine` and production-incomplete.
5. Hardened translation CLI endpoint/key routing and error redaction.
6. Removed tracked `.agent-backups/**` and `patch_runner.js`; added ignore rules.
7. Added regression tests and updated i18n operating documentation.

## Required Execution Order

1. P1-01 full-app hardcoded-string migration.
2. P1-02 native-language catalog review and mixed-artifact correction.
3. P2-01 no-regression hardcoded-string gate.
4. P2-02 packaged locale/RTL/layout QA.
5. P2-03 dependency-backed full validation and release proof.

Do not mark localization complete before tasks P1-01, P1-02, and P2-02 are closed.

---

## [P1-01] Migrate all visible hardcoded UI text to canonical i18n keys

**Status:** Unresolved
**Classification:** Confirmed bug / incomplete feature
**Affected area:** Full renderer UI / Localization

### Evidence

- `scripts/verify-hardcoded-strings.cjs`
- Generated audit: `artifacts/i18n/hardcoded-strings.json`
- Current measured result: **1,304 candidates across 92 files**
- Highest-count files:
  - `src/components/rp-studio/CharacterEditor.tsx` — 169
  - `src/components/documents/DocumentAgentView.tsx` — 62
  - `src/components/gallery/media-inspector.tsx` — 57
  - `src/components/privacy/StoragePrivacyDashboard.tsx` — 53
  - `src/components/rp-studio/CharacterLibrary.tsx` — 44
  - `src/components/layout/inspector-pane.tsx` — 39
  - `src/components/character-creator/CharacterCreatorDraftEditor.tsx` — 37
  - `src/components/CharactersView.tsx` — 35
  - `src/components/scenes/SceneComposerView.tsx` — 34
  - `src/components/chat/HistoryView.tsx` — 30
  - `src/components/chat/chat-view.tsx` — 30
  - `src/components/image/image-view.tsx` — 28

### Root Cause

Catalog key parity was completed without migrating all visible component literals. The inventory command is advisory and therefore does not block new English-only UI.

### Required Implementation

1. Generate a fresh report:

   ```bash
   npm run i18n:verify-hardcoded
   ```

2. Convert files in bounded feature slices. Recommended order:
   1. Navigation, Config, dialogs, toasts, and shared controls.
   2. Chat, Character Chats, History, and Characters.
   3. Character Creator and RP Studio.
   4. Documents and privacy/storage.
   5. Media Gallery, Image, Video, Audio, and Image Inspector.
   6. Scene Composer, Workflows, Prompts, Research, and remaining surfaces.

3. For every literal:
   - Choose the correct namespace.
   - Add a semantic key to `en-US`.
   - Replace visible JSX/string usage with `t(...)` or `<Trans>`.
   - Preserve interpolation variables.
   - Do not use source sentences as key names.
   - Do not translate internal identifiers, API fields, file formats, model IDs, or test fixture text.

4. After each feature slice:

   ```bash
   npm run i18n:extract
   npm run i18n:sync-catalogs
   npm run i18n:coverage:write
   npm run i18n:locale-status
   npm run i18n:verify-hardcoded
   ```

5. Add focused component tests that switch between `en-US` and at least one long-string locale and assert visible labels change.

6. Address dynamic strings through a finite manifest or explicit mapping. Do not generate keys from arbitrary runtime data.

### Constraints

- Preserve current fallback behavior.
- Do not use `__MISSING__:` or `[XX]` values as shipped translations.
- Do not add one-off local translation maps inside components.
- Do not suppress candidates with `i18n-allow` unless the text is a verified brand, protocol, model, format, or non-visible developer token.
- Maintain Electron process isolation.

### Acceptance Criteria

- [ ] Every user-visible production component is translation-key backed.
- [ ] `artifacts/i18n/hardcoded-strings.json` contains zero non-allowlisted production findings, or an approved tightly scoped baseline during migration.
- [ ] No `__MISSING__:` or sentinel value is bundled.
- [ ] Source-key extractor reports zero missing canonical keys.
- [ ] Feature-level language-switch tests pass.
- [ ] Full TypeScript, lint, test, and build matrix passes.

### Validation

```bash
npm run i18n:extract
npm run i18n:coverage
npm run i18n:verify-hardcoded -- --strict
npm run test:i18n
npm run typecheck
npm run lint:eslint
npm run test:ci
npm run build
```

### Dependencies

None, but work should be divided by feature owner to avoid catalog merge conflicts.

### Explicit Non-Goals

- Rewording product copy unrelated to translation.
- Translating model/provider output.
- Replacing the i18n framework.

---

## [P1-02] Complete native-language review and remove mixed-language catalog artifacts

**Status:** Unresolved
**Classification:** Confirmed bug / incomplete feature
**Affected area:** Localization catalogs

### Evidence

Representative current artifacts:

- `src/i18n/resources/ja/errors.json`
  - `失敗：read file.`
- `src/i18n/resources/ru/research.json`
  - `Введите research topic or URL to scrape...`
  - `Нет research results found for query.`
- `src/i18n/resources/zh-CN/research.json`
  - `输入research topic or URL to scrape...`
- Similar mixed strings exist in German, Spanish, and French.

All non-English entries in `docs/i18n/native-review-status.json` are intentionally set to:

```json
{
  "status": "first-pass-machine",
  "reviewer": null,
  "reviewedAt": null
}
```

### Root Cause

The first-pass translator validated key shape and interpolation parity but not embedded English clauses, linguistic naturalness, terminology consistency, or native-speaker approval.

### Required Implementation

1. Assign a qualified reviewer for each locale.
2. Review every catalog leaf against the canonical `en-US` value and UI context.
3. Correct:
   - Embedded English clauses.
   - Literal camelCase or key-path fragments.
   - Incorrect grammar, punctuation, capitalization, and register.
   - Inconsistent terminology across namespaces.
   - Bad line-breaking or excessive length for compact UI controls.
4. Preserve:
   - `{{interpolation}}` variable identity.
   - HTML/XML tags.
   - Brand/model/protocol/file-format tokens when appropriate.
5. Add per-locale glossary decisions to `docs/i18n/GLOSSARY.md` where terminology is product-specific.
6. Record review evidence in `docs/i18n/native-review-status.json` only after complete review.
7. Run the explicit status-generation pipeline:

   ```bash
   npm run i18n:coverage:write
   npm run i18n:locale-status
   ```

### Constraints

- Do not mark `reviewStatus: complete` based on machine output alone.
- Do not relax interpolation or identical-English checks to force a green result.
- Do not translate API keys, routes, model IDs, schema fields, or file extensions.
- Keep the source language as `en-US`.

### Acceptance Criteria

- [ ] No non-allowlisted English clause remains in any reviewed locale.
- [ ] Every locale has a named reviewer and review date.
- [ ] `reviewStatus: complete` is set only after full catalog review.
- [ ] `isProductionComplete` becomes true only for reviewed locales.
- [ ] Native reviewer signs off on screenshots from the packaged app.
- [ ] Interpolation and catalog verifiers pass.

### Validation

```bash
npm run i18n:coverage
npm run test:i18n
npm run i18n:verify-hardcoded
npm run verify:markdown-links
```

### Dependencies

P1-01 should be substantially complete so reviewers see all active UI strings.

### Explicit Non-Goals

- Translating user prompts or model-generated content.
- Automatically promoting machine output.

---

## [P2-01] Add a baseline-and-ratchet hardcoded-string CI gate

**Status:** Unresolved
**Classification:** Test/CI improvement
**Affected area:** Localization quality gate / GitHub Actions

### Evidence

`scripts/verify-hardcoded-strings.cjs` is advisory unless `--strict` is passed. Current total is 1,304, so immediately enabling strict mode would fail every branch without distinguishing existing debt from new regressions.

### Root Cause

The scanner was introduced for inventory, not enforcement.

### Required Implementation

1. Commit a machine-readable baseline keyed by:
   - File path.
   - Stable normalized visible string.
   - Source node kind.
   - Optional approved reason.
2. Add a verifier mode such as:

   ```bash
   node scripts/verify-hardcoded-strings.cjs --baseline config/i18n-hardcoded-baseline.json --no-regressions
   ```

3. Fail when:
   - A new file introduces candidates.
   - A known file increases its candidate set.
   - A removed candidate reappears.
   - An allow directive lacks a reason.
4. Allow the baseline to decrease without manual edits, then regenerate explicitly after reviewed migrations.
5. Add the no-regression mode to `verify:contracts:static` and CI.
6. Add synthetic tests for add/remove/rename/allow scenarios.

### Constraints

- Do not accept only a total count; it can hide churn.
- Do not baseline test fixtures as production UI.
- Do not allow path-wide exemptions.

### Acceptance Criteria

- [ ] Existing debt is represented exactly.
- [ ] New hardcoded production UI fails CI.
- [ ] Removing a literal decreases the baseline.
- [ ] Tests prove no-regression semantics.
- [ ] The final target is strict zero outside approved tokens.

### Validation

```bash
npm run verify:contracts:static
npx vitest run scripts/verify-hardcoded-strings.test.ts
```

### Dependencies

Can begin immediately; should land before large P1-01 migration to prevent further growth.

### Explicit Non-Goals

- Automatically translating source.
- Exempting entire components.

---

## [P2-02] Execute packaged Electron locale, RTL, overflow, and accessibility QA

**Status:** Unresolved
**Classification:** Validation gap
**Affected area:** Full UI / Release

### Evidence

Static locale tests and formatters exist, but the audit could not install dependencies or launch the application. The attached screenshots demonstrate marker/mixed-language/partial-translation regressions in prior builds.

### Required Implementation

1. Build and launch a packaged macOS artifact under the declared Node 22 toolchain.
2. Test all 12 locales at:
   - Default size.
   - Minimum supported window.
   - 125%, 150%, and 200% zoom.
   - Reduced motion.
   - Keyboard-only navigation.
3. For Arabic:
   - Confirm `<html dir="rtl">`.
   - Verify sidebar, tabs, menus, icon direction, selection controls, text fields, and mixed Latin technical tokens.
4. For German/French/Russian:
   - Check long-label clipping and button overflow.
5. For Japanese/Chinese/Korean/Hindi:
   - Check font fallback, line breaking, glyph coverage, and truncation.
6. Capture screenshots for:
   - Onboarding.
   - Chat.
   - Character chats and creator.
   - Documents.
   - Image/media/video.
   - Research.
   - Config.
   - Backup/sync.
   - Workflows.
7. Record failures with exact locale, window size, zoom, route, and screenshot.
8. Add Playwright/Electron smoke coverage for surfaces that can be automated without provider credentials.

### Constraints

- Do not hide overflow with global clipping.
- Do not force LTR in RTL locales.
- Do not shrink all text to compensate for one locale.
- Preserve accessible names and focus order.

### Acceptance Criteria

- [ ] No marker or raw key appears.
- [ ] No visible English remains outside approved technical/brand terms.
- [ ] No clipping, overlap, inaccessible control, or unusable dialog at tested sizes.
- [ ] Arabic direction is correct across all major surfaces.
- [ ] Native reviewers approve packaged screenshots.
- [ ] QA evidence is linked from release documentation.

### Validation

```bash
npm ci
npm run typecheck
npm run lint:eslint
npm run test:ci
npm run build
npm run dist:mac
```

### Dependencies

P1-01 and P1-02.

### Explicit Non-Goals

- Paid provider generation tests unless credentials are explicitly supplied.
- Signing/notarization changes unrelated to localization.

---

## [P2-03] Run the complete dependency-backed validation matrix in the canonical checkout

**Status:** Unresolved
**Classification:** Validation gap
**Affected area:** Repository-wide

### Evidence

The audit environment could not fetch an uncached package. `eslint`, `vitest`, `cross-env`, Electron, YAML, and type packages were unavailable. Dependency-free checks passed, but the full gate has not been rerun against the patched tree.

### Required Implementation

1. Use the canonical checkout:

   ```bash
   cd <canonical-checkout-from-AGENTS.md>
   ```

2. Confirm Node 22:

   ```bash
   node --version
   npm --version
   npm ci
   ```

3. Apply/review the patched files from this audit.
4. Run:

   ```bash
   npm run typecheck
   npm run lint:eslint
   npm test
   npm run test:ci
   npm run verify:contracts
   npm run ci
   npm run build
   npm run verify:archive-clean
   npm run verify:release-packaging-hardening
   ```

5. Run focused new regressions:

   ```bash
   npx vitest run \
     scripts/verify-safety-guard.test.ts \
     scripts/i18n-status-isolation.test.ts \
     scripts/i18n-tooling.test.ts \
     scripts/translate-missing.test.ts \
     src/i18n/locale-completion-status.test.ts \
     --no-file-parallelism
   ```

6. Record exact output in `docs/summary_of_work.md`.
7. Do not classify missing-dependency output from this audit as source-code failures.

### Constraints

- Use the declared Node range.
- Do not update dependencies merely to make installation work.
- Do not suppress TypeScript/lint/test failures.
- Preserve the user's worktree.

### Acceptance Criteria

- [ ] Dependency install succeeds from the lockfile.
- [ ] All new tests pass.
- [ ] Full static and dynamic contract gates pass.
- [ ] Build succeeds.
- [ ] Any unrelated pre-existing failure is documented with exact evidence.
- [ ] No generated status/report artifact dirties the tree after read-only verification.

### Dependencies

Access to package registry/cache and the canonical checkout.

### Explicit Non-Goals

- Publishing or pushing without explicit user authorization.

## Final Agent Checklist

### Localization source migration
- [ ] Regenerate hardcoded-string inventory.
- [ ] Migrate shared navigation/config/dialog controls.
- [ ] Migrate chat/history/characters.
- [ ] Migrate Character Creator and RP Studio.
- [ ] Migrate Documents/privacy/storage.
- [ ] Migrate media/image/video/audio.
- [ ] Migrate remaining scenes/workflows/prompts/research.
- [ ] Add language-switch regressions per feature.

### Native review
- [ ] Assign a native reviewer to every non-English locale.
- [ ] Remove embedded English fragments.
- [ ] Validate interpolation and technical-token preservation.
- [ ] Record reviewer/date evidence.
- [ ] Regenerate status and completion module.

### CI
- [ ] Add hardcoded-string baseline/no-regression mode.
- [ ] Add it to static contracts and GitHub Actions.
- [ ] Run full Node 22 matrix.

### Manual QA
- [ ] Test all locales in packaged Electron.
- [ ] Test Arabic RTL.
- [ ] Test long-string locales and CJK/Hindi layout.
- [ ] Test zoom, minimum window, keyboard, and reduced motion.
- [ ] Attach screenshots and release evidence.
