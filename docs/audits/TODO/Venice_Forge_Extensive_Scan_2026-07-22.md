# Venice Forge Extensive Repository Scan

**Audit date:** 2026-07-22
**Snapshot:** `Venice_Forge-clean-20260722-074814.zip`
**Repository version:** `3.0.0-beta.1`
**Extracted branch:** `main`
**Extracted commit:** `2669b67dd4525e220c1d309af8c371eed818ff28`
**Extracted worktree state:** clean
**Audit environment:** Node `22.16.0`, npm `10.9.2`
**Required Node contract:** `>=22.13.0 <23.0.0`

## 1. Executive Verdict

The July 22 snapshot contains substantial real implementation work. The media API-contract remediation, character persona separation, generated-media persistence, object-level encrypted sync-folder architecture, Electron browser hardening, safety guard, and repository contract scaffolding are materially present in source.

The snapshot is **not ready to close the chat-folder portability/lock work or pass a final release gate**. The highest-risk defects are not superficial UI omissions. They are durability, profile-isolation, and false-success failures in the main-process chat-folder path:

1. Chat-folder reorder, move, delete, lock, unlock, and legacy migration operations ignore storage result contracts and can report success after failed or partial writes.
2. `chat-folders:list` accepts a renderer-selected profile ID instead of deriving the profile exclusively from the sender session.
3. Bulk conversation move ignores structured `{ ok: false }` responses and can silently produce partial movement.
4. Folder import is exposed as a dead file input in the desktop UI and never invokes the implemented import service.
5. Folder lock backoff is calculated but not enforced; lock state and secure metadata can diverge after persistence failure.
6. Import IPC accepts renderer-selected arbitrary paths rather than a main-process file-picker capability or approved-path token.

These findings directly violate the reopened work order's own prohibitions against renderer-selected profiles, false-success notifications, renderer filesystem authority, and premature closure.

### Release assessment

| Area | Assessment |
|---|---|
| Media API request contracts | Materially remediated in static source |
| Character persona isolation and greeting ownership | Materially remediated in static source |
| Electron navigation/CSP-adjacent process boundaries | Strong static posture |
| Encrypted object-level sync-folder core | Strong foundation, runtime validation incomplete |
| Manual encrypted full-profile backup/import | Substantial implementation, new-profile rollback defect remains |
| Chat-folder export/import | Incomplete and unsafe to close |
| Chat-folder lock/privacy gate | Incomplete and insufficiently tested |
| Documentation/work-order authority | Internally inconsistent |
| Aggregate CI/build/test evidence | Not established in this audit due dependency-registry failure |

**Overall:** beta-quality foundation with **three P0 feature release blockers**, **six P1 defects**, and **five P2 integrity/maintainability defects** identified below.

---

## 2. Scope and Method

### 2.1 Snapshot inspection

The archive was checked for unsafe extraction paths before extraction. It contained:

- 1,461 archive entries.
- 1,317 extracted files.
- 949 TypeScript/TSX files.
- 402 test/spec files.
- 150 Markdown files.
- Approximately 169,081 TypeScript/TSX lines across `src/` and `electron/`, including tests.

The scan covered:

- Repository metadata and package contracts.
- Electron main/preload/IPC boundaries.
- Chat-folder persistence, locks, backup/import, and renderer state.
- Full-profile encrypted backup/import and sync-folder architecture.
- Media request adapters, background media completion, and generated-media persistence.
- Character conversation creation, character binding, and stale persona cleanup.
- Documentation, work-order status, contract scripts, and test coverage.
- Large production modules and architectural concentration risks.

### 2.2 Source-of-truth hierarchy

Claims were based on this order:

1. Current July 22 source code.
2. Current repository tests and verification scripts.
3. Current canonical work orders and roadmap.
4. Prior audit/work-order inputs used only as comparison leads.

Prior reports were not treated as proof that an issue remained or had been fixed.

### 2.3 Execution limitation

`npm ci --no-audit --no-fund --prefer-offline` was attempted four times. Every attempt failed with HTTP 503 while fetching:

```text
zwitch-2.0.4.tgz
https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/
```

The public npm registry was also unavailable from the sandbox and no complete dependency cache existed. Therefore:

- TypeScript compilation was not executed.
- ESLint was not executed.
- Vitest suites were not executed.
- Vite/Electron builds were not executed.
- Packaging was not executed.
- `npm audit` was not executed.

Static Node verifiers that did not require missing packages were executed individually. Findings labeled as runtime behavior are derived only where the control flow and result contract are unambiguous from source.

---

## 3. Validation Results

### 3.1 Aggregate static contract chain

`npm run verify:contracts:static` progressed through several checks and then failed at Markdown link validation.

| Check | Result | Evidence |
|---|---:|---|
| `verify:lockfile` | PASS | Lockfile recognized |
| `verify:repository-identity` | PASS | Archive mode accepted |
| `verify:roadmap-current` | PASS | Script-level status check passed |
| `verify:release-metadata` | PASS | Version metadata and stack facts match |
| `verify:bundle-budget` | SKIPPED | No `dist/assets` build output |
| `verify:safety-guard` | PASS | Guard enforcement and no-raw-log scan passed |
| `verify:markdown-links` | **FAIL** | Two links target a missing Document Agent specification |
| Remaining aggregate checks | NOT REACHED | Chain stopped at Markdown failure |

Broken links:

```text
docs/DOCS_INDEX.md:120
  audits/TODO/Function_calling_todo.md

docs/features/DOCUMENT_AGENT.md:62
  ../audits/TODO/Function_calling_todo.md
```

