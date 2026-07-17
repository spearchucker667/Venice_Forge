# Venice Forge Deep Scan — 2026-07-16 22:47:49 Snapshot

## 1. Executive Verdict

**Audited archive:** `Venice_Forge-clean-20260716-224749.zip`  
**Source branch:** `main`  
**Source commit:** `8cd4ffdcb5ba166e48f8721469ed1feeceda561f`  
**Application version:** `3.0.0-beta.1`  
**Runtime contract:** Node `>=22.13.0 <23`, npm `>=10`  
**Audit runtime:** Node `v22.16.0`, npm `10.9.2`

### Release assessment

The latest update is **materially better** than the 18:39 snapshot. It closes the previously reproduced Markdown-contract failure, legal-link drift, provider capability overstatement, music duplication, audio-extension mislabeling, ignored-file archive leakage, synchronous logging hot path, audit-document sprawl, and principal-bundle pressure.

It is **not release-ready**. This scan verified four P1 issues:

1. Workflow output deduplication leaks across independent workflow runs and can silently suppress later actions.
2. Workflow Research actions navigate to an invalid tab ID and are normalized to Chat.
3. The canonical `test:unit:stores` shard does not terminate when all 41 store files run together, blocking `test:unit` and `test:ci` in this environment even though partitioned groups pass.
4. Normal Electron shutdown discards promises from bridge shutdown, sync-watcher shutdown, and log flushing; queued state can be lost during ordinary quit.

No P0 remote-code-execution, raw-key exposure, plaintext sync, or confirmed destructive data-loss defect was found by static inspection and executable tests.

### Finding count

| Severity | Count | Meaning |
|---|---:|---|
| P0 | 0 | Immediate security or destructive data-loss blocker |
| P1 | 4 | Release blocker or high-impact correctness/durability defect |
| P2 | 7 | Major reliability, accessibility, documentation, or maintainability issue |
| P3 | 5 | Deferred feature, bounded cleanup, or architectural debt |
| **Total** | **16** | Confirmed findings and explicit deferred scope |

---

## 2. Scope and Method

The scan covered:

- Electron main process, preload, IPC handlers, secure storage, custom protocols, navigation restrictions, background tasks, sync, logging, and shutdown.
- React renderer, tab registry, Zustand stores, chat, image, video, music, characters, RP Studio, research, workflows, privacy, settings, status, and media persistence.
- Venice and fallback-provider adapters, capability declarations, model catalogs, request routing, and binary media handling.
- Build, lint, TypeScript, test orchestration, contract verifiers, packaging scripts, dependency state, and bundle budgets.
- README, legal/security/privacy documents, roadmap/status documents, design documentation, operational agent files, historical reports, archive policy, broken links, stale references, and exact duplicates.
- Delta against `Venice_Forge-clean-20260716-183918.zip`.

Methods included:

- Deterministic archive inventory and hash comparison.
- Source inspection with file/line evidence.
- Production build and bundle-budget validation.
- Direct ESLint and both TypeScript compiler pipelines.
- Server, Electron, ingestion, UI, workflow, store, media, chat, research, settings, and changed-area tests.
- Static contract verification and security-boundary checks.
- Direct runtime reproductions for workflow output suppression and invalid tab normalization.
- Approximate relative-import graph and exact-file hash scan.

This was a source-level and automated audit. It did not spend money on provider requests, perform signed/notarized release installation, use a second physical machine, or complete the headed accessibility/theme/manual matrix.

---

## 3. Snapshot Inventory and Delta

### 3.1 Repository inventory

| Metric | Value |
|---|---:|
| Content files | 1,164 |
| Content directories | 109 |
| Archive size | ~27 MB |
| TypeScript/TSX under `src/` and `electron/` | 815 |
| Test files | 368 |
| Markdown files checked by current link verifier | 102 |
| Total Markdown files including extract metadata context | 104 |
| Approximate source lines under `src/` and `electron/` | 156,535 |

The archive’s own `_REPO_EXTRACT_METADATA/EXTRACT_INFO.txt` confirms a clean `main` worktree at `8cd4ffd` and clean-repo-zip script version `v4`.

### 3.2 Delta from the 18:39 snapshot

| Change class | Count |
|---|---:|
| Added | 3 |
| Removed | 67 |
| Changed | 63 |
| Generated comparison patch | 8,148 lines |

Important additions:

- Restored `docs/archives/session-history-pre-2026-07-11.md`.
- Retained the prior audit report and evidence manifest under a bounded audit directory.

Important removals:

- Large sets of redundant/stale audit records.
- Multiple source modules previously identified as production-unreachable.
- Obsolete alternate workflow-node UI and associated tests.

