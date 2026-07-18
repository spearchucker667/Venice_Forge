# Venice Forge Deep Scan — 2026-07-17 03:10:29 Snapshot

## 1. Executive Verdict

**Audited archive:** `Venice_Forge-clean-20260717-031029.zip`  
**Source branch:** `main`  
**Source commit:** `f00cf997c69b81874ef603a3ac68577f3a48709e` (`f00cf99`)  
**Commit subject:** `fix(audit): close July 17 release blockers`  
**Application version:** `3.0.0-beta.1`  
**Runtime contract:** Node `>=22.13.0 <23`, npm `>=10`  
**Prior audited snapshot:** `8cd4ffdcb5ba166e48f8721469ed1feeceda561f` (`2026-07-16 22:47:49`)

### Release assessment

This snapshot is a substantial and verifiable improvement over the 22:47 update. All four prior P1 blockers are closed:

1. Workflow output deduplication is now scoped to a single run.
2. Research workflow actions use the canonical `search` tab ID.
3. The canonical store test surface is split into bounded shards and completes successfully.
4. Electron shutdown is coordinated, idempotent, timeout-bounded, and awaited by the main lifecycle.

The repository also passes lint, both TypeScript projects, production build, bundle budgets, Markdown links, release metadata, workflow tests, the canonical store suite, and all independently executed renderer UI shards. `npm audit` reports zero known vulnerabilities.

The application is nevertheless **not release-ready**. This scan verified three P1 defects in areas not covered by the prior remediation commit:

1. Audio transcription sends a model identifier that violates the bundled Venice Swagger contract.
2. The user-facing Venice API Safe Mode toggle is documented and stored as independent from Local Family Safe Mode, but it is not consistently applied to supported audio, embedding, and augment requests.
3. Deleting a non-default profile leaves that profile’s filesystem-backed chat history readable on disk.

No P0 remote-code-execution, plaintext API-key storage, arbitrary renderer filesystem access, plaintext sync export, or confirmed cross-origin navigation escape was found.

### Finding count

| Severity | Count | Meaning |
|---|---:|---|
| P0 | 0 | Immediate exploit or destructive-data-loss emergency |
| P1 | 3 | Release blocker or high-impact privacy/API-contract defect |
| P2 | 4 | Major durability, isolation, CI, or documentation defect |
| P3 | 5 | Bounded technical debt, test portability, or deferred cleanup |
| **Total** | **12** | Confirmed current-snapshot findings |

Deferred product/release scope is listed separately and is not misrepresented as an implemented defect.

---

## 2. Scope and Method

The audit covered the complete extracted repository rather than only the files changed by the remediation commit.

### 2.1 Surfaces inspected

- Electron main process, preload bridge, IPC registration and validation, custom protocols, navigation policy, secure storage, profile purge, chat persistence, background tasks, sync, logging, shutdown, and update flows.
- React renderer, tab registry, chat, character chats, history, Image Studio, Media Studio, Audio Studio, Music Studio, Video Studio, embeddings, Research, characters, RP Studio, Scene Composer, workflows, Playground, privacy, settings, and status diagnostics.
- Venice request adapters, model IDs, Swagger-backed endpoint payloads, fallback-provider capability declarations, binary media retrieval, provider-side `safe_mode`, and local Family Safe Mode enforcement.
- Zustand and IndexedDB persistence, profile scoping, filesystem persistence, Conversation Vault, backup/export, encrypted sync-folder behavior, tombstones, generated media storage, and cache ownership.
- Build, lint, TypeScript, Vitest orchestration, contract verifiers, clean archive generation, bundle budgets, release metadata, dependencies, and CI scripts.
- README, legal/security/privacy documents, roadmap/status authority, historical reports, architecture references, duplicate files, stale TODOs, and documentation retention.
- Delta against the 22:47 snapshot and reconciliation of every prior P1/P2/P3 item.

### 2.2 Methods

- Deterministic ZIP extraction and file inventory.
- Hash-based exact-duplicate scan.
- Path/type/line-count inventory and large-module review.
- Source-level contract comparison against `docs/reference/Venice_swagger_api.yaml`.
- Direct execution of lint, TypeScript, build, release, contract, workflow, store, script, type, and renderer UI commands.
- Direct reproductions for profile-purge retention, cross-profile TTS cache reuse, and bounded-runner process-tree behavior.
- Static security searches for unsafe Electron options, navigation bypasses, `eval`, `new Function`, `dangerouslySetInnerHTML`, raw secret logging, arbitrary filesystem exposure, and unsupported request keys.
- Evidence capture into a standalone bundle.

### 2.3 Limitations

This is a source-level and automated audit. It did not:

- Spend money on live Venice or fallback-provider requests.
- Perform signed/notarized macOS installation or signed Windows installation/update.
- Exercise two physical machines for sync.
- Complete screen-reader, 200–400% zoom, all-theme, audio-device, and sound-feedback manual QA.
- Validate first-party release signing secrets or hosted release automation.

No claim in this report treats those unexecuted activities as passed.

---

## 3. Snapshot Inventory and Delta

### 3.1 Repository inventory

