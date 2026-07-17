# Venice Forge Comprehensive Deep Scan

**Snapshot:** `Venice_Forge-clean-20260716-183918.zip`  
**Repository metadata:** branch `main`, commit `73f8b83daa1dabd34db63641e3784ed549e5dad2`, clean worktree at export  
**Application version:** `3.0.0-beta.1`  
**Audit date:** 2026-07-16  
**Audit mode:** static repository analysis, build/type/lint verification, segmented test execution, contract-verifier execution, documentation graph analysis, source import graph analysis, and prior-finding reconciliation

---

## 1. Executive Verdict

Venice Forge has a broad, mature feature surface and substantially stronger implementation discipline than the prior July snapshots. The current archive contains extensive tests, typed Electron boundaries, hardened navigation/network policies, local-first storage controls, encrypted backup/sync infrastructure, media persistence, character-card tooling, and explicit release verifiers.

No P0 security vulnerability, destructive data-loss defect, exposed credential, or renderer privilege escalation was verified in this scan.

The snapshot is **not release-ready as-is**, for four principal reasons:

1. The canonical `verify:contracts` release gate fails because `docs/DOCS_INDEX.md` links to a missing archive file.
2. The fallback-provider registry advertises modalities that the actual main-process adapters and model catalog cannot route.
3. Music completion can be inserted twice into Media Studio, and WAV/FLAC outputs are mislabeled as MP3 during download/export.
4. The repository's current roadmap/remediation evidence overstates the validation state of the current snapshot; external signed, paid-operation, accessibility, and two-device sync evidence also remains outstanding.

### Overall assessment

| Area | Assessment |
|---|---|
| Core architecture | Strong, but several large modules and duplicated contract declarations increase change risk |
| Electron security boundary | Strong; no verified boundary weakening |
| Build/type/lint | Passed |
| Automated tests | Broadly passed; full aggregate could not finish only because the offline audit environment lacked the Electron postinstall binary |
| Canonical contracts | Failed on one reproducible Markdown link |
| Media generation | Previous image/video/music API drift is largely remediated; two music catalog/export defects remain |
| Characters/RP | Previous greeting/avatar/local-character defects appear remediated and covered by tests |
| Backup/sync | Substantial implementation exists and verifier passes; real two-device evidence remains absent |
| Documentation | Extensive but internally inconsistent, partially stale, and burdened by historical audit material |
| Release readiness | Blocked pending P1 corrections and external QA evidence |

---

## 2. Snapshot and Repository Inventory

### 2.1 Export provenance

The archive metadata reports:

- Export timestamp: `20260716-183918`
- Branch: `main`
- Commit: `73f8b83daa1dabd34db63641e3784ed549e5dad2`
- Dirty file count: `0`
- Exporter: `clean-repo-zip-v4`
- Secret scan: no high-risk source secret was identified; reported matches were test fixtures

The archive intentionally omits `.git`, so current tracked/untracked status cannot be recomputed inside the extraction. Repository-state claims therefore use the export metadata, `.gitignore`, and archive contents.

### 2.2 File inventory

The scan counted **1,239 files** excluding installed dependencies and generated build output.

| Type | Count |
|---|---:|
| TypeScript `.ts` | 692 |
| React/TypeScript `.tsx` | 195 |
| Markdown `.md` | 138 |
| CommonJS `.cjs` | 47 |
| YAML `.yaml` | 46 |
| SVG | 20 |
| OGG sound assets | 20 |
| PNG | 17 |
| JSON | 13 |
| GIF | 11 |

Top-level concentration:

| Directory | Files |
|---|---:|
| `src/` | 720 |
| `docs/` | 131 |
| `electron/` | 119 |
| `scripts/` | 74 |
| `config/` | 36 |
| `tests/` | 34 |
| `assets/` | 34 |
| `public/` | 32 |

The source and test surface is unusually large for a beta Electron app. That is a positive signal for coverage, but it also means contract drift can occur between duplicated registries, adapters, stores, UI badges, verifier scripts, and historical reports.

### 2.3 Large implementation units

| File | Lines |
|---|---:|
| `src/components/rp-studio/CharacterEditor.tsx` | 1,278 |
| `src/services/desktopBridge.ts` | 1,270 |
| `server.ts` | 1,098 |
| `src/stores/chat-store.ts` | 1,037 |
| `src/components/gallery/gallery-view.tsx` | 1,004 |
| `src/components/chat/chat-view.tsx` | 926 |
| `src/components/gallery/media-inspector.tsx` | 926 |
| `src/components/scenes/SceneComposerView.tsx` | 925 |
| `electron/preload.ts` | 693 |

These are not defects by themselves, but they are high-risk change zones and make it harder to prove behavior locally.

---

## 3. Validation Results

### 3.1 Passed checks

The following checks completed successfully in the extracted snapshot:

- `npm ci --ignore-scripts`
  - 853 packages installed
  - npm audit: **0 vulnerabilities**
- Renderer TypeScript compilation
- Electron TypeScript compilation
- ESLint
- Production build
  - 3,117 renderer modules transformed
  - Electron and server outputs built
  - largest principal renderer chunks approximately 502.49 KiB and 511.67 KiB, below the 600 KiB enforced threshold
  - PDF worker approximately 1,375.84 KiB, below its 1.5 MiB bound
- Bundle budget verification
- Backup/sync verifier
- Repository identity verifier in archive mode
- Roadmap-current verifier
- Release metadata verifier
- Safety guard verifier
- Network-boundary verifier
- Venice API documentation verifier
- Agent-document verifier
- Archive-clean verifier tests
- Image policy verifier
- Media Studio power-tools verifier
- Status diagnostics verifier
- Prompt library verifier
- Scene Composer verifier
- RP Studio verifier
- Character Card V1/V2/PNG/security tests
- Workflow-template verifier
- Storage privacy/policy tests
- Document-ingestion verifier
- Research workspace/browser tests
- Layout UI: **95/95 passed**
- Research UI: **38/38 passed**
- Chat UI: **76/76 passed**
- Media Gallery UI: **63/63 passed**
- Image UI: **19/19 passed**
- Settings UI: **17/17 passed**
- Contract unit group: **221/221 passed**
- Type-focused group: **102/102 passed**
- Script verifier tests executable in this environment: **130/130 passed**

### 3.2 Reproducible failure

`npm run verify:contracts` fails during `verify:markdown-links`:

```text
::error file=docs/DOCS_INDEX.md,line=111::Broken Markdown link "archives/session-history-pre-2026-07-11.md": target does not exist
[verify:markdown-links] FAIL: 1 issue(s) in 93 Markdown files.
```

This is a repository defect, not an audit-environment limitation.

### 3.3 Aggregate test limitation

The full `npm run test:ci` chain advanced through the server, Electron, ingestion, stores, services, hooks, shared, utilities, theme, and most script suites. It stopped when `scripts/verify-provider-adapters.test.ts` imported Electron-backed secure-storage code and the local `electron` package attempted to download its runtime binary.

Dependencies were installed with lifecycle scripts disabled because the audit sandbox has no external package-download access. `node_modules/electron/path.txt` was therefore absent. This is an **environment-only limitation** and is not evidence that the repository's hosted CI fails.

All test shards that could execute without the missing binary passed. The audit does not claim a complete current-snapshot `test:ci` pass.

### 3.4 Corrected transient observation

An earlier combined run appeared to leave layout/research Vitest workers alive after assertions. Clean isolated reruns completed normally. This was not reproducible and is **not retained as a finding**.

---

## 4. Severity Model and Finding Summary

- **P0 — Critical:** immediate security compromise, credential exposure, destructive data loss, or app-wide unusability.
- **P1 — High:** release blocker, materially incorrect user-facing behavior, or governance evidence that falsely represents release state.
- **P2 — Medium:** significant maintainability, performance, documentation, or validation weakness with bounded immediate impact.
- **P3 — Low:** cleanup, decomposition, discoverability, dependency maintenance, or deferred enhancement.

### Summary

| Severity | Count | General status |
|---|---:|---|
| P0 | 0 | None verified |
| P1 | 6 | Must resolve before release candidate approval |
| P2 | 11 | Should resolve or explicitly accept before stable release |
| P3 | 7 | Schedule as bounded maintenance/deferred scope |

---

# 5. Detailed Findings

## VF-SCAN-20260716-001 — Canonical documentation contract is broken

**Severity:** P1  
**Status:** Verified  
**Area:** Release governance / documentation

### Evidence

- `docs/DOCS_INDEX.md:111` links:

```md
[archives/session-history-pre-2026-07-11.md](archives/session-history-pre-2026-07-11.md)
```

- `docs/archives/` contains only `README.md`.
- `.gitignore:20` explicitly unignores the missing file:

```gitignore
!docs/archives/session-history-pre-2026-07-11.md
```

- `npm run verify:contracts` fails on this exact link.

### Impact

- The canonical release contract is red.
- Documentation navigation points to a nonexistent source of historical truth.
- Any report claiming the current snapshot passes Markdown/contracts is inaccurate.

### Required correction

Choose one authoritative action:

1. Restore the intended archive file with sanitized historical content; or
2. Remove the link and `.gitignore` exception, then point the index to the actual retained history authority.

Do not create a placeholder that falsely implies complete session history.

### Validation

```bash
npm run verify:markdown-links
npm run verify:contracts
```

---

## VF-SCAN-20260716-002 — Root legal document contains broken links outside verifier coverage

**Severity:** P1  
**Status:** Verified  
**Area:** Legal/release documentation

### Evidence

`LEGAL.md` is at repository root, but contains:

- `LEGAL.md:108` → `[SECURITY.md](../SECURITY.md)`; this resolves outside the repository root.
- `LEGAL.md:110` → `[RELEASE.md](RELEASE/release.md)`; the actual file is `docs/RELEASE/release.md`.

The same document has a correct link at line 107, proving the other forms are stale rather than intentional.

`scripts/verify-markdown-links.cjs:6` scans:

```js
["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "AGENTS.md", "SECURITY.md", ".github", ".config", "docs"]
```