### 3.2 Individually executed static verifiers

| Verifier | Result |
|---|---:|
| `verify:repo-handoff-hygiene` | PASS |
| `verify:theme-tokens` | PASS |
| `verify:network-boundaries` | PASS |
| `verify:custom-protocol-privileges` | PASS |
| `verify:ci-contract` | PASS |
| `verify:agent-docs` | PASS |
| `verify:image-policy` | PASS |
| `verify:no-native-dialogs` | PASS |
| `verify:inactive-feature-archive` | PASS |
| `verify:prompt-library` | PASS |

### 3.3 Verifiers blocked by missing dependencies

These are **blocked**, not application failures:

| Verifier | Blocker |
|---|---|
| `verify:venice-api-docs` | `Cannot find module 'yaml'` |
| `verify:work-orders` | `Cannot find module 'yaml'` |
| `verify:provider-adapters` | `Cannot find module 'vitest/package.json'` |
| Test-bearing document verifiers | Dependency installation incomplete |

### 3.4 Required validation still outstanding

The following remain mandatory before release closure:

```bash
npm ci
npm run lint:eslint
npm run typecheck
npm run test:ci
npm run build
npm run verify:contracts
npm run ci
```

No report should describe these as passing based on this snapshot audit alone.

---

## 4. Prior Remediation Reverification

### 4.1 Media API-contract drift: materially corrected

The earlier media work order identified unsupported image properties, incorrect audio retrieval, discarded video `download_url`, and durable-media result problems. Current source now contains a shared request adapter and explicit legacy-key stripping/tests.

Verified static improvements include:

- Image edit uses the canonical `model` field.
- Upscale request construction is limited to `image`, `scale`, and optional `creativity`.
- Background removal does not require a model.
- Audio/video retrieval uses `model` plus `queue_id`.
- Video queue metadata preserves optional `download_url`.
- Background task persistence uses durable media identifiers rather than assuming a large persistent data URL.
- Media request construction is centralized in `src/services/media-request-adapter.ts`.

This is a meaningful improvement over the prior API-drift state. Runtime provider calls and binary playback were not re-executed in this audit.

### 4.2 Character persona leakage: materially corrected

Verified source behavior:

- `src/stores/chat-stream-manager.ts` derives hosted character identity from the active conversation metadata and removes stale global character slugs for standard/local chats.
- `src/stores/chat-store.ts` creates standard, hosted-character, and local-character conversations through distinct metadata paths.
- Character greetings are persisted as conversation messages rather than relying on an unreachable empty-state renderer.
- Migration logic removes stale global `character_slug` values from non-hosted conversations.

The formerly reported “character persona contaminates future normal chats” defect appears statically remediated.

### 4.3 Encrypted sync-folder core: strong foundation

The sync-folder subsystem includes important design controls:

- Object-level encrypted packets rather than raw database synchronization.
- XChaCha20-Poly1305/Argon2id-oriented cryptographic handling.
- Profile, sync-set, and device identity fields.
- Tombstone and conflict handling.
- Atomic/outbox-style writes.
- Packet bounds and path/symlink checks.
- Media inclusion as explicit opt-in.
- Main-process filesystem/crypto ownership.

This substantially follows the local-first encrypted sync roadmap. The primary unresolved problems are concentrated in the separate chat-folder operation/export/import path and in unexecuted runtime validation.

### 4.4 Electron shell hardening: verified

`electron/main.ts` statically configures application windows with:

```ts
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
```

Navigation and new-window controls are present both per-window and globally. Static network-boundary and custom-protocol verifiers passed. No change proposed by this audit requires weakening these controls.

---

# 5. Findings

## VF-SCAN-20260722-001 — Chat-folder mutations can report success after failed persistence

**Priority:** P0
**Release gate:** Chat-folder feature / beta
**Subsystem:** `electron/services/chatFolderService.ts`

### Evidence

Multiple operations call persistence functions whose contract is `{ ok: boolean; error?: string }` and ignore the result:

- Reorder: `electron/services/chatFolderService.ts:83-95`
- Move conversation: `electron/services/chatFolderService.ts:101-125`
- Delete folder/conversations: `electron/services/chatFolderService.ts:127-152`
- Legacy migration: `electron/services/chatFolderService.ts:165-257`

Representative pattern:

```ts
for (const f of folders) {
  f.sortOrder = order.indexOf(f.id);
  f.updatedAt = new Date().toISOString();
  await saveChatFolder(f, profileId); // result discarded
}
```

The IPC handlers then return `{ ok: true }` because no exception was thrown.

### Impact

- UI can show success while disk state was not committed.
- Reorder can partially commit across folder files.
- Conversation movement can update memory/caller state while the stored conversation remains unchanged.
- Delete can remove some conversations and fail on later records without rollback.
- Migration can produce duplicate split folders, partially moved conversations, or a still-live legacy folder.

This violates the reopened work order's **No False-Success Toasts** rule.

### Required correction

1. Treat every storage result as authoritative.
2. Throw or return a structured failure immediately when `ok === false`.
3. Introduce a main-process batch transaction/journal for multi-file operations:
   - Stage rewritten folder/conversation files.
   - `fsync` where applicable.
   - Atomically rename staged files.
   - Record rollback metadata before destructive deletes.
4. On partial failure, restore prior files or leave a recoverable operation journal.
5. Return a structured result containing committed IDs and rollback state.

### Required tests

Create direct service tests, not only mocked renderer-store tests:

```text
electron/services/chatFolderService.test.ts
```