| Metric | Value |
|---|---:|
| Files including extraction metadata | 1,179 |
| Directories | 109 |
| TypeScript files (`.ts`) | 681 |
| React TypeScript files (`.tsx`) | 188 |
| Markdown files | 103 |
| Approximate source lines under `src/` | 128,841 |
| Approximate source lines under `electron/` | 28,577 |
| Approximate Markdown lines | 44,388 |
| Exact duplicate groups across `src/`, `electron/`, `scripts/`, and docs | 0 |

The clean archive metadata reports a clean `main` source state at commit `f00cf99`.

### 3.2 Delta from the 22:47 snapshot

| Change class | Count |
|---|---:|
| Added | 7 |
| Removed | 3 |
| Changed | 40 |
| Unchanged | 1,132 |

The changed surface is focused and corresponds to the prior audit:

- Workflow runner typing and per-run output state.
- Canonical workflow regression tests.
- Bounded store test orchestration.
- Electron shutdown coordinator and lifecycle tests.
- Current stack/version documentation updates.
- Accessibility correction in Character Editor.
- Provider-catalog provenance and stale-catalog disclosure.
- Removal of an unused generation barrel.

### 3.3 Largest current implementation modules

Large files are not automatically defective, but these remain concentrated ownership and regression-risk points:

| File | Approx. lines |
|---|---:|
| `src/components/rp-studio/CharacterEditor.tsx` | 1,279 |
| `src/services/desktopBridge.ts` | 1,270 |
| `src/stores/chat-store.ts` | 1,037 |
| `src/components/gallery/gallery-view.tsx` | 1,004 |
| `src/components/chat/chat-view.tsx` | 936 |
| `src/components/scenes/SceneComposerView.tsx` | 929 |
| `src/components/gallery/media-inspector.tsx` | 926 |
| `electron/services/configService.ts` | 910 |
| `src/services/veniceClient/fetch.ts` | 893 |
| `electron/services/secureStore.ts` | 880 |
| `electron/services/syncFolderWatcher.ts` | 876 |
| `electron/services/researchBrowserServer.ts` | 847 |

These should be decomposed only through behavior-preserving work orders with regression tests; they are not justification for an audit-driven mass rewrite.

---

## 4. Validation Results