Important changes:

- Endpoint-granular provider capability registry.
- Music media deduplication and MIME-aware filenames.
- Async batched logger.
- Tracked-file-only clean ZIP generation.
- Broader Markdown link coverage.
- Electron 43 / Vite 8 / Express 5 toolchain migration.
- Updated PDF.js, ESLint, React hooks plugin, globals, dotenv, and proxy middleware.

---

## 4. Validation Results

### 4.1 Passed checks

| Check | Result |
|---|---|
| `npm ci` | Passed; 842 packages installed |
| npm vulnerability audit | **0 vulnerabilities** |
| Direct ESLint | Passed with zero warnings |
| Renderer TypeScript | Passed |
| Electron TypeScript | Passed |
| Production build | Passed |
| Bundle budget | Passed; all principal and vendor chunks below enforced limits |
| Markdown links | Passed; 102 Markdown files checked |
| Roadmap-current verifier | Passed |
| Release-metadata verifier | Passed |
| Server tests | 59/59 passed |
| Electron tests | 51 files, 687/687 passed |
| Ingestion tests | 9 files, 65/65 passed |
| Workflow core tests | 8 files, 104/104 passed |
| Layout/accessibility UI | 14 files, 95/95 passed |
| Chat UI | 76/76 passed |
| Media Gallery UI | 63/63 passed |
| Image UI | 19/19 passed |
| Research UI | 38/38 passed |
| Settings UI | 17/17 passed |
| Changed-area focused suite | 8 files, 62/62 passed |

The Electron suite includes secure storage, IPC validation, provider adapters, bridge lifecycle, background media tasks, generated media persistence, backup cryptography, sync identity, sync outbox, sync apply queue, profile purge, custom protocol, CSP, navigation, and research-browser policy coverage.

### 4.2 Canonical store-test shard does not terminate

Command:

```bash
npm run test:unit:stores
# vitest run src/stores --no-file-parallelism
```

Observed behavior:

- Assertions progress normally.
- The run stops producing output after a subset of passing files.
- It did not terminate within a 15-minute allowance.
- Running the observed 20-file partition separately passed: 20 files / 507 tests.
- Running the remaining 21-file partition separately passed: 21 files / 220 tests.
- Running all 41 files together reproduced the non-termination.

This is an aggregate-process lifecycle/state-leak defect, not a failing assertion. It blocks `test:unit`, `test:ci`, and any release command depending on them.

### 4.3 Contract aggregate environment limitation

`verify:contracts` passed all static documentation, release, safety, theme, network, Venice API, CI, agent-doc, image-policy, native-dialog, and WebContentsView gates. It reached `verify:provider-adapters`, where four suites and 33 tests passed, but one script suite attempted to download Electron’s runtime binary and failed because outbound artifact download was unavailable in the audit sandbox.

The same provider adapter code passed inside the isolated Electron suite. This specific failure is classified as an **audit-environment limitation**, not a verified repository defect. The provider verifier should nevertheless avoid a runtime download during an otherwise source-only contract check where possible.

### 4.4 Build output

Principal generated assets were comfortably within current budgets:

- Main application chunk: ~306 KB raw.
- Documents vendor: ~497 KB raw.
- PDF.js vendor: ~425 KB raw.
- React vendor: ~183 KB raw.
- XYFlow vendor: ~126 KB raw.

The prior near-threshold bundle finding is resolved.

---

## 5. Confirmed P1 Findings

## VF-SCAN-20260717-001 — Workflow output deduplication leaks across independent runs

**Severity:** P1  
**Status:** Reproduced

### Evidence

`src/services/workflowRunner.ts:31` defines process-global mutable state:

```ts
const globalEmittedOutputs = new Set<string>();
```

`createWorkflowRunPlan()` consults and mutates that global set at lines 60–65. If a prior workflow used an `outputKey`, a later independent workflow with the same key is skipped before its action is emitted.

Direct reproduction:

```json
{
  "first": { "actions": 1, "outputs": ["shared"] },
  "second": { "actions": 0, "outputs": [] }
}
```

Both workflows were valid, distinct workflow IDs with one prompt step and the same output key.

### Impact

- Later workflows can silently lose actions and outputs.
- Behavior depends on process history and run order.
- Restarting the renderer may make the defect disappear temporarily.
- Users receive no warning because the step is skipped with `continue`.

### Required correction

- Move the emitted-output set inside `createWorkflowRunPlan()` so it is scoped to one plan.
- Decide whether duplicate output keys within one compiled workflow are invalid or should be deterministically renamed/merged.
- Prefer compile-time duplicate detection with an explicit warning/error.
- Never skip the action solely because an output-key collision occurred.

