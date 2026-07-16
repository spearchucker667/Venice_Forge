# Venice Forge 3.0 Beta Deep Scan

**Snapshot:** `Venice_Forge-clean-20260716-013926.zip`  
**Observed package version:** `3.0.0-beta.1`  
**Audit date:** 2026-07-16  
**Audit type:** Static repository inspection, documentation reconciliation, dependency installation, build/lint/typecheck execution, targeted verifier/test execution, and architecture review.

---

## 1. Executive Verdict

The snapshot is a broad, materially implemented beta rather than a shell. Core Chat, Character Chats, Image Studio, Media Studio, Research, RP Studio, encrypted backup/sync-folder support, themes, provider adapters, persistent task handling, privacy/status surfaces, sounds, reply TTS, toasts, and most prior API-contract remediation are present with substantial automated coverage.

It is **not release-ready as-is**.

Three issues should block a beta promotion or public release:

1. **The model-catalog status architecture can falsely report configured models as unavailable.** Typed model requests update a global status object, and the diagnostic check compares every saved modality against whichever partial catalog was loaded. The canonical in-memory model cache is also cleared on each typed request.
2. **Deleting a profile leaves its profile-scoped encrypted Conversation Vault on disk.** Renderer purge documentation still describes the old non-profile-scoped vault architecture, but the current main-process vault stores profiles separately.
3. **The canonical static contract gate is red.** `docs/DOCS_INDEX.md` links to a missing archive file, so `verify:contracts:static` and the aggregate contract gate cannot pass.

The repository also has significant documentation/version drift, conflicting sync/privacy language, a routed workflow-template surface that does not match the advertised visual canvas, global serial test execution that did not finish within five minutes, missing sync developer documentation, a partial design-system rollout, and a set of likely orphaned production modules.

### Severity Summary

| Priority | Count | Meaning |
|---|---:|---|
| P0 — Release blocker | 3 | Correct before beta promotion or release packaging claims |
| P1 — High | 7 | Correct before declaring feature-complete 3.0 beta |
| P2 — Medium | 8 | Technical debt, UX inconsistency, or maintenance risk |
| P3 — Low / hygiene | 4 | Cleanup and governance improvements |

---

## 2. Repository Inventory

| Metric | Observed |
|---|---:|
| Files inspected, excluding `node_modules`, `dist`, and `.git` | 1,250 |
| TypeScript files | 701 |
| TSX files | 204 |
| Markdown files | 127 |
| Markdown files under `docs/` | 109 |
| Production TS/TSX files | 522 |
| Test TS/TSX files | 378 |
| Production TS/TSX lines | ~100,800 |
| Canonical visible tabs | 19 |
| Legacy tab aliases | 4 |
| Package version | `3.0.0-beta.1` |

### Canonical Product Surfaces

The current tab registry defines:

- Conversation: Chat, Character Chats, History.
- Generate: Image Studio, Media Studio, Prompts, Scene Composer, Audio Studio, Music Studio, Video Studio, Embeddings, Research, Characters.
- Build: RP Studio, Workflows, Playground.
- System: Privacy, Config, Status.
- Compatibility aliases: `gallery`, `models`, `batch`, and `diagnostics`.

Evidence: `src/config/tabs.ts:18-94`.

---

## 3. Executable Validation Results

### Passed

| Command / gate | Result |
|---|---|
| `npm ci --ignore-scripts` | Passed; 853 packages installed; npm reported 0 vulnerabilities |
| `npm run typecheck` | Passed |
| `npm run lint:eslint` | Passed |
| `npm run build` | Passed |
| `npm run verify:bundle-budget` | Passed |
| `npm run test:server` | Passed; 59 tests |
| `npm run test:electron` | Passed; 50 files / 682 tests |
| `npm run test:ingestion` | Passed; 9 files / 65 tests |
| `npm run verify:backup-sync` | Passed |
| `npm run verify:storage-privacy` | Passed; 5 files / 41 tests |
| `npm run verify:storage-policy` | Passed |
| `npm run verify:status-diagnostics` | Passed |
| `npm run verify:media-studio-power-tools` | Passed |
| `npm run verify:model-aware-recipes` | Passed |
| `npm run verify:prompt-library` | Passed |
| `npm run verify:scene-composer` | Passed |
| `npm run verify:scene-references` | Passed |
| `npm run verify:rp-studio-polish` | Passed; 6 files / 140 tests |
| Character-card V2/PNG/security verifiers | Passed |
| `npm run verify:workflow-templates` | Passed; core 8 files / 104 tests and UI 2 files / 12 tests |
| API docs, CI contract, agent docs, image policy, work-order, native-dialog, network-boundary and WebContentsView static checks | Passed before the documentation-link failure |

### Failed or Incomplete

| Command / gate | Result | Classification |
|---|---|---|
| `npm run verify:contracts:static` | Failed at `verify:markdown-links` because `docs/DOCS_INDEX.md:102` targets missing `docs/archives/session-history-pre-2026-07-11.md` | Confirmed repository defect |
| Aggregate `verify:contracts` | Blocked by the same static failure | Confirmed release-gate failure |
| `npm run verify:provider-adapters` | Its 4 suites / 33 tests passed, then Electron binary acquisition failed because dependencies were installed with scripts disabled and the sandbox could not download Electron | Audit-environment limitation, not a confirmed product defect |
| `npm run test:ci` | Did not complete within 300 seconds | Test architecture / CI scalability risk |
| `npm run test:unit:services` | Did not complete within 300 seconds; 24 of 82 service files had run | Test architecture / CI scalability risk |
| Full `npm test -- --reporter=dot` | Did not complete within 300 seconds; no failure had printed before timeout | Test architecture / CI scalability risk |
| Signed installer QA | Not executed | Unverified |
| Paid Venice/Jina/provider operations | Not executed | Unverified |
| Two-machine sync-folder QA | Not executed | Unverified |
| Headed cross-platform accessibility/theme/sound QA | Not executed | Unverified |

