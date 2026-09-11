# Venice Forge Full Repository Audit — 2026-07-26

> **Authority:** Current audit report for the supplied ZIP and the live `spearchucker667/Venice_Forge` repository as inspected on 2026-07-26. Executable source and tests remain authoritative when this document conflicts with later code.
>
> **Audit prompt:** `Pasted text.txt`
>
> **Supplied snapshot:** `Venice_Forge-clean-20260726-054446-dirty.zip`
>
> **Patched deliverable:** created from the extracted snapshot only. No branch, commit, push, tag, issue, or pull request was created.

## 1. Executive Audit Report

### Overall verdict

**Not release-ready.** The repository is large, mature, and has strong static security and contract coverage, but the current multi-language feature is not complete across the application. The catalog layer is structurally complete, while 1,304 visible hardcoded-text candidates remain across 92 source files and several non-English catalogs contain mixed English/target-language artifacts. The pre-audit repository also falsely marked every non-English locale as production-complete.

The audit remediated the verified safety-verifier regression, status-file mutation, translation-key routing/logging weakness, false locale-production signal, and two tracked local-agent artifacts. Full dependency-backed lint, test, build, and packaging execution was blocked because the supplied ZIP has no `node_modules` and the audit environment could not fetch an uncached package.

### Release-readiness assessment

| Area | Verdict |
|---|---|
| Repository identity and lockfile | Static checks passed |
| Electron security boundary | Static checks passed; no weakening introduced |
| API/network boundary | Static checks passed |
| Archive/release hygiene | Static verifiers passed after removing confirmed local artifacts |
| Dependency vulnerability metadata | `npm audit --offline` reported 0 vulnerabilities |
| Typecheck/lint/tests/build | **Blocked** by unavailable dependencies; no green claim |
| Localization catalog structure | Pass: 12 locales × 12 namespaces, 0 missing source keys |
| Full-app localization | **Fail/incomplete:** 1,304 hardcoded candidates in 92 files |
| Native-language quality | **Incomplete:** machine-first-pass catalogs require review |
| GitHub CI at latest commit | No check/status records were returned by the connector for the latest direct commit |
| Release decision | Hold until unresolved P1 localization work and dependency-backed validation are complete |

### Sources inspected

