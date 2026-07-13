# Venice Forge ZIP Audit Report

## 1. Audit Baseline

```yaml
audit_run_id: VF-AUDIT-20260713T003700Z-97da773
authoritative_input: Venice_Forge-clean-20260712-172641.zip
archive_commit: 97da7736a361ec5c4612e811b650329774bc8fe7
archive_branch: main
archive_worktree: clean
package_version: 2.1.2
node_version: v22.16.0
npm_version: 10.9.2
content_files: 1034
text_lines: 216328
binary_files: 4
git_metadata_present: false
coverage_model: all files inventoried and automatically scanned; high-risk subsystems
  deep-audited; exhaustive semantic line-by-line coverage not claimed
```

The ZIP was checked for path traversal and symlink entries before extraction. No unsafe archive entries were found. The embedded export metadata identifies a clean `main` snapshot at commit `97da7736a361ec5c4612e811b650329774bc8fe7`; `.git` was intentionally absent, so tracking state was derived from the archive manifest rather than `git ls-files`.

## 2. Executive Result

**Release status: BLOCKED.** The audit confirmed **15 actionable findings**: 7 High, 7 Medium, and 1 Low. The release blockers are `T-001, T-002, T-003, T-004, T-005, T-006, T-007`.

The most serious defects are concentrated in encrypted sync/backup and fallback-provider consent. The sync watcher currently ignores its own hidden directory; most syncable stores cannot be applied in Electron; tombstone authorization cannot reach the target record; Electron and web backup formats are mutually incompatible; imports can discard concurrent edits; disabled providers can still receive prompts; and the renderer can acknowledge remote operations without proving durable application.

No Critical credential exposure was confirmed. `npm ci` reported zero vulnerabilities, no populated `.env` file was included, and the archive’s high-risk secret scan was consistent with an independent review.

## 3. Findings Summary

| ID | Severity | Category | Finding | Release blocker |
|---|---|---|---|---|
| T-001 | HIGH | data-integrity | Electron and web backups use incompatible schema-v2 ciphertext encodings | Yes |
| T-002 | HIGH | sync | Sync watcher ignores the entire hidden .vfbackup tree | Yes |
| T-003 | HIGH | data-integrity | Remote tombstone grants cannot authorize deletion of the underlying record | Yes |
| T-004 | HIGH | ipc | Renderer can acknowledge a remote packet without proving durable application | Yes |
| T-005 | HIGH | privacy | Disabled fallback providers can still receive private prompts | Yes |
| T-006 | HIGH | data-integrity | Electron remote sync rejects twelve renderer-managed data stores | Yes |
| T-007 | HIGH | data-integrity | Global import suppression silently discards concurrent local sync mutations | Yes |
| T-008 | MEDIUM | ci | Agent-doc verifier resolves maintainer-only absolute paths | No |
| T-009 | MEDIUM | docs | Roadmap marks Backup/Sync complete while conflict UI and core flows remain broken | No |
| T-010 | MEDIUM | ipc | Backup crypto IPC bypasses rate limiting and input-size validation | No |
| T-011 | MEDIUM | provider | Automatic fallback reuses Venice model IDs on incompatible providers | No |
| T-012 | MEDIUM | build | Clean ZIP excludes a document required by active Markdown links | No |
| T-013 | MEDIUM | test | Backup/sync contract verifier checks source strings instead of behavior | No |
| T-014 | MEDIUM | provider | Provider capability badges exceed implemented adapter endpoints | No |
| T-015 | LOW | accessibility | Secret-entry fields lack stable accessible labels | No |

## 4. Detailed Findings

### T-001 — Electron and web backups use incompatible schema-v2 ciphertext encodings

- Severity: **HIGH**
- Confidence: **high**
- Category: `data-integrity`
- Locations: `electron/services/backupCrypto.ts:48-79`; `src/services/backupExportService.ts:84-97`; `src/services/backupImportService.ts:53-68`

Evidence:
```text
// Electron
const finalCiphertext = encrypted + ":" + authTag;
...
const parts = ciphertextWithTag.split(":");
if (parts.length !== 2) throw new Error("Invalid ciphertext format (missing auth tag)");

// Web
const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedPayload);
ciphertext: toBase64(ciphertextBuffer)
```

**Problem:** Both runtimes declare the same backup schema version, but Electron stores separate base64 ciphertext and tag joined by a colon while WebCrypto stores one combined ciphertext-plus-tag buffer.