### Bundle Snapshot

The bundle-budget verifier passed. Largest observed assets included:

| Asset | Approximate size |
|---|---:|
| PDF worker | 1.31 MiB |
| Main application chunk A | 495.38 KiB |
| Main application chunk B | 490.72 KiB |
| PDF vendor | 326.24 KiB |
| Math vendor | 255.05 KiB |
| React vendor | 193.34 KiB |
| CSS | 127.67 KiB |
| Sync packet importer | 124.18 KiB |
| Settings view | 122.21 KiB |

The bundle is under its current caps, but two main chunks are already close to 500 KiB and should be tracked during further feature additions.

---

## 4. P0 Release Blockers

## VF-2026-0716-001 — Partial Model Catalogs Produce False Global Status Warnings

**Severity:** P0  
**Areas:** Model status, header, settings, diagnostics, startup responsiveness

### Evidence

`src/hooks/use-models.ts:14-42`:

- Normalizes a requested modality.
- Calls `/models?type=<modality>` for typed views.
- Calls `replaceCanonicalModels(liveModels)` with only that result set.
- Calls the global runtime store with only the current type and its IDs.

`src/services/diagnosticsService.ts:162-180`:

- Iterates every entry in `settings.selectedModels`.
- Warns when any saved model ID is absent from `catalog.liveModelIds`.
- Does not verify that the relevant modality was loaded.

`src/components/layout/header.tsx:39-43`:

- Chat requests only text models.
- Tabs with a view-owned selector or no model type call `useModels(undefined)`, which requests all models.
- The behavior depends on whichever tab is currently mounted.

`src/stores/model-catalog-runtime-store.ts:50-78` merges ID lists for typed loads, but it does not track which model types have been authoritatively loaded and cannot distinguish a partial catalog from a complete one during diagnostic validation.

### Failure Scenario

1. The app starts on Chat.
2. Chat requests `type=text`.
3. The status service checks saved image, video, music, TTS, and embedding selections against the partial text model list.
4. A valid configured non-text model is reported as absent even though the API key is active and the model has never been checked in that session.

This closely matches the reported “model is not loaded despite an active API key” behavior.

### Required Correction

- Replace the single global `liveModelIds` validation contract with either:
  - `modelsByType: Record<ModelType, Set<string>>` plus `loadedTypes`, or
  - a normalized global catalog whose completeness is explicitly represented.
- Validate a selected model only when its corresponding type has successfully loaded.
- Represent unknown/unloaded separately from unavailable/offline.
- Do not let an unrelated tab transition downgrade model health.
- Add a startup hydration state that distinguishes API-key readiness from model-catalog readiness.

### Required Tests

- Text-only load does not warn about valid saved image/video/music selections.
- Image load can warn only about an image selection.
- Complete catalog load authoritatively validates all supported modalities.
- Catalog failure with cached data yields stale, not unavailable.
- Tab switching does not change status from healthy to false-warning.
- Active API key plus partial catalog is shown as “catalog partially loaded,” not “model missing.”

### Acceptance Criteria

- No selected model is marked unavailable until that model’s modality has been loaded successfully or a complete catalog has been loaded.
- Status count and health are deterministic regardless of active tab.

---

## VF-2026-0716-002 — Typed Model Fetches Clear the Canonical Cross-Modality Cache

**Severity:** P0  
**Areas:** Model metadata, capability resolution, pricing/privacy badges, status

### Evidence

`src/services/modelCatalogCache.ts:3-8`:

```ts
const canonicalModels = new Map<string, ModelInfo>();

export function replaceCanonicalModels(models: readonly ModelInfo[]): void {
  canonicalModels.clear();
  for (const model of models) canonicalModels.set(model.id, model);
}
```

Every typed call in `src/hooks/use-models.ts:30-42` invokes this replacement function with only the returned modality.

### Impact

After loading image models, previously loaded text/video metadata can disappear from the canonical cache; after returning to Chat, image metadata can disappear. This can cause inconsistent capability, context-length, privacy, and pricing lookups across views and can amplify the global status defect.

### Required Correction

- Introduce `mergeCanonicalModels(type, models)` for typed requests.
- Reserve a full clear/replace operation for a verified complete `type=all` response.
- Store type ownership for each cached model where API metadata is incomplete.
- Define cache invalidation by query type and fetch timestamp.
- Ensure fallback-provider models cannot erase live Venice metadata.

### Required Tests

- Loading text then image preserves both sets.
- Refreshing one type replaces only that type.
- A complete catalog replaces all live Venice records atomically.
- Offline-model filtering does not delete unrelated types.
- Pricing, privacy badges, and context lengths remain resolvable after tab changes.

---

## VF-2026-0716-003 — Profile Deletion Leaves Profile-Scoped Conversation Vault Data

**Severity:** P0  
**Areas:** Privacy, profile lifecycle, secure storage, Electron IPC

### Evidence

`src/services/profilePurge.ts:9-14` states that desktop filesystem chat history is keyed by conversation ID rather than profile ID and is intentionally not purged.

That statement is stale. `electron/services/conversationVault.ts:27-47` defines profile-specific directories and encryption IDs:

- Default profile under the base conversation directory.
- Other profiles under `conversations/profiles/<profileId>`.
- Profile-specific manifest, journal, memory index, record paths, and scoped encryption identifiers.

`src/components/settings/ProfilePanel.tsx:197-208` warns the user that desktop vault files may remain and invokes a renderer-orchestrated purge.

### Impact

A user can delete a profile, including credentials and renderer records, while its current encrypted conversations remain indefinitely. Encryption reduces casual exposure but does not satisfy user expectations for deletion, storage cleanup, or profile isolation. The stale documentation can also hide regressions in future profile-specific main-process stores.

### Required Correction