### 4.1 Build, lint, type, dependency, and documentation gates

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` | Passed; 842 packages installed |
| `npm audit` | **0 vulnerabilities** |
| Direct ESLint | Passed |
| Canonical `npm run lint` | Passed, exit 0 |
| Renderer TypeScript | Passed |
| Electron TypeScript | Passed |
| Production build | Passed |
| Bundle-budget verification | Passed |
| `verify:release-metadata` | Passed |
| `verify:markdown-links` | Passed; 102 Markdown files checked |
| `verify:repo-handoff-hygiene` | Passed |
| `verify:roadmap-current` | Passed structurally |
| `verify:contracts:features` | Passed |
| `verify:contracts:release` | Passed |

Build output remains within enforced limits. Representative generated assets:

- Main application chunk: approximately 306 KB raw.
- Documents vendor: approximately 497 KB raw.
- PDF.js vendor: approximately 425 KB raw.
- Settings view: approximately 127 KB raw.

### 4.2 Automated test results

| Suite | Result |
|---|---:|
| Server | 59 tests passed |
| Electron | 691 tests passed |
| Ingestion | 65 tests passed |
| Store core shard | 16 files / 376 tests passed |
| Store chat shard | 9 files / 90 tests passed |
| Store feature shard | 16 files / 261 tests passed |
| Store integration shard | 4 files / 50 tests passed |
| Services | 73 files / 667 tests passed |
| Hooks | 16 files / 90 tests passed |
| Library/workflow utilities | 11 files / 80 tests passed |
| Shared safety/contracts | 12 files / 268 tests passed |
| Utilities | 17 files / 357 tests passed |
| Themes | 6 files / 118 tests passed |
| Script/verifier assertions reached before environment failure | 133 tests passed |
| Type-level runtime tests | 6 files / 102 tests passed |
| Workflow core | 8 files / 112 tests passed |
| Workflow UI | 1 file / 4 tests passed |
| Layout/accessibility UI | 14 files / 95 tests passed |
| Chat UI | 6 files / 76 tests passed |
| Media Gallery UI | 7 files / 63 tests passed |
| Image UI | 2 files / 19 tests passed |
| Research UI | 4 files / 38 tests passed |
| Settings UI | 2 files / 17 tests passed |

The canonical `npm run test:unit:stores` now completes successfully. Its four bounded shards execute 45 test-file runs and 777 assertions when the intentional integration reruns are included; there are 727 unique store assertions.

### 4.3 Aggregate `test:ci` limitation

`npm run test:ci` progressed through the repaired store orchestration and the broad unit surface. Its terminating failure occurred in the script-verifier stage because a verifier imports Electron while dependencies had been installed with lifecycle scripts disabled. Electron attempted to download its runtime binary, and outbound artifact access was unavailable in the audit sandbox.

Evidence:

- 18 script suites passed.
- 133 script tests passed.
- One suite failed during module import before registering tests.
- The corresponding Electron/provider code passed in the isolated Electron suite after the runtime binary was rebuilt.

This is not classified as an application runtime defect. It is retained as a P3 test-portability issue because a nominally static contract verifier should avoid requiring Electron’s downloadable runtime where practical.

### 4.4 Transient UI-runner observations

The first external orchestration loop around layout and research UI commands remained alive after complete assertion output. Clean isolated reruns exited normally:

- Layout: 14 files / 95 tests, exit 0 in 26.16 seconds.
- Research: 4 files / 38 tests, exit 0 in 7.78 seconds.

Because the issue did not reproduce in clean reruns, it is not classified as a repository defect.

---

## 5. Prior 22:47 Finding Reconciliation

| Prior finding | Current status | Evidence |
|---|---|---|
| Global workflow output dedupe suppresses later runs | **Resolved** | Output tracking is run-local; independent-run regression tests pass. |
| Research workflow maps to invalid `research` tab | **Resolved** | Workflow actions use typed canonical `TabId` and map Research to `search`; 116 workflow tests pass. |
| Store suite does not terminate | **Resolved for current suite** | Four bounded shards complete; canonical command exits 0. Process-tree hardening remains P2. |
| Shutdown cleanup promises not awaited | **Resolved functionally** | Idempotent coordinator is wired into quit and signal paths and awaits bridge, sync, tasks, and logs. |
| Active docs describe obsolete stack versions | **Resolved** | Electron 43, Vite 8, Express 5 references are current in active top-level docs. |
| Character Editor saving spinner lacks accessible status | **Resolved** | Saving state now has accessible status semantics and coverage. |
| Provider catalogs lack stale-data disclosure | **Resolved** | Static catalog provenance and limitations are explicitly disclosed. |
| Removed workflow-node references remain active | **Resolved in active paths** | Unused generation barrel and stale active references were removed/updated. |
| Large-module decomposition | **Accepted debt** | Still valid architecture guidance; not a runtime regression. |
| IPC/preload concentration | **Accepted debt** | Requires a separate typed-surface decomposition plan. |
| Deferred providers/transports and external QA | **Still deferred** | Fail-closed or represented as external release evidence, not falsely implemented. |

The remediation commit should be credited for closing the prior release blockers. The current findings are separate defects discovered by expanding the scan beyond that remediation surface.

---

## 6. Confirmed P1 Findings

## VF-SCAN-20260717-031029-001 — Transcription sends a model ID rejected by the bundled API contract

**Severity:** P1  
**Area:** Audio Studio / Venice API contract  
**Status:** Directly verified in source

### Evidence

`src/hooks/use-audio.ts:78–85` constructs transcription form data as follows:

```ts
formData.append('file', file)
formData.append('model', 'whisper-large-v3')
return veniceFormData<{ text: string }>('/audio/transcriptions', formData)
```

The bundled authoritative schema at `docs/reference/Venice_swagger_api.yaml:3563–3582` accepts these model IDs:

```text
nvidia/parakeet-tdt-0.6b-v3
openai/whisper-large-v3
fal-ai/wizper
elevenlabs/scribe-v2
stt-xai-v1
```

`whisper-large-v3` is not in the enum. The closest valid identifier is `openai/whisper-large-v3`.

The FormData transport forwards the field unchanged; no canonical adapter rewrites the ID. Existing `use-audio` tests exercise TTS behavior but do not assert the transcription request contract.

### User impact

- Transcription can fail with a provider 400 before useful work begins.
- The error consumes user time and can be misdiagnosed as an invalid audio file or API-key problem.
- CI remains green because no test compares the outbound FormData model field to the Swagger enum.

### Related feature gaps

The current transcription UI provides only file selection and submission. The bundled API supports:

- Multiple transcription models.
- `response_format` (`json` or `text`).
- Language/timestamp-related fields where supported by the schema.
- A documented list of accepted media formats.

The current `<input accept="audio/*">` is broader than the provider’s enumerated formats and does not perform provider-size/format validation before request dispatch.

### Required correction

1. Add a canonical `TranscriptionRequest`/builder shared by UI and tests.
2. Use a schema-valid default, preferably the documented default unless product requirements choose another model.
3. Populate transcription models from model metadata or a Swagger-derived allowlist.
4. Validate file MIME/extension, non-zero size, and provider size limits before dispatch.
5. Add model, response format, and optional language/timestamp controls only when supported.
6. Add request-contract tests that inspect serialized FormData entries.

### Acceptance tests

- Default transcription payload contains a valid model ID.
- Every selectable model belongs to the current accepted catalog.
- Invalid or unsupported files are rejected locally.
- FormData includes the selected model and expected response format.
- Provider errors remain redacted and actionable.

---

## VF-SCAN-20260717-031029-002 — Venice API Safe Mode is stored as an independent setting but is not consistently wired to supported endpoints

**Severity:** P1  
**Area:** Safety settings / request construction  
**Status:** Verified across multiple request paths

### Declared contract

`src/shared/veniceSafeMode.ts:1–31` explicitly states that provider-side Venice API `safe_mode` and local Family Safe Mode are independent controls. It records supported top-level or form-data usage for:

- `/image/generate`, `/image/edit`, `/image/multi-edit`
- `/audio/speech`, `/audio/transcriptions`
- `/embeddings`
- `/augment/search`, `/augment/scrape`, `/augment/text-parser`

The settings store persists both:

```ts
localFamilySafeModeEnabled: boolean
veniceApiSafeMode: boolean
```

### Actual behavior

Several supported request paths do not read or apply `veniceApiSafeMode`:

- `useTTS()` sends the raw TTS request to `/audio/speech`.
- `useTranscription()` builds FormData without a `safe_mode` field.
- Embedding requests send the request object without provider safe-mode state.
- Search/Scrape/Text Parser UI and Venice research-provider calls omit the setting.
- The main chat TTS bridge constructs its request without the setting.

The Electron guard pipeline uses `applyVeniceApiSafeMode(..., true)` only as a Local Family Safe Mode defense-in-depth override. `electron/services/runtimeSafetySettings.ts` stores the local family setting, not the independent provider setting. Renderer-to-main request headers similarly transport only Local Family Safe Mode.

Resulting mismatch:

- Local Family Safe Mode OFF + Venice API Safe Mode ON: supported endpoint requests may omit `safe_mode` entirely.
- Local Family Safe Mode ON + Venice API Safe Mode OFF: the main guard may force provider `safe_mode=true`, contradicting the UI’s claim that controls are independent.

The centralized helper and its matrix are tested, but the tests do not prove that every supported production call site passes the user’s setting into the helper.

### User impact

- A visible safety preference can be silently ignored.
- Diagnostics can report `veniceApiSafeMode=true` while outbound supported requests omit it.
- The two-toggle mental model in settings and documentation does not match runtime behavior.
- Safety behavior differs by endpoint and by renderer/main transport path.

### Required correction

1. Define one authoritative effective-provider-safe-mode source for Electron and web mode.
2. Synchronize `veniceApiSafeMode` into the main process through a typed, main-authoritative settings channel.
3. Apply it in the canonical request adapter after endpoint validation and before dispatch.
4. Preserve the local Family Safe Mode override as a separately documented policy decision. If local mode forces provider safe mode, the UI must say so rather than describing strict independence.
5. Support serialized FormData through the existing helper for transcription/text-parser paths.
6. Add an endpoint matrix integration test that asserts actual outbound payloads, not only helper behavior.

### Acceptance tests

For every supported endpoint, test all four combinations:

| Local Family Safe Mode | Venice API Safe Mode | Expected provider field |
|---|---|---|
| Off | Off | `false` or omitted according to documented policy |
| Off | On | `true` |
| On | Off | Explicitly documented effective value |
| On | On | `true` |

Unsupported endpoints must never receive an unknown `safe_mode` field.

---

## VF-SCAN-20260717-031029-003 — Profile deletion leaves profile-scoped filesystem chat history readable

**Severity:** P1  
**Area:** Profiles / privacy / data deletion  
**Status:** Directly reproduced

### Evidence

`electron/services/chatStorage.ts:28–34` stores non-default profiles under:

```text
userData/chat-history/profiles/<profileId>/
```

`electron/services/profilePurge.ts:39–57` purges:

- Conversation Vault data.
- Venice API key.
- Jina API key.
- Fallback-provider API keys.
- Profile password verifier.

It has no chat-history filesystem step and its result schema cannot report one.

A direct reproduction created a conversation under a non-default profile, called `purgeMainProfileData("work")`, and then read the same private message from the profile’s chat-storage API. The reproduction exited successfully because the retained message remained available.

`SECURITY.md:247` is internally stale: it says filesystem chat history is not keyed by profile, while the implementation now explicitly uses profile subdirectories. It also acknowledges that deletion does not remove the files.

### User impact

- “Delete profile” does not erase all profile-owned conversation data.
- Deleted-profile messages remain recoverable from disk and through internal storage functions.
- The purge result can return `ok: true` despite retained chat content.
- Privacy and security documentation do not match the current storage architecture.

### Required correction

1. Add `purgeProfileChatHistory(profileId)` in the main process.
2. Validate profile IDs and refuse the default profile through the same rules as the main purge.
3. Remove the complete profile directory atomically or through bounded enumeration with symlink/path-escape protection.
4. Add a `chatHistory` step to `MainProfilePurgeResult`.
5. Treat chat-history deletion failure as purge failure and preserve enough profile metadata to allow retry/recovery.
6. Invalidate renderer chat state and any profile-scoped in-memory caches after successful purge.
7. Update `SECURITY.md`, privacy copy, profile UI copy, and tests.

### Acceptance tests

- Create multiple chat files under one profile; deletion removes all of them.
- Other profiles and the default root remain untouched.
- Repeated purge is idempotent.
- Invalid IDs and traversal attempts fail closed.
- A partial filesystem failure is surfaced to the UI and does not produce a false success.
- Restart after deletion cannot reload the deleted conversations.

---

## 7. Confirmed P2 Findings

## VF-SCAN-20260717-031029-004 — Bounded test runner times out only the npm wrapper, not the full process tree

**Severity:** P2  
**Area:** CI reliability

`scripts/run-bounded-test-shards.cjs` spawns `npm run <shard>` and calls `child.kill(...)` on timeout. That targets the immediate npm process. It does not establish and terminate a Unix process group, and it does not use Windows `taskkill /T` or an equivalent process-tree strategy.

A direct reproduction launched a grandchild Node process through the bounded runner. The runner reported its timeout, but the grandchild remained alive (`grandchild_alive_after_runner=yes`).

The current store shards pass, so this is not a present assertion failure. It means the “hard bound” added to prevent the prior hang is incomplete: the same open-handle/subprocess class can leave CI workers alive after the wrapper believes it terminated the shard.

### Required correction

- Unix: spawn detached and terminate the negative process-group PID, escalating from `SIGTERM` to `SIGKILL` after a grace period.
- Windows: terminate the full tree with a safe equivalent such as `taskkill /PID <pid> /T /F`.
- Record timeout, signal, shard name, and final exit state.
- Add a fixture that deliberately spawns a grandchild and proves no descendant survives.

---

## VF-SCAN-20260717-031029-005 — TTS cache is machine-global and crosses profile credential/billing boundaries

**Severity:** P2  
**Area:** Profile isolation / cache ownership

`electron/services/chatTtsBridge.ts` uses a global `userData/tts-cache` directory. Its cache key is derived from text/model/voice/speed, not `profileId`. A direct reproduction showed that a second profile requesting the same TTS input reused the first profile’s generated result and did not invoke the provider a second time.

The repository discloses that some caches are shared, so this is not classified as a hidden P1 privacy breach. It remains a material isolation/accounting problem:

- A request under profile B can reuse output produced and billed under profile A.
- Deleting profile A does not necessarily remove audio derived from its content.
- Provider selection or credentials can change by profile while cache identity does not.

### Required correction

Either:

1. Scope the cache directory/key by validated profile ID and purge it with profile deletion; or
2. Explicitly define a machine-wide shared-output cache, expose it in Privacy settings, and provide per-profile exclusion/purge controls.

The cache key should also include every output-affecting option and provider identity/version where relevant.

---

## VF-SCAN-20260717-031029-006 — Shutdown coordinator flushes logs concurrently with cleanup steps that can still emit logs

**Severity:** P2  
**Area:** Shutdown observability/durability

The new shutdown coordinator correctly awaits all main cleanup operations. However, `stopBridgeServer`, `stopSyncWatcher`, background-task flush, and `flushLogs` are launched concurrently. Cleanup operations can log after their own asynchronous close completes. If `flushLogs` resolves before those final messages are queued, the process can exit without persisting the last shutdown diagnostics.

This does not invalidate the functional shutdown fix for sync/task durability. It weakens the evidence trail needed to diagnose shutdown failures.

### Required correction

- Run durable cleanup tasks in parallel.
- After they settle, perform `flushLogs()` as the final ordered phase.
- Use stderr fallback for failures that occur after logger shutdown begins.
- Extend coordinator tests with a cleanup dependency that logs after a delay and assert that the final log is flushed.

---

## VF-SCAN-20260717-031029-007 — Current roadmap and closure ledger overstate the locally verified state

**Severity:** P2  
**Area:** Documentation authority / release governance

`docs/ROADMAP.md:7–20` says the prior audit’s locally actionable issues are closed and that only external release evidence remains. It also cites a complete test surface and aggregate contracts. This scan verifies three locally actionable P1 defects and several P2 issues in the live snapshot.

`verify:roadmap-current` passes because it checks structure, required tokens, and stale historical references; it does not prove semantic agreement between the roadmap and the implementation.

`docs/summary_of_work.md` records profile-erasure closure around Conversation Vault and credentials without reconciling the retained filesystem chat directory.

### Required correction

- Add the current P1/P2 findings to the canonical roadmap before any release claim.
- Distinguish “prior audit findings closed” from “repository has no remaining local defects.”
- Record exact commit-bound validation results and environment limitations.
- Avoid citing a grand aggregate test number unless generated from a deterministic manifest that excludes intentional reruns and skipped/external suites.
- Update summary-of-work only after the implementation and verification commands pass.

---

## 8. P3 Findings and Bounded Technical Debt

## VF-SCAN-20260717-031029-008 — Static provider verifier depends on an installed Electron runtime

A source/contract verifier imports a module that resolves Electron’s runtime package. In an offline audit or an install performed with lifecycle scripts disabled, this triggers an attempted binary download and fails before tests register.

The production Electron suite passed after the runtime was rebuilt, so this is not an application failure. Refactor static provider-contract tests to import pure adapters/constants without requiring Electron initialization.

## VF-SCAN-20260717-031029-009 — Prompt payload extractor retains obsolete upscale prompt keys

The central prompt payload extractor still recognizes historical upscale prompt/enhance keys that the current Venice upscale contract no longer accepts. This does not place those keys in the actual request builder, but it creates future drift risk and misleading safety coverage.

Remove obsolete keys or annotate them solely as legacy-import fields with tests proving they cannot reach outbound upscale payloads.

## VF-SCAN-20260717-031029-010 — Deprecated transitive dependencies remain in packaging chains

`npm audit` is clean. Deprecated transitive packages remain through Electron Builder/updater tooling, including `glob@7`, `inflight`, `boolean@3`, `rimraf@2`, and `lodash.isequal`.

These are not direct vulnerabilities in this snapshot. Track upstream replacement rather than forcing unsupported overrides into release tooling.

## VF-SCAN-20260717-031029-011 — Large modules concentrate unrelated responsibilities

The largest modules combine orchestration, persistence, view state, request construction, and UI rendering. This increases regression blast radius and makes contract ownership harder to audit. Prioritize separations around typed adapters, state selectors, and presentational components when modifying those areas; do not perform a speculative mass split.

## VF-SCAN-20260717-031029-012 — Historical documentation volume remains high

The archive/history document exceeds 1.2 MB, `summary_of_work.md` is approximately 66 KB, and several retained historical reports exceed 30–60 KB. Link integrity is good and no exact duplicates were found, so this is not a broken-doc defect. It remains context-budget and navigation debt.

Use immutable dated archives, bounded canonical indexes, and a concise current ledger. Do not let historical reports become current-state authority.

---

## 9. Feature Coverage and Missing/Deferred Scope

### 9.1 Current user-facing surface

The canonical registry exposes:

- Chat
- Character Chats
- History
- Image Studio
- Media Studio
- Prompts
- Scene Composer
- Audio Studio
- Music Studio
- Video Studio
- Embeddings
- Research
- Characters
- RP Studio
- Workflow Templates
- Privacy
- Playground
- Config
- Status

All canonical views are routed through `App.tsx`, with heavier views lazy-loaded where defined.

### 9.2 Coverage matrix

| Area | Current implementation status | Audit disposition |
|---|---|---|
| Generic chat, streaming, history, per-chat model state | Broadly implemented and heavily tested | No new blocker found |
| Hosted/local character chats, greetings, cached avatars | Prior regressions appear remediated | No new blocker found |
| Character card authoring/import/export | Substantial V1/V2 support with documented compatibility limits | V3/bulk assets remain explicitly unsupported |
| Image generation/edit/upscale/background removal | Prior API-drift fixes retained; image UI tests pass | Live paid endpoint QA still external |
| Video queue/retrieve/catalog persistence | Durable task architecture and tests present | Live provider/restart QA external |
| Music queue/retrieve/MIME-aware catalog persistence | Prior duplication/extension defects resolved | Live provider QA external |
| TTS | Implemented with MIME validation, timeout, and UI controls | Profile-global cache is P2 |
| Transcription | UI surface exists | Invalid model contract is P1; controls/validation incomplete |
| Embeddings | Implemented | Provider Safe Mode wiring gap applies |
| Research/search/scrape/text parser | Implemented with Venice/Jina paths | Provider Safe Mode wiring gap applies; robots behavior remains provider-dependent |
| Workflow templates/Playground | Prior P1 mappings fixed; 116 tests pass | No new workflow blocker found |
| Profiles and credentials | Profile-scoped settings/keys/passwords implemented | Profile chat deletion is P1; TTS cache isolation P2 |
| Encrypted backup/import | Broad implementation and crypto tests | No plaintext-backup defect found |
| Encrypted sync folder | Object-level encrypted architecture and tests present | Physical two-device QA external |
| WebDAV/S3 provider transports | Deferred/fail-closed | Missing planned scope, not falsely active |
| Sync-key rotation | Design/partial support; live in-place rotation deferred | Deferred scope |
| Fallback providers | Implemented provider set has endpoint-granular capabilities | Replicate, Bedrock, Vertex, Azure OpenAI, Hugging Face, Cohere deferred/fail-closed |
| Scheduled provider-key rotation | Not implemented | Explicit product gap |
| Signed/notarized installers and paid-operation evidence | Not available in this audit | Release evidence remains open |

### 9.3 Explicitly deferred items

The following should remain visible in the roadmap rather than being described as complete:

- WebDAV and S3-compatible sync transports.
- Live in-place sync-key rotation and recovery UX.
- Scheduled provider-key rotation.
- Replicate, AWS Bedrock, Google Vertex AI, Azure OpenAI, Hugging Face, and Cohere integrations.
- Destructive orphan cleanup with quarantine/rollback.
- Signed/notarized macOS and signed Windows evidence.
- Paid provider calls, two-device sync, and full manual accessibility/theme/audio QA.
- Character Card V3, compressed PNG metadata, embedded V3 assets, and bulk ZIP character libraries.

---

## 10. Documentation, Redundancy, and Repository Hygiene

### 10.1 Positive findings

- Markdown verifier passes 102 files.
- No exact duplicate documents/source files were found in the scanned scopes.
- Legal and first-class root links are now covered.
- Active stack references match Electron 43, Vite 8, and Express 5.
- Clean archive tooling excludes real environment/key/certificate files.
- Secret heuristic matches are confined to named test fixtures; no production secret file was identified.
- Current report indexes distinguish historical snapshots from authority documents more clearly than prior versions.

### 10.2 Remaining mismatches

- `SECURITY.md` incorrectly says filesystem chat history is not profile-keyed while current code stores non-default profiles under `chat-history/profiles/<profileId>`.
- The same section accurately admits profile deletion does not remove the files, contradicting stronger profile-isolation/product language elsewhere.
- `docs/ROADMAP.md` represents local closure too broadly.
- Historical plans/reports contain old versions and superseded paths by design. They must remain clearly marked historical and excluded from current-state assertions.

### 10.3 Recommended documentation policy

1. `docs/ROADMAP.md` is the only current unfinished-work authority.
2. `docs/summary_of_work.md` is a bounded, commit-linked validation ledger.
3. Audit reports remain immutable snapshots.
4. Historical plans remain searchable but carry a top-of-file status banner.
5. Current docs should derive version claims from package metadata where feasible.
6. Verification reports should record exact command, commit, environment, exit status, and known skipped/external work.

---

## 11. Security and Privacy Assessment

### 11.1 Security controls confirmed in source

- Renderer windows use `nodeIntegration: false`, `contextIsolation: true`, sandboxing, and web security.
- Navigation and window-open handlers restrict untrusted destinations and externalize approved links.
- No production `eval`, `new Function`, or `dangerouslySetInnerHTML` path was identified in the static scan.
- Renderer filesystem and secure-storage access remain behind preload/IPC surfaces.
- API keys use Electron `safeStorage` on macOS/Windows and fail closed when unavailable; strict password-class credentials prohibit plaintext fallback.
- Profile password verifiers use salted PBKDF2-SHA256 and timing-safe comparison, with main-process lockout.
- Sync/backup design encrypts portable payloads and does not sync a raw database file.
- Logging and diagnostics include redaction paths for keys, bearer tokens, prompts, and local paths.
- Endpoint allowlists, request validation, local safety guard pipelines, and CSP/navigation controls remain present.
- npm reports zero known vulnerabilities.

### 11.2 Security/privacy risks requiring action

- Profile deletion does not erase profile chat files (P1).
- Provider Safe Mode state does not match the user-facing setting on all supported routes (P1).
- Machine-global TTS cache crosses profile ownership/billing boundaries (P2).
- Shutdown log ordering can lose final failure evidence (P2).

### 11.3 No verified P0

The scan did not find evidence of:

- Raw API keys committed in production source.
- Renderer-accessible arbitrary `file://` browsing.
- Unrestricted shell/child-process IPC.
- Plaintext backup/sync payloads.
- Remote navigation with Node privileges.
- Automatic destructive sync conflict resolution that drops user data.