**Impact:** A backup exported in Electron cannot be imported in web mode, and a web backup cannot be imported in Electron, contradicting the portable “any device” product claim.

**Required remedy:**

Define a canonical versioned encryption envelope with explicit `algorithm`, `kdf`, `iterations`, `salt`, `iv`, `ciphertext`, and `authTag` fields, or a single specified binary layout. Bump the format version and add migration readers for both existing schema-v2 encodings. Add committed Electron-produced and WebCrypto-produced fixtures and test both import directions.

**Validation:**
- `npx vitest run tests/backup/cross-runtime-backup.test.ts --fileParallelism=false` — expected: Electron and web fixtures decrypt in both runtimes and tampering is rejected; observed: **new-required** — Direct reproduction: Electron→web failed with InvalidCharacterError; web→Electron failed with missing authentication tag.

### T-002 — Sync watcher ignores the entire hidden .vfbackup tree

- Severity: **HIGH**
- Confidence: **high**
- Category: `sync`
- Locations: `electron/services/syncFolderWatcher.ts:492-497`; `electron/services/syncFolderWatcher.test.ts:16-27`

Evidence:
```text
watcher = chokidar.watch([path.join(vfbackupPath, "blobs"), path.join(vfbackupPath, "objects")], {
  ignored: /(^|[/\])\../,
  persistent: true,
  ignoreInitial: false,
  depth: 0
});
```

**Problem:** The watcher is rooted below `.vfbackup`, but its ignore expression rejects every path containing a dot-prefixed component, so no remote packet event is delivered.

**Impact:** Encrypted sync can appear active while remote object and blob changes are never imported.

**Required remedy:**

Remove the blanket hidden-component regular expression from the explicit `.vfbackup/blobs` and `.vfbackup/objects` watches. Replace it with an ignore predicate limited to temporary files and known non-packet entries. Add a real-Chokidar integration test that creates a packet inside a temporary `.vfbackup/objects` directory and waits for an `add` event; do not mock Chokidar in that test.

**Validation:**
- `npm run test:electron` — expected: all Electron tests pass, including a real filesystem watcher fixture; observed: **pass** — Existing mocked watcher tests passed but do not cover hidden-directory semantics.
- `npx vitest run electron/services/syncFolderWatcher.integration.test.ts --fileParallelism=false` — expected: a packet created under `.vfbackup/objects` emits exactly one event; observed: **new-required** — Standalone reproduction emitted no events with the current ignore rule and emitted events when the rule was removed.

### T-003 — Remote tombstone grants cannot authorize deletion of the underlying record

- Severity: **HIGH**
- Confidence: **high**
- Category: `data-integrity`
- Locations: `electron/services/syncFolderWatcher.ts:595-614`; `electron/services/remoteApplyAuthority.ts:22-33`; `src/services/backupImportService.ts:227-235`

Evidence:
```text
const remoteApplyToken = issueRemoteApplyGrant(parsed._operationId, parsed._storeName, parsed._id);
...
return grant?.storeName === storeName && grant.recordId === recordId;
...
await deleteStoreRecord(validation.tombstone.storeName, validation.tombstone.recordId, importOrigin, remoteApplyToken);
```

**Problem:** A tombstone packet receives authority for `tombstones/<store>:<id>`, but importing it requests deletion of `<store>/<id>`, which fails the exact store-and-ID authority check.

**Impact:** Remote deletes for main-process-managed records are rejected, leaving deleted records present and vulnerable to later resurrection.

**Required remedy:**

Validate tombstones in the main process and issue a grant containing both packet identity and an explicit target mutation `{operationId, targetStore, targetId, operation: "delete", payloadHash}`. Consume the grant atomically when the target delete succeeds. Add an end-to-end test using the real watcher authority, import service, and storage adapter rather than mocks.

**Validation:**
- `npx vitest run tests/sync/tombstone-authority.integration.test.ts --fileParallelism=false` — expected: a remote conversations tombstone deletes the conversation and records one acknowledgment; observed: **new-required** — Direct authority reproduction accepted the packet grant but rejected the underlying delete.

### T-004 — Renderer can acknowledge a remote packet without proving durable application