Cover failed first write, failed middle write, failed delete, failed rollback, crash/interruption recovery, and exact IPC response behavior.

---

## VF-SCAN-20260722-002 — Renderer-selected profile ID bypasses chat-folder session isolation

**Priority:** P0
**Release gate:** Profile isolation / security
**Subsystem:** `electron/ipc/handlers/chatFolderHandlers.ts:38-41`

### Evidence

```ts
registerIpcChannel("chat-folders:list", async (event, requestedProfileId: unknown) => {
  const profileId = typeof requestedProfileId === "string"
    ? requestedProfileId
    : getProfileSessionId(event.sender);
  const result = await listChatFolders(profileId);
});
```

Every other folder operation derives the profile from `event.sender`; list is the exception.

### Impact

A compromised or defective renderer can enumerate folder metadata from another valid local profile by supplying its ID. This directly violates the work order's **No Renderer-Selected Profile Identities** prohibition.

### Required correction

- Remove `requestedProfileId` from the channel contract.
- Derive profile exclusively from `getProfileSessionId(event.sender)`.
- Where administrative cross-profile operations are genuinely needed, create a separate privileged main-process workflow with explicit local-user confirmation and capability-scoped authorization.
- Validate that all folder storage paths derive from a server-side profile registry, never directly from renderer input.

### Required tests

Add IPC tests proving:

- Supplied profile IDs are rejected or ignored.
- Sender session profile is always used.
- Unknown/unbound sender session fails closed.
- Profile directory traversal is impossible.

---

## VF-SCAN-20260722-003 — Bulk conversation movement silently ignores structured failures

**Priority:** P0
**Release gate:** Chat-folder feature
**Subsystem:** `src/stores/chat-folder-store.ts:172-187`

### Evidence

Single move correctly checks the response:

```ts
const res = await desktopChatFolders.moveConversation(...);
if (!res.ok) throw new Error(res.error);
```

Bulk move does not:

```ts
for (const conversationId of conversationIds) {
  await desktopChatFolders.moveConversation({ conversationId, folderId: destinationFolderId });
}
```

IPC returns failures as resolved `{ ok: false, error }` values, so the loop neither throws nor reports which records failed.

### Impact

- Dragging or moving multiple chats can partially succeed.
- Caller can treat the entire operation as successful.
- Failed chat IDs are not surfaced.
- Reload can reveal a different result than the immediate UI.

### Required correction

Prefer one IPC operation:

```ts
moveConversations({ conversationIds, folderId, expectedProfileRevision })
```

The main process should validate all IDs, enforce lock state, commit atomically or return a detailed partial/rollback result. Do not loop one IPC call per record in the renderer.

### Required tests

- Second-of-three move returns failure and no partial state remains.
- Locked destination rejects before any movement.
- Missing source conversation rejects before commit.
- Renderer emits no success state on `{ ok: false }`.

---

## VF-SCAN-20260722-004 — Folder lock can enter secure-store/disk split-brain state

**Priority:** P1
**Release gate:** Folder privacy gate
**Subsystem:** `electron/services/chatFolderLockService.ts`

### Evidence

The service writes secure credentials first, then discards the folder persistence result:

```ts
setCredential(getLockCredentialKey(input.folderId), JSON.stringify(lockMetadata));
...
await saveChatFolder(folder, profileId);
logInfo("Folder locked", ...);
```

Unlock has the same pattern at `electron/services/chatFolderLockService.ts:226-230`.

Additional defects in the same service:

- `OPSLIMIT` and `MEMLIMIT` are read from libsodium at module initialization (`:10-12`) before `await _sodium.ready`.
- Credential names use only `folderId`, not `profileId` (`:24-29`).
- Lock passphrase validation accepts any non-empty string (`:44`).
- Keying material is not explicitly zeroed after use.
- The “remember on device” derivation uses a fixed literal passphrase plus random salt; OS secure storage is already the security boundary, so the extra wrapping does not establish a stable device-secret model and complicates recovery.

### Impact

- Secure metadata can say “locked” while the folder JSON remains unlocked, or vice versa.
- First-use libsodium constants may be invalid depending on wrapper initialization behavior.
- Cross-profile UUID collision can share credential entries.
- Very weak passphrases are accepted.
- Recovery and migration behavior becomes ambiguous.

### Required correction

1. Resolve sodium constants only after `await _sodium.ready`.
2. Scope credentials by profile and folder:

```text
chat-folder-lock:<profileId>:<folderId>
```

3. Establish an explicit two-phase state transition:
   - Validate and prepare lock metadata.
   - Persist folder lock intent/revision.
   - Store credential.
   - Finalize folder state.
   - Roll back both surfaces on failure.
4. Use the same minimum passphrase policy as encrypted backup, or define and document a separate policy.
5. Zero temporary key buffers in `finally` blocks where practical, while documenting JavaScript memory limitations.
6. Simplify “remember on device” to a keychain-held random device key, not a fixed string passed through a KDF.

### Required tests

Add `electron/services/chatFolderLockService.test.ts` covering sodium readiness, secure-store failure, folder-save failure, rollback, profile collision, weak passphrases, remembered unlock, and restart state.

---

## VF-SCAN-20260722-005 — Folder unlock backoff is calculated but never enforced

**Priority:** P1
**Release gate:** Folder privacy gate
**Subsystem:** `electron/services/chatFolderLockService.ts:180-218, 233-268`

### Evidence

On failure, the service increments attempts and calculates `retryAfter`. `getLockState()` exposes the value. `unlockFolder()` does not check `lastFailedAt` and calculated backoff before attempting another KDF/decrypt operation.