### Required tests

- Two independent workflows with the same output key both emit actions.
- Re-running the same workflow produces the same plan.
- Duplicate keys within one workflow follow the documented policy.
- Test order does not affect output.

---

## VF-SCAN-20260717-002 — Workflow Research actions navigate to Chat

**Severity:** P1  
**Status:** Reproduced; current test asserts the defect

### Evidence

`src/services/workflowRunner.ts:54` maps:

```ts
case "research": tabId = "research"; break;
```

The canonical tab registry in `src/config/tabs.ts:18–45` contains `search`, not `research`; Research is registered at line 86 as:

```ts
{ id: 'search', label: 'Research', ... }
```

Unknown tab IDs normalize to `chat` in `normaliseTab()` at `src/config/tabs.ts:115–120`, and `src/stores/settings-store.ts:207` applies that normalization when workflow UI calls `setActiveTab()`.

Direct reproduction:

```json
{ "research": "chat", "search": "search" }
```

`src/services/workflowRunner.test.ts:70–85` currently expects the invalid value `research`, so the suite passes while preserving broken behavior.

### Impact

- Running a Research workflow step opens Chat instead of Research.
- The action label and target appear correct, masking the routing failure.
- The canonical tab registry is bypassed by a free-form string mapping.

### Required correction

- Map workflow target `research` to canonical tab ID `search`.
- Type `WorkflowRunAction.tabId` as `TabId`, not `string`.
- Centralize workflow-target-to-tab mapping and validate every mapping against `TAB_ID_SET`.
- Remove unsafe `as Tab` casts in the handoff path.

### Required tests

- Every workflow target resolves to a canonical tab ID or `undefined`.
- Research target resolves to `search` and activates Research.
- Unknown mappings fail during compilation/testing rather than falling back to Chat.

---

## VF-SCAN-20260717-003 — Canonical store test shard does not terminate

**Severity:** P1  
**Status:** Reproduced

### Evidence

`package.json` defines:

```json
"test:unit:stores": "vitest run src/stores --no-file-parallelism"
```

The command did not finish after 15 minutes under the declared Node 22 runtime. Explicitly passing all 41 store files also stalled. Partitioned execution passed all 727 tests:

- Group A: 20 files, 507 tests.
- Group B: 21 files, 220 tests.

The store suite contains several module-scoped fake-timer regimes and long-lived store/background mechanisms. Individual cleanup appears sufficient in isolation but not across the entire worker lifecycle.

### Impact

- `npm run test:unit` cannot advance beyond stores.
- `npm run test:ci` cannot complete deterministically.
- Hosted runners may consume their full timeout with no failed assertion.
- A passing historical count cannot substitute for the current command’s exit status.

### Required correction

1. Reproduce in CI with process diagnostics and current lockfile.
2. Add `afterEach`/`afterAll` cleanup for fake timers, pending timeouts, intervals, subscriptions, BroadcastChannels, object URLs, store persistence listeners, and chat-save debounce state.
3. Use Vitest hanging-process/open-handle diagnostics where available.
4. If the issue is a Vitest worker limit/regression, split `test:unit:stores` into deterministic bounded shards as an immediate release-gate fix, then retain a smaller cross-store integration shard.
5. Add an outer timeout that fails with diagnostics rather than hanging indefinitely.

### Acceptance

```bash
npm run test:unit:stores
npm run test:unit
npm run test:ci
```

must all terminate successfully on Linux, macOS, and Windows Node 22 runners.

---

## VF-SCAN-20260717-004 — Async shutdown cleanup is discarded during normal quit

**Severity:** P1  
**Status:** Confirmed by inspection; durability risk

### Evidence

The logger now uses an asynchronous queue and exposes `flushLogs(): Promise<void>` at `electron/services/logger.ts:176–180`.

Normal quit handling at `electron/main.ts:409–413` does not await cleanup:

```ts
app.on("will-quit", () => {
  stopBridgeServer();
  void stopSyncWatcher();
  void flushLogs();
});
```

`stopBridgeServer()` returns `Promise<void>`. `stopSyncWatcher()` is async and performs sync identity/journal/watcher cleanup. `will-quit` is not prevented while those promises are pending.

The signal path is also described as bounded but has no timeout, and it calls `stopBridgeServer()` without awaiting it.

### Impact

- Queued log lines can be lost on ordinary quit.
- Sync watcher/journal finalization can be interrupted.
- Bridge socket shutdown can race process exit or next launch.
- Signal cleanup can hang indefinitely despite the “bounded” comment.