- Severity: **HIGH**
- Confidence: **high**
- Category: `ipc`
- Locations: `electron/services/syncFolderWatcher.ts:280-305`; `electron/ipc/handlers/syncHandlers.ts:137-145`; `electron/services/remoteApplyAuthority.ts:4-33`

Evidence:
```text
ipcMain.handle("sync:acknowledgeOperation", async (_event, input) => {
  return await acknowledgeOperation(input.operationId, input.ok);
});
...
if (ok) {
  await recordAppliedOperation(operationId, inFlight.storeName, "applied", inFlight.sourceDeviceId);
  await collectAcknowledgedEvent(...);
}
```

**Problem:** Any renderer that knows an in-flight operation ID can send a positive acknowledgment; the acknowledgment is not bound to the grant token, target mutation, payload hash, or a main-process commit result.

**Impact:** A compromised renderer or logic bug can mark unapplied data as applied and allow event collection, causing silent permanent data loss.

**Required remedy:**

Move apply-and-ack into one main-process transaction. Bind the grant to `{operationId, packetHash, targetStore, targetId, operation}`; consume it once after the main-owned or renderer-owned storage adapter returns durable success. Do not expose a standalone positive acknowledgment that can advance the journal without commit evidence.

**Validation:**
- `npx vitest run tests/sync/remote-apply-transaction.test.ts --fileParallelism=false` — expected: an acknowledgment cannot be recorded unless the bound mutation durably succeeds; observed: **new-required**

### T-005 — Disabled fallback providers can still receive private prompts

- Severity: **HIGH**
- Confidence: **high**
- Category: `privacy`
- Locations: `src/components/settings/ProvidersPanel.tsx:67-85`; `src/components/settings/ProvidersPanel.tsx:115-130`; `src/services/desktopBridge.ts:88-95`; `electron/services/veniceClient.ts:354-359`; `electron/services/providerAdapters.ts:320-328`

Evidence:
```text
fallbackConfig: {
  enabled: useSettingsStore.getState().autoFallbackEnabled,
  ordering: useSettingsStore.getState().fallbackOrdering,
}
...
const extra = fallbackConfig.ordering.filter(p => p !== "venice");
providersToTry.push(...extra);
...
const apiKey = getProviderApiKey(providerId, profileId);
```

**Problem:** The main process receives fallback ordering but not the enabled-provider consent state, and it routes to every ordered provider with a stored key.

**Impact:** A provider that the user disabled can receive prompt and conversation content during automatic fallback.

**Required remedy:**

Persist provider consent in a main-process, profile-scoped registry. Before routing, intersect fallback routes with providers that are explicitly enabled, configured, available, and modality-compatible. Disabling a provider must remove or ignore stale ordering entries. Add a test that stores a key, disables the provider, leaves it in ordering, triggers a retryable Venice failure, and proves no request reaches that provider.

**Validation:**
- `npx vitest run electron/services/veniceClient.adapters.test.ts --fileParallelism=false` — expected: disabled providers are skipped even when configured and present in ordering; observed: **pass** — Current adapter tests pass but do not send enabled-provider state.

### T-006 — Electron remote sync rejects twelve renderer-managed data stores

- Severity: **HIGH**
- Confidence: **high**
- Category: `data-integrity`
- Locations: `src/constants/venice.ts:141-179`; `src/services/backupImportService.ts:78-88`; `electron/ipc/handlers/syncHandlers.ts:95-127`

Evidence:
```text
if (isElectron() && origin === "remote-sync") {
  const result = await desktopSync.applyRemoteMutation({ storeName, id, recordJson, remoteApplyToken });
  if (!result.ok) throw new Error(result.error || "Remote sync save was rejected.");
  return;
}
...
default:
  return { ok: false, error: "Remote mutation store is not main-process managed." };
```

**Problem:** Every authenticated remote mutation in Electron is routed to one main-process handler, but that handler supports only seven stores while the sync allowlist contains nineteen user-data stores.

**Impact:** Images, web chats, settings, memory, files, projects, prompts, scenes, workflow templates, research sessions, visual workflows, and playground data cannot converge through Electron sync.

**Required remedy:**

Create one typed store-ownership registry covering every syncable store. Route main-owned stores to main-process storage adapters. Route renderer-owned IndexedDB stores through a narrowly scoped, authenticated renderer apply path, or migrate those stores to main ownership. Acknowledge a packet only after the selected owner durably commits it. Add a parameterized integration test over every syncable store and fail if a store is allowlisted without an apply adapter.