Create a typed main-process profile deletion transaction, for example:

```ts
profile:previewPurge
profile:purge
```

Main process should own deletion of:

- `conversations/profiles/<profileId>`.
- Profile-scoped vault manifest, journal, memory index, and records.
- Profile-scoped task state and sync enrollment where applicable.
- Profile provider/Venice/Jina credentials.
- Profile password verifier and related secure-store entries.

Renderer should continue purging renderer-owned stores through a narrow, explicit flow, but the final result must aggregate both sides and report partial failures.

Do not give the renderer direct filesystem paths or deletion capability.

### Required Tests

- Non-default profile deletion removes its vault directory and only that directory.
- Default profile cannot be purged accidentally.
- Invalid profile IDs are rejected.
- Symlink/path traversal cannot escape the conversation root.
- Partial deletion produces a redacted, actionable result.
- Deleted profile cannot rehydrate stale conversations after recreation.
- Profile A deletion does not affect Profile B.

---

## 5. P1 High-Priority Findings

## VF-2026-0716-004 — Canonical Documentation Gate Is Broken

**Severity:** P1, release-gate impact

`docs/DOCS_INDEX.md:102` links to:

```text
docs/archives/session-history-pre-2026-07-11.md
```

The file does not exist; `docs/archives/` contains only its README in this snapshot. This directly fails `verify:markdown-links`, then `verify:contracts:static`, then the aggregate contract gate.

### Correction

Choose one:

- Restore the intended archive with a clear historical banner, or
- Remove the entry and point to the actual retained session ledger/archive.

Then run:

```bash
npm run verify:markdown-links
npm run verify:contracts:static
npm run verify:contracts
```

Do not weaken the link verifier.

---

## VF-2026-0716-005 — Version and Release-Readiness Statements Are Inconsistent

**Severity:** P1

| File | Claim |
|---|---|
| `package.json` | `3.0.0-beta.1` |
| `AGENTS.md:5` | Version `2.1.2` |
| `LEGAL.md:107` | “currently v2.1.1” |
| `docs/ABOUT.md:30` | “fully stabilized under v2.1.2” |
| `docs/DEVELOPMENT/CONFIG.md:3` | “Last updated: 2.1.0” |
| `docs/reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md` | Audit of a specific 2.1.2-era commit/worktree |

The clean ZIP has no `.git` metadata, so exact-commit and hosted-check claims cannot be inherited by this snapshot.

### Correction

- Add one machine-readable release metadata source consumed by docs/verifiers.
- Remove “fully stabilized” language from an active beta unless supported by packaged/manual evidence.
- Make dated audit reports explicitly snapshot-bound and non-authoritative for later archives.
- Update legal/release docs through a version-sync verifier.
- Distinguish product version from document revision date.

### Acceptance Criteria

- `package.json`, About, agent guide, legal checklist, release docs, and in-app About show compatible version/status language.
- A clean archive never claims exact-commit validation without embedded provenance.

---

## VF-2026-0716-006 — Privacy, Sync, and Export Documentation Contradict Current Behavior

**Severity:** P1

### Contradictions

- `README.md:63` correctly documents manual encrypted backups and encrypted sync-folder support.
- `docs/ABOUT.md:25` says “There is no cloud sync or telemetry.”
- Root `PRIVACY.md:10` says the app does not sync local data to any external servers.
- `docs/legal/PRIVACY.md:60-61` is more precise: no Venice Forge-operated cloud service.
- `docs/FAQ.md:182-186` describes Config-tab JSON export/import, while the current product also contains encrypted `.vfbackup` export/import and Backup & Sync/Data & Storage surfaces.

### Risk

The current wording can be interpreted as a promise that no user data is ever copied to an external provider, which is false when a user explicitly chooses an iCloud/Dropbox/OneDrive/Syncthing-backed folder. It also obscures the difference between generic redacted JSON export and encrypted full backup.

### Correction

Adopt one precise product statement:

> Venice Forge has no first-party hosted sync service or mandatory cloud account. Optional encrypted backup and user-selected sync-folder features can write ciphertext into a folder managed by a third-party provider. API keys and secure-store secrets remain excluded by default.

Document these as separate operations:

1. Redacted portable JSON export, if retained.
2. Encrypted `.vfbackup` snapshot.
3. Encrypted sync-folder replication.
4. Diagnostics/privacy-summary export.

Include exact settings paths and destructive import safety behavior.

---

## VF-2026-0716-007 — Five Required Sync Documentation Deliverables Are Missing

**Severity:** P1

Present:

- `docs/backup-and-sync.md`
- `docs/security-model.md`
- `docs/sync-threat-model.md`
- `docs/data-export-format.md`

Missing from the stated local-first sync work order:

- `docs/privacy.md`
- `docs/sync-troubleshooting.md`
- `docs/developer/sync-architecture.md`
- `docs/developer/sync-testing.md`
- `docs/developer/sync-provider-interface.md`

The implementation appropriately labels direct WebDAV/S3-compatible providers and live in-place sync-key rotation as deferred. Those should remain deferred rather than being misrepresented as implemented.

### Correction

Create the five missing documents and link them from `docs/DOCS_INDEX.md`. Include:

- Main/renderer trust boundaries.
- Backup container and encrypted object packet schemas.
- Conflict/tombstone semantics.
- Sync watcher recovery and atomic-write behavior.
- Test fixtures and two-device simulation.
- Provider interface and credential custody for future WebDAV/S3-compatible adapters.
- Passphrase loss and new-sync-set recovery.
- Explicit non-goals and deferred features.

---

## VF-2026-0716-008 — Workflows UI Does Not Match the Advertised Visual Canvas

**Severity:** P1

### Evidence

- `src/config/tabs.ts:89` describes Workflows as “Chain models visually.”
- `README.md:99` calls the area “Workflows & Canvas.”
- `src/App.tsx:48-50,150` routes the Workflows tab to `WorkflowTemplatesView`.
- `src/components/workflows/workflows-view.tsx:393` contains an approximately 496-line React Flow-based `WorkflowsView` with no production references found by filename/symbol scan.