### Required correction

- Add a single idempotent shutdown coordinator.
- Intercept `before-quit`, prevent default once, await bridge shutdown, sync shutdown, background-task persistence, and log flush under a bounded timeout, then call `app.exit()`.
- Await `stopBridgeServer()` in signal handling.
- Record timeout/failure safely without recursively depending on the logger being flushed.
- Add lifecycle tests proving cleanup completion, timeout fallback, and exactly-once behavior.

---

## 6. Confirmed P2 Findings

## VF-SCAN-20260717-005 — Active documentation and agent pointers describe the old runtime stack

**Severity:** P2

Current nonhistorical files still state Electron 42, Vite 6, or Express 4 after the package migrated to Electron 43.1.1, Vite 8.1.5, and Express 5.2.1:

- `README.md:38` — Electron 42 badge.
- `docs/ABOUT.md:106–108` — Vite 6, Electron 42, Express 4.
- `CLAUDE.md:13` — Electron 42.
- `GEMINI.md:13` — Electron 42.
- `.cursorrules` and `.windsurfrules` — Electron 42.
- `docs/reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md:28` — old stack while still referenced by the current roadmap.
- `docs/BUG_HUNTING_AGENT_PROMPT.md` includes an old runtime finding and is not clearly snapshot-bound inside the file.

`verify:release-metadata` passes because it does not semantically compare active stack claims to `package.json`.

**Required:** update active documents, mark retained reports with source commit/toolchain snapshot, and add a verifier for canonical stack facts in README, ABOUT, and agent pointer files.

---

## VF-SCAN-20260717-006 — Roadmap/status authority overstates closure for the current tree

**Severity:** P2

`docs/ROADMAP.md` says only one externally blocked release-evidence item remains. `docs/summary_of_work.md` says every locally actionable July 16 finding was completed and the current dependency-migration tree passes the complete test surface.

This scan reproduced three locally actionable correctness/test defects and one shutdown durability risk in the current archive. The new defects were not necessarily present in the earlier audit, but the status language is absolute and not tied to a freshly executed current-commit result artifact.

**Required:**

- Reopen current work for the four P1 findings.
- Bind validation claims to commit, lockfile hash, command, platform, and exit status.
- Generate current validation status from machine-readable results rather than prose-only closure claims.
- Do not use historical aggregate counts as current release evidence.

---

## VF-SCAN-20260717-007 — Current workflow documentation references removed implementation files

**Severity:** P2

- `docs/design/REPOSITORY_TREE.md:236` still lists `workflow-node.tsx` and its test as part of the current workflow visual editor, but those files were removed.
- `src/lib/workflow-engine.ts:150` and `:253` still refer to `WorkflowNode` in implementation comments.
- A historical/superpowers work order retains the old test command. Historical retention is acceptable, but current design and source comments are not.

**Required:** update the repository tree to describe Workflow Templates plus the Playground-owned graph, and replace `WorkflowNode` comments with the current renderer/ownership abstraction.

---

## VF-SCAN-20260717-008 — Character save overlay violates the documented loading accessibility contract

**Severity:** P2

`docs/design/LOADING_AND_SURFACE_CONTRACT.md:9` requires CSS spinners to expose an accessible name or adjacent status text.

`src/components/rp-studio/CharacterEditor.tsx:1271–1274` renders an overlay containing only `<Spinner>`. `src/components/ui/spinner.tsx` emits an unlabeled SVG without `role`, title, `aria-label`, or `aria-hidden` paired with live text.

**Impact:** screen-reader users receive no saving status; the overlay is visual-only.

**Required:** add a `role="status"` live region with “Saving character…” text, make decorative SVGs `aria-hidden`, and add an accessibility test. Audit all standalone spinner usages against the contract.

---

## VF-SCAN-20260717-009 — Fallback-provider model catalogs remain static and time-dependent

**Severity:** P2  
**Status:** Accepted current architecture, but operational limitation remains

The new capability registry correctly fails closed and no longer advertises unsupported modalities. However, non-Venice implemented providers use `modelDiscovery: 'static'` and `src/config/provider-models.ts` is a hard-coded catalog without live freshness proof.

**Impact:** provider model IDs can become unavailable or obsolete without the app detecting catalog drift until a request fails.

**Required:** add optional live discovery where providers support it, cached `fetchedAt`/source metadata, stale-state UI, provider-specific validation, and a controlled fallback when discovery is unavailable. Static catalogs should carry a reviewed date and fail with a precise “catalog may be stale” diagnostic.

---