**Validation:**
- `npm run verify:backup-sync` — expected: verifier exercises every syncable store through the real apply boundary; observed: **pass** — Current verifier passed despite the unsupported-store matrix.
- `npx vitest run tests/sync/store-apply-matrix.test.ts --fileParallelism=false` — expected: every syncable store can apply save and delete operations in Electron; observed: **new-required**

### T-007 — Global import suppression silently discards concurrent local sync mutations

- Severity: **HIGH**
- Confidence: **high**
- Category: `data-integrity`
- Locations: `src/services/backupImportService.ts:359-393`; `electron/services/syncFolderWatcher.ts:453-455`; `electron/services/syncFolderWatcher.ts:625-628`

Evidence:
```text
await desktopSync.setEmissionSuppressed({ suppressed: true });
...
localEmissionSuppressed = suppressed;
...
if (localEmissionSuppressed) return { ok: true };
```

**Problem:** Manual import flips one process-global suppression flag, and every local mutation during that window receives a false success without being written to the durable outbox.

**Impact:** Concurrent user edits or background writes can remain local forever while the application reports successful sync emission.

**Required remedy:**

Remove process-global emission suppression. Propagate a scoped mutation origin/operation token through the import transaction and suppress only writes caused by that imported operation. Every unrelated local write must durably enqueue before returning success. Add a concurrency test that performs a local edit during a multi-record import and proves the edit remains in the outbound outbox.

**Validation:**
- `npx vitest run tests/sync/import-concurrency.test.ts --fileParallelism=false` — expected: a concurrent local mutation is durably enqueued exactly once during import; observed: **new-required**

### T-008 — Agent-doc verifier resolves maintainer-only absolute paths

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `ci`
- Locations: `AGENTS.md:70-72`; `scripts/verify-agent-docs.cjs:106-116`; `scripts/verify-agent-docs.test.ts:201-204`

Evidence:
```text
`/Users/super_user/Projects/Venice_Forge/docs/reference/Venice_api_LLM_info.md`
...
const targetPath = path.resolve(repoRoot, mdPath);
if (!fs.existsSync(targetPath)) {
  errorSet.add(`ERROR: ${doc} references missing file ${mdPath}.`);
}
```

**Problem:** The canonical agent guide contains absolute local Markdown paths, and the verifier treats them as literal filesystem targets outside any extracted or CI checkout.

**Impact:** `verify:agent-docs`, the unit aggregate, and the contract suite fail on any machine not using the maintainer’s exact checkout path.

**Required remedy:**

Replace API-reference links in `AGENTS.md` with repository-relative paths. Update the verifier to reject private absolute Markdown references explicitly, while allowing the separately documented local root bootstrap assertion. Add a fixture that runs verification from a randomized temporary root.

**Validation:**
- `npm run verify:agent-docs` — expected: passes from an arbitrary extraction directory; observed: **fail** — Reported the missing `/Users/super_user/.../Venice_api_LLM_info.md` path.
- `npx vitest run scripts/verify-agent-docs.test.ts --fileParallelism=false` — expected: actual-repository and temporary-root tests pass; observed: **fail** — The actual-repository test failed with the same absolute path.

### T-009 — Roadmap marks Backup/Sync complete while conflict UI and core flows remain broken

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `docs`
- Locations: `docs/ROADMAP.md:9-13`; `src/components/settings/BackupSyncPanel.tsx:330-355`

Evidence:
```text
### [x] Finish Backup/Sync Conflict and Lifecycle Coverage
- **Status:** Closed (2026-07-12)
...
"Sync is active. New changes will be automatically merged. (Conflict resolution UI is under development)."
```

**Problem:** The canonical release ledger closes Backup/Sync despite explicit incomplete conflict UX and confirmed failures in watcher delivery, store routing, delete authority, backup portability, and import concurrency.

**Impact:** Maintainers and users receive a false release-readiness signal for a privacy- and data-integrity-sensitive feature.

**Required remedy:**

Reopen the P0 Backup/Sync item. List T-001 through T-007 as release blockers, mark conflict-resolution UI as incomplete, and require the new behavioral test matrix plus native packaged smoke before closure. Update `docs/summary_of_work.md` only after fixes and validation actually land.