### Interpretation

One of two things is true:

1. The visual workflow canvas is a missing/regressed product feature, or
2. The product intentionally pivoted to template-based workflows and the old canvas plus marketing language are stale.

The current repository does not make that decision explicit.

### Required Product Decision

**Option A — Restore/merge the canvas**

- Route or integrate the React Flow editor.
- Ensure saved workflow templates and graph execution share one schema.
- Add migration, graph validation, keyboard/accessibility, and end-to-end tests.

**Option B — Formalize templates only**

- Rename the tab/subtitle and README to “Workflow Templates.”
- Remove or archive the orphan canvas implementation.
- Remove unused `@xyflow` bundle cost if no other use remains.

Do not continue advertising a visual canvas while routing only a list/detail template editor.

---

## VF-2026-0716-009 — Full Test Feedback Is Not Bounded or Reliably Completable

**Severity:** P1

`vitest.config.ts:27-29` globally sets:

```ts
fileParallelism: false,
pool: "forks",
testTimeout: 30000,
```

The repository has hundreds of test files. In the audit environment:

- Full CI test command exceeded 300 seconds.
- Service-only tests exceeded 300 seconds after 24 of 82 files.
- The full default test command exceeded 300 seconds without a summary.

This does not prove test failures, but it prevents a reliable full-suite verdict and creates slow developer/CI feedback.

### Correction

- Split Node, jsdom, Electron-main, server, and security suites into separate Vitest projects/configurations.
- Enable file parallelism for isolated suites.
- Keep only known shared-state suites serial.
- Add deterministic per-shard duration limits and slow-test reporting.
- Add open-handle detection and cleanup assertions.
- Run CI as named shards with an aggregate required check.
- Preserve a single local command that runs all shards with a final summary.

### Acceptance Criteria

- Each required CI shard has a documented upper bound.
- A full supported runner completes with a conclusive summary.
- No test relies on execution order unless explicitly marked and justified.

---

## VF-2026-0716-010 — Renderer IndexedDB Encryption Boundary Is Under-Explained

**Severity:** P1 security/documentation

`src/services/cryptoService.ts:28-73` creates a non-extractable AES-GCM key and stores the `CryptoKey` in a dedicated renderer IndexedDB database named `venice_forge_keys`. This protects against casual offline inspection of the data database, but it does **not** provide a strong boundary against malicious renderer code, XSS, a compromised same-origin execution context, or a debugger running as the same user: the renderer can ask Web Crypto to use the key.

The desktop Conversation Vault has a stronger main-process/OS-safe-storage boundary.

### Correction

- State the limitation explicitly in `PRIVACY.md`, `docs/legal/PRIVACY.md`, `docs/security-model.md`, and the sync threat model.
- Avoid describing renderer IndexedDB encryption as equivalent to OS-keychain-backed main-process storage.
- Consider a future main-process encryption service for high-value renderer stores, using narrow typed IPC and no raw key exposure.
- Preserve current AES-GCM data migration compatibility.

---

## 6. P2 Medium-Priority Findings

## VF-2026-0716-011 — Report Governance Still Creates Multiple “Current” Authorities

`docs/reports/README.md:5-19` says current operational truth lives in `summary_of_work.md`, `DOCS_INDEX.md`, and `ROADMAP.md`. However:

- `docs/reports/CANONICAL_REPORT_INDEX.md:5-16` labels multiple dated reports as “Current Authorities.”
- `docs/DOCS_INDEX.md:110-112` describes dated remediation reports as current evidence.
- The repository contains 127 Markdown files, including substantial audit/report history.

### Risk

Dated snapshot evidence can be mistaken for current implementation truth, especially after another clean ZIP is produced. This increases stale TODOs, version drift, duplicated conclusions, and agent confusion.

### Correction

- Limit current authority to:
  - `docs/ROADMAP.md`
  - `docs/summary_of_work.md`
  - `docs/DOCS_INDEX.md`
  - one current release-readiness report.
- Give every dated report a visible `HISTORICAL SNAPSHOT — NOT CURRENT STATE` banner unless it is the current release report.
- Move closed remediation reports under `docs/reports/historical/` or immutable audit packages.
- Require all open findings to have stable IDs reconciled into the roadmap.

---

## VF-2026-0716-012 — Likely Orphaned Production Modules and Compatibility Shims

A direct filename/symbol reference scan found zero production references outside the file itself for these candidates:

| Candidate | Approx. role |
|---|---|
| `src/components/AttachmentTray.tsx` | Attachment UI |
| `src/components/ImageActionModal.tsx` | Image action UI |
| `src/components/ImageGenerationPreview.tsx` | Image preview |
| `src/components/MemoryManagerModal.tsx` | Memory UI |
| `src/components/TabButton.tsx` | Legacy tab control |
| `src/components/VideoGenerationForm.tsx` | Video form |
| `src/components/VideoGenerationPreview.tsx` | Video preview |
| `src/components/workflows/workflows-view.tsx` | Visual workflow canvas |
| `src/hooks/use-models-mock.ts` | Mock model hook |
| `src/hooks/useNetworkStatus.ts` | Network status hook |
| `src/hooks/useSettingsPersistence.ts` | Settings persistence hook |
| `src/services/capabilityResolver.ts` | Provider capability resolver |
| `src/services/imageWorkflowService.ts` | Image workflow service |
| `src/utils/safePreviewUrl.ts` | Preview URL helper |

This is a heuristic, not proof of dead code. Dynamic imports, test-only imports, barrel exports, and verifier token checks must be examined before deletion.

Additional shims include:

- `src/components/SettingsView.tsx` re-export compatibility layer.
- `src/components/SearchScrapeView.tsx` wrapper with verifier-sensitive source tokens.