## VF-SCAN-20260717-010 — Large modules remain high-risk change surfaces

**Severity:** P2

Largest production units include:

- `src/components/rp-studio/CharacterEditor.tsx` — 1,278 lines.
- `src/services/desktopBridge.ts` — 1,270 lines.
- `src/stores/chat-store.ts` — 1,037 lines.
- `src/components/gallery/gallery-view.tsx` — 1,004 lines.
- `src/components/chat/chat-view.tsx` — 936 lines.
- `src/components/scenes/SceneComposerView.tsx` — 929 lines.
- `src/components/gallery/media-inspector.tsx` — 926 lines.
- `electron/services/configService.ts` — 910 lines.
- `src/services/veniceClient/fetch.ts` — 893 lines.
- `electron/services/secureStore.ts` — 880 lines.
- `electron/services/syncFolderWatcher.ts` — 876 lines.
- `electron/services/researchBrowserServer.ts` — 847 lines.

This is not proof of a runtime bug, but it raises regression and audit cost. The two workflow defects demonstrate that passing suites can miss cross-module contract drift.

**Required:** decompose by domain boundary without broad rewrites; preserve public contracts; add contract tests before extraction.

---

## VF-SCAN-20260717-011 — Desktop bridge and IPC surfaces remain manually difficult to audit

**Severity:** P2

`src/services/desktopBridge.ts` remains a 1,270-line renderer bridge, while Electron IPC handler tests exceed 1,700 lines. The repository has strong validation, but the surface is large enough that channel ownership, argument validation, profile scoping, and return-type parity are difficult to prove manually.

**Required:** generate a typed channel manifest from one source of truth, split bridge modules by domain, enforce renderer/main parity at compile time, and generate a human-readable IPC inventory used by security review.

---

## 7. P3 / Deferred Findings

## VF-SCAN-20260717-012 — Unreferenced generation barrel remains

**Severity:** P3

An approximate relative-import graph found only one meaningful production candidate with no incoming import: `src/components/generation/index.ts`. Its exports are imported directly from their concrete modules elsewhere, so the barrel appears unnecessary. `src/assets.d.ts` is a declaration entry and `envPermissionsService.ts` is imported by `server.ts`, so they are not dead code.

**Required:** remove the barrel or adopt it consistently; add a lightweight unused-module check with explicit entrypoint allowlists.

---

## VF-SCAN-20260717-013 — Several fallback providers are intentionally unimplemented

**Severity:** P3 / deferred product scope

Fail-closed deferred providers:

- Replicate.
- AWS Bedrock.
- Google Vertex AI.
- Azure OpenAI.
- Hugging Face.
- Cohere.

The UI correctly marks them unavailable and accepts no keys or traffic. This is no longer a misleading-capability defect, but it remains missing requested product scope.

---

## VF-SCAN-20260717-014 — Advanced sync transports and live key rotation remain deferred

**Severity:** P3 / deferred product scope

Implemented direction includes encrypted backup/import and encrypted local sync-folder transport. Explicitly absent:

- Native WebDAV provider.
- Native S3-compatible provider.
- Live in-place sync-set key rotation.
- Scheduled provider-key rotation.

Current documentation is explicit and fail-closed. Two-device destructive QA remains required before a release-grade sync claim.

---

## VF-SCAN-20260717-015 — Storage orphan cleanup remains analysis-only

**Severity:** P3 / accepted safety boundary

The app intentionally identifies orphan references without destructive automated deletion because quarantine/rollback semantics are not complete. This is safer than a premature cleanup feature but remains incomplete maintenance scope.

**Required before enabling deletion:** preview, dependency graph, quarantine, rollback, profile scoping, sync/tombstone awareness, media-blob reference counting, and interruption recovery.

---

## VF-SCAN-20260717-016 — External release proof remains incomplete

**Severity:** P3 product/release completion; P1 gate for public signed release

Still missing by explicit roadmap admission:

- Signed and notarized macOS clean install/update evidence.
- Signed Windows installer/portable evidence.
- Paid Venice generation matrix.
- Physical two-device sync convergence/destructive recovery.
- Headed screen-reader, high-zoom, theme, reduced-motion, and sound QA.
- Valid release signing identities and repository secrets.

These are not source defects, but release claims must remain bounded until evidence exists.

---

## 8. Prior 18:39 Finding Reconciliation