- Full extracted ZIP tree: 1,638 original repository content files; no `.git`.
- Live GitHub repository metadata, latest commits, current file content, PR/issue state, and current repository permissions.
- 1,026 TypeScript/TSX files, 437 test files, 241 Markdown files in the patched audit tree.
- `package.json`, `package-lock.json`, Electron main/preload/IPC/service boundaries, renderer source, scripts, localization resources, GitHub workflows, build and release configuration, docs, reports, work orders, themes, and tests.
- Repository-level instructions: `AGENTS.md`, `AGENT_REINITIALIZATION.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `package.json`.

### Confirmed issue totals

| Severity | Confirmed | Fixed in audit copy | Unresolved |
|---|---:|---:|---:|
| P0 | 0 | 0 | 0 |
| P1 | 4 | 3 | 1 |
| P2 | 4 | 3 | 1 |
| P3 | 1 | 0 | 1 |
| **Total** | **9** | **6** | **3** |

The three unresolved rows are grouped implementation programs: full-app hardcoded-string conversion, native-language catalog review, and CI ratcheting/manual QA.

## 2. Environment and Source of Truth

| Item | Value |
|---|---|
| ZIP filename | `Venice_Forge-clean-20260726-054446-dirty.zip` |
| Extracted root | `/mnt/data/venice_forge_audit_20260726/Venice_Forge` |
| GitHub repository | `spearchucker667/Venice_Forge` |
| GitHub default branch | `main` |
| ZIP metadata branch | `main` |
| ZIP metadata base commit | `1c91fc88dbc07410fa670d1f77b0971c609f8129` |
| Latest GitHub commit | `771d1d8c8064bedf86e43beff575cf0441e6f3c9` |
| Application version | `3.0.0-beta.2` |
| Package manager | npm, lockfile v3 |
| Declared Node | `>=22.13.0 <23.0.0` |
| Audit Node | `v22.16.0` |
| Audit npm | `10.9.2` |
| Electron | `^43.2.0` |
| React | `^19.2.8` |
| TypeScript | `~5.8.3` |
| Audit OS/arch | Linux x86_64 |
| ZIP contains `.git` | No |
| Open GitHub issues | 0 returned |
| Open GitHub PRs | 0 returned |

The canonical macOS checkout root is declared by `AGENTS.md`. The audit ran against an extracted source archive, not that checkout. Git operations and commit-state mutation were therefore not attempted.

## 3. ZIP-to-GitHub Comparison

### Initial source-of-truth comparison

`_REPO_EXTRACT_METADATA/EXTRACT_INFO.txt` states that the ZIP was exported from `main` at base commit `1c91fc88dbc07410fa670d1f77b0971c609f8129` with exactly one dirty tracked file:

```text
M scripts/translate-missing.cjs
```

GitHub reports that the latest commit `771d1d8c8064bedf86e43beff575cf0441e6f3c9` is exactly one commit ahead of that base and modifies only `scripts/translate-missing.cjs`. The ZIP copy and the live GitHub copy of that file have the same blob SHA:

```text
53c8c684a4d72f29b921ccf4d957df4e6381aa5f
```

**Conclusion:** The supplied ZIP is content-equivalent to the latest GitHub tip for tracked source, based on the archive metadata, one-commit GitHub comparison, and exact changed-file blob match. This is stronger than a timestamp comparison but is not represented as a full Git tree hash because the archive has no `.git`.

### Snapshot-specific content

- `_REPO_EXTRACT_METADATA/` is archive metadata and is ignored by `.gitignore`.
- The ZIP included two tracked `.agent-backups` files and tracked `patch_runner.js`; both were confirmed as repository contaminants and removed from the patched audit copy.
- The ZIP did not include build output, `node_modules`, release artifacts, or a Git database.
- No local implementation was found in the ZIP that was absent from the live GitHub tip after accounting for the one committed translation-script update.

## 4. Major Feature Inspection Classification

The absence of installable dependencies prevented renderer/Electron runtime execution. The classifications below separate static implementation evidence from runtime proof.

| Feature area | Classification | Evidence |
|---|---|---|
| Electron startup/security | Implemented; statically verified | Secure BrowserWindow flags and network/protocol verifiers passed |
| Chat and character chats | Implemented; runtime not exercised | Source, stores, IPC, persistence, and extensive tests present |
| Character Library / Creator / RP Studio | Implemented; runtime not exercised | Components/services/contracts/tests present |
| Documents / Working environments | Implemented; statically contract-verified | `verify:document-agent` passed |
| Image/audio/video/media | Implemented; statically policy-verified | Image/network/protocol verifiers passed |
| Research / Jina | Implemented; statically guarded | Safety and network dispatch checks passed |
| Prompts / system layers / Traffic Inspector | Implemented; runtime not exercised | Source and stores present; prompt-language verifier passed |
| Workflows | Implemented; dependency-backed verifier blocked | Source/tests present; Vitest unavailable |
| Backup / sync / storage | Implemented; several static checks passed | Storage policy and packaging checks passed; backup tests blocked |
| Themes | Implemented; statically verified | Theme token verifier passed |
| Localization | **Partially implemented / broken as full-app feature** | Catalog structure passes, but 1,304 visible literals remain and machine artifacts persist |
| Release packaging | Configured; not fully executed | Static packaging verifier passed; build/package execution blocked |
| Updates / signed release | Configured/documented; external acceptance not run | No signing identities or package output available |

## 5. Verified Findings

### [P1-01] Full-application localization remains incomplete

**Classification:** Confirmed bug / incomplete feature
**Severity:** P1
**Confidence:** Confirmed
**Source:** Both screenshots and ZIP
**Affected files:**
- `scripts/verify-hardcoded-strings.cjs`
- 92 source files reported in `artifacts/i18n/hardcoded-strings.json`
- Highest-count examples:
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

**Affected symbols:**
- JSX text and visible string-literal surfaces across the files above
- `runVerification` in `scripts/verify-hardcoded-strings.cjs`

**Evidence:**

```text
[verify:hardcoded-strings] 1304 candidate(s) across 92 file(s) (advisory; strict=false).
```

The scanner visits 781 source files and reports 1,304 candidates. It is advisory by default (`scripts/verify-hardcoded-strings.cjs:25`, `:277-291`) and is not part of the static contract chain.

**Observed behavior:** Changing locale can translate catalog-backed surfaces while leaving many buttons, headings, labels, placeholders, empty states, dialogs, and complex feature panels in English.

**Expected behavior:** Every user-visible app surface should resolve through canonical translation keys, with English used only as the explicit fallback locale.

**Root cause:** Catalog remediation was treated as equivalent to full-app localization, while the known per-component literal migration was deferred.

**Impact:** Major product feature remains visibly inconsistent and does not satisfy the user requirement for translation throughout the entire application.

**Remediation performed:** None of the 1,304 candidates was bulk-rewritten because this requires component-by-component semantic key design and regression testing. The audit changed production-completion metadata so these locales are no longer represented as finished.

**Validation:** `NODE_PATH="$(npm root -g)" node scripts/verify-hardcoded-strings.cjs`.

**Remaining work:** Execute the phased conversion in the agent handoff.

---

### [P1-02] Non-English locales were falsely marked production-complete

**Classification:** Confirmed bug / release-truth issue
**Severity:** P1
**Confidence:** Confirmed
**Source:** ZIP
**Affected files:**
- `scripts/verify-i18n.cjs`
- `scripts/i18n-locale-status.cjs`
- `docs/i18n/translation-status.json`
- `src/i18n/locale-completion-status.ts`
- `src/i18n/locales.ts`

**Affected symbols:**
- `runVerification`
- `deriveCompletion`
- `LOCALE_COMPLETION`

**Evidence:**

Before remediation, every locale had:

```json
{
  "uiCoveragePercent": 100,
  "reviewStatus": "complete",
  "isProductionComplete": true
}
```

The verifier derived `reviewStatus: complete` solely from structural catalog checks. It had no native-review evidence source, despite repository documentation acknowledging machine-first-pass output.

**Observed behavior:** The renderer and documentation could represent all 11 non-English locales as production-complete despite visible hardcoded English and mixed-language catalog entries.

**Expected behavior:** Catalog completeness and human/native-language review must be separate. Machine translation cannot self-certify production readiness.

**Root cause:** `reviewStatus` conflated key/interpolation parity with linguistic review.

**Impact:** False release signal and misleading UI/metadata.

**Remediation performed:**
- Added `docs/i18n/native-review-status.json`.
- Added `catalogStatus` and explicit review evidence handling in `scripts/verify-i18n.cjs`.
- Set every non-English locale to `first-pass-machine`.
- Regenerated `translation-status.json` and `locale-completion-status.ts`.
- `isProductionComplete` is now false for every non-English locale until explicit native-review evidence is recorded.
- Added/updated tests for default incomplete state and explicit promotion.

**Validation:**
- `node scripts/verify-i18n.cjs --write-status`
- `node scripts/i18n-locale-status.cjs --write`
- Read-only verifier hash test
- Ad-hoc assertions passed

**Remaining work:** Native review and hardcoded-string conversion.

---

### [P1-03] Safety verifier rejected legitimate translated UI copy

**Classification:** Confirmed bug / CI blocker
**Severity:** P1
**Confidence:** Confirmed
**Source:** ZIP
**Affected files:**
- `scripts/verify-safety-guard.cjs`
- `scripts/verify-safety-guard.test.ts`
- Triggering legitimate source: `src/components/settings/SafetyPanel.tsx:107`

**Affected symbols:**
- `scanForViolations`
- `stripCommentsAndLiterals`
- `containsSafetyBypassCode`

**Evidence:**

The pre-audit scanner applied this regex to complete file contents:

```js
/disable.*safety|bypass.*guard|setContentGuardBypass|DEV_DISABLE|VENICE_FORGE_DEV_DISABLE_SAFETY_GUARD/
```

The legitimate fallback text included:

```tsx
'Cannot disable Provider Safe Mode'
```

**Observed behavior:** `verify:safety-guard` failed even though all real guard enforcement points passed.

**Expected behavior:** The gate should detect executable bypass symbols, not prose or translation keys.

**Root cause:** Whole-file regex scanned comments and string literals.

**Impact:** Static contract/CI gate blocked by a false positive, encouraging unsafe suppression.

**Remediation performed:**
- Added a dependency-free comment/string-literal stripper.
- Restricted bypass detection to executable known identifiers and assignments.
- Added regression cases for user-facing safety copy, comments, and a real bypass assignment.

**Validation:** `npm run verify:safety-guard` passed, including all eight enforcement points.

**Remaining work:** Run the Vitest regression suite after dependencies are installed.

---

### [P1-04] Translation CLI could route `VENICE_API_KEY` to an unrelated host and expose provider error bodies

**Classification:** Security issue
**Severity:** P1
**Confidence:** High
**Source:** Both ZIP and GitHub latest file
**Affected files:**
- `scripts/translate-missing.cjs`
- `scripts/translate-missing.test.ts`
- `.env.example`
- `docs/i18n/TRANSLATION_GUIDE.md`

**Affected symbols:**
- `resolveVeniceBaseUrl`
- `requireVeniceApiKey`
- `callVenice`

**Evidence:**

Pre-audit behavior:

```js
const VENICE_BASE_URL =
  process.env.OPENAI_BASE_URL || 'https://api.venice.ai/api/v1';