### Correction

- Build a TypeScript-aware production entrypoint reachability report.
- Classify each candidate as active, compatibility, test-only, planned, or dead.
- Delete dead code and associated tests/assets/dependencies in one controlled change.
- Replace source-token verifiers with behavior or import-graph assertions where possible.

---

## VF-2026-0716-013 — Generation Animation Replacement Is Incomplete

The custom generation animation registry is substantial and includes reduced-motion static fallbacks. It is used across Chat, Playground, TTS, Audio, Music, task center, Research, and RP flows.

Remaining older loading treatments include:

- Prompt Library text-only loading state.
- Scene Composer text-only loading state.
- Storage Privacy CSS spinner.
- Media toolbar `animate-spin` states.
- RP Studio spinners in Character Library, Persona Manager, Asset Gallery, RP Chat List, Character Editor, and Lorebook Manager.
- Some model pickers and Backup & Sync loading text.

### Correction

Define adoption rules:

- Use the animated character indicator for long-running generation/provider work.
- Use compact accessible spinners/skeletons for short metadata/list loads.
- Respect `prefers-reduced-motion` everywhere.
- Avoid cycling decorative GIFs for destructive, security, or error states where a static semantic indicator is clearer.

The requirement should be rewritten from “replace all loading animations” to a semantic loading-system contract; then migrate the remaining qualifying generation states.

---

## VF-2026-0716-014 — Mesh/Gradient Surface Design Is Only Partially Adopted

Positive implementation exists:

- `app-mesh-overlay`.
- `.mesh-surface`.
- `.soft-separator-x` and `.soft-separator-y` gradient pseudo-elements.
- Multiple shell and RP surfaces use them.

However, hundreds of `border-border`, hard `border-*`, and divider references remain. Examples include Image Studio, Backup & Sync cards, Audio/Music/Media controls, and older forms.

### Correction

Do not replace every control boundary. Establish a tokenized rule:

- Structural page/panel separation: gradient/soft separator.
- Interactive control boundary: visible solid border with accessible contrast.
- Selected/focus/error state: semantic outline/ring.
- Dense tables: restrained solid separators where scanning requires them.

Audit the main 19 tabs at dark/light/high-contrast themes and 100/200/400% zoom.

---

## VF-2026-0716-015 — “Archive Orphans” Is Listed as an Action but Cannot Execute

`src/services/storageMaintenance.ts:72-82` adds an “Archive Orphans” maintenance action when reference issues exist and marks it `dryRunOnly: true`. `applyMaintenanceAction` then returns a typed rejection at lines 122-135.

The code is honest internally, but surfacing an action-shaped control that cannot execute can confuse users.

### Correction

Choose one:

- Present it as “Analyze Orphans” with no destructive/action affordance, or
- Implement per-store archive semantics with preview, exact affected IDs, undo/safety backup, and tests.

Do not label it as a destructive maintenance command until execution exists.

---

## VF-2026-0716-016 — Provider Catalog Is Broader Than Implemented Adapters

Implemented/active provider support includes Venice plus Together, Groq, Fireworks, Google Gemini, Mistral, Anthropic, and Perplexity.

Explicitly unavailable/deferred providers include:

- Replicate.
- AWS Bedrock.
- Google Vertex AI.
- Azure OpenAI.
- Hugging Face.
- Cohere.

The UI and registry fail closed, which is correct. However, unreferenced placeholder modules remain under:

- `electron/services/providers/replicate.ts`
- `electron/services/providers/awsBedrock.ts`
- `electron/services/providers/googleVertex.ts`

### Correction

- Keep unavailable providers visibly labeled “Not implemented” rather than “disabled” or “temporarily unavailable.”
- Remove unreferenced placeholders or formalize them as compile-time adapter skeletons included in a provider-interface test.
- Keep credential inputs disabled and ensure settings import discards keys for unavailable providers.
- Do not count deferred providers in feature-completeness marketing.

---

## VF-2026-0716-017 — Large Monolithic Modules Increase Regression and Responsiveness Risk

Largest production files include:

| File | Lines |
|---|---:|
| `src/components/rp-studio/CharacterEditor.tsx` | 1,278 |
| `src/services/desktopBridge.ts` | 1,263 |
| `server.ts` | 1,098 |
| `src/stores/chat-store.ts` | 1,037 |
| `src/components/gallery/gallery-view.tsx` | 1,004 |
| `src/components/gallery/media-inspector.tsx` | 926 |
| `src/components/chat/chat-view.tsx` | 926 |
| `src/components/scenes/SceneComposerView.tsx` | 925 |
| `electron/services/configService.ts` | 910 |
| `src/components/image/image-view.tsx` | 897 |
| `src/services/veniceClient/fetch.ts` | 893 |
| `electron/services/secureStore.ts` | 880 |
| `electron/services/syncFolderWatcher.ts` | 876 |

Large files are not automatically defective, and the build passed. They do, however, concentrate state, rendering, side effects, and protocol code, making responsiveness regressions and review mistakes more likely.

### Correction

Prioritize measured decomposition:

- Profile React render commits in Chat, Sidebar, Image Studio, Character Editor, Gallery, and Settings.
- Add Zustand selectors that avoid broad-store subscriptions.
- Extract pure request/schema adapters from UI components.
- Split `desktopBridge.ts` by typed domain while preserving one preload API namespace.
- Split background watcher state machine from filesystem transport.
- Add bundle and render-duration baselines before/after refactors.

Do not perform cosmetic file splitting without reducing coupling or render work.

---

## VF-2026-0716-018 — Header Model Fetch Strategy Is Inconsistent and Potentially Wasteful

`src/components/layout/header.tsx:39-43` requests:

- A typed list for tabs whose selector lives in the header.
- The entire model list for tabs that own their selector or have no model type.