| Prior ID | Latest status |
|---:|---|
| 001 Markdown contract broken | **Fixed.** Missing archive restored; 102 Markdown files pass. |
| 002 Legal links broken/outside scanner | **Fixed.** Legal links corrected; scanner now covers repository Markdown. |
| 003 Provider capabilities overstated | **Fixed.** Canonical endpoint-granular registry; deferred providers fail closed. |
| 004 Music duplicate save | **Fixed.** Queue/result dedup added in UI and catalog persistence. |
| 005 WAV/FLAC labeled MP3 | **Fixed.** MIME type propagated; extension utility used by download/export. |
| 006 Audit claims not current-bound | **Partially improved.** Prior audit is commit-bound, but current status prose is again contradicted by live findings. |
| 007 Markdown unit tests did not prove repo | **Fixed.** Live repository is exercised; direct verifier passes. |
| 008 Clean archive copied ignored history | **Fixed.** Git tracked-file manifest used when available. |
| 009 Backup docs said 2.1.2 | **Fixed.** Version bound to package/current schema. |
| 010 Synchronous logger blocked main | **Hot path fixed; shutdown regression remains.** Async queue is not awaited on normal quit. |
| 011 Static provider catalog | **Still present by design.** Capability truth fixed; model freshness remains limited. |
| 012 Loading replacement not universal | **Explicitly dispositioned.** Contract limits shared animation to semantic long-running work; accessibility violation remains in CharacterEditor. |
| 013 Audit/report sprawl | **Substantially fixed.** 67 files removed; retained audit bounded. |
| 014 Useful docs undiscoverable | **Substantially fixed.** DOCS_INDEX expanded. |
| 015 Stale source comments | **Partially fixed.** WorkflowNode references and stack claims remain stale. |
| 016 Storage orphan cleanup analysis-only | **Deferred safely.** |
| 017 No generated feature-status SSoT | **Accepted future architecture.** Current prose-only status still drifts. |
| 018 Production-unreachable modules | **Substantially fixed.** 14 modules removed; one unused generation barrel remains. |
| 019 Large modules | **Open maintenance debt.** |
| 020 IPC/bridge surface | **Open maintenance debt.** |
| 021 Dependency maintenance | **Major migration completed.** Zero audit vulnerabilities; some transitive deprecation notices remain. |
| 022 Advanced fallback providers | **Deferred and now accurately unavailable.** |
| 023 Advanced sync/key rotation | **Deferred and documented.** |
| 024 Build chunks near limits | **Fixed/improved.** All chunks comfortably pass enforced budgets. |

---

## 9. Feature Coverage and Missing Scope

| Product area | Static/automated status | Remaining limitation |
|---|---|---|
| Chat and streaming | Broad implementation and tests | Paid live-model and packaged restart QA still needed |
| Character chats | Hosted/local identity, greetings, cached avatars, dedicated surfaces present | Manual packaged visual QA |
| Image generation/tools | Contract adapters and tests present | Paid edit/upscale/background removal matrix needed |
| Video | Queue URL preservation, binary/download persistence, restart task coverage present | Paid provider completion and expiry QA |
| Music/audio | Binary retrieval, durable media, MIME-aware download, dedup present | Paid MP3/WAV/FLAC generation QA |
| Media Studio | Persistence, tagging, export, bulk actions, lineage, projects tested | Large gallery modules; packaged large-library performance |
| Prompts | Store and UI coverage present | Live model compatibility/manual UX QA |
| Projects | CRUD/reference protection tested | Cross-profile and large-dataset headed QA |
| Research | Jina/generic providers, browser policy, ingestion and UI tests | Live authenticated provider and browser-content QA |
| RP Studio/ST cards | Extensive stores, codecs, hostile fixture tests, editor/library | CharacterEditor decomposition and saving-state accessibility |
| Workflows | Compiler, templates, engine, Playground graph | **Two current runner correctness bugs** |
| Embeddings | Venice implementation present | No fallback-provider embedding implementation |
| Themes/mesh | Token and reduced-motion contracts present | Headed dark/light/high-contrast and 100–400% zoom QA |
| Toasts/background jobs | Cross-tab persistent task architecture present | Aggregate lifecycle/manual restart QA |
| TTS/UI sounds | Preferences and bridge tests present | Manual device/output QA |
| Backup/import | Encryption, wrong-key, tamper, recovery tests present | Physical-machine destructive matrix |
| Sync folder | Identity, outbox, apply queue, conflicts/tombstones architecture present | Two-device convergence; WebDAV/S3 and live rotation deferred |
| Fallback providers | Together + chat providers accurately scoped | Several requested providers deferred; static catalogs |
| Diagnostics/security | Redaction, CSP, navigation, IPC, secure file tests | Signed packaged and OS-specific credential QA |

No hidden fully implemented first-party cloud account/backend was found. The app remains local-first and fail-closed for deferred sync/provider scope.