---

## 12. Architecture and Maintainability Assessment

The repository has strong verification density and clear security intent. Its main architectural risk is inconsistent ownership: some contracts have canonical adapters, while others remain assembled directly in hooks or views. The transcription and provider Safe Mode findings are examples of this drift.

### Recommended ownership boundaries

- **API payload construction:** pure endpoint-specific builders, shared by Electron/web paths and contract tests.
- **Safety state:** one typed effective-policy snapshot in main, with explicit independent/override semantics.
- **Profile-owned storage:** one registry of every profile-scoped surface and one purge transaction that iterates it.
- **Caches:** explicit ownership (`profile`, `machine`, or `temporary`) encoded in path/key and documentation.
- **Test orchestration:** process-tree-safe bounded runner with machine-readable shard manifest.
- **Docs truth:** generated version/toolchain snippets and commit-bound validation manifests.

---

## 13. Remediation Plan

### Phase A — Release blockers

#### A1. Fix transcription contract

- [ ] Introduce a typed transcription request builder.
- [ ] Replace `whisper-large-v3` with a valid model ID.
- [ ] Add model discovery/allowlist and supported-file validation.
- [ ] Add FormData contract tests and Audio Studio UI tests.

#### A2. Wire provider Safe Mode end to end

- [ ] Define authoritative main-process provider-safe-mode state.
- [ ] Synchronize settings through typed IPC without trusting arbitrary renderer request fields.
- [ ] Apply the setting in the canonical adapter for every supported JSON and FormData endpoint.
- [ ] Document the exact interaction with Local Family Safe Mode.
- [ ] Add the full endpoint/state matrix integration suite.