A tab with no model selector can therefore trigger a full model-catalog request merely because the global header is mounted. This contributes to inconsistent status transitions and unnecessary work.

### Correction

- Do not fetch models in the header when no header selector is rendered.
- Let a catalog coordinator or the owning view load the required type.
- Prefetch complete catalog only under an explicit strategy with cache timing and network-state rules.
- Ensure one query cannot overwrite another modality’s health/cache state.

---

## 7. P3 Hygiene Findings

## VF-2026-0716-019 — Exact Duplicate Agent/Editor Rule Files

Exact SHA-256 duplicates:

- `CLAUDE.md` and `GEMINI.md`.
- `.cursorrules` and `.windsurfrules`.
- `assets/branding/NOTICE.md` and `public/assets/branding/NOTICE.md`.

The branding notice duplication may be intentional for packaging. The agent/editor files are more maintainable as small pointers to one canonical source.

### Correction

- Keep `AGENTS.md` authoritative.
- Make model/editor-specific files minimal pointers plus only tool-specific exceptions.
- Add a verifier that prevents them from becoming independent policy copies.
- Document packaging copies explicitly rather than treating them as accidental duplicates.

---

## VF-2026-0716-020 — Agent Guide Is Hard-Coded to One Local Machine Path

`AGENTS.md:3-16` requires `/Users/super_user/Projects/Venice_Forge` and exits when the current directory differs. This is useful for the maintainer’s local agents but prevents portability for other contributors, CI, WSL, Windows, and clean review environments.

### Correction

Use repository discovery first:

```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
```

Allow an optional maintainer-only expected root through an environment variable. Keep the current path in a local, untracked bootstrap file rather than universal contributor policy.

---

## VF-2026-0716-021 — Root Debug Probes Remain in the Clean Snapshot

Present at repository root:

- `debug-webcrypto.cjs`
- `test_playwright.js`

The roadmap already treats these as cleanup candidates.

### Correction

- Move durable diagnostics under `scripts/diagnostics/` with ownership and usage docs, or delete them.
- Ensure no release archive includes ad hoc probes unless intentionally supported.

---

## VF-2026-0716-022 — README Terminology Can Reintroduce Old Image-Tool Confusion

`README.md:93` describes Image Studio as including “upscaling, enhancer controls.” Prompt enhancement appears to be a current feature, but the wording can be read as the obsolete upscale enhancer controls removed during the API-contract remediation.

### Correction

Use precise terms such as:

> Model-aware generation, prompt enhancement, image editing, background removal, and API-compliant 2×/4× upscaling.

---

## 8. Feature Implementation Matrix

| Area | Static implementation status | Test/gate status | Audit disposition |
|---|---|---|---|
| Chat streaming | Present | Broad unit/service coverage; full suite incomplete | Implemented; runtime paid QA still required |
| Per-chat model selection/persistence | Present | Model-aware tests/verifiers pass | Implemented, but global catalog/status bug can misreport availability |
| Context usage/length | Present in model selector and chat meter | Source/tests present | Implemented |
| Context truncation/compaction warning | Present in prompt compiler | Source/tests present | Implemented; user-controlled compaction UX should be separately verified |
| Private/anonymous model badges | Present in `ModelSelect` | Source evidence | Implemented when API metadata publishes privacy fields |
| Message editing/branching/regeneration | Present | Chat tests present | Implemented |
| Character Chats as separate UI | Present in canonical tab registry | Character chat tests/verifiers pass | Implemented |
| Hosted/local character greeting handling | Present after prior remediation | Character tests present | Statically implemented; manual QA still required |
| Character avatar cache resolver | Present and reused | Focused tests present | Implemented |
| Character Hub | Present | Character-card/RP verifiers pass | Implemented |
| Prompt Library | Present | Verifier passed | Implemented |
| Scene Composer | Present | Verifiers passed | Implemented |
| Image edit/upscale/background removal adapters | Present in canonical media request adapter | Image policy/model-aware gates pass | Prior drift appears statically remediated; live paid QA not performed |
| Media Studio persistence/tools | Present | Power-tools verifier passed | Implemented; packaged playback persistence still needs manual QA |
| Music/video durable queues | Present | Electron/background tests passed | Statically implemented; paid queue/restart QA not performed |
| Research/Jina/browser | Present | Ingestion and WebContentsView checks pass | Implemented; live external-provider QA not performed |
| RP Studio / ST cards | Extensive | Multiple verifiers and 140-test RP polish group pass | Implemented beta |
| Workflow templates | Present and routed | Workflow-template verifier passed | Implemented |
| Visual workflow canvas | Orphan implementation exists, not routed | No current routed UI proof | Missing, regressed, or stale—product decision required |
| Encrypted manual `.vfbackup` | Present | Backup/sync verifier passed | Implemented MVP |
| Encrypted sync folder | Present with watcher/conflict/tombstone code | Backup/sync tests pass | Implemented MVP; real two-machine QA pending |
| WebDAV/S3-compatible provider sync | Explicitly deferred | N/A | Not implemented; correctly non-claimed in README |
| Live sync-set key rotation | Explicitly deferred | N/A | Not implemented |
| Fallback providers | Seven active non-deferred providers plus Venice | Provider adapter tests passed before environment Electron step | Partially implemented; six providers explicitly deferred |
| Persistent toasts | Present | Notification tests/verifiers present | Implemented |
| UI sound packs | Present | Source/tests present | Implemented |
| Reply TTS | Present | Source/tests present | Implemented |
| Custom generation GIF system | Present | Registry/reduced-motion implementation present | Implemented but not universally adopted |
| Themes | 35 built-ins plus custom YAML/theme maker | Theme/contrast tests present | Implemented |
| Mesh/soft separators | Present | Broad static use | Partially adopted |
| Onboarding/legal/age gate | Present | Previous rendered checks documented | Implemented; current packaged/manual accessibility matrix unverified |
| Storage/privacy dashboard | Present | Verifier passed | Implemented; orphan archival remains analysis-only |
| Status/diagnostics | Present | Verifier passed | Implemented, but model health logic is defective |