It omits root documents including `LEGAL.md`, `PRIVACY.md`, `PRODUCT.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `CLAUDE.md`, and `GEMINI.md`.

### Impact

- Public release/legal documentation directs maintainers to nonexistent paths.
- Current verifier coverage creates false confidence by excluding multiple first-class root documents.

### Required correction

- Change line 108 to `SECURITY.md`.
- Change line 110 to `docs/RELEASE/release.md`.
- Change the verifier to discover root `*.md` files or maintain an explicit complete allowlist.
- Add a test that executes the verifier against the actual repository, not only fixture helpers.

### Validation

```bash
node scripts/verify-markdown-links.cjs
npm run test:unit:scripts
```

---

## VF-SCAN-20260716-003 — Provider capability registry overstates routable features

**Severity:** P1  
**Status:** Verified  
**Area:** Fallback providers / settings / request routing

### Evidence

`src/types/provider.ts` advertises:

- Groq: `chat`, `audio`
- Fireworks: `chat`, `image`
- Google Gemini: `chat`, `image`, `video`, `audio`, `embeddings`
- Mistral: `chat`, `embeddings`
- Anthropic: `chat`, `vision`

`ProvidersPanel.tsx:13-17` determines displayed availability directly from `supportedTypes`.

Actual main-process adapter routes in `electron/services/providerAdapters.ts`:

- Together: `/chat/completions` and `/images/generations`
- Groq: `/chat/completions` only
- Anthropic: `/chat/completions` only
- Mistral: `/chat/completions` only
- Cohere: `/chat/completions` only
- Google Gemini: `/chat/completions` only
- Fireworks: `/chat/completions` only
- Perplexity: `/chat/completions` only
- Deferred providers return `null`

`src/config/provider-models.ts:10` limits fallback model types to:

```ts
_type: 'text' | 'image'
```

`getEnabledProviderModels('embeddings')` normalizes to `'embedding'`, a value that no `FallbackModelDef` can hold.

### Impact

- Settings can display support badges for modalities that will be rejected at request routing.
- Model selection and fallback availability can disagree.
- Users can configure credentials expecting image/audio/video/embedding fallback behavior that is not implemented.

### Required correction

Create one canonical provider capability contract shared by:

- Settings badges
- Model catalogs
- Adapter route guards
- Request fallback selection
- Status diagnostics
- Verifiers/tests

Represent capability at endpoint granularity, for example:

```ts
interface ProviderCapability {
  feature: 'chat' | 'image-generate' | 'audio-transcribe' | 'tts' | 'video-generate' | 'embeddings' | 'vision-input'
  route: string
  implemented: boolean
  modelDiscovery: 'static' | 'live' | 'none'
}
```

Until non-chat adapters exist, advertise only implemented routes.

### Validation

Add table-driven tests asserting every advertised capability resolves through a real adapter and model type.

---

## VF-SCAN-20260716-004 — Music can be saved twice to Media Studio

**Severity:** P1  
**Status:** Verified by control-flow inspection  
**Area:** Music / Media Studio

### Evidence

- `src/stores/background-task-store.ts:69-72` automatically invokes `persistCompletedTaskMedia(task)` for every completed desktop task envelope.
- `src/services/taskMediaCatalog.ts:14-17` correctly deduplicates auto-persistence by deterministic task ID or `queueId`.
- `src/components/music/music-view.tsx:140-170` uses only a component-local `savedQueueIdsRef` when the user clicks **Save to Media Studio**.
- The manual music save does not query `useMediaStore` for an item already auto-saved by queue ID.
- It creates a new random ID; `media-store` uniqueness is primarily ID-based.
- The video implementation already checks both the local set and `useMediaStore.getState().items.some(media => media.queueId === queueId)` at `video-view.tsx:376`.

### Impact

After background completion auto-adds music, clicking the visible save button can create a duplicate Media Studio item for the same queue.

### Required correction

Use the same idempotency contract as video:

- Treat `queueId` as the generation identity.
- Check the current media store and durable storage before manual insert.
- Prefer a shared `saveGeneratedTaskMedia` function rather than duplicate per-view logic.
- Update the button state from actual store state, not only component-local history.

### Validation

Add tests for:

1. background task auto-save;
2. manual save after auto-save;
3. navigation/remount then manual save;
4. repeated completion envelope;
5. exactly one item per queue ID.

---

## VF-SCAN-20260716-005 — WAV/FLAC music is exported and downloaded as MP3

**Severity:** P1  
**Status:** Verified  
**Area:** Audio metadata / downloads / export

### Evidence

The retrieval pipeline accepts `audio/mpeg`, `audio/wav`, and `audio/flac`, but:

- `taskMediaCatalog.ts` does not populate `mimeType` for completed music.
- `music-view.tsx:187` hardcodes:

```tsx
download="venice-music.mp3"
```

- `src/utils/image.ts:109-114` returns `.mp3` for every `mediaType === "audio"`.

The media schema can carry MIME metadata through the underlying storage record, but this path drops it.

### Impact

- WAV or FLAC bytes receive a misleading `.mp3` extension.
- Players, operating systems, uploaders, and user workflows may reject or misidentify valid output.
- Export bundles cannot reliably preserve original media format.

### Required correction

- Persist the completed response MIME type and/or canonical audio format on `MediaItem`.
- Map MIME types to extensions:
  - `audio/mpeg` → `.mp3`
  - `audio/wav` / `audio/x-wav` → `.wav`
  - `audio/flac` → `.flac`
  - other explicitly supported formats as applicable
- Generate the direct-download filename from the same helper used by gallery export.
- Reject mismatches between declared format and validated media signature where feasible.

### Validation

Add MP3, WAV, and FLAC completion/export tests and assert both filename and MIME preservation.

---

## VF-SCAN-20260716-006 — Current audit/roadmap claims are not bound to current-snapshot validation

**Severity:** P1  
**Status:** Verified  
**Area:** Governance / evidence integrity

### Evidence

- `docs/ROADMAP.md:7` says every automated July 16 deep-scan finding is closed or classified.
- `docs/audits/Venice_Forge_Deep_Scan_2026-07-16_REMEDIATION_REPORT.md:125-139` reports:
  - `test:ci` passed with 3,906 tests;
  - Markdown links passed;
  - contract aggregation passed.
- The current snapshot reproducibly fails Markdown/contracts.
- `ROADMAP.md:9` cites hosted CI evidence for commit `6257f294...`, while this archive identifies commit `73f8b83...`.

The historical report may accurately describe an earlier tree, but its validation summary is easy to read as current state.

### Impact

- Maintainers and agents can assume the current commit is fully validated when the evidence belongs to an older commit or earlier filesystem state.
- Closed status can hide regressions introduced after the remediation report.

### Required correction

- Add immutable metadata to every validation report: exact commit, dirty state, Node/npm versions, platform, timestamp, command list, artifact hashes.
- Label reports visibly as **historical evidence for commit X**, not current release truth.
- Make the canonical roadmap derive automated status from the current CI commit or link to a commit-scoped validation manifest.
- Reopen or classify any finding contradicted by the live tree.

### Validation

A release report must fail review if its `validatedCommit` differs from the candidate commit without a subsequent current-commit validation record.

---

## VF-SCAN-20260716-007 — Markdown verifier unit tests do not prove the current repository passes

**Severity:** P2  
**Status:** Verified  
**Area:** Test design

### Evidence

`scripts/verify-markdown-links.test.ts` passes its eight tests while the executable `node scripts/verify-markdown-links.cjs` fails against the actual repository.

### Impact

The script test suite can remain green while the release command is red.

### Required correction

Add a test equivalent to:

```ts
it('passes against the actual repository', () => {
  expect(runVerifierAt(repoRoot)).toEqual({ exitCode: 0 })
})
```

Alternatively, invoke the executable verifier as part of `test:unit:scripts` while retaining fixture tests for edge cases.

---

## VF-SCAN-20260716-008 — Clean archive process copies noncanonical ignored history

**Severity:** P2  
**Status:** Verified at archive-behavior level  
**Area:** Repository hygiene / handoff packaging

### Evidence

- `.gitignore:22` matches `docs/audits/*`, with selected exceptions.
- The archive includes `docs/audits/Records/` containing 44 files and approximately 441 KiB.
- `scripts/clean-repo-zip.sh:290-309` copies the working tree with `rsync` or `tar` using a hardcoded exclusion list.
- It does not build the archive from `git ls-files` and does not generally honor `.gitignore`.
- The extraction omits `.git`, so individual record tracking cannot be recomputed; nevertheless, the exporter is structurally capable of including ignored/untracked files.

### Impact

- “Clean” handoffs can include local historical evidence, stale reports, and unrelated scratch content.
- Archive size and audit noise increase.
- Historical files can contain broken relative links that are irrelevant to the current product but confuse scanners and agents.

### Required correction

Prefer a tracked-file manifest:

```bash
git ls-files -z --cached --others --exclude-standard
```

Then explicitly add only approved generated metadata. If ignored audit records must be included, require an opt-in flag and list them in the extract manifest.

### Validation

- Create an ignored sentinel file and verify it is absent by default.
- Create an approved opt-in audit record and verify it appears only with the flag.
- Verify every archived source file is either tracked or explicitly classified in metadata.

---

## VF-SCAN-20260716-009 — Backup/export documentation remains versioned as 2.1.2

**Severity:** P2  
**Status:** Verified  
**Area:** Documentation / data portability

### Evidence

- `package.json` version: `3.0.0-beta.1`.
- `docs/data-export-format.md:3` says the current implementation is Venice Forge `2.1.2`.
- Its example manifest at line 67 also uses `2.1.2`.
- Runtime export correctly imports the version from `package.json` in `backupExportService.ts`.
- `backupExportService.test.ts:71` accepts either `2.1.2` or any `3.0.0-beta.N`, reducing the test's ability to catch stale version output.

### Impact

- Users and developers may mistake examples for the current emitted format.
- A broad regex allows a stale version contract to survive future package changes.

### Required correction

- Describe examples as illustrative, or update them to the current version.
- Assert `metadata.appVersion === packageJson.version` in tests.
- Avoid hard-coded historical versions unless testing backward compatibility explicitly.

---

## VF-SCAN-20260716-010 — Synchronous logging can block Electron's main process

**Severity:** P2  
**Status:** Verified architectural risk; runtime impact not benchmarked  
**Area:** Performance / responsiveness

### Evidence

`electron/services/logger.ts` performs synchronous I/O for each log line:

- `statSync`
- `existsSync`
- `unlinkSync`
- `renameSync`
- `mkdirSync`
- `appendFileSync`

`electron/main.ts:137-153` persists renderer console messages, including verbose and informational output, through this logger. Messages may be up to 10,000 characters before redaction.

### Impact

During renderer error storms, verbose development behavior, network failures, or repeated task updates, synchronous disk writes can block the Electron event loop and contribute to perceived sluggishness.

### Required correction

- Buffer log lines in memory and flush asynchronously in bounded batches.
- Serialize writes through a promise queue or dedicated worker.
- Rotate asynchronously and enforce a queue-size/backpressure policy.
- In production, persist warnings/errors by default; sample or disable renderer info/verbose messages unless diagnostics mode is enabled.
- Flush on controlled shutdown without blocking normal UI operations.

### Validation

Benchmark 1,000 renderer console messages and assert main-process responsiveness and bounded write latency.

---

## VF-SCAN-20260716-011 — Provider model catalog is static, incomplete, and time-dependent

**Severity:** P2  
**Status:** Verified maintenance risk  
**Area:** Provider models

### Evidence

- `src/config/provider-models.ts` manually hard-codes fallback model IDs.
- Model records use `Date.now()` for `created`, so identical builds expose different metadata across launches/imports.
- The type system supports only text/image fallback models.
- There is no provider-native discovery or verified refresh timestamp in this layer.

### Impact

- Provider offerings can drift without an API-contract change being detected.
- Model sort order and metadata can be nondeterministic.
- Non-text/image modality expansion requires another parallel catalog design.

### Required correction

- Use stable, checked-in timestamps or omit unsupported creation metadata.
- Add provider-specific live discovery where supported, with cached fallback manifests and explicit last-verified dates.
- Generate provider models and capability badges from the same schema.
- Fail closed when model support is unknown.

No specific external model ID is classified as invalid by this audit because live provider catalogs were not queried.

---

## VF-SCAN-20260716-012 — Loading-animation replacement is not universal

**Severity:** P2  
**Status:** Verified scope mismatch  
**Area:** UX consistency

### Evidence

The shared `GenerationLoadingIndicator` is integrated into major long-running paths including chat, RP chat, Playground, Audio, Music, Research, task center, progress toasts, and TTS playback.

However:

- `src/components/image/image-view.tsx:822` still uses button text `Generating…`.
- Media cards use `Loading…` text for previews.
- Some toolbar actions use generic CSS spinners.
- Video and Embeddings retain their own processing treatments rather than one shared generation-animation system.

### Impact

If the accepted requirement is “replace all loading animations with the supplied cycling assets,” implementation is incomplete. If the requirement was narrowed to long-running generation feedback, the current state may be acceptable, but the documentation should say so explicitly.

### Required correction

Define a formal loading taxonomy:

- Long-running generation → shared animated asset component
- Short local mutation → compact spinner
- Background task → persistent toast/task center
- Media decode/thumbnail → skeleton or media placeholder

Then either complete the universal replacement or update the requirement/acceptance criteria to the scoped taxonomy.

---

## VF-SCAN-20260716-013 — Historical audit and report sprawl lacks a bounded retention model

**Severity:** P2  
**Status:** Verified  
**Area:** Documentation hygiene

### Evidence

- `docs/audits/Records/`: 44 files, approximately 441 KiB.
- `docs/reports/`: 14 report files/directories, approximately 381 KiB.
- Multiple historical scans, validation reports, work orders, and evidence packages repeat overlapping findings.
- Exact duplicate detection found only intentional duplicates:
  - `CLAUDE.md` and `GEMINI.md`
  - branding `NOTICE.md` in source/public asset locations

The main problem is semantic repetition and stale authority, not byte-identical duplication.

### Impact

- Agents can select an obsolete report as current truth.
- Links and status claims diverge.
- Repository review time and archive size increase.

### Required correction

Adopt a report lifecycle:

1. `docs/ROADMAP.md` — current open work only.
2. `docs/reports/CANONICAL_REPORT_INDEX.md` — immutable report registry with commit and status.
3. `docs/reports/historical/` — closed reports with front matter identifying supersession.
4. External evidence bundles — release assets or excluded local artifacts, not copied into every source handoff.
5. Retention rule — keep only the latest N raw evidence bundles per release line unless legally required.

Do not delete historical evidence blindly; classify and archive it.

---

## VF-SCAN-20260716-014 — Several useful documents are not discoverable from the canonical document graph

**Severity:** P2  
**Status:** Verified by inbound-link analysis  
**Area:** Documentation discoverability

### Candidate orphan documents

The following current/non-history documents had no Markdown inbound link in the scanned graph:

- `docs/data-export-format.md`
- `docs/DEVELOPMENT/macos.md`
- `docs/design/DESIGN.md`
- `docs/design/VENICE_UI_EXTRACTION.md`
- `docs/reference/seedance-2-0-api-guide.md`
- `docs/reference/seedance-face-consent-api-guide.md`
- `docs/reference/Venice_api_LLM_info.md`
- `docs/archives/README.md`
- `scripts/dev-tools/README.md`
- `docs/BUG_HUNTING_AGENT_PROMPT.md`

Some are intentionally internal/reference-only, but that classification is not consistently recorded.

### Impact

Important developer or API documentation exists but is difficult to locate from `DOCS_INDEX.md` or README.

### Required correction

- Add user/developer-relevant documents to `DOCS_INDEX.md`.
- Mark internal agent prompts and raw references as internal/noncanonical.
- Add front matter: `status`, `owner`, `validatedCommit`, `supersededBy`, and `audience`.

---

## VF-SCAN-20260716-015 — Stale source comments reference nonexistent or renamed contracts

**Severity:** P2  
**Status:** Verified  
**Area:** Code documentation

### Evidence

- `src/config/tabs.ts:11` instructs maintainers to update root `CHANGELOG.md`; no root changelog exists in the archive. The large changelog present is under `docs/audits/Records/CHANGELOG.md`, which is historical/noncanonical.
- `src/stores/chat-store.ts:891` references `flushAllPendingSavesForTests`; the exported function is `flushAllPendingSaves`.
- `src/components/video/video-view.tsx:102-106` says completed video keeps the upstream `downloadUrl` and does not save bytes. The desktop background-task manager now writes completed audio/video bytes to app-managed media storage and returns a durable `venice-media://<sha256>` URL.

### Impact

Future agents may reintroduce old behavior or update the wrong document/function.

### Required correction

Update comments to the current contract and add a lightweight verifier for known retired paths/symbols.

---

## VF-SCAN-20260716-016 — Storage orphan cleanup is analysis-only

**Severity:** P2  
**Status:** Verified as intentionally partial  
**Area:** Data maintenance

### Evidence

Storage-maintenance logic supports orphan analysis/dry-run reporting, but not a fully implemented destructive cleanup flow with transaction, rollback, and user confirmation.

### Impact

Long-lived installations may accumulate detached blobs or stale references. The UI appears to avoid falsely claiming deletion, so this is a missing maintenance capability rather than deceptive behavior.

### Required correction

Before adding deletion:

- Produce a deterministic reference graph.
- Require preview and explicit confirmation.
- Quarantine before permanent deletion.
- Exclude active background tasks, drafts, sync outbox records, recovery backups, and imported source files still referenced by projects/research.
- Add rollback and interrupted-cleanup recovery tests.

---

## VF-SCAN-20260716-017 — Feature status lacks one generated single source of truth

**Severity:** P2  
**Status:** Verified architecture issue  
**Area:** Product configuration

### Evidence

Feature availability is distributed across:

- tab registry;
- model type definitions;
- provider registry;
- adapter route guards;
- model capability maps;
- settings badges;
- status diagnostics;
- verification scripts;
- documentation/roadmap statements.

The provider mismatch is a concrete manifestation of this duplication.

### Impact

A feature can be visible, documented, and badge-enabled while its underlying route is unsupported.

### Required correction

Introduce a generated capability manifest that records:

- feature ID;
- UI visibility;
- route/IPC owner;
- supported runtime(s);
- model source;
- provider support;
- safety policy;
- persistence contract;
- test/verifier owner;
- release status.

Generate badges, diagnostics, and contract tests from this manifest.

---

## VF-SCAN-20260716-018 — Several production modules have no detected incoming source imports

**Severity:** P3  
**Status:** Candidate; requires dynamic-import verification before deletion  
**Area:** Dead/redundant code

A static relative-import graph identified zero incoming production references for candidates including:

- `src/components/CollapsibleSection.tsx`
- `src/components/ModelRefreshButton.tsx`
- `src/components/StatusBlock.tsx`
- `src/components/icons.tsx`
- `src/components/workflows/workflow-node.tsx`
- `src/config/defaultConfig.ts`
- `src/config/defaultThemes.ts`
- `src/hooks/useThemeLifecycle.ts`
- `src/lib/stream.ts`
- `src/research/agent/citationBuilder.ts`
- `src/research/index.ts`
- `src/services/ingestion/index.ts`
- `src/utils/markdown.tsx`
- `src/utils/mediaModelSpecs.ts`

Entry points, declarations, tests, and dynamically loaded modules were excluded where identifiable.

### Important example

`src/components/workflows/workflow-node.tsx` has its own tests and scripts, but current production workflow graph rendering is routed through Playground's workflow preview. Tests may therefore prove a component that is no longer shipped.

### Required correction

For each candidate:

1. Search static, alias, lazy, dynamic, and barrel imports.
2. Check package scripts and documentation.
3. Classify as entry point, public API, test fixture, future module, or dead code.
4. Delete only after production bundle/source-map confirmation.
5. Remove orphan tests and docs with the implementation.

---

## VF-SCAN-20260716-019 — Large modules need bounded decomposition

**Severity:** P3  
**Status:** Verified maintenance risk  
**Area:** Architecture

The files listed in Section 2.3 combine UI, orchestration, validation, storage, and transport concerns. This raises regression risk and makes isolated test ownership difficult.

### Required correction

Prioritize decomposition by churn and boundary value, not line count alone:

- `desktopBridge.ts` → domain-specific bridges (`chat`, `media`, `sync`, `characters`, `settings`, `system`).
- `CharacterEditor.tsx` → form sections, validation controller, import/export actions, preview, version history.
- `chat-store.ts` → conversation CRUD, save scheduler, stream state, migration, selectors.
- `gallery-view.tsx` / `media-inspector.tsx` → query/filter, selection, lineage, export, metadata panels.
- `server.ts` → routing, proxy transport, safety, health, configuration.

Require behavior-preserving tests before extraction.

---

## VF-SCAN-20260716-020 — IPC/bridge surface is difficult to audit manually

**Severity:** P3  
**Status:** Verified maintenance risk; no security defect found  
**Area:** Electron IPC

### Evidence

- `electron/preload.ts`: 693 lines.
- `src/services/desktopBridge.ts`: 1,270 lines.
- Static string scanning found hundreds of channel-like literals across preload, bridge, and handler sources.
- Security tests and sandbox settings pass, but manual parity review is expensive.

### Required correction

- Define a typed channel manifest per domain.
- Generate preload exposure types and validation stubs from the manifest where practical.
- Add parity verification: every exposed channel has one handler; every handler is intentionally exposed or main-only.
- Keep filesystem, shell, credentials, and crypto main-owned.

---

## VF-SCAN-20260716-021 — Direct dependency maintenance is pending

**Severity:** P3  
**Status:** Verified  
**Area:** Dependencies

`npm outdated` reported 30 packages with available updates. Current npm audit reports zero known vulnerabilities.

Examples of bounded patch/minor candidates include React, Tailwind, Vitest, Electron 42.x, electron-builder, and electron-updater. Major migrations include ESLint 10, Express 5, Vite 8, TypeScript 7, pdfjs 6, and Electron 43.

### Required correction

- Apply patch/minor updates in small domain batches.
- Isolate Electron, Vite, TypeScript, ESLint, Express, and PDF.js major upgrades.
- Require build, full CI, packaging, updater, and platform smoke tests for each major batch.
- Do not bulk-upgrade the entire graph.

---

## VF-SCAN-20260716-022 — Advanced fallback providers remain deliberately unimplemented

**Severity:** P3  
**Status:** Confirmed deferred scope  
**Area:** Missing features

The following requested fallback providers are represented as unavailable/deferred or return no adapter:

- Replicate
- AWS Bedrock
- Google Vertex AI
- Azure OpenAI
- Hugging Face

Cohere exists in the provider type/adapter surface but has no fallback model catalog entries. Other implemented adapters are primarily chat-only.

### Required correction

Keep them fail-closed until each has:

- secure credential schema;
- endpoint allowlist;
- model discovery/fallback manifest;
- request/response normalization;
- streaming support where applicable;
- media/blob handling for non-chat output;
- cost/rate-limit/error mapping;
- settings/status/diagnostic integration;
- contract and security tests.

---

## VF-SCAN-20260716-023 — Advanced sync-provider and key-rotation scope remains deferred

**Severity:** P3  
**Status:** Confirmed deferred scope  
**Area:** Backup & sync

Manual encrypted backup/import and encrypted folder-sync architecture are substantial and pass their repository verifier. The following remain future scope:

- WebDAV provider
- S3-compatible provider
- hosted/provider sync adapters
- live sync-set key rotation across all objects/devices
- scheduled provider-key rotation

This is consistent with a local-first staged roadmap and should not be treated as a current defect unless product claims imply availability.

### Required correction

Keep UI/status language explicit: implemented, experimental, or unavailable. Do not expose credential forms for nonfunctional providers.

---

## VF-SCAN-20260716-024 — Build output is within budget but near principal-chunk thresholds

**Severity:** P3  
**Status:** Verified  
**Area:** Frontend performance

The two largest principal renderer chunks are approximately 502.49 KiB and 511.67 KiB against a 600 KiB budget. The build passes, but remaining headroom is limited.

### Required correction

- Track chunk growth per feature/PR.
- Confirm large lazy tabs remain lazy.
- Split heavy editors, syntax/rendering dependencies, and media tooling by interaction boundary.
- Measure cold startup and tab activation in packaged builds, not only bundle size.

---

# 6. Previous High-Risk Findings Reconciled Against This Snapshot

The following earlier issues are largely remediated and should not be copied into a new work order as if still proven:

| Prior issue | Current snapshot status |
|---|---|
| Image edit/upscale/background-remove sent unsupported request keys | Canonical media request adapter exists; related tests/verifiers pass |
| Image edit used deprecated model field/base model | Current adapter/capability logic appears corrected and tested |
| Music retrieve used `{ id }` and expected `audio_url` | Current retrieval uses model + queue ID and handles binary completion |
| Video discarded queue `download_url` | Queue download URL is preserved and VPS completion path exists |
| Completed media stored as truncated task data URLs | Main process persists durable media and exposes `venice-media://<sha256>` |
| Character greeting unreachable in empty chat | Explicit character empty-state/greeting behavior is present and chat tests pass |
| Local characters excluded by slug-only binding | Local-character metadata paths are implemented |
| Raw character avatar URLs used everywhere | Shared `CharacterAvatar` is used in the hub and key chat/history surfaces |
| Negative prompt silently dropped | Focused image/negative-prompt behavior is present and tests pass |
| Workflows lacked graph visualization | Workflow visualization is integrated through Playground/preview surfaces |
| Toasts disappeared on tab changes | Global toaster/task-to-toast bridge exists at app level |
| UI sound feedback absent | Configurable UI sound controller and asset packs exist |
| TTS replies absent | Chat TTS bridge/player and desktop cache paths exist |

These conclusions are source/test based; paid live-provider behavior still requires manual external QA.

---

# 7. Feature Coverage Matrix

`Implemented` means the source, routes, stores, and/or tests are present. It does not mean live paid operations were executed in this sandbox.

| Feature | Status | Audit note |
|---|---|---|
| Standard chat | Implemented | Broad store/hook/UI tests; streaming and persistence architecture present |
| Character chats | Implemented | Hosted/local distinction, greetings, character-specific state, avatar component |
| Chat history | Implemented | Dedicated history tab and sidebar/history views |
| Message editing | Implemented/covered in chat surface | Validate manually with streamed and character messages |
| Model selection | Implemented | Tab-aware model types and provider model integration |
| Model privacy/context metadata | Implemented | Model selection and context budgeting logic present |
| Context usage/compaction | Implemented | Compiler/budget/state paths and tests exist |
| Image generation | Implemented | Model-aware UI and request policy tests |
| Image edit | Implemented | Prior contract drift appears remediated |
| Upscale | Implemented | Fixed-route adapter and policy tests present |
| Background removal | Implemented | Fixed route and binary output handling present |
| Media Studio | Implemented | Lineage, tagging, export, persistence; music defects remain |
| Video generation | Implemented | Background task, durable storage, restart-oriented metadata; live QA required |
| Music generation | Implemented with defects | Duplicate save and MIME/extension defects remain |
| TTS/transcription | Implemented | Audio Studio and chat TTS paths present |
| Embeddings | Implemented for Venice | Fallback-provider embedding support is not implemented |
| Prompt library | Implemented | Verifier and tests pass |
| Scene Composer | Implemented | Reference resolver and verifier pass |
| Research/Jina/browser | Implemented | Network hardening and UI/service tests pass; live source QA remains |
| Characters hub | Implemented | Hosted/local/favorites/recent and ST Card actions |
| RP Studio | Implemented | Character/scenario tooling and test surface |
| ST Character Card V1/V2/PNG | Implemented | Import/export/security/migration tests |
| Workflow templates | Implemented | Visual preview/playground integration; static orphan workflow node candidate remains |
| Toast notifications | Implemented | App-level toaster and background-task bridge |
| Loading animation assets | Partial | Major generation surfaces use shared indicator; not universal |
| UI sound packs | Implemented | Configurable controller/assets |
| Encrypted manual backup/import | Implemented | Backup/sync verifier passes; docs version stale |
| Encrypted sync folder | Implemented/advanced | Source and verifier present; real two-device QA outstanding |
| WebDAV/S3 sync | Deferred | Not implemented |
| Fallback providers | Partial | Several chat adapters; advertised capability mismatch; multiple providers deferred |
| Diagnostics/status | Implemented | Verifier passes; external signed/runtime evidence remains |
| Signed macOS/Windows release | Unverified | Explicit release blocker |
| Accessibility matrix | Unverified | Screen reader, high zoom/DPI, full keyboard, reduced motion require manual evidence |

---

# 8. Documentation and Redundancy Audit

## 8.1 Canonical truth problem

The repository has three competing kinds of material:

1. Current work ledger (`ROADMAP.md`).
2. Session/history ledger (`summary_of_work.md` and missing archive target).
3. Numerous immutable audits/remediation reports.

The intended model is sound, but commit binding and link integrity are insufficient. Historical success statements currently coexist with a failing current gate.

## 8.2 Exact duplicates

Only two exact Markdown duplicate groups were found:

- `CLAUDE.md` and `GEMINI.md` — likely intentional tool-discovery pointers.
- `assets/branding/NOTICE.md` and `public/assets/branding/NOTICE.md` — likely intentional source/runtime asset duplication.

`.cursorrules` and `.windsurfrules` are also intentionally parallel tool-specific files.

No broad exact-copy purge is recommended.

## 8.3 Semantic redundancy

The larger issue is repeated narrative evidence:

- Deep scans
- Remediation TODOs
- Remediation reports
- Intended-feature verification
- Bug-hunt summaries
- Work orders
- Session logs
- Historical audit packages

Each should have explicit lifecycle metadata and a single canonical index.

## 8.4 Broken historical links

Several files under `docs/audits/Records/` contain stale relative paths. Because this directory is historical and may be local/ignored, the preferred solution is to exclude it from default source handoffs and classify it, not to spend release time repairing every archived narrative link.

---

# 9. Security Review

## 9.1 Positive verified controls

- Browser windows/views use `contextIsolation: true`.
- Renderer `nodeIntegration` is disabled.
- Sandbox and `webSecurity` are enabled.
- Window creation/navigation is constrained.
- Private/LAN/loopback URL controls and DNS-rebinding protections are tested.
- File, shell, secure storage, media persistence, backup crypto, and provider secrets remain main-process owned.
- API keys are stored via secure storage in desktop mode.
- Logs and diagnostics apply secret/path redaction.
- Safety guard enforcement passes across renderer transport, Electron IPC, server, research orchestration, and providers.
- Archive secret scan identified only classified test fixtures.
- npm audit reports zero vulnerabilities.

## 9.2 Security conclusions

No P0/P1 exploitable Electron boundary defect was verified. The main risk areas are future drift caused by the large IPC surface, provider expansion, and historical evidence that may cause an agent to make unsafe assumptions.

## 9.3 External security/release proof still required

- Signed/notarized macOS install/update.
- Signed Windows install/update and SmartScreen behavior.
- Keychain/Credential Manager behavior in packaged builds.
- Code-signing and updater verification.
- Paid API operations without credential leakage.
- Two-device sync conflict/recovery/wrong-passphrase testing.

---

# 10. Prioritized Remediation Plan

## Phase A — Immediate release-gate repair

1. Fix the missing `docs/archives/session-history-pre-2026-07-11.md` authority or remove its stale reference.
2. Fix both `LEGAL.md` links.
3. Expand Markdown verifier roots and add an actual-repository test.
4. Re-run `verify:markdown-links` and `verify:contracts`.
5. Generate a current-commit validation manifest; stop inheriting pass claims from older commits.

## Phase B — User-facing correctness

1. Replace provider `supportedTypes` with one endpoint-level capability manifest.
2. Disable every badge/model/fallback path not backed by an adapter.
3. Make music save idempotent by queue ID across auto-save, manual save, remount, and restart.
4. Preserve audio MIME/format and derive correct filenames/extensions.
5. Add focused provider-capability and music regression tests.

## Phase C — Handoff and documentation hygiene

1. Change clean archive generation to tracked-file/explicit-opt-in semantics.
2. Add report front matter and commit binding.
3. Update `data-export-format.md` and exact package-version assertions.
4. Index current developer/reference docs; classify internal agent prompts.
5. Move or exclude noncanonical `docs/audits/Records/` from default handoffs.
6. Correct stale source comments.

## Phase D — Performance and architecture

1. Convert main logger to queued asynchronous writes.
2. Decompose `desktopBridge`, `CharacterEditor`, `chat-store`, gallery, scene composer, and server in behavior-preserving slices.
3. Generate/verify typed IPC parity.
4. Establish per-chunk growth budgets and packaged startup/tab-switch benchmarks.
5. Resolve zero-incoming production module candidates.

## Phase E — External release validation

1. Run signed/notarized macOS clean install/update.
2. Run signed Windows clean install/update.
3. Execute paid chat, image, edit, upscale, background removal, video, music, TTS, transcription, embeddings, and research operations.
4. Validate task continuation across tabs, renderer reload, and application restart.
5. Run two-device encrypted sync, conflicts, tombstones, wrong-passphrase, corrupted packet, partial-write, and recovery scenarios.
6. Complete keyboard, screen-reader, high-zoom/high-DPI, reduced-motion, theme, sound, and long-generation QA.

---

# 11. Acceptance Criteria

The next release candidate should not be approved until:

- [ ] `npm run verify:markdown-links` passes against every first-class root and docs Markdown file.
- [ ] `npm run verify:contracts` passes on the exact candidate commit.
- [ ] Validation evidence records exact commit, clean/dirty state, platform, Node/npm versions, command results, and artifact hashes.
- [ ] Every provider capability shown in UI has a functioning adapter, compatible model entry, status check, and test.
- [ ] Unsupported provider modalities are hidden or explicitly marked unavailable.
- [ ] A completed music queue creates exactly one Media Studio item across auto-save/manual-save/remount/restart.
- [ ] MP3, WAV, and FLAC retain correct MIME type and extension through playback, direct download, gallery export, and bundle export.
- [ ] Default clean archives contain only tracked/approved files plus declared metadata.
- [ ] Current backup/export documentation matches `package.json` and emitted runtime metadata.
- [ ] Main-process logging is benchmarked or converted to nonblocking queued writes.
- [ ] Signed platform artifacts and updater paths receive external manual evidence.
- [ ] Paid multimodal operations and restart recovery are verified.
- [ ] Two-device sync and accessibility matrices are verified.

---

# 12. Agent-Ready Work Checklist

## Release contracts

- [ ] Resolve the missing `docs/archives/session-history-pre-2026-07-11.md` link without fabricating historical content.
- [ ] Fix `LEGAL.md` links to root `SECURITY.md` and `docs/RELEASE/release.md`.
- [ ] Make the Markdown verifier discover all first-class root Markdown files.
- [ ] Add an actual-repository pass test for the Markdown verifier.
- [ ] Run and record `npm run verify:markdown-links` and `npm run verify:contracts`.

## Provider capability contract

- [ ] Inventory every implemented provider endpoint in `electron/services/providerAdapters.ts`.
- [ ] Replace broad modality badges with endpoint-level implemented capabilities.
- [ ] Generate Settings badges and fallback model filters from the same capability source.
- [ ] Remove audio support from Groq UI until an audio adapter exists.
- [ ] Remove image support from Fireworks UI until an image adapter exists.
- [ ] Restrict Google Gemini UI to implemented chat/vision-input behavior until media/embeddings routes exist.
- [ ] Resolve Mistral embeddings and Anthropic vision semantics explicitly.
- [ ] Add table-driven advertised-capability-to-route tests.

## Music/media correctness

- [ ] Make manual music save check durable Media Studio state by queue ID.
- [ ] Use one shared idempotent save function for video and music.
- [ ] Persist completed audio MIME type/format in `MediaItem`.
- [ ] Generate download/export extensions from MIME type.
- [ ] Add MP3/WAV/FLAC round-trip tests.
- [ ] Add auto-save then manual-save duplicate regression tests.
- [ ] Add remount/restart deduplication tests.

## Documentation governance

- [ ] Add commit/status/audience/supersession metadata to reports.
- [ ] Mark prior remediation validation as historical evidence for its exact commit.
- [ ] Update `docs/data-export-format.md` for the current release line.
- [ ] Assert backup `appVersion` equals `package.json` version.
- [ ] Add current developer/reference docs to `DOCS_INDEX.md` or mark them internal.
- [ ] Correct stale comments in tabs, chat save scheduling, and video persistence.
- [ ] Establish historical report retention and archive policy.

## Archive hygiene

- [ ] Build default source archives from tracked files plus explicit approved additions.
- [ ] Exclude ignored local audit records by default.
- [ ] Add an ignored-sentinel archive test.
- [ ] Record every explicitly included nontracked file in extract metadata.
- [ ] Preserve secret scanning and dirty-repository refusal behavior.

## Performance/architecture

- [ ] Replace synchronous per-line main-process logging with an asynchronous bounded queue.
- [ ] Add logger stress/responsiveness tests.
- [ ] Split `desktopBridge.ts` by domain while retaining narrow APIs.
- [ ] Split large UI/store modules along tested boundaries.
- [ ] Add IPC exposure/handler parity verification.
- [ ] Verify and remove or classify zero-incoming production modules.
- [ ] Monitor principal chunk growth and packaged startup/tab activation.

## Release QA

- [ ] Complete signed/notarized macOS install/update QA.
- [ ] Complete signed Windows install/update QA.
- [ ] Run paid multimodal generation and persistence tests.
- [ ] Run application-restart recovery for video/music tasks.
- [ ] Run two-device encrypted sync conflict/recovery scenarios.
- [ ] Run screen-reader, keyboard, high-zoom/high-DPI, reduced-motion, theme, and sound QA.

---

# 13. Commands Executed

Representative commands executed during this audit included:

```bash
npm ci --ignore-scripts
npm run lint:eslint
npx tsc -p tsconfig.json --noEmit
npx tsc -p tsconfig.electron.json --noEmit
npm run build
npm run verify:contracts
npm run verify:backup-sync
npm run verify:dist
npm run test:ci
npm run test:ui:layout
npm run test:ui:research
npm run test:ui:chat
npm run test:ui:media
npm run test:ui:image
npm run test:ui:settings
npm outdated --json
```

Additional static analyses covered:

- file/type/directory inventory;
- exact Markdown duplicate hashing;
- Markdown link graph;
- relative-import incoming-edge graph;
- source marker and stale-reference searches;
- feature and prior-finding reconciliation;
- archive behavior and extract metadata;
- large-file/module review.

---

# 14. Audit Limitations

- The sandbox had no external network access.
- The Electron runtime binary could not be downloaded after lifecycle scripts were disabled; this prevented one Electron-importing script test from loading in the aggregate chain.
- No live Venice, Jina, or fallback-provider API request was made.
- No signed installer was produced or installed.
- No graphical packaged-app walkthrough, screen-reader session, or multi-device sync exercise was performed.
- The source archive omits `.git`, so per-file tracked status could not be independently reconstructed.
- Static zero-incoming import analysis cannot prove dead code where aliases, dynamic imports, code generation, or external consumers are involved.

These limitations are explicitly separated from verified repository defects.

---

# 15. Final Assessment

Venice Forge `3.0.0-beta.1` is not a hollow or partially scaffolded application. Most intended product areas are implemented, many earlier API-contract and character defects have been corrected, and the security/testing foundation is substantial.

The dominant remaining risk is **contract truthfulness**: duplicated capability definitions, historical validation claims, broad docs, and archive contents can disagree with the current executable tree. The immediate work should therefore be narrowly focused:

1. Restore a green current-commit release contract.
2. Make provider capability claims match actual adapter routes.
3. Correct the remaining music catalog/format defects.
4. Bind validation evidence to exact commits.
5. Complete external signed, paid-operation, accessibility, and multi-device proof.

After those items, the repository should move from repeated broad audits to smaller, commit-bound regression and release evidence cycles.