#### A3. Complete profile purge

- [ ] Add profile chat-history purge with path validation.
- [ ] Extend main purge result and renderer reporting.
- [ ] Fail the purge visibly on partial filesystem errors.
- [ ] Purge/invalidate profile-owned caches according to explicit policy.
- [ ] Update security/privacy/profile documentation.
- [ ] Add restart and idempotency tests.

### Phase B — Durability and isolation

- [ ] Make bounded test timeouts terminate complete process trees on macOS/Linux/Windows.
- [ ] Scope TTS cache by profile or expose/document an explicit shared-cache policy.
- [ ] Flush logs after all other shutdown tasks settle.

### Phase C — Documentation truth

- [ ] Reopen current roadmap items for every verified local finding.
- [ ] Correct `SECURITY.md` profile-storage language.
- [ ] Replace broad “all local work closed” claims with commit-bound evidence.
- [ ] Record audit-environment limitations without treating them as passes.

### Phase D — Bounded debt

- [ ] Remove obsolete API-field aliases from safety/prompt extractors.
- [ ] Decouple static provider verifier from Electron binary initialization.
- [ ] Track transitive deprecations upstream.
- [ ] Decompose large modules only when adjacent behavior is already under focused tests.
- [ ] Continue reducing current-ledger size while retaining immutable history.