---

## 9. Reconciliation Against the Local-First Sync Work Order

### Implemented Materially

- Manual encrypted `.vfbackup` export/import.
- Passphrase-based encryption and tamper/wrong-passphrase tests.
- Import preview/merge behavior.
- Secret exclusion defaults.
- Sync-folder watcher in Electron main process.
- Encrypted object packets rather than raw database sync.
- Tombstones and delete propagation logic.
- Conflict copies and deterministic conflict identity.
- Atomic/recoverable write handling.
- Device/sync identity support.
- Sync-folder status and settings UI.
- Main-process filesystem ownership.

### Still Missing or Deferred

- Five named documentation deliverables listed in VF-2026-0716-007.
- Advanced direct provider implementations such as WebDAV/S3/R2/B2/MinIO.
- In-place sync-set key rotation.
- Current two-machine manual QA evidence.
- Packaged recovery testing against provider conflict files and interrupted sync.
- A clear, current privacy statement differentiating first-party cloud from user-selected encrypted folders.

### Important Scope Note

The advanced provider and rotation items are legitimately future-phase work. They should remain explicitly deferred, with stable roadmap IDs and no UI that suggests immediate availability.

---

## 10. Reconciliation Against Prior API-Contract Drift Findings

The current repository contains canonical media request builders and retrieval normalizers. Static inspection indicates that the previously documented drift has been materially addressed:

- Image edit uses canonical request adaptation.
- Upscale is restricted to API-shaped scale/creativity controls.
- Background removal is treated as a fixed route.
- Audio retrieval includes model/queue identity and binary handling.
- Video queue/retrieve normalization and durable task infrastructure exist.
- Character empty-state and avatar resolver work is present.
- Dedicated Character Chats and Character Hub surfaces exist.

The applicable focused verifiers and Electron tests passed in this audit.

This is **not equivalent to live provider proof**. No paid image edit, upscale, background removal, audio, music, or video operation was executed against Venice in this environment. The release checklist must retain live paid-operation and packaged persistence QA.

---

## 11. Documentation Audit and Canonicalization Plan

### Current Strengths

- A documentation index exists.
- Security, legal, development, release, design, user, and testing docs are separated.
- Dated audit packages preserve evidence.
- The roadmap and session ledger are intended as current-state sources.
- Backup/sync and threat-model docs exist.

### Current Weaknesses

- Broken canonical index link.
- Multiple incompatible version/readiness claims.
- Privacy and sync language conflict.
- Export/import FAQ is incomplete.
- Dated reports are simultaneously historical and current authorities.
- Missing sync troubleshooting/developer docs.
- Hard-coded contributor path.
- Duplicate agent/editor instruction copies.

### Target Documentation Hierarchy

```text
README.md                         User-facing project overview
PRIVACY.md                        Concise current privacy statement
SECURITY.md                       Vulnerability and security boundary policy
LEGAL.md                          Legal/trademark/disclaimer summary
AGENTS.md                         Canonical agent/contributor automation rules

docs/DOCS_INDEX.md               Navigation only
docs/ROADMAP.md                  Only current open work
docs/summary_of_work.md          Recent execution ledger
docs/release-readiness.md        Current release evidence only

docs/user/...                    User procedures
docs/developer/...               Architecture and implementation contracts
docs/security/...                Threat models
docs/reports/historical/...      Immutable snapshot evidence
```

### Canonicalization Rules

- A dated report never becomes current merely because it is recent.
- Every open finding is copied to the roadmap under a stable ID.
- Closing a finding records the validating command and release version.
- Historical reports never contain active instructions without a banner.
- Version strings are generated or verified from one source.
- Every index link is verified in CI.

---

## 12. Security and Privacy Review

### Positive Findings

- Desktop secrets are routed through main-process secure storage.
- Renderer does not receive raw API keys in the intended desktop architecture.
- Endpoint/provider routing has explicit allowlists and fail-closed deferred providers.
- Diagnostic and traffic logging has redaction infrastructure.
- Sync writes encrypted packets rather than plaintext records or raw databases.
- Conversation Vault is profile-scoped and encrypted.
- Character image and media paths use controlled bridge/protocol concepts.
- Family Safe Mode/provider safe-mode separation is documented.

### Required Improvements

1. Complete profile-vault deletion.
2. Clarify renderer IndexedDB encryption limitations.
3. Correct privacy claims for optional encrypted sync folders.
4. Run packaged-path traversal and custom-protocol tests on both macOS and Windows.
5. Validate all profile-scoped secure-store deletes pass the profile ID; `profilePurge.ts:109-115` currently calls provider key deletion by provider ID alone and should be checked against the bridge signature to ensure the correct profile is purged.
6. Add release evidence for signed/unsigned artifact behavior, notarization, and update metadata.
7. Keep paid provider errors and signed URLs out of persistent diagnostics.

---

## 13. Performance and Responsiveness Review

No deterministic runtime profiler trace was captured, so this audit does not claim a measured renderer bottleneck. Static risk factors include:

- Multiple 900–1,200-line stateful components/services.
- Global model query work in the always-mounted header.
- Two approximately 500 KiB main chunks.
- Large PDF worker/vendor payloads.
- Extensive Zustand stores where broad subscriptions may cause avoidable renders.
- Background watchers/tasks and media lists that require selector discipline.
- Serial test architecture slowing regression detection.

### Required Profiling Matrix

Capture React Profiler and Electron performance traces for:

1. Cold start to first interactive Chat.
2. API-key hydration and model catalog load.
3. Switching among Chat, Image, Media, Characters, Research, and Settings.
4. Opening a 1,000-message history.
5. Media Studio with 500+ records and thumbnails.
6. Character library with 500+ local/hosted cards.
7. Active chat streaming while switching tabs.
8. Concurrent video/music background tasks.
9. Sync-folder scan with 10,000 packets.
10. Theme switch and command palette open.