**Validation:**
- `npm run verify:markdown-links` — expected: updated roadmap links remain valid; observed: **fail** — Currently blocked by T-010.
- `npm run verify:backup-sync` — expected: behavioral acceptance suite passes before roadmap closure; observed: **pass** — Current static verifier is insufficient; see T-012.

### T-010 — Backup crypto IPC bypasses rate limiting and input-size validation

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `ipc`
- Locations: `electron/ipc/handlers/common.ts:7-13`; `electron/ipc/handlers/syncHandlers.ts:147-168`

Evidence:
```text
export function registerIpcChannel(channel, handler): void {
  ipcMain.handle(channel, rateLimitIpcHandler(channel, handler));
}
...
ipcMain.handle("sync:encryptBackup", async (_event, params) => {
  const encrypted = await encryptPayload(params.payload, params.password);
});
```

**Problem:** The sync crypto handlers use raw `ipcMain.handle`, accept unbounded strings, and invoke an expensive PBKDF2/AES operation in the main process.

**Impact:** A compromised or malfunctioning renderer can repeatedly submit oversized payloads and passwords, consuming main-process CPU and memory and freezing the application.

**Required remedy:**

Register sync handlers through `registerIpcChannel`. Validate payload shape before crypto, cap plaintext/ciphertext/base64/password lengths to documented backup limits, and reject malformed base64 before KDF work. Move expensive derivation/encryption to a worker when payload size crosses a small threshold. Add rate-limit and oversized-input tests.

**Validation:**
- `npm run test:electron` — expected: sync IPC rate-limit, validation, and maximum-size tests pass; observed: **pass** — Existing Electron suite passed but does not cover these limits.

### T-011 — Automatic fallback reuses Venice model IDs on incompatible providers

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `provider`
- Locations: `electron/services/veniceClient.ts:348-376`; `electron/services/veniceClient.ts:391-394`; `src/config/provider-models.ts:1-110`

Evidence:
```text
const originalModel = request.body.model;
...
model: `${providerId}:${originalModel}`
...
if (response.ok || ![408, 429, 500, 502, 503, 504].includes(response.status)) {
  return response;
}
```

**Problem:** Fallback prepends another provider ID to the selected Venice model instead of selecting a model available from that provider, then stops on the expected 400/401 client error.

**Impact:** Automatic fallback is normally nonfunctional for Venice-native model IDs and may stop at the first incompatible provider.

**Required remedy:**

Replace `string[]` fallback ordering with validated routes such as `{providerId, modelId, modality}`. Build routes from the provider model catalog and reject unavailable combinations before network I/O. Add tests using a Venice-only model and prove each fallback uses the configured target-provider model.

**Validation:**
- `npx vitest run electron/services/veniceClient.adapters.test.ts --fileParallelism=false` — expected: fallback uses provider-specific model IDs and skips invalid routes; observed: **pass** — Current tests cover explicit provider prefixes, not automatic Venice-to-provider model mapping.

### T-012 — Clean ZIP excludes a document required by active Markdown links

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `build`
- Locations: `scripts/clean-repo-zip.sh:239-252`; `.gitignore:18-20`; `docs/summary_of_work.md:9-11`; `docs/DOCS_INDEX.md:85-89`

Evidence:
```text
"--exclude=*session*.md"
...
!docs/archives/session-history-pre-2026-07-11.md
...
[archives/session-history-pre-2026-07-11.md](archives/session-history-pre-2026-07-11.md)
```

**Problem:** The archive script broadly excludes every session Markdown file, including the explicitly retained archive document linked by two active documents.

**Impact:** The official clean ZIP cannot pass `verify:markdown-links` and ships incomplete documentation.

**Required remedy:**

Build source archives from an explicit tracked-file manifest (`git archive` or `git ls-files`) and then add only approved metadata. If the current rsync approach remains, re-include `docs/archives/session-history-pre-2026-07-11.md` after the broad exclusion. Run `verify:markdown-links` and `verify:contracts:static` against the staged archive root before compression.

**Validation:**
- `npm run verify:markdown-links` — expected: all links resolve inside the extracted clean archive; observed: **fail** — The extracted ZIP reports two missing links to the excluded archive file.

### T-013 — Backup/sync contract verifier checks source strings instead of behavior

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `test`
- Locations: `scripts/verify-backup-sync.cjs:80-102`; `electron/services/syncFolderWatcher.test.ts:16-27`; `src/services/syncEngine.test.ts:150-156`