---

## 10. Documentation and Redundancy Audit

### 10.1 Positive changes

- Broken links are repaired.
- Link scanning now covers the repository instead of a narrow root list.
- Audit records were aggressively reduced.
- A retention/taxonomy policy exists.
- Backup/sync, privacy, threat model, provider interface, export format, and developer docs are indexed.
- Historical documents are generally separated from current authority.

### 10.2 Semantic drift

The link verifier proves path integrity, not factual integrity. Current stack claims disagree across README, ABOUT, ROADMAP, package metadata, and tool-discovery files. Add semantic checks for version and feature facts.

### 10.3 Exact duplicates

Exact duplicates include:

- `GEMINI.md` and `CLAUDE.md`.
- `.cursorrules` and `.windsurfrules`.
- Branding assets copied under both `assets/branding/` and `public/assets/branding/`.

The branding copies are plausibly intentional source/public deployment copies and should not be removed without build-path verification. Agent pointers are tool-discovery adapters, but duplicated stack text already drifted; generate them from one template or reduce them to minimal pointers to `AGENTS.md`.

### 10.4 Large retained history

`docs/archives/session-history-pre-2026-07-11.md` is ~11,089 lines. It restores a required canonical link, but it should remain clearly immutable/historical and excluded from current-status semantic scans.

---

## 11. Security and Privacy Assessment

### Verified positive controls

- Renderer does not receive raw API keys from main secure storage.
- Deferred provider credentials fail closed.
- IPC validation tests cover key boundaries.
- Navigation and custom protocol checks reject arbitrary paths/URLs.
- CSP and WebContentsView boundary verifiers pass.
- Character-card PNG hostile fixtures are tested.
- Backup crypto rejects wrong passwords, tampering, malformed envelopes, and invalid Base64.
- Sync identity rejects a different key.
- Profile purge has explicit partial-failure behavior.
- Logs redact secrets and now batch routine writes asynchronously.
- Generated media is persisted behind an app-managed protocol instead of large task data URLs.
- npm audit reports zero vulnerabilities.

### Remaining security/reliability risks

- Normal quit can interrupt async sync/log cleanup.
- Large IPC/bridge and secure-store modules remain costly to review.
- External signed-package, OS keychain, Windows Credential Manager, and two-device proof is absent.
- Static provider model metadata can drift and cause paid request failures, though it no longer overstates modalities.

No evidence was found that the update weakened `nodeIntegration`, CSP, endpoint allowlists, secure storage, or renderer filesystem isolation.

---

## 12. Architecture and Maintainability

### Strong areas

- Canonical tab registry.
- Endpoint-granular provider capabilities.
- Main-authoritative secure operations.
- Durable generated-media service.
- Object-level encrypted sync rather than raw database sync.
- Extensive verifier and test suite.
- Current bundle splitting and lazy-loaded heavy views.

### Weak areas

- Free-form string contracts still exist around workflow target/tab handoffs.
- Module-global state in a pure planner created history-dependent behavior.
- Test orchestration is too large for one store worker lifecycle.
- Large bridge/store/view modules dilute ownership.
- Status truth is still primarily prose rather than generated evidence.

---

## 13. Remediation Order

### Phase A — Immediate P1 release blockers

1. Scope workflow output-key tracking to a single run and add deterministic collision behavior.
2. Map Research workflow targets to canonical `search` and type tab IDs.
3. Fix or split the non-terminating store shard; make `test:ci` bounded and deterministic.
4. Implement one awaited, timeout-bounded Electron shutdown coordinator.

### Phase B — Truth and accessibility

5. Update README, ABOUT, agent pointers, and current verification report to Electron 43 / Vite 8 / Express 5.
6. Reopen the roadmap with the current findings and commit-bound evidence.
7. Correct repository-tree and WorkflowNode references.
8. Add accessible save status to CharacterEditor and audit standalone spinners.

### Phase C — Operational hardening

9. Add fallback catalog freshness/live discovery strategy.
10. Generate an IPC/channel manifest and split desktop bridge by domain.
11. Decompose CharacterEditor, chat store, gallery, sync watcher, and large main-process services incrementally.

### Phase D — Deferred product scope

12. Implement deferred fallback providers only with secure custody, capability parity, and live tests.
13. Implement WebDAV/S3 transports and live key rotation only after protocol/threat-model review.
14. Add safe orphan quarantine/rollback before destructive cleanup.
15. Complete signed, paid, two-device, and headed accessibility release evidence.

---

## 14. Acceptance Criteria

### Workflow