Set budgets for first interactive time, longest task, render commits, memory growth, and tab-switch latency before refactoring.

---

## 14. Prioritized Remediation Backlog

## P0 — Block Release Promotion

- [ ] **VF-2026-0716-001:** Add type-aware model-catalog completeness and selected-model validation.
- [ ] **VF-2026-0716-002:** Stop typed fetches from clearing unrelated canonical model metadata.
- [ ] **VF-2026-0716-003:** Add main-process profile-vault purge with typed IPC and partial-failure reporting.
- [ ] **VF-2026-0716-004:** Repair the missing documentation archive link and make all contract gates green.

## P1 — Required for 3.0 Beta Feature-Complete Claim

- [ ] **VF-2026-0716-005:** Synchronize version/readiness language to `3.0.0-beta.1` or the next chosen version.
- [ ] **VF-2026-0716-006:** Reconcile privacy, sync, JSON export, encrypted backup, and sync-folder documentation.
- [ ] **VF-2026-0716-007:** Add the five missing sync/privacy developer documents.
- [ ] **VF-2026-0716-008:** Decide and implement visual workflow canvas versus template-only product direction.
- [ ] **VF-2026-0716-009:** Split/parallelize the test architecture and establish bounded CI shards.
- [ ] **VF-2026-0716-010:** Document the renderer IndexedDB encryption threat boundary accurately.
- [ ] Complete signed/package, paid-operation, two-machine sync, accessibility, theme, sound, and reduced-motion manual QA.

## P2 — Stabilization and UX Consistency

- [ ] Canonicalize report authority and historical banners.
- [ ] Run a TypeScript-aware dead-code/reachability scan and remove confirmed orphan modules.
- [ ] Complete semantic generation-loading adoption.
- [ ] Finish structural mesh/soft-separator rollout without weakening control affordances.
- [ ] Rename or implement “Archive Orphans.”
- [ ] Remove or contract-test deferred provider placeholders.
- [ ] Profile and decompose measured monolith hotspots.
- [ ] Remove unnecessary all-model header queries.

## P3 — Repository Hygiene

- [ ] Consolidate duplicate agent/editor rules.
- [ ] Make local path enforcement optional and portable.
- [ ] Remove or relocate root debug probes.
- [ ] Clarify README image-tool terminology.

---

## 15. Required Acceptance Gates for the Next Snapshot

A subsequent “clean” archive should not be called release-ready until all of these are evidenced:

### Build and Static Contracts

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run verify:contracts:static
npm run verify:contracts
npm run verify:bundle-budget
```

### Tests

- Every CI shard completes with a conclusive summary.
- Electron, server, renderer/service, security, sync, media, character, research, and workflow suites pass.
- Model-catalog tests cover partial versus complete catalogs.
- Profile deletion tests prove vault removal and isolation.

### Packaged Desktop QA

- macOS arm64/x64 as supported.
- Windows x64 as supported.
- Signed/notarized or explicitly unsigned with documented warnings.
- First run, age gate, API key, model load, generation, persistence, restart, and uninstall/reinstall behavior.

### Live Provider QA

- Chat stream.
- Image generation/edit/upscale/background removal.
- TTS/transcription.
- Music queue/retrieve.
- Text-to-video and image-to-video queue/retrieve.
- Research with Venice and Jina.
- Each enabled fallback provider.

Record request IDs/statuses and redacted evidence; never commit credentials, raw prompts, signed media URLs, or user media.

### Two-Machine Sync QA

- Initial enrollment.
- New/updated/deleted records.
- Conflict preservation.
- Tombstone propagation.
- Media enabled and disabled.
- Interrupted/partial write recovery.
- Wrong passphrase and tamper rejection.
- Disable/pause/re-enroll/new sync set.
- Verify no plaintext user content appears in the sync folder.

### UX/Accessibility QA

- Dark, light, and high-contrast themes.
- 100%, 200%, and 400% zoom.
- Keyboard-only navigation.
- Screen-reader labels and dialog focus trapping.
- Reduced motion.
- Sound off/on and all sound packs.
- Reply TTS off/on.
- Persistent toasts across tab changes.
- Long-running tasks across tab changes and app restart.

---

## 16. Audit Limitations

- The uploaded clean ZIP did not include `.git`, so branch, dirty state, commit ancestry, and live GitHub protections/checks could not be verified.
- No API credentials were used.
- No paid provider operation was executed.
- No signed installer was built or launched.
- No Windows or second physical machine was available.
- The full monolithic test suite did not finish within the five-minute audit command limit; targeted suites and verifiers provide strong but incomplete coverage.
- Direct-reference dead-code findings are candidates until a TypeScript-aware entrypoint graph confirms them.
- Static source presence and passing unit tests do not prove packaged UX behavior.

---

## 17. Final Assessment

Venice Forge 3.0 beta has advanced substantially. The prior media/character API drift work is represented in the current architecture, encrypted backup/sync is no longer merely a proposal, and most requested product surfaces are implemented with meaningful tests.

The remaining problems are now concentrated in **state authority, deletion completeness, documentation truth, test scalability, and product-surface consistency** rather than wholesale missing architecture.

The fastest safe path is:

1. Correct the two model-catalog defects.
2. Correct profile deletion at the main-process boundary.
3. Restore green documentation/contract gates.
4. Reconcile all 3.0 beta privacy/version/export claims.
5. Make the workflow product decision.
6. Split tests into bounded required shards.
7. Perform packaged, paid-operation, and two-machine manual QA.
8. Then remove orphan code and complete visual/loading-system consistency.

Until those steps are complete, the snapshot should be described as a **feature-rich internal 3.0 beta with unresolved release blockers**, not a stabilized release candidate.