### Impact

- Unlimited rapid unlock attempts remain possible.
- The UI may display a wait period that is not enforced by the authoritative main process.
- Repeated Argon2 work can be used to cause local CPU/memory pressure.

### Required correction

At the start of `unlockFolder()`:

1. Read authoritative lock metadata.
2. Compute the active retry deadline.
3. Reject before KDF execution when the deadline is in the future.
4. Return a structured `retryAfter` field rather than embedding localized time in an error string.
5. Decide and document whether successful remembered-device unlock resets failures.

Never rely on renderer timers as the enforcement boundary.

---

## VF-SCAN-20260722-006 — Chat-folder import UI is nonfunctional in the desktop application

**Priority:** P1
**Release gate:** Folder portability
**Subsystem:** `src/components/chat/HistoryView.tsx:856-887`

### Evidence

The Import action triggers a hidden browser file input:

```tsx
<input type="file" accept=".json" ... />
```

Its handler never reads or imports the file. It always displays:

```text
Folder import requires the Electron file picker. Use the Desktop app to import backups.
```

This code is already running in the desktop app context. No native file picker is invoked, no `.vfbackup` is selected, and neither `previewImport` nor `importBackup` is called.

### Impact

The implemented main-process import path is effectively unreachable from the primary folder UI. Users cannot complete the expected export/import loop.

### Required correction

- Add a narrow main-process file-picker channel dedicated to `.vfbackup` files.
- Return a capability token or opaque approved-file handle, not an arbitrary path.
- Invoke preview before passphrase entry where safe technical metadata is available.
- Request passphrase using a password input.
- Show record counts, media inclusion, source version, conflicts, warnings, and mode.
- Require explicit apply confirmation.
- Support merge/new-folder behavior as declared by the service contract.
- Add on-device QA for exported backup from Machine A to Machine B.

---

## VF-SCAN-20260722-007 — Chat-folder IPC validation and file-path custody are incomplete

**Priority:** P1
**Release gate:** Electron trust boundary
**Subsystem:** `electron/ipc/handlers/chatFolderHandlers.ts`

### Evidence

Most channels cast `unknown` input directly to a TypeScript type:

```ts
input as CreateChatFolderInput
input as RenameChatFolderInput
input as ReorderChatFoldersInput
input as MoveConversationToFolderInput
input as DeleteChatFolderInput
input as PreviewFolderImportInput
input as LockFolderInput
input as UnlockFolderInput
```

Type assertions provide no runtime validation.

For imports, validation only requires a non-empty `backupFilePath`. The service then directly calls:

```ts
fs.readFile(input.backupFilePath, "utf-8")
```

### Impact

- Malformed values can reach main-process services.
- Oversized arrays/strings can cause avoidable work or errors.
- A compromised renderer can request the main process to parse an arbitrary readable path as JSON.
- Path policy is weaker than the project's stated renderer-filesystem prohibition.

### Required correction

1. Add schema validation for every IPC input and output, using the repository's established validation library/pattern.
2. Bound string lengths, array counts, UUID formats, enum values, and passphrase lengths.
3. Replace raw import paths with an opaque file capability produced by a main-process picker.
4. Bind the capability to sender WebContents, profile, file extension, inode/path, issuance time, and one-time use.
5. Reject symlinks, directories, non-regular files, oversized files, and changed files.
6. Ensure errors are redacted and do not echo private paths to renderer logs.

---

## VF-SCAN-20260722-008 — New-profile backup import has no rollback on activation or import failure

**Priority:** P1
**Release gate:** Full-profile backup/import
**Subsystem:** `src/components/settings/DataStoragePanel.tsx:82-117`

### Evidence

For `newProfile` mode, the renderer:

1. Creates a profile.
2. Mutates profile-store active state.
3. Mutates the active storage profile.
4. Activates the desktop profile.
5. Imports the backup.

The catch path does not restore the previous profile, delete/quarantine the empty new profile, or roll back partially imported records.

### Impact

- Failed import can strand the app on a partially initialized profile.
- Profile store, storage service, and main-process session can diverge.
- A retry can duplicate records or create multiple abandoned profiles.

### Required correction

Move the orchestration into a main-process transactional service:

```text
create-staging-profile
activate-staging-context
import-and-validate
commit-profile-registration
switch-active-profile
```

On failure, delete/quarantine staging data and restore the prior active session. The renderer should receive one structured operation result rather than coordinating multiple stores and dynamic imports.

---

## VF-SCAN-20260722-009 — Headless bridge can generate an authentication token that no client can obtain

**Priority:** P1
**Release gate:** Headless bridge usability/security
**Subsystem:** `electron/main.ts:294-306`, `docs/DEVELOPMENT/BRIDGE.md`

### Evidence

When `VENICE_BRIDGE_TOKEN` is not supplied, the bridge server generates a token. `electron/main.ts` intentionally does not print it and states that `bridge:getToken` is “not yet exposed.” The generated token returned by bridge initialization is not retained for a usable operator retrieval path.

The development documentation says the token is generated and printed to stdout.

### Impact

- Headless server starts successfully but is unusable by clients when no environment token is preconfigured.
- Documentation sends operators down a path that current code intentionally removed.
- Users may disable authentication locally to work around the contradiction.

### Required correction

Choose one explicit contract:

**Preferred:** Require `VENICE_BRIDGE_TOKEN` for headless mode and fail closed if absent.

Alternative: Write a one-time generated token to an operator-selected or documented `0600` file, never normal logs, and display only the file path. Ensure cleanup and rotation behavior are defined.

