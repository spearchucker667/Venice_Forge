# Venice Forge Extensive Update Scan

**Snapshot:** `Venice_Forge-clean-20260714-233458.zip`
**Application version:** `2.1.2`
**Audit date:** 2026-07-14 (America/Los_Angeles)
**Scope:** source inventory, requirement-to-code trace, API-contract review, dependency audit, TypeScript/build verification, static contract gates, focused unit/UI/Electron tests, packaging checks.

## 1. Executive Verdict

The update contains most of the requested media, character, UX, and local-first sync work. The prior image/audio/video and character-chat API drift has been corrected in code, and the requested Seedream, sound, TTS, loading-animation, toast, model-persistence, message-editing, character-hub, and mesh-layer work is present.

**The snapshot is not release-ready as submitted.** Four repository gates remain red, and several requested areas are only partial:

1. `verify:contracts` fails because `docs/DOCS_INDEX.md` links to a missing archive file.
2. `verify:bundle-budget` fails because one main application chunk is 602.00 KB against a 600 KB limit.
3. The sync-folder serialization regression test exceeds Vitest's 5-second test budget after the Argon2id/XChaCha20 migration. The same behavior passes with a 30-second test timeout in approximately 5.7 seconds.
4. Full ESLint and Electron-suite execution do not terminate reliably in this audit environment, despite targeted lint and focused test groups passing.
5. Five specifically requested fallback providers remain unavailable placeholders.
6. Destructive `replace` import is gated by a session boolean indicating that an export occurred, but it does not automatically create and verify a local safety backup immediately before clearing stores.
7. Backup manifest/import-preview metadata is materially thinner than the stated product contract.
8. Backup/sync documentation and UI still describe AES-256-GCM even though Electron backup encryption now uses Argon2id plus XChaCha20-Poly1305.

## 2. Validation Summary

| Gate | Result | Evidence |
|---|---:|---|
| Archive extraction/source inventory | PASS | Complete Electron/React/TypeScript source tree, package version `2.1.2`; no `.git` directory in the clean archive. |
| Node engine | PASS | Audited with Node `v22.16.0`; package requires `>=22.13 <23`. |
| Dependency installation | PASS | `npm ci --ignore-scripts` completed. |
| Dependency vulnerability audit | PASS | `npm audit --json`: 0 info/low/moderate/high/critical vulnerabilities; 952 total dependency records. |
| TypeScript | PASS | `npm run typecheck` completed for renderer and Electron projects. |
| Build | PASS | `npm run build` completed for Vite web, server bundle, and Electron bundle. |
| Targeted ESLint | PASS | Critical media, character, backup, sync, and provider files lint clean with `--max-warnings=0`. |
| Full ESLint | INDETERMINATE / GATE RISK | `npm run lint:eslint` produced no diagnostic and did not complete within 360 seconds. |
| Target API/media/sync/security verifiers | PASS | `verify:venice-api-docs`, `verify:image-policy`, `verify:media-studio-power-tools`, `verify:provider-adapters`, `verify:network-boundaries`, `verify:backup-sync`, `verify:storage-privacy`, `verify:storage-policy`, `verify:agent-docs`, `verify:work-orders`, and `verify:release-packaging-hardening` passed. |
| Full contract gate | FAIL | `verify:markdown-links` reports missing `archives/session-history-pre-2026-07-11.md` referenced at `docs/DOCS_INDEX.md:91`. |
| Distribution verifier | PASS | `verify:dist` passed after build. |
| Icon verifier | PASS | `verify:icon` passed. |
| Archive cleanliness | PASS | `verify:archive-clean` passed in filesystem mode. |
| CI contract | PASS | `verify:ci-contract` passed. |
| Bundle budget | FAIL | `dist/assets/index-DO8mgnO_.js` = 602.00 KB; configured limit = 600 KB. |
| Server test suite | PASS | 59/59 tests. |
| Focused media/API suite | PASS | 13 files, 169 tests. |
| Focused sound/TTS/toast suite | PASS | 5 files, 25 tests. |
| Focused character/chat suite | PASS assertions, process-lifecycle risk | 84 visible passing assertions across chat view, sidebar, character store, history, header, message operations, character hub/chats, and avatar tests; combined runner did not terminate cleanly. |
| Sync record→tombstone test | FAIL under default budget; PASS with corrected budget | Fails at 5 seconds/default `waitFor`; passes with 30-second test timeout in ~5.7 seconds. |
| Full `test:ci` | INCOMPLETE / FAILING GATE | Server segment passes; Electron segment hits sync test budget and suite-lifecycle/non-termination issues. |

## 3. Requested Feature Coverage

### 3.1 Fully Present and Evidence-Backed