Evidence:
```text
function mustContain(file, label, fragments) {
  text = read(file);
  for (const f of fragments) {
    check(`${label} → ${JSON.stringify(f)}`, text.includes(f));
  }
}
```

**Problem:** The release contract proves that named functions and strings exist but does not prove filesystem events, cross-runtime cryptography, store routing, authority transitions, or convergence.

**Impact:** `verify:backup-sync` passes while multiple release-blocking backup and sync behaviors fail direct reproduction.

**Required remedy:**

Keep minimal static guards only for architecture invariants, and make `verify:backup-sync` execute behavioral tests for real Chokidar delivery, every-store apply routing, tombstone authority, Electron↔web backup fixtures, import concurrency, and multi-device convergence. Fail the verifier when any required test file is absent.

**Validation:**
- `npm run verify:backup-sync` — expected: fails against the current broken behaviors and passes after their fixes; observed: **pass** — Current verifier passed; a focused 93-test cluster also passed while direct reproductions failed.

### T-014 — Provider capability badges exceed implemented adapter endpoints

- Severity: **MEDIUM**
- Confidence: **high**
- Category: `provider`
- Locations: `src/types/provider.ts:48-105`; `electron/services/providerAdapters.ts:29-30`; `electron/services/providerAdapters.ts:118-120`; `electron/services/providerAdapters.ts:199-200`; `electron/services/providerAdapters.ts:268-270`

Evidence:
```text
groq: { supportedTypes: ["chat", "audio"] },
fireworks: { supportedTypes: ["chat", "image"] },
google_gemini: { supportedTypes: ["chat", "image", "video", "audio", "embeddings"] },
mistral: { supportedTypes: ["chat", "embeddings"] },
...
if (originalPath !== "/chat/completions") return null;
```

**Problem:** The UI-facing registry advertises audio, image, video, and embeddings support that the corresponding adapters reject because they implement chat only.

**Impact:** Users are shown unsupported functionality and requests fail after configuration.

**Required remedy:**

Make one typed adapter manifest the source of truth for availability, modalities, endpoints, and model catalog. Derive UI badges and route validation from it. Extend `verify:provider-adapters` with a table-driven parity test that invokes every advertised modality.

**Validation:**
- `npm run verify:provider-adapters` — expected: every advertised provider modality has a working adapter test; observed: **pass** — The current verifier passed despite registry/adapter mismatch.

### T-015 — Secret-entry fields lack stable accessible labels

- Severity: **LOW**
- Confidence: **high**
- Category: `accessibility`
- Locations: `src/components/settings/DataStoragePanel.tsx:25-32`; `src/components/settings/ProvidersPanel.tsx:216-223`

Evidence:
```text
<input type="password" placeholder="Backup Password" ... />
...
<input type="password" placeholder="Enter API Key" ... />
```

**Problem:** Backup-password and provider-key fields rely on placeholder text and have no associated `<label>` or provider-specific accessible name.

**Impact:** Screen-reader users cannot reliably identify the secret being entered; placeholder text also disappears after input.

**Required remedy:**

Add visible or screen-reader-only `<label htmlFor>` elements with stable unique IDs. Name provider inputs with the provider label, set appropriate `autoComplete` values, and add `type="button"` to adjacent non-submit buttons where applicable. Add Testing Library assertions using `getByLabelText`.

**Validation:**
- `npm run test:ui:settings` — expected: settings inputs are discoverable by accessible label; observed: **pass** — Current settings tests pass but do not assert labels for these fields.

## 5. Validation Results