Update documentation and tests to match exactly. Do not add a general renderer IPC token getter.

---

## VF-SCAN-20260722-010 — Encrypted folder backup leaks the folder name in plaintext

**Priority:** P2
**Release gate:** Privacy claim accuracy
**Subsystem:** `electron/services/chatFolderBackupService.ts:92-103, 257-265`

### Evidence

The unencrypted `publicHeader` contains:

```ts
sourceFolderName: string
```

The export filename also derives from the folder name:

```ts
chat-folder-${kind}-${sanitizedFolderName}-${timestamp}.vfbackup
```

### Impact

Folder names can reveal sensitive subjects, people, projects, or character names even though the content payload is encrypted. This conflicts with the stricter roadmap principle that user content leaving app-managed storage should be encrypted first.

### Required correction

- Keep only non-content technical metadata plaintext: format/version, KDF parameters, cipher metadata, coarse size/count fields if needed.
- Move folder name into authenticated encrypted metadata.
- Use a neutral default filename such as `venice-forge-folder-backup-<timestamp>.vfbackup`.
- If preview labels are retained as an explicit usability tradeoff, make the leakage opt-in and state it clearly in UI/docs.

---

## VF-SCAN-20260722-011 — Transient filesystem errors can quarantine valid folder files as “corrupt”

**Priority:** P2
**Release gate:** Storage durability
**Subsystem:** `electron/services/chatFolderStorage.ts:107-128`

### Evidence

Every non-`ENOENT` error from read, decode, or schema validation enters one catch block, logs “corrupt or unreadable,” and attempts to rename the file to a backup path.

This includes permission errors, transient I/O failures, descriptor exhaustion, and other conditions that do not prove corruption.

### Impact

A valid file can be moved out of its canonical location because of a temporary environmental error. The next read then looks like the folder disappeared.

### Required correction

Classify failures:

- `ENOENT`: not found.
- JSON parse/schema failure: quarantine as corrupt.
- Permission/transient I/O: leave file in place and surface retryable error.
- Unsupported schema version: preserve file and route through migration/recovery UI.

Quarantine should use atomic copy/rename plus an audit record and should never silently convert a retryable I/O event into data disappearance.

---

## VF-SCAN-20260722-012 — Lock/export passphrases are collected in a generic plaintext text field

**Priority:** P2
**Release gate:** Security UX
**Subsystem:** `src/components/ui/modal-requests.tsx:149-169`, `src/components/chat/HistoryView.tsx:797-849`

### Evidence

`askText()` renders a standard input without `type="password"`. It is used for lock, unlock, and encrypted folder export passphrases. The UI does not request passphrase confirmation before lock/export.

### Impact

- Passphrases are visible on screen.
- Typographical errors can permanently make exported backups unusable.
- Lock creation can store an unintended passphrase.
- Password-manager/autocomplete semantics are not correctly communicated.

### Required correction

Create a dedicated secret-entry modal with:

- `type="password"`.
- Reveal toggle with explicit user action.
- Confirmation field for lock/export creation.
- Minimum-length and mismatch validation.
- No trimming unless policy explicitly says so.
- Correct `autocomplete` values.
- No secret in toasts, logs, React dev diagnostics, or persistent state.
- Optional strength guidance that does not overpromise entropy.

---

## VF-SCAN-20260722-013 — Documentation and work-order status contradict the current repository

**Priority:** P2
**Release gate:** Governance / audit reliability
**Subsystem:** `docs/`

### Evidence

1. `verify:markdown-links` fails because `docs/audits/TODO/Function_calling_todo.md` is missing.
2. Current audit files explicitly claim that path was verified present.
3. `docs/ROADMAP.md` describes the July 19 work order as closed and the five P0 defects as remediated, while the current reopened ledger still has 15 unchecked items.
4. Work-order checkbox inventory:

```text
VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md
  23 checked / 535 unchecked

VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001-REOPENED.md
  0 checked / 15 unchecked

gamora-black-bolt-power-girl.md
  0 checked / 233 unchecked
```

5. The reopened work order still lists release-metadata failure as open, but `verify:release-metadata` currently passes.

### Impact

- Agents cannot determine the authoritative implementation state.
- Closed claims can mask live defects.
- Missing acceptance specifications undermine verification.
- Work-order scripts can pass superficial status strings while substantive checklist state remains unresolved.

### Required correction

- Restore the canonical Document Agent spec or remove/replace every reference with a verified current source.
- Amend audit records that made factually false presence claims; do not silently rewrite historical evidence without an addendum.
- Reconcile roadmap rows with current source and executed validation.
- Mark resolved reopened items with evidence and leave unresolved items open.
- Make `verify:work-orders` enforce status/checklist consistency, required evidence links, and absence of “closed” claims when release gates remain unchecked.
- Add a single `docs/STATUS.md` or generated ledger that derives from machine-readable work-order metadata instead of prose duplication.

---

## VF-SCAN-20260722-014 — Critical chat-folder main-process services have almost no direct test coverage

**Priority:** P2
**Release gate:** Regression prevention
**Subsystem:** Tests and architecture

### Evidence

Only two focused chat-folder test files were found:

```text
electron/services/chatFolderBackupService.test.ts
src/stores/chat-folder-store.test.ts
```

No focused tests were found for:

```text
electron/services/chatFolderService.ts
electron/services/chatFolderLockService.ts
electron/services/chatFolderStorage.ts
electron/ipc/handlers/chatFolderHandlers.ts
```