---

## 14. Acceptance Criteria

The snapshot can be reconsidered for release only when all of the following are true:

1. Transcription submits a Swagger-valid model ID and has request-contract tests.
2. Audio file format/size validation occurs before provider dispatch.
3. Venice API Safe Mode reaches every endpoint declared to support it.
4. The interaction between Local Family Safe Mode and provider Safe Mode is explicit, deterministic, and tested.
5. Deleting a non-default profile removes its filesystem chat history and cannot reload it after restart.
6. Profile purge reports partial failures and remains safely retryable.
7. TTS cache ownership is profile-scoped or explicitly machine-shared with user controls.
8. Bounded test timeouts kill descendant processes on supported platforms.
9. Shutdown performs the final log flush after cleanup tasks settle.
10. `docs/ROADMAP.md`, `SECURITY.md`, privacy copy, and summary ledger match the live implementation.
11. `npm run lint`, TypeScript, build, workflow tests, canonical store tests, and relevant UI suites pass.
12. The aggregate contract/test command passes in a normal lifecycle-complete Node 22 installation.
13. No live paid-provider, signed-build, two-device, or manual accessibility claim is made without recorded evidence.

---

## 15. Agent Implementation Checklist

### Discovery and baseline

- [ ] Record branch, commit, Node/npm versions, and clean working-tree status.
- [ ] Run the current focused reproductions before editing and retain failing evidence.
- [ ] Re-read the bundled Swagger sections for transcription and each `safe_mode` endpoint.