| Requested update | Status | Verified implementation |
|---|---:|---|
| Seedream v5 Pro/Lite/v4 text-to-image | PASS | Registered in `src/config/image-model-capabilities.ts`, fallback catalog, and payload/capability tests. |
| Seedream v5 Pro/Lite/v4 image editing | PASS | Edit-only IDs registered and excluded from text-to-image selection; UI tests verify separation. |
| Image-edit API drift remediation | PASS | Canonical `model` field, edit-capability filtering, binary-result handling, and legacy-field rejection in `src/services/media-request-adapter.ts` and tests. |
| Upscale API drift remediation | PASS | Fixed route contract uses only image, scale, and optional creativity; no invented upscale model selector. |
| Background-removal contract | PASS | Fixed route, no model selector, binary PNG handling, transparency-preserving media path. |
| Music retrieval contract | PASS | Queue model retained; retrieve sends `model` + `queue_id`; JSON-processing and MP3/WAV/FLAC binary paths normalized. |
| Video queue/download handling | PASS | Queue `download_url` preserved; inline MP4 and signed-download completion supported; durable local media persistence and deduplication tests present. |
| Generated media saved to gallery | PASS | Main-process generated-media store and stable media protocol URLs; result is not persisted as a truncated multi-megabyte task data URL. |
| Character greeting/default first message | PASS | Character-bound empty state is separate from generic chat; greeting insertion is guarded against duplication. |
| Local character recognition | PASS | Character binding no longer depends on a hosted slug; `localCharacterId` path is implemented. |
| Character image cache across chat surfaces | PASS | Shared `src/components/characters/CharacterAvatar.tsx` is used across header/sidebar/history/chat paths. |
| Dedicated character hub | PASS | `src/components/CharactersView.tsx` normalizes hosted and local records with Hosted/Local/Favorites/Recent surfaces. |
| Separate character-chat workspace | PASS | `src/components/chat/CharacterChatsView.tsx`; standard and character conversation navigation are tested separately. |
| Negative-prompt template handling | PASS | Supported-model append/replace and unsupported-model warning/preservation behavior are tested. |
| Optional UI sounds | PASS | `src/services/uiSoundController.ts`, settings controls, application initialization, and subscriber wiring tests. |
| TTS on chat replies | PASS | Renderer controller, main-process guarded synthesis bridge, IPC, auto-read behavior, cache controls, and tests. |
| GIF loading-animation cycling | PASS | Central generation-animation registry and bundled mascot/GIF assets are present. |
| Persistent toast notifications | PASS | Central toast store/host is present and tested; generation/status notifications are not limited to a single tab view. |
| Per-chat model persistence/hot swap | PASS | Conversation model is persisted in `chat-store`; character model preference and unavailable-model fallback are tested. |
| Default standard-chat model GLM 4.6 | PASS | `DEFAULT_CHAT_MODEL` and resolver are `zai-org-glm-4.6`, with tests. |
| Message editing | PASS | Store operations and message bubble edit callbacks/tests are present. |
| Smooth mesh UI layer | PASS | Global `AppMeshOverlay`, mesh surfaces/cards, soft separators, and application-wide use are present. |
| Manual encrypted backup/import | PASS, with safety caveat | Main-process encryption, passphrase import, preview, merge/replace/new-profile modes, secret filtering, and tamper/wrong-password tests exist. |
| Encrypted sync folder | PASS, with CI timing caveat | Object packets, tombstones, stable device identity, acknowledgments, retries, atomic custody, symlink/path protections, conflict handling, and renderer/main IPC boundaries exist. |

### 3.2 Partial or Missing

| Requested update | Status | Gap |
|---|---:|---|
| All requested fallback API providers | PARTIAL | Working definitions/adapters/catalogs exist for Venice, Together, Groq, Fireworks, Google Gemini Developer API, Mistral, Anthropic, and Perplexity. `Replicate`, `AWS Bedrock`, `Google Vertex AI`, `Azure OpenAI`, and `Hugging Face` are explicitly `unavailable: true` and have empty model catalogs. Cohere is also unavailable. |
| Replace import safety backup | FAIL contract | `DataStoragePanel.tsx:82-85` clears every store before import. UI only requires `hasExported === true` during the current component session; it does not create, verify, retain, or rollback from an automatic pre-replace safety backup. A failed import after clearing can leave the current profile empty. |
| Backup manifest metadata | PARTIAL | `EncryptedBackupManifest` contains only `version`, `exportedAt`, `salt`, `iv`, and `ciphertext`. It omits app version, source device ID, profile ID outside ciphertext, encryption/KDF identifiers, key ID, content counts, blob counts, and explicit exclusions. |
| Import preview contract | PARTIAL | Preview shows total/store records and new/modified/conflict/identical counts. It does not surface backup date, source app version, source device, schema details, tombstone/deletion totals, blob totals, whether secrets are present, or structured warnings. |
| Key rotation | NOT FOUND | No user-facing or IPC key-rotation flow was located. Sync identity includes a key ID, but no complete rotation operation is exposed. |
| Advanced BYO sync providers | NOT IMPLEMENTED | No complete WebDAV/S3/R2/B2/MinIO/Git sync-provider implementation or UI flow was found. Folder sync remains the implemented mode. This is acceptable only if these remain explicitly deferred Phase 3 work. |
| Backup crypto documentation/UI | STALE | Electron backup encryption now uses Argon2id/XChaCha20-Poly1305 with legacy PBKDF2/AES-GCM decryption, but `docs/backup-and-sync.md`, `docs/data-export-format.md`, `docs/security-model.md`, `docs/sync-threat-model.md`, and `BackupSyncPanel.tsx:332` still state AES-256-GCM as the current sync format. |