The renderer store tests mock IPC and therefore cannot detect discarded main-process persistence results, profile selection bypasses, lock split-brain, or transient I/O quarantine behavior.

Several production modules also have high concentration:

```text
src/services/desktopBridge.ts                 1,379 lines
src/stores/chat-store.ts                      1,298 lines
src/components/rp-studio/CharacterEditor.tsx 1,289 lines
src/components/gallery/gallery-view.tsx       1,068 lines
src/components/chat/chat-view.tsx               986 lines
src/components/gallery/media-inspector.tsx      943 lines
src/services/veniceClient/fetch.ts              925 lines
electron/services/configService.ts              913 lines
src/components/image/image-view.tsx              909 lines
src/components/chat/HistoryView.tsx              890 lines
```

### Impact

- Main-process data-integrity regressions can pass renderer-level tests.
- Large modules increase merge risk and make contract ownership harder to audit.
- Static token verifiers can report a feature present while its result handling is incorrect.

### Required correction

- Add failure-injection tests at the service and IPC layers.
- Introduce filesystem adapters/interfaces so writes can deterministically fail in tests.
- Add integration tests using temporary profile directories.
- Split `HistoryView.tsx` folder management into a dedicated, testable feature module.
- Split `desktopBridge.ts` into capability-specific adapters with runtime schemas.
- Set practical file-size/complexity review thresholds as warnings, not blind hard failures.

---

## 6. Additional Architectural Observations

### 6.1 Chat-folder “lock” is a privacy/access gate, not encrypted storage

The lock service wraps a random key, but folder contents and conversations are not encrypted at rest by this mechanism. The lock state restricts application access. Product language must consistently say **Privacy Gate** or **Access Lock**, not “encrypted folder” or “vault.”

### 6.2 Folder export destination is not user-controlled

`chatFolderBackupService.ts` writes exports to:

```text
<userData>/backups/chat-folders/
```

The store only toasts the path. There is no Save As, Reveal in Finder/Explorer, or copy/export workflow. Even after fixing import, portability remains poor unless the user can select a destination through main-process dialogs.

### 6.3 Legacy folder migration is not idempotently transactional

The mixed-folder migration creates two folders, rewrites conversations, and tombstones the original in separate operations. A crash between steps can produce duplicate children or a partially active source. The migration must have a durable operation ID and resume/rollback semantics.

### 6.4 Static contract verification is necessary but not sufficient

Current verifiers successfully detect broad policy violations and broken links, but they do not detect discarded `{ ok: false }` values, dead UI flows, or profile authority mistakes. Contract scripts should be supplemented with executable behavioral tests rather than expanded into token-search proxies for runtime correctness.

### 6.5 No live secrets were observed in the extracted snapshot

The archive metadata indicates local secrets/build artifacts were excluded, and the scan did not identify an obvious live API key or signing credential. This is not a substitute for secret scanning in CI, commit history, release artifacts, or user data directories.

---

## 7. Data and Security Model Assessment

### 7.1 Strong controls found

- Main-process ownership of sensitive filesystem and secure-store operations.
- Hardened BrowserWindow settings.
- Endpoint/network boundary verification.
- Custom protocol privilege verification.
- Safety guard at renderer, Electron IPC, web proxy, and research dispatch boundaries.
- No-raw-prompt logging verifier passed.
- Object-level encrypted sync packets rather than raw database synchronization.
- Path/symlink checks in sync-folder code.
- Media inclusion opt-in and content-addressed/durable media concepts.
- Profile-aware full backup/import structures.

### 7.2 Security boundaries needing correction

- Renderer-selected profile in chat-folder list.
- Renderer-selected import path.
- Runtime IPC schemas absent for most chat-folder channels.
- Main-process lock backoff not enforced.
- Credential/disk lock state non-atomic.
- Plaintext user-chosen folder name in encrypted backup metadata and filename.
- Absolute backup path included in renderer success toast/log path handling.

### 7.3 Threat-model note

These are primarily local application trust-boundary and data-integrity defects. They do not establish a remote exploit by themselves. They become more serious under renderer compromise, malicious imported content, plugin/integration misuse, or ordinary filesystem failure. Because Electron's security model assumes the renderer is less trusted than the main process, the IPC/profile/path defects should still be treated as release blockers.

---

## 8. Required Remediation Plan

## Phase A — P0 durability and profile isolation

1. Remove renderer profile selection from `chat-folders:list`.
2. Add runtime schemas to every chat-folder IPC channel.
3. Replace renderer-side per-record bulk move with one transactional main-process operation.
4. Make `chatFolderService` check every persistence result.
5. Add operation journaling/rollback for reorder, bulk move, delete, and mixed-folder migration.
6. Add direct service and IPC tests with deterministic write failures.

**Exit criteria:** no folder mutation can return success unless all durable writes and required rollback cleanup have completed.

## Phase B — Lock/privacy-gate correctness

1. Resolve sodium constants after readiness.
2. Scope lock credentials by profile and folder.
3. Enforce retry deadline in main process before KDF work.
4. Make secure-store and folder-state updates transactional/recoverable.
5. Replace fixed-string device wrapping with a keychain-held random device secret or simplify the model.
6. Add password-specific UI and confirmation.
7. Rename product copy to Privacy Gate/Access Lock.
8. Add lock-service tests and restart QA.

**Exit criteria:** no secure-store/disk divergence, backoff is authoritative, and all lock states survive restart consistently.

## Phase C — Export/import completion