| Command | Status | Evidence |
|---|---|---|
| `npm ci` | PASS | 850 packages added; 851 audited; 0 vulnerabilities. |
| `npm run lint:eslint` | PASS | ESLint completed with zero warnings. |
| `npm run typecheck` | PASS | Renderer and Electron TypeScript pipelines passed. |
| `npm run build` | PASS | Renderer, server, and Electron build completed. |
| `npm run verify:dist` | PASS | Build-output verification completed. |
| `npm run test:server` | PASS | 59 tests passed as part of the segmented aggregate. |
| `npm run test:electron` | PASS | 39 files / 613 tests passed as part of the segmented aggregate. |
| `npm run test:ingestion` | PASS | Ingestion suite completed successfully in the segmented aggregate. |
| `npm run test:ui` | PASS | All layout, chat, media, research, and settings UI segments passed. |
| `npm run test:unit` | FAIL | One test failed from the absolute AGENTS.md path; one suite failed because Electron binary download/install was unavailable. |
| `npm run test:unit:types` | PASS | 6 files / 102 tests passed. |
| `npm run test:unit:theme` | PASS | 6 files / 118 tests passed. |
| `npm run verify:contracts:static` | FAIL | Stopped at verify:markdown-links because the clean ZIP omitted session-history-pre-2026-07-11.md. |
| `npm run verify:agent-docs` | FAIL | AGENTS.md points to `/Users/super_user/.../Venice_api_LLM_info.md`. |
| `npm run verify:backup-sync` | PASS | Static contract passed despite direct behavioral reproductions failing. |
| `npm run verify:provider-adapters` | PASS | Static/provider verifier passed. |
| `focused backup/sync/provider Vitest cluster` | PASS | 6 files / 93 tests passed. |
| `real Chokidar hidden-directory reproduction` | FAIL | Current ignore rule emitted zero events; control emitted add events. |
| `Electron↔web backup-format reproduction` | FAIL | Electron→web and web→Electron both failed while same-runtime round trips succeeded. |
| `tombstone authority reproduction` | FAIL | Packet grant accepted; target-store delete authority rejected. |
| `npm run test:coverage` | BLOCKED | Execution exceeded the available validation window before a threshold summary was produced. |
| `npm run smoke:electron` | BLOCKED | Electron binary installation/download was unavailable in the sandbox; no packaged GUI/display smoke was claimed. |

`npm run test:ci` was not reported as a complete pass because the aggregate exceeded the execution window while entering later segments. Its server, Electron, and ingestion segments completed successfully; the UI aggregate was then run independently and passed. The unit aggregate completed with the two failures described above. Coverage execution timed out before Vitest emitted threshold results, so coverage compliance remains unverified.

## 6. Historical and Documentation Reconciliation

| Claim | Disposition | Result |
|---|---|---|
| Backup/Sync conflict and lifecycle coverage is complete. | contradicted | Behavioral reproductions and cross-layer source tracing show release-blocking failures. |
| Current focused validation demonstrates sync completion. | partially-confirmed | Focused tests pass, but they mock or omit the failing boundaries. |
| No high-risk secrets are present. | confirmed | No populated `.env` file or raw provider key was found in the archive. Test fixtures contain secret-shaped placeholders. |

## 7. Coverage and Limitations

- All **1034** content files were inventoried with size, line count, type, and review depth in the CSV manifest.
- **45** high-risk or contract-relevant files received source-backed deep review.
- Remaining text files received deterministic inventory and automated pattern scanning and are marked `continuation-pending`; this report does not falsely claim a complete human semantic line audit of all 222,000+ lines.
- Windows and packaged macOS runtime smoke were not available in the sandbox.
- Real provider requests were intentionally not made; no user API keys were used.
- The Electron binary download failed in one unit verifier test, preventing packaged Electron smoke. This environment failure is separate from the confirmed repository defects.
- The repository was not modified.

## 8. Remediation Order

1. Fix T-002, T-003, T-004, and T-006 together as one main-authoritative remote-apply transaction redesign.
2. Standardize and migrate the backup format under T-001 before publishing any portability claim.
3. Replace global suppression under T-007 with operation-scoped provenance and a durable outbox invariant.
4. Enforce provider consent and provider-specific fallback models/capabilities under T-005, T-011, and T-014.
5. Replace static false-confidence gates under T-013 with behavioral integration tests, then reopen/close the roadmap under T-009 based on those results.
6. Repair source-archive and agent-doc portability under T-012 and T-008 so the clean ZIP can pass its own contracts.

## 9. Completion Summary

```yaml
coverage_complete: false
manifest_rows: 1034
deep_audited_files: 45
continuation_pending_files: 985
actionable_findings: 15
severity_counts:
  critical: 0
  high: 7
  medium: 7
  low: 1
  info: 0
release_blocked: true
release_blocking_ids:
- T-001
- T-002
- T-003
- T-004
- T-005
- T-006
- T-007
highest_risk_subsystems:
- sync-folder-watcher
- remote-mutation-routing
- sync-tombstone-authority
- encrypted-backup-format
- provider-consent-routing
```