## 4. Release-Blocking Findings

### P0-01 — Broken documentation link blocks `verify:contracts`

- **Evidence:** `docs/DOCS_INDEX.md:91` references `archives/session-history-pre-2026-07-11.md`.
- **Observed:** target file is absent from the clean archive.
- **Impact:** full static contract pipeline fails before later feature/release verifiers can complete.
- **Required correction:** restore the archived document or remove/replace the stale link; rerun `npm run verify:markdown-links` and `npm run verify:contracts`.

### P0-02 — Main bundle exceeds configured budget

- **Evidence:** `dist/assets/index-DO8mgnO_.js` = 602.00 KB; limit = 600 KB.
- **Impact:** `npm run verify:bundle-budget` fails, making the build non-releaseable under current policy.
- **Required correction:** identify the route/chunk owning the extra ~2 KB, move a dependency behind a lazy boundary or split the chunk, then verify the budget. Do not simply raise the budget without documenting and approving the regression.

### P0-03 — Sync regression test budget was not updated for the new KDF

- **Evidence:** `electron/services/syncFolderWatcher.test.ts:341-377` uses default test and `vi.waitFor` budgets while performing multiple Argon2id/XChaCha20 operations.
- **Observed:** default run fails; an audit-only copy with longer `waitFor` and `--testTimeout=30000` passes in ~5.7 seconds.
- **Interpretation:** this is a deterministic CI/test-budget defect, not proof that record/tombstone serialization is functionally broken.
- **Required correction:** mock/parameterize the expensive KDF in unit tests or give this integration-style case an explicit justified timeout. Keep production Argon2 settings unchanged.

### P0-04 — Full lint/test commands do not terminate reliably

- **Evidence:** full ESLint exceeded 360 seconds without output; Electron suite excluding the sync watcher displayed broad passing coverage but did not exit in the allotted window.
- **Impact:** CI can hang or consume the job timeout even when assertions pass.
- **Required correction:** run ESLint with timing/debug output to isolate the pathological file/rule; use Vitest open-handle diagnostics and inspect services that bind loopback servers/watchers/timers. Ensure every test-owned server, watcher, timer, and listener is closed in `afterEach`/`afterAll`.

## 5. High-Priority Product/Contract Findings

### P1-01 — Destructive replace import is not transactionally safe

Current sequence:

1. User may export once during the current settings-panel session.
2. `hasExported` becomes `true` without retaining or validating a safety-backup artifact.
3. Replace mode clears all `STORE_NAMES` concurrently.
4. Import then begins.

This does not meet the stated requirement to create a local safety backup immediately before destructive replace. Implement a main-process transaction coordinator:

1. Generate an encrypted pre-replace backup to a controlled recovery location.
2. Verify it can be opened and its manifest/hash is valid.
3. Record recovery metadata.
4. Stage/decrypt/validate incoming data before any clear.
5. Clear and apply only after validation succeeds.
6. Automatically restore or expose a one-click recovery path if apply fails.

### P1-02 — Fallback-provider rollout is incomplete

`src/types/provider.ts:60-100` marks the following requested providers unavailable:

- Replicate
- AWS Bedrock
- Google Vertex AI
- Azure OpenAI
- Hugging Face

`src/config/provider-models.ts` contains empty arrays for those providers. Their presence in the registry is not equivalent to implementation. Either implement provider-specific authentication, endpoints, payload/response adapters, capability catalogs, consent, error normalization, and tests, or label them as explicitly deferred in the UI and roadmap.

### P1-03 — Backup format and preview are not sufficiently self-describing

The manual `.vfbackup` wrapper cannot identify the source app version, source device, declared cipher/KDF, key version, object counts, or exclusions without first decrypting the payload. Add a versioned authenticated manifest containing non-sensitive metadata and include:

- format/formatVersion
- appVersion
- createdAt
- sourceDeviceId
- profile ID or a non-identifying profile reference
- encryption algorithm/KDF/key ID
- per-store counts
- tombstone count
- blob count and include-media flag
- explicit secret/log/cache exclusions
- payload/content hash

The import modal should display these fields and warnings before apply.

### P1-04 — Crypto copy is inaccurate

- **Implementation:** new Electron backup packets use Argon2id and XChaCha20-Poly1305; 12-byte-IV legacy manifests use PBKDF2/AES-256-GCM.
- **Stale copy:** multiple docs and `BackupSyncPanel.tsx` state all current sync data uses AES-256-GCM.
- **Required correction:** describe both current and legacy formats precisely. Do not imply the browser fallback and desktop implementation use identical primitives.

## 6. Security Boundary Review

### Confirmed controls

- Renderer filesystem access remains mediated through typed preload/IPC APIs.
- Main process owns encrypted backup operations, sync-folder custody, generated-media persistence, and signed video downloads.
- API/provider credentials use secure-store boundaries and are excluded from portable data.
- Sync store names, IDs, packet size, profile identity, sync-set identity, and source devices are validated.
- Symlink and path-escape protections exist for sync roots and watched packets.
- Diagnostics and sync errors use redaction helpers.
- No dependency vulnerabilities were reported by npm audit.

### Remaining security concern

The replace-import failure mode is a data-availability risk. It is not a confidentiality bypass, but destructive clearing before a fully staged/verified import can cause unrecoverable local data loss.

## 7. Recommended Remediation Order

### Release gate — must fix before packaging

1. Repair `docs/DOCS_INDEX.md` broken archive link.
2. Reduce/split the 602 KB main bundle chunk.
3. Correct the sync test's KDF-aware timeout strategy.
4. Find and close ESLint/Vitest non-termination sources.
5. Rerun `npm run lint`, `npm run test:ci`, `npm run verify:contracts`, `npm run build`, and post-build dist/budget verifiers from a clean install.

### Product safety — must fix before advertising replace import

6. Stage and validate incoming backup before clearing stores.
7. Automatically create and verify a pre-replace recovery backup.
8. Add rollback/recovery behavior and focused failure-injection tests.

### Requirement completeness

9. Decide whether the five unavailable fallback providers are in-scope for this release. Implement them or explicitly mark them deferred.
10. Expand the backup manifest and import preview metadata.
11. Update all backup/sync crypto documentation and UI copy.
12. Add key rotation and advanced provider work to a current, non-closed roadmap if still deferred.

## 8. Required Revalidation Matrix

Run from a clean checkout/archive after corrections:

```bash
npm ci
npm audit
npm run lint
npm run typecheck
npm run test:ci
npm run verify:contracts
npm run build
npm run verify:dist
npm run verify:icon
npm run verify:bundle-budget
npm run verify:archive-clean
```

Focused mandatory regressions:

```bash
npx vitest run electron/services/syncFolderWatcher.test.ts --fileParallelism=false
npx vitest run src/services/backupExportService.test.ts src/services/backupImportService.test.ts --fileParallelism=false
npx vitest run src/services/media-request-adapter.test.ts src/services/audio-retrieve-normalizer.test.ts src/services/video-retrieve-normalizer.test.ts --fileParallelism=false
npx vitest run src/components/chat/chat-view.test.tsx src/components/characters/CharacterAvatar.test.tsx src/components/CharactersView.test.tsx src/components/chat/CharacterChatsView.test.tsx --fileParallelism=false
npx vitest run src/services/uiSoundController.test.ts src/services/chatTtsController.test.ts --fileParallelism=false
```

Manual packaged-app QA still required:

- Live Venice image edit, upscale, and background removal.
- Live music and both video completion modes.
- Tab switch and app restart during background media jobs.
- Media playback after restart and exact-once gallery insertion.
- Hosted/local character greeting and avatar rendering across every surface.
- Two-machine or two-instance encrypted folder sync with record/edit/delete/conflict sequences.
- Replace-import failure injection and recovery verification.
- Provider credential and request tests for every provider advertised as available.

## 9. Final Assessment

The snapshot is a substantial and technically credible update. The core API-contract drift and character/media regressions are addressed, and the feature surface is materially broader than the prior build. However, the repository's own release policy is still failing, destructive replace import is not yet safely transactional, and the fallback-provider claim exceeds what is actually implemented.

**Release recommendation: HOLD.** Fix the four red gates and the replace-import safety defect, then rerun the complete validation matrix. The remaining unavailable providers and advanced sync features must be either implemented or explicitly documented as deferred rather than treated as included.