1. Add native Save As for folder export.
2. Remove plaintext folder names from default public metadata/filename.
3. Add native `.vfbackup` picker returning an opaque one-time file capability.
4. Implement preview, passphrase, mode, conflict/warning, and apply flow in the renderer.
5. Reject arbitrary renderer-supplied paths.
6. Add safety backup/rollback for destructive modes.
7. Move full-profile new-profile import orchestration to a transactional main-process service.
8. Add cross-machine round-trip and corrupted/tampered backup tests.

**Exit criteria:** export on Machine A, import on Machine B, no plaintext content/path leakage, and safe recovery from interruption.

## Phase D — Documentation and release evidence

1. Restore or replace the missing Document Agent specification.
2. Reconcile roadmap, summary, and work-order statuses against current code.
3. Amend false historical presence claims with dated addenda.
4. Update bridge docs to match token policy.
5. Complete dependency installation in a functioning environment.
6. Run the full validation matrix.
7. Complete packaged macOS/Windows QA and two-device sync/import QA.

**Exit criteria:** `npm run ci` passes, all relevant work-order rows are checked with evidence, and no status document claims completion beyond executed proof.

---

## 9. Exact Implementation Checklist

### Chat-folder persistence

- [ ] Change every `saveChatFolder`, `saveConversation`, and `deleteConversation` call in `chatFolderService.ts` to check and propagate its structured result.
- [ ] Add a `ChatFolderOperationJournal` with operation ID, profile ID, preimages, staged paths, commit phase, and recovery status.
- [ ] Implement atomic `reorderChatFolders` with staged writes and rollback.
- [ ] Implement atomic `moveConversationsToFolder` as one main-process API.
- [ ] Implement recoverable folder delete with explicit `keep conversations` and `delete conversations` plans.
- [ ] Make legacy mixed-folder migration resumable and idempotent.

### IPC/profile boundary

- [ ] Remove `requestedProfileId` from `chat-folders:list` renderer/preload/main contracts.
- [ ] Validate all chat-folder IPC inputs at runtime.
- [ ] Add maximum sizes/counts to names, arrays, passphrases, and backup files.
- [ ] Bind every operation to `getProfileSessionId(event.sender)`.
- [ ] Add tests for malformed input, profile spoofing, and unbound sender sessions.

### Lock/privacy gate

- [ ] Fetch libsodium limits after `await sodium.ready`.
- [ ] Include `profileId` in every lock credential key.
- [ ] Enforce retry deadline before passphrase derivation.
- [ ] Return structured `retryAfter` data from IPC.
- [ ] Roll back secure metadata when folder-state persistence fails.
- [ ] Roll back folder state when secure-store writes fail.
- [ ] Replace fixed-string remembered-device derivation with a random device secret held by OS secure storage.
- [ ] Zero temporary key buffers where practical and document JS memory limitations.
- [ ] Add direct lock-service tests.

### Folder export/import UI

- [ ] Replace generic `askText` with a dedicated password modal.
- [ ] Require passphrase confirmation for lock and export creation.
- [ ] Add native Save As and neutral `.vfbackup` filename.
- [ ] Add native Open dialog restricted to `.vfbackup`.
- [ ] Return an opaque approved-file capability instead of a raw path.
- [ ] Add import preview and explicit apply confirmation.
- [ ] Surface record counts, warnings, media inclusion, source version, and conflicts.
- [ ] Add merge/new-folder behavior and define replace behavior explicitly.
- [ ] Add reveal/copy-path action only where safe and useful.

### Full-profile backup/import

- [ ] Move new-profile import orchestration out of `DataStoragePanel.tsx`.
- [ ] Import into an unregistered staging profile.
- [ ] Commit profile registration only after import validation completes.
- [ ] Restore prior active profile and remove/quarantine staging data on failure.
- [ ] Add restart recovery for an interrupted profile import.

### Storage recovery

- [ ] Quarantine only parse/schema corruption, not generic I/O failures.
- [ ] Preserve unsupported-schema files for migration/recovery.
- [ ] Add retry classification for permissions and transient I/O.
- [ ] Redact absolute paths in user-facing errors and normal logs.

### Bridge

- [ ] Require `VENICE_BRIDGE_TOKEN` in headless mode or implement a secure one-time token file.
- [ ] Fail closed when no usable token-delivery contract exists.
- [ ] Update `docs/DEVELOPMENT/BRIDGE.md` and automated tests.

### Documentation/governance

- [ ] Restore or replace `docs/audits/TODO/Function_calling_todo.md`.
- [ ] Fix both Markdown links detected by the verifier.
- [ ] Add a dated correction to audit files that claimed the missing file existed.
- [ ] Reconcile checked/unchecked work-order rows with current implementation evidence.
- [ ] Remove stale open claims already proven resolved, such as release metadata.
- [ ] Prevent “closed” status when required checklist or release gates remain incomplete.

### Validation