- Two independent workflow runs with the same output key both emit complete actions.
- Research workflow action activates canonical tab `search`.
- Every emitted `tabId` is statically typed and validated against `TAB_ID_SET`.
- Workflow tests fail if unknown tab IDs are introduced.

### Test gate

- `npm run test:unit:stores` exits successfully without external timeout.
- `npm run test:unit`, `npm run test:ui`, `npm run test:contracts`, and `npm run test:ci` terminate under Node 22 on all CI OSes.
- Test commands have bounded failure behavior and diagnostic output for open handles.

### Shutdown

- Normal quit awaits bridge, sync, task-state, and log cleanup.
- Cleanup is exactly once and bounded by a timeout.
- A forced fallback exit cannot hang indefinitely.
- Tests prove queued logs and sync journal writes are flushed before exit.

### Documentation

- Active docs and agent pointers match package stack versions.
- Current reports identify source commit and are labeled snapshot evidence.
- Current repository tree contains no references to removed production files.
- Release/status claims are generated or directly linked to current command results.

### Accessibility

- Every standalone spinner has an accessible label or adjacent live status.
- Character save overlay announces saving and completion/failure.
- Reduced-motion behavior remains intact.

---

## 15. Agent Implementation Checklist

### Workflow correctness

- [ ] Replace `globalEmittedOutputs` with run-local state inside `createWorkflowRunPlan`.
- [ ] Define and test duplicate-output-key behavior within one workflow.
- [ ] Change Research target mapping from `research` to canonical `search`.
- [ ] Type workflow `tabId` as `TabId` and remove unsafe casts.
- [ ] Add a table-driven test covering every workflow target and canonical tab.

### Test orchestration

- [ ] Reproduce the 41-file store-shard hang in CI with the current lockfile.
- [ ] Audit every store test using fake timers for guaranteed restoration and pending-timer cleanup.
- [ ] Close BroadcastChannels, subscriptions, persistence listeners, object URLs, and background pollers after tests.
- [ ] Split the store suite into bounded deterministic shards if a single-worker aggregate remains unstable.
- [ ] Add an outer timeout that produces open-handle diagnostics and fails rather than hanging.

### Shutdown durability

- [ ] Add an idempotent async shutdown coordinator.
- [ ] Await `stopBridgeServer`, `stopSyncWatcher`, task persistence, and `flushLogs`.
- [ ] Use `before-quit` plus a bounded timeout before final `app.exit`.
- [ ] Add tests for normal quit, signal quit, repeated quit, cleanup failure, and timeout fallback.

### Documentation

- [ ] Update Electron/Vite/Express versions in README and ABOUT.
- [ ] Remove duplicated stack facts from tool pointer files or generate them from one template.
- [ ] Snapshot-bind `INTENDED_FEATURE_VERIFICATION_2026-07-15.md` or refresh it.
- [ ] Correct `REPOSITORY_TREE.md` workflow file list.
- [ ] Remove stale `WorkflowNode` comments from current source.
- [ ] Reopen ROADMAP entries for this scan and link current evidence.
- [ ] Add a semantic stack/version verifier sourced from `package.json`.

### Accessibility

- [ ] Add a live saving status to CharacterEditor.
- [ ] Mark decorative spinner SVGs `aria-hidden` or give status containers proper roles/labels.
- [ ] Audit all standalone spinner usages against `LOADING_AND_SURFACE_CONTRACT.md`.
- [ ] Add Testing Library accessibility assertions.

### Architecture

- [ ] Remove or standardize the unused generation barrel.
- [ ] Add provider catalog timestamps/freshness state.
- [ ] Generate an IPC/channel inventory from typed definitions.
- [ ] Decompose high-change modules in bounded, test-first phases.

### Release evidence

- [ ] Run the full current-commit CI matrix after P1 fixes.
- [ ] Produce signed/notarized macOS and signed Windows artifacts.
- [ ] Run paid image/video/music/TTS/chat workflows with explicit authorization.
- [ ] Run physical two-device sync convergence and recovery tests.
- [ ] Complete screen-reader, 200–400% zoom, theme, reduced-motion, and sound QA.

---

## 16. Final Assessment

This update successfully remediates most of the previous scan and materially improves repository hygiene, provider truthfulness, media correctness, dependency currency, and build output. The remaining release blockers are narrower but substantive: workflow plans are history-dependent, Research workflow navigation is broken, the canonical store suite does not terminate as one shard, and async shutdown durability is not guaranteed.

Correct those four P1 items before treating the tree as locally complete. Then update active documentation and validation authority so the next audit can distinguish current proof from historical closure without another semantic reconciliation pass.