### Transcription

- [ ] Create a canonical `buildTranscriptionRequest`/serialized-FormData adapter.
- [ ] Replace the invalid hardcoded model with a schema-valid default.
- [ ] Populate selectable STT models from verified metadata or a bounded allowlist.
- [ ] Validate provider-supported file types, non-zero bytes, and size limits locally.
- [ ] Add response-format and optional language/timestamp fields only when contract-supported.
- [ ] Add hook, adapter, and Audio Studio tests that inspect outbound FormData entries.

### Provider Safe Mode

- [ ] Add provider Safe Mode to the main-authoritative runtime safety snapshot.
- [ ] Add typed settings synchronization with validation and no arbitrary payload override.
- [ ] Apply provider Safe Mode centrally to JSON and serialized FormData requests.
- [ ] Cover TTS, transcription, embeddings, search, scrape, and text parser.
- [ ] Preserve fail-closed omission for unsupported endpoints.
- [ ] Add four-state Local/Provider Safe Mode integration tests per endpoint.
- [ ] Update settings help text and security documentation with effective-policy semantics.

### Profile deletion

- [ ] Add `purgeProfileChatHistory(profileId)` with validated, contained paths.
- [ ] Extend `MainProfilePurgeResult.steps` with `chatHistory`.
- [ ] Remove all profile conversation files and empty profile directories.
- [ ] Ensure other profiles/default chat history are unaffected.
- [ ] Treat deletion failure as a visible partial purge, not success.
- [ ] Invalidate renderer/store state after a successful purge.
- [ ] Add repeated-purge, restart, traversal, and partial-failure tests.
- [ ] Correct `SECURITY.md` and profile deletion UI copy.