const veniceAuth = process.env.VENICE_API_KEY;
```

and:

```js
throw new Error(
  `Venice responded ${response.status}: ${errText.slice(0, 240)}`
);
```

**Observed behavior:** A globally configured `OPENAI_BASE_URL` could receive the Venice bearer key. Error bodies contradicted the script's own no-response-body logging claim.

**Expected behavior:** The key must default to Venice's HTTPS host, custom routing must be explicit, and provider response content must never enter logs/errors.

**Root cause:** Reuse of a provider-generic environment variable and raw upstream error interpolation.

**Impact:** Developer credential disclosure risk during translation maintenance.

**Remediation performed:**
- Removed `OPENAI_BASE_URL` usage.
- Added canonical HTTPS Venice endpoint validation.
- Non-Venice hosts require deliberate `VENICE_TRANSLATE_ALLOW_CUSTOM_BASE_URL=1`.
- HTTP remains rejected.
- Provider response bodies are consumed but never included in errors.
- Moved key validation out of module import so pure helper tests do not require a secret.
- Added endpoint and key-validation regression cases.

**Validation:** Node syntax checks and ad-hoc endpoint/redaction assertions passed. Vitest execution remains blocked by missing dependencies.

**Remaining work:** Run full unit suite in a dependency-complete checkout.

---

### [P2-01] `verify:i18n` mutated a tracked status file by default

**Classification:** Confirmed bug / repository hygiene
**Severity:** P2
**Confidence:** Confirmed
**Source:** ZIP
**Affected files:**
- `scripts/verify-i18n.cjs`
- `scripts/i18n-status-isolation.test.ts`
- `package.json`

**Affected symbols:**
- `applyCliFlags`
- CLI `require.main` block

**Evidence:**

The function defaulted `writeStatus=false`, but the CLI hard-coded:

```js
writeStatus: true
```

Therefore a verification-only command changed `docs/i18n/translation-status.json`.

**Observed behavior:** Running the normal verifier dirtied the working tree and rewrote timestamps.

**Expected behavior:** Validation is read-only unless an explicit status-generation command is used.

**Root cause:** CLI behavior contradicted function defaults and the prior commit message.

**Impact:** Non-reproducible validation and noisy commits.

**Remediation performed:**
- Added `--write-status`.
- Default CLI invocation is read-only.
- Added `i18n:coverage:write`.
- Updated `i18n:full-pipeline` to explicitly regenerate status before the renderer completion module.
- Added CLI-flag isolation tests.

**Validation:** SHA-256 of `translation-status.json` was identical before and after `node scripts/verify-i18n.cjs`.

---

### [P2-02] Local agent backup artifacts were tracked

**Classification:** Repository hygiene
**Severity:** P2
**Confidence:** Confirmed
**Source:** Both ZIP and GitHub tree represented by ZIP
**Affected files:**
- `.agent-backups/image-remediation-20260725/pre-edit-working-tree.patch`
- `.agent-backups/image-remediation-20260725/package.json`
- `.gitignore`

**Evidence:** The directory contained a 20,455-byte patch and a 19,251-byte package copy. No production references were found.

**Observed behavior:** Local recovery artifacts were shipped as repository source.

**Expected behavior:** Agent recovery files remain local/ignored.

**Root cause:** Missing root ignore rule and accidental tracking.

**Impact:** Review noise, stale code exposure, larger archives, and scanner false positives.

**Remediation performed:**
- Removed `.agent-backups/` from the patched tree.
- Added `/.agent-backups/` to `.gitignore`.

**Validation:** Archive and release packaging verifiers passed.

**Remaining work in a real checkout:** `git rm -r --cached .agent-backups` if the directory must remain locally.

---

### [P2-03] Root `patch_runner.js` was a tracked one-shot source mutator

**Classification:** Repository hygiene / unsafe developer artifact
**Severity:** P2
**Confidence:** Confirmed
**Source:** ZIP
**Affected files:**
- `patch_runner.js`
- `.gitignore`
- `docs/summary_of_work.md`

**Evidence:**

The script performed a regex replacement and direct write against:

```text
electron/agent/runtime/chat-agent-runner.ts
```

The existing session ledger already described it as local-only, untested, and intentionally excluded from an earlier commit.

**Observed behavior:** It later became tracked despite the documented decision.

**Expected behavior:** Local one-shot mutators are not product source.

**Root cause:** Missing ignore rule and later accidental inclusion.

**Impact:** Accidental destructive execution and repository clutter.

**Remediation performed:**
- Removed `patch_runner.js`.
- Added `/patch_runner.js` to `.gitignore`.

**Validation:** Archive/repository hygiene verifiers passed.

---

### [P2-04] Machine-translated catalogs contain mixed-language artifacts

**Classification:** Confirmed bug / incomplete feature
**Severity:** P2
**Confidence:** Confirmed
**Source:** ZIP
**Affected files:**
- `src/i18n/resources/{de,es,fr,ru,zh-CN,ja}/errors.json`
- `src/i18n/resources/{de,es,fr,ru,zh-CN,ja}/research.json`
- Additional catalogs require systematic review

**Evidence examples:**

```json
"fileReadError": "失敗：read file."
"queryPlaceholder": "Введите research topic or URL to scrape..."
"noResults": "Нет research results found for query."
"queryPlaceholder": "输入research topic or URL to scrape..."
```

**Observed behavior:** A translated locale can display target-language prefixes combined with untranslated English clauses.

**Expected behavior:** Natural, semantically accurate locale text, except explicitly allowlisted brands/technical tokens.

**Root cause:** First-pass model output was accepted when the complete string differed from English; embedded source-language fragments are not measured.

**Impact:** Low-quality and confusing UI even on catalog-backed surfaces.

**Remediation performed:** Production readiness was corrected to `first-pass-machine`; catalog prose was not bulk-retranslated without review.

**Validation:** Direct catalog search plus verifier output.

**Remaining work:** Native-language review task in the handoff.

---

### [P3-01] Hardcoded-string control is advisory and not a no-regression gate

**Classification:** Improvement / test gap
**Severity:** P3
**Confidence:** Confirmed
**Source:** ZIP
**Affected files:**
- `scripts/verify-hardcoded-strings.cjs`
- `package.json`
- CI/static contract chain

**Evidence:** The scanner prints `strict=false` and exits 0 with 1,304 findings. `verify:contracts:static` does not invoke it.

**Observed behavior:** New English-only UI can be added without failing CI.

**Expected behavior:** Existing debt can be baselined, while new or expanded hardcoded visible text fails the gate.

**Root cause:** The scanner was introduced as inventory only.

**Impact:** Localization debt can increase unnoticed.

**Remediation performed:** None; a strict zero-total gate would break immediately and is not an appropriate one-step change.

**Remaining work:** Add a committed baseline and fail only on regressions, then ratchet downward.

## 6. Security Review Verdict

### Verified positive controls

- `contextIsolation`, `nodeIntegration`, sandboxing, and web security settings are present in the Electron window configuration.
- Renderer network boundaries and custom protocol privileges passed their static verifiers.
- Safety guard enforcement passed for renderer fetch/stream, IPC, server proxy, research UI, research runner, Venice research provider, and Jina provider.
- Main-process ownership patterns are present for privileged file, credential, media, backup, and provider operations.
- No private-key block or GitHub-token pattern was found.
- Secret-shaped matches were confined to test fixtures; values were not included in this report.
- `npm audit --offline --audit-level=moderate` reported 0 vulnerabilities from the lockfile metadata.

### Limitations

- Git history was not locally available; no history rewrite or full historical secret scan was possible.
- Runtime origin/sender validation, archive parsing, credential storage, and external URL flows were not dynamically exercised.
- No signed/package runtime was launched.
- A dependency-complete CodeQL run was not available from the latest direct commit through the connector.

## 7. Repository Hygiene Report

### Confirmed incorrectly tracked files

| Path | Sensitive | Action |
|---|---|---|
| `.agent-backups/image-remediation-20260725/pre-edit-working-tree.patch` | No secret found; stale source diff | Removed from patched tree; ignored |
| `.agent-backups/image-remediation-20260725/package.json` | No secret found | Removed from patched tree; ignored |
| `patch_runner.js` | No secret; destructive local helper | Removed from patched tree; ignored |

### Ignore changes

Added:

```gitignore
/.agent-backups/
/patch_runner.js
```

### Secret exposure verdict

No confirmed production secret was found. Secret-shaped values occurred in test fixtures. No Git-history remediation is currently justified by this audit. A full history scan remains a manual follow-up if repository policy requires it.

## 8. Changes Implemented

| File | Symbol/area | Change | Regression evidence |
|---|---|---|---|
| `scripts/verify-safety-guard.cjs` | violation scanner | Strip comments/literals and detect executable bypass identifiers only | Verifier pass + ad-hoc assertions |
| `scripts/verify-safety-guard.test.ts` | scanner tests | Added UI-copy/comment false-positive and real bypass cases | Added; Vitest blocked |
| `scripts/verify-i18n.cjs` | CLI/status/review | Read-only default, `--write-status`, native-review manifest, separate `catalogStatus` | Hash isolation + verifier pass |
| `scripts/i18n-status-isolation.test.ts` | CLI flags | Added explicit status-write tests | Added; Vitest blocked |
| `scripts/i18n-locale-status.cjs` | type generator | Added machine/native review states | Generator pass |
| `scripts/i18n-tooling.test.ts` | verifier semantics | Added needs-review and explicit-promotion tests | Added; Vitest blocked |
| `docs/i18n/native-review-status.json` | review evidence | Added authoritative per-locale human review state | Loaded by verifier |
| `docs/i18n/translation-status.json` | generated truth | Non-English locales now `first-pass-machine` | Generated |
| `src/i18n/locale-completion-status.ts` | generated registry data | Non-English production flags now false | Generated |
| `src/i18n/locale-completion-status.test.ts` | registry regression | Added first-pass incomplete assertions | Added; Vitest blocked |
| `scripts/translate-missing.cjs` | endpoint/auth/error handling | Venice-host validation, explicit custom-host opt-in, no raw response logging | Syntax + ad-hoc tests |
| `scripts/translate-missing.test.ts` | utility tests | Endpoint, HTTPS, key validation cases | Added; Vitest blocked |
| `package.json` | i18n scripts | Added explicit status writer and corrected full pipeline | JSON/lock verifier pass |
| `.env.example` | maintenance config | Documented secure translation endpoint variables | Static review |
| `.gitignore` | local artifacts | Ignored `.agent-backups` and `patch_runner.js` | Hygiene verifiers |
| `.agent-backups/**` | tracked artifacts | Removed | Tree check |
| `patch_runner.js` | tracked artifact | Removed | Tree check |
| i18n docs | operational truth | Separated structural coverage from native review | Markdown verifier |
| audit/report docs | governance | Added this report and implementation handoff | Markdown verifier |

## 9. Validation Matrix

| Command or check | Result | Relevant output | Notes |
|---|---|---|---|
| `npm ci --offline --ignore-scripts` | BLOCKED | `ENOTCACHED` for `zwitch-2.0.4.tgz` | Network/cache limitation |
| `npm run typecheck` | BLOCKED | Missing Node/Electron/package types | Dependencies absent; not treated as source failures |
| `npm run lint:eslint` | BLOCKED | `eslint: not found` | Dependencies absent |
| `npm test` | BLOCKED | `vitest: not found` | Dependencies absent |
| `npm run test:ci` | BLOCKED | `vitest: not found` | Dependencies absent |
| `npm run build` | BLOCKED | `cross-env: not found` | Dependencies absent |
| `npm audit --offline --audit-level=moderate` | PASS | `found 0 vulnerabilities` | Lockfile metadata only |
| `npm run verify:safety-guard` | PASS | All eight enforcement points; no violations | Confirms false-positive remediation |
| `node scripts/verify-i18n.cjs` | PASS | 12 locales, 12 namespaces | Read-only; status hash unchanged |
| `node scripts/verify-i18n.cjs --write-status` | PASS | Status regenerated | Explicit write path |
| `node scripts/i18n-locale-status.cjs --write` | PASS | 11 locales incomplete pending review | Correct production signal |
| `node scripts/extract-i18n-keys.cjs` | PASS | 627 usages, 587 unique, 0 missing, 208 unused | Global module path used for TypeScript |
| `node scripts/verify-hardcoded-strings.cjs` | PASS/advisory | 1,304 candidates, 92 files | Confirms unresolved P1 |
| `npm run verify:repository-identity` | PASS | archive mode | No `.git` |
| `npm run verify:roadmap-current` | PASS | Current-work ledger accepted | Before final doc addition and again after |
| `npm run verify:lockfile` | PASS | `OK` | Package/lock integrity |
| `npm run verify:repo-handoff-hygiene` | PASS | `OK` | |
| `npm run verify:archive-clean` | PASS | `OK` | |
| `npm run verify:release-metadata` | PASS | Electron 43, Vite 8, Express 5 | |
| `npm run verify:icon` | PASS | Icon assets present | |
| `npm run verify:network-boundaries` | PASS | Network boundaries intact | |
| `npm run verify:custom-protocol-privileges` | PASS | Renderer schemes secure and stream-aware | |
| `npm run verify:no-native-dialogs` | PASS | No prohibited renderer-native dialogs | |
| `npm run verify:ci-contract` | PASS | Workflow contract valid | |
| `npm run verify:release-packaging-hardening` | PASS | 102 checks | Static/archive mode |
| `npm run verify:image-policy` | PASS | Policy contract valid | |
| `npm run verify:theme-tokens` | PASS | 154 files, no forbidden color classes | |
| `npm run verify:document-agent` | PASS | Document Agent contract valid | |
| `npm run verify:storage-policy` | PASS | Storage policy valid | |
| `npm run verify:prompt-language` | PASS | Prompt-language audit valid | Does not prove UI translation |
| `npm run verify:contracts:static` | BLOCKED | Reached `verify:venice-api-docs`, then missing `yaml` | Earlier static stages passed |
| Bundle budget | NOT APPLICABLE | `dist/assets` absent | Build was blocked |
| Packaged Electron manual QA | NOT RUN | No package/dependencies/display workflow | Required before release |
| GitHub latest-commit checks | UNVERIFIED | Connector returned no status records | Do not infer pass/fail |

## 10. Final Repository State

```text
Branch: archive metadata says main; no local .git
Starting commit: 1c91fc88dbc07410fa670d1f77b0971c609f8129 + one dirty file matching GitHub 771d1d8
GitHub tip inspected: 771d1d8c8064bedf86e43beff575cf0441e6f3c9
Ending commit: none (no commit created)
Working tree: patched extracted source tree; Git status unavailable
Files modified: i18n/safety/translation tooling, tests, package/docs/ignore configuration
Files added: native-review manifest, audit report, unresolved-work handoff
Files removed: .agent-backups/**, patch_runner.js
Tests passed: dependency-free verifiers and ad-hoc regression assertions
Tests failed: none classified as source failures
Blocked checks: dependency install, TypeScript, ESLint, Vitest, Vite/Electron build, full static aggregate
Handoff path: docs/work-orders/CHATGPT_5_6_REPOSITORY_AUDIT_HANDOFF_2026-07-26.md
```

## 11. Highest-Priority Remaining Risks

1. Convert visible hardcoded text across the 92 reported source files, starting with the highest-count critical product surfaces.
2. Perform native-language review and correct mixed-language machine artifacts in all 11 non-English catalogs.
3. Add a baseline/ratchet CI gate so the hardcoded-string count cannot increase.
4. Run the complete Node 22 dependency-backed validation matrix in the canonical macOS checkout.
5. Complete packaged Electron locale QA, including Arabic RTL, long German/French strings, CJK line breaking, zoom, and small-window overflow.