- [ ] Run `npm ci` in a network-capable Node 22 environment.
- [ ] Run `npm run lint:eslint`.
- [ ] Run `npm run typecheck`.
- [ ] Run focused new chat-folder service/IPC/lock tests.
- [ ] Run `npm run test:ci`.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify:contracts`.
- [ ] Run `npm run ci`.
- [ ] Perform packaged macOS and Windows export/import QA.
- [ ] Perform two-device encrypted sync-folder QA.
- [ ] Record commands, exact exit codes, environment, and artifacts.

---

## 10. Proposed Regression Test Matrix

### Unit/service tests

- Storage result `ok:false` propagation.
- Atomic reorder success/failure.
- Atomic bulk move success/failure.
- Delete rollback.
- Legacy migration resume after interruption.
- Sodium readiness.
- Wrong passphrase and enforced backoff.
- Secure-store failure and disk-write failure rollback.
- Profile-scoped credential keys.
- Corruption vs permission-error classification.
- Neutral backup metadata/filename.
- Import capability expiration and one-time use.

### IPC tests

- Renderer profile spoof rejected.
- Invalid UUID/name/mode rejected.
- Oversized conversation list rejected.
- Raw arbitrary import path rejected.
- Capability bound to originating sender/profile.
- Symlink and changed-file import rejected.
- Structured retry/error response preserved.

### UI tests

- Bulk move failure does not show success.
- Password fields mask input.
- Confirmation mismatch blocks export/lock.
- Import action opens the native bridge flow.
- Preview appears before apply.
- Lock wait state reflects authoritative retry deadline.
- Export success offers useful destination/reveal action.

### Integration tests

- Machine A folder export to Machine B import.
- Media excluded and included variants.
- Wrong passphrase.
- Tampered ciphertext/header.
- Interrupted export/import.
- New-profile import rollback.
- Two-process folder operation contention.
- App restart during migration/lock/import.

---

## 11. Manual QA Still Required

The following cannot be closed through static inspection:

- Paid image/audio/video generation against live Venice endpoints.
- Generated audio/video playback and seek after restart.
- Native Save As on macOS and Windows.
- OS keychain/credential manager behavior.
- Lock state across actual app restart.
- Export/import between two separate machines.
- Sync folder backed by iCloud, Dropbox, OneDrive, Syncthing, and a network share.
- Filesystem interruption and provider conflict-copy behavior.
- Signed/notarized macOS and signed Windows packaging.
- Screen-reader, keyboard-only, high-zoom, and theme contrast QA.

These must be recorded as unverified until executed.

---

## 12. Final Assessment

The latest snapshot is an architectural improvement over the July 12–20 states. The previously identified media and character contract defects have been addressed in meaningful source-level ways, and the local-first encrypted sync implementation contains several correct primitives.

The dominant risk has shifted to **chat-folder operation integrity and portability closure**. The current implementation can violate its own durability and profile-boundary requirements while still returning successful IPC results. Because those defects affect user data organization, delete/move semantics, profile privacy, and encrypted backup usability, they should block closure of the folder work order and any release claim that the feature is complete.

The correct next step is not another broad rewrite. It is a focused remediation pass that makes main-process folder operations transactional, removes renderer authority over profiles and file paths, completes the native export/import UI, hardens the privacy-gate state machine, adds direct service/IPC tests, and then reruns the full Node 22 validation matrix in a functioning dependency environment.

---

## 2026-07-22 remediation addendum

This addendum records live-tree remediation; it does not rewrite the original snapshot evidence above.

| Finding | Disposition | Evidence |
|---|---|---|
| `VF-SCAN-20260722-001` | Corrected | `chatFolderService.ts` now checks every structured persistence result and uses durable operation journals, rollback, and startup recovery for reorder, bulk move, delete, and mixed-folder migration. |
| `VF-SCAN-20260722-002` | Corrected | The list IPC has no renderer profile argument; every chat-folder channel requires the explicitly bound WebContents profile session. |
| `VF-SCAN-20260722-003` | Corrected | Renderer bulk movement uses one validated `chat-folders:move-conversations` transaction and surfaces `{ok:false}`. |
| `VF-SCAN-20260722-004` | Corrected | Lock credentials are profile/folder scoped; sodium limits resolve after readiness; secure-store changes roll back when folder persistence fails; remembered unlock uses a random key held by secure storage. |
| `VF-SCAN-20260722-005` | Corrected | Main rejects unlock attempts before KDF work while the retry deadline is active and returns structured `retryAfter`. |
| `VF-SCAN-20260722-006` | Corrected | History uses the native `.vfbackup` picker, technical preview, explicit apply confirmation, masked passphrase entry, and the import service. |
| `VF-SCAN-20260722-007` | Corrected | Every channel now performs bounded runtime validation. Import uses sender/profile-bound, expiring, file-identity-checked capabilities; raw renderer paths are rejected. |
| `VF-SCAN-20260722-008` | Corrected within current renderer-owned IndexedDB architecture | New-profile import uses a staging registration and restores renderer, storage, and main profile authority on failure. Failed staging data remains unregistered/quarantined rather than becoming an active profile. |
| `VF-SCAN-20260722-009` | Corrected | Headless mode fails closed unless `VENICE_BRIDGE_TOKEN` is present and strong; documentation matches the operator-supplied-token contract. |
| `VF-SCAN-20260722-010` | Corrected | Folder names moved inside encrypted metadata; default filenames are neutral and absolute save paths never return to the renderer. |
| `VF-SCAN-20260722-011` | Corrected | Only parse/schema corruption is quarantined; transient I/O and future schema versions remain in place with retry/recovery errors. |
| `VF-SCAN-20260722-012` | Corrected | Privacy-gate and export passphrases use masked secret entry, reveal controls, minimum length, and confirmation for creation. |
| `VF-SCAN-20260722-013` | Corrected | The Document Agent specification is retained at its indexed path; this snapshot's missing-file claim was not reproducible in the live checkout. Roadmap/work-order/summary status was reconciled by this session. |
| `VF-SCAN-20260722-014` | Corrected | Direct service, journal, storage, lock, IPC, renderer, and modal tests cover failure injection and recovery. |

External signed macOS/Windows, paid-provider, and two-device QA remains governed by `VF-VERIFY-005`; it is not inferred from local automated validation.