### Cache isolation

- [ ] Decide whether TTS cache is profile-owned or explicitly machine-shared.
- [ ] Include validated profile/provider identity in cache paths or keys when profile-owned.
- [ ] Add purge and cross-profile non-reuse tests.
- [ ] Surface shared-cache behavior in Privacy settings if intentionally retained.

### Test orchestration

- [ ] Spawn bounded shards in a process group on Unix.
- [ ] Terminate full process trees on Windows.
- [ ] Escalate timeout termination after a bounded grace period.
- [ ] Add a grandchild-process regression fixture.
- [ ] Keep deterministic shard manifests and machine-readable summaries.

### Shutdown

- [ ] Run bridge/sync/task cleanup concurrently.
- [ ] Await settlement and then flush logs as the final ordered phase.
- [ ] Preserve stderr fallback for final logger failures.
- [ ] Add delayed-final-log regression coverage.

### Documentation and release

- [ ] Reopen current roadmap items before implementation begins.
- [ ] Update summary-of-work only after commands actually pass.
- [ ] Remove or qualify broad local-closure claims.
- [ ] Record exact commands, exit codes, commit, and environment limitations.
- [ ] Do not mark signed, paid, two-device, or manual QA complete without evidence.

---

## 16. Final Assessment

The 03:10 update successfully repairs the prior workflow, test-orchestration, shutdown, accessibility, and documentation-version blockers. The codebase has broad automated coverage, a clean dependency audit, strong Electron defaults, and materially improved release governance.

The next release decision should not be based on the remediation commit’s intent or the current roadmap’s closure statement. Three independent release blockers remain in the live source:

- Broken transcription request identity.
- Incomplete provider Safe Mode wiring.
- Incomplete profile data erasure.

These are narrow enough to fix without architectural churn, but each requires a canonical contract owner and regression tests. After those corrections, the P2 isolation/durability items and documentation truth should be closed before signed/paid/manual release evidence is collected.
