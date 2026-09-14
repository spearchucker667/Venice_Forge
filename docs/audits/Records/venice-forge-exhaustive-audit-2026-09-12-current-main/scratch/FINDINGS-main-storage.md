# FINDINGS — Main-Process Storage / Backup / Sync / Media Custody

Audit domain: `electron/services` (chatStorage, chatFolder*, generatedMedia*, backupCrypto,
conversationVault, vaultMigration, sync*, secureStore, mediaService, characterCardStorage,
rp* stores, profilePurge, chatTtsBridge, characterImageCache, configService,
providerSettingsStore, logger), `electron/utils` (secureFile, navigation, customProtocolAccess),
and the IPC handler layer that feeds them (`electron/ipc/handlers/chatFolderHandlers.ts`,
`fileHandlers.ts`, `systemHandlers.ts`), plus protocol handlers in `electron/main.ts`.

Verified against worktree at HEAD `84cf5bbe` (main, version 3.0.0-beta.3). All file:line
references are to that commit. No repository source files were modified.

Scope notes:
- **No IndexedDB access exists in the Electron main process** (grep for
  `indexedDB|IDBFactory|toVersion|openDB` under `electron/` returned nothing). IndexedDB
  schema versions/migrations (toVersion 12 etc.) are renderer-side and out of this domain.
- Failed-persistence media recovery custody (`generatedMediaRecoveryQueue.ts`) was verified
  compliant with AGENTS.md §11: `MAX_RECOVERY_ITEMS = 8`, `MAX_RECOVERY_BYTES = 128 MiB`,
  `RECOVERY_TTL_MS = 30 min` (generatedMediaRecoveryQueue.ts:5-7), opaque UUID IDs, no
  prompts/URLs stored, main-frame-only retry/save-as with recovery-ID revalidation
  (fileHandlers.ts:133-166). Not a finding.
- Media binary custody (`generatedMediaStore.ts`) verifies MIME magic bytes
  (mediaFormat.ts:33-67), sha256 content addressing, file-signature checks, fsync-before-
  rename, and descriptor-safe TOCTOU-closed reads. PNG alpha is preserved byte-for-byte
  (bytes are stored untransformed). Not a finding.

---

## VF-AUD-20260912-P1-001 — Import of a crafted `.vfbackup` can freeze the main process via attacker-controlled Argon2id KDF parameters

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/chatFolderBackupService.ts:365-386`

Observed: `importBackup` validates only `backup.kdf.algorithm === "argon2id13"` and then
passes the file-supplied work factors straight into libsodium:

```ts
if (backup.version !== 2 || !backup.kdf || backup.kdf.algorithm !== "argon2id13") { ... }
...
const kek = _sodium.crypto_pwhash(
  _sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
  passphrase,
  salt,
  backup.kdf.opslimit,   // <-- attacker-controlled
  backup.kdf.memlimit,   // <-- attacker-controlled
  _sodium.crypto_pwhash_ALG_ARGON2ID13,
);
```

`crypto_pwhash` is synchronous and runs on the Electron main process. libsodium accepts any
`opslimit` up to `crypto_pwhash_OPSLIMIT_MAX` (2^32-1), so a backup file carrying
`opslimit: 4294967295` triggers an effectively unbounded Argon2id computation that blocks
the main process (UI freeze, no recovery short of killing the app). The exporter's own
constants are `OPSLIMIT/MEMLIMIT_INTERACTIVE` (chatFolderBackupService.ts:37-46), and the
sibling `chatFolderLockService.ts:64-70` pins its parameters to the known-good constants —
the import path is the outlier.

Expected: KDF parameters in an untrusted file must be pinned to, or clamped against, the
expected constants (exact match with `getArgonConstants()`), as AGENTS.md §13 requires
import safety for hostile backup payloads.

Root cause: Missing validation of file-supplied KDF work factors; trust boundary treats
`.vfbackup` file content as advisory.

Impact: Local DoS of the desktop app (main-process freeze) when a user imports a backup
file from an untrusted source (sync folder, email, chat). Also memory-pressure failures
from very large `memlimit` values surface only as generic errors.

Recommended remediation: Reject any backup whose `kdf.opslimit`/`kdf.memlimit` differ from
the exporter's canonical `INTERACTIVE` constants; alternatively enforce
`opslimit <= crypto_pwhash_OPSLIMIT_INTERACTIVE && memlimit <= crypto_pwhash_MEMLIMIT_INTERACTIVE`
before calling `crypto_pwhash`, and run the KDF off the main thread.

Required regression tests: import a v2 payload with `opslimit`/`memlimit` inflated to
`OPSLIMIT_MAX`/`MEMLIMIT_MAX` and assert immediate rejection without invoking
`crypto_pwhash`; import a payload with the canonical constants and assert success.

---

## VF-AUD-20260912-P1-002 — Conversation Vault misclassifies systemic key failure as per-file corruption and quarantines every vault file it touches

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/conversationVault.ts:296-325` (readEncryptedFile),
`electron/services/conversationVault.ts:137-181` (getOrInitVaultKey),
`electron/services/conversationVault.ts:340-371` (getOrLoadManifest)

Observed: `readEncryptedFile` wraps key acquisition **and** decryption in one catch-all:

```ts
try {
  const raw = await fs.readFile(filePath, "utf-8");
  const envelope = JSON.parse(raw) as EncryptedVaultFileV1;
  const key = await getOrInitVaultKey();          // throws when safeStorage unwrap fails
  return decrypt(envelope, key, fileType, id);
} catch (err) {
  if (...ENOENT...) return null;
  logError(`Decryption failed or file missing: ${filePath}`, String(err));
  // Corruption backup
  const backupPath = path.join(corruptDir, `conv_corrupted_${Date.now()}_${filename}`);
  await fs.rename(filePath, backupPath);          // file is MOVED to corrupt/
  return null;
}
```

When the OS secure-storage key becomes unusable (macOS keychain reset/migration, Linux
secret-service re-creation, `safeStorage.decryptString` throwing at conversationVault.ts:166),
every vault read is treated as a corrupt file and **renamed into `<profile>/corrupt/`**.
`getOrLoadManifest` then sees `null`, logs "Resetting manifest.", and caches an empty
manifest (lines 352-370), so the UI shows an empty vault; `listConversations` subsequently
quarantines each record file as it is reached (lines 505-536). The user's encrypted data is
not destroyed, but the vault is dismantled file-by-file into the quarantine directory and
the manifest is replaced with an empty one.

Expected: Distinguish "key unavailable / decrypt failure for systemic reasons" from "this
single file is corrupt". A key-unavailability condition must abort vault access with a clear
error and leave all files in place (fail closed, no quarantine). Only structurally invalid
individual files (bad JSON envelope, AAD mismatch with a working key) should be quarantined.

Root cause: Single catch-all conflates key-acquisition failures with per-file corruption;
quarantine is applied unconditionally on any error.

Impact: Catastrophic, self-amplifying data-availability loss on a routine OS event; the
first sign is a vanished conversation history. Recovery requires manual reassembly from
`corrupt/`.

Recommended remediation: Call `getOrInitVaultKey()` outside the per-file try/catch and
propagate key errors; only quarantine on parse/AAD failure after the key is known-good; add
an explicit "vault key unavailable" state surfaced to the renderer.

Required regression tests: simulate `safeStorage.decryptString` throwing and assert no file
renames occur, manifest is not reset, and reads return a structured key-error; simulate a
single truncated record file and assert only that file is quarantined.

---

## VF-AUD-20260912-P1-003 — Vault master key file is written non-atomically; a mid-write crash permanently bricks vault access and throws uncaught

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/conversationVault.ts:150-168` (read path),
`electron/services/conversationVault.ts:182-218` (write path, line 215)

Observed: The vault master key — the sole key for every encrypted record, manifest, and
journal — is persisted with a plain `fs.writeFile`, not temp+rename:

```ts
await fs.writeFile(KEY_FILE, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
```

Every other durable file in the vault (`writeEncryptedFile`, conversationVault.ts:272-291)
uses temp+fsync+rename. A crash or power loss mid-write leaves a truncated
`vault-key.v1.json`; on the next launch, `JSON.parse(raw)` at line 152 throws **uncaught**
out of `getOrInitVaultKey()` (the read path has no try/catch around parse), producing an
unhandled rejection in main and rendering every vault record, manifest, and journal
permanently undecryptable (key file is the only key; `wrappedWith: "electron.safeStorage"`
cannot be re-derived).

Expected: Atomic temp-write + fsync + rename for the key file, and a guarded parse that
surfaces a recoverable "vault key corrupted" error rather than an unhandled throw.

Root cause: The key-creation path predates/omits the atomic-write utility used everywhere
else in the same module.

Impact: Total vault data loss (availability) from a single ill-timed crash during first
vault initialization; unhandled exception on every subsequent startup.

Recommended remediation: Route the key file through the same temp+fsync+rename helper;
wrap the key-file read/parse in a typed error; consider writing the key file before any
record so a failed key write cannot follow successful record writes.

Required regression tests: inject a write failure between temp create and rename and assert
no partial `vault-key.v1.json` remains and the previous key survives; feed a truncated key
file and assert a typed, catchable error.

---

## VF-AUD-20260912-P1-004 — `saveCharacterCard` silently deletes the stored avatar when the save payload omits avatar data

Severity: P1 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/characterCardStorage.ts:243-254, 319-336`

Observed: Avatar bytes live in a sidecar `avatar.png` and are deliberately stripped from
`character.json` (`stripAvatar`, lines 197-203; read-side hydration at 146-161). On save:

```ts
if (avatar) {
  ...
  await atomicWrite(characterAvatarPath(id, profileId), buffer);
} else {
  // No avatar provided: leave any prior file in place? No — drop it for hygiene.
  try {
    await fs.unlink(characterAvatarPath(id, profileId));
  } catch { ... }
}
```

Any save whose payload lacks `avatar.data` — e.g., an edit flow that round-trips the card
without re-fetching the hydrated avatar, a version restore, a partial import, or any caller
constructing the card from `character.json` alone — permanently deletes `avatar.png`.
Because reads intentionally do not persist avatar bytes in the JSON, the loss is silent and
unrecoverable.

Expected: Absence of avatar data in the payload must be treated as "no change" (or require
an explicit `removeAvatar: true` flag); a card round-trip must be idempotent with respect
to its sidecar.

Root cause: The "hygiene" deletion conflates "caller cleared the avatar" with "caller did
not send the avatar".

Impact: Irreversible loss of user media (character avatars) on ordinary save flows; data
loss is the highest-severity category per audit rules.

Recommended remediation: Delete `avatar.png` only on an explicit removal signal; otherwise
retain the existing sidecar. Add a regression test that saves a card with an avatar, saves
an avatar-less payload, and asserts `avatar.png` still exists and hydrates.

Required regression tests: (1) avatar-preserving round-trip; (2) explicit removal; (3)
avatar-less save of a card that never had an avatar (no error).

---

## VF-AUD-20260912-P2-005 — Unknown future-version chat-history files are quarantined as "corrupt", making downgrades destroy conversation visibility

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/chatStorage.ts:52-75` (readConversationFile),
`electron/services/chatStorage.ts:106-112` (isValidConversationFile)

Observed: Any conversation file whose `version !== FILE_VERSION (1)` fails validation and is
renamed to `<file>.backup.<ts>.<uuid>` ("Corrupt chat file backed up"), returning `null`:

```ts
if (v.version !== FILE_VERSION) return false;   // future versions included
...
const backupPath = `${filePath}.backup.${timestamp}.${randomSuffix}`;
await fs.rename(filePath, backupPath);
```

The sibling store `chatFolderStorage.ts:121-133` explicitly distinguishes
`schemaVersion > 1` ("unsupported schema version … file was left in place"); chatStorage has
no such guard. Running a newer build (or receiving a profile folder copied from a newer
build) and then opening an older build makes every newer-version conversation vanish from
the UI (data is retained on disk under `.backup.*`, but the app presents an empty history
and any subsequent same-id save would collide with nothing — the originals are orphaned).

Expected: `version > FILE_VERSION` must be treated as "unsupported, leave in place" (read as
absent, no quarantine), exactly as chatFolderStorage does.

Root cause: Version equality is used as a corruption signal; no newer-version fast path.

Impact: Data-availability loss and user confusion on version downgrade or cross-version
profile sharing; violates AGENTS.md §9 "Do not silently discard incompatible records"
(spirit: incompatible records must not be rewritten).

Recommended remediation: In `isValidConversationFile`/`readConversationFile`, branch on
`version > FILE_VERSION` and skip without renaming; only quarantine structurally invalid
files at the current version.

Required regression tests: write a `version: 2` conversation file and assert it is neither
renamed nor reported corrupt; assert a malformed `version: 1` file is still quarantined.

---

## VF-AUD-20260912-P2-006 — Seven storage services use a fixed `${target}.tmp` temp name, so concurrent saves of the same record interleave and fail or swap content

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files:
`electron/services/chatFolderStorage.ts:179`; `electron/services/rpSingleFileStore.ts:100`;
`electron/services/rpChatStorage.ts:189`; `electron/services/characterCardStorage.ts:355-359`;
`electron/services/secureStore.ts:98-114`; `electron/services/syncConfig.ts:41-53`;
`electron/services/providerSettingsStore.ts:113-124`;
(weaker variant: `electron/services/mediaService.ts:291-296` — tmp is `pid + Date.now()`, same-ms collision only)

Observed: These writers all stage via a predictable temp path:

```ts
// chatFolderStorage.ts
const tmp = `${target}${TMP_SUFFIX}`;            // TMP_SUFFIX = ".tmp"
await fs.open(tmp, "w", 0o600) / fs.writeFile(tmp, ...)
await fs.rename(tmp, target);
```

With two in-flight async saves for the same record (e.g., `reorderChatFolders` plus a
concurrent `saveChatFolder` from another IPC call, or `migrateLegacyFolder`'s internal
save racing a user rename), interleaving produces: writer B truncates/rewrites the temp
while writer A is mid-flight; A's `rename` moves B's bytes; B's `rename` then fails with
ENOENT and the whole operation reports failure (chatFolderStorage.ts:191-194 swallows the
specifics into "Failed to write chat-folders file"), or worse, a torn composite lands at
the target on filesystems where rename semantics differ. `chatStorage.ts:280`,
`chatFolderOperationJournal.ts:40-48`, `conversationVault.ts:275`, and
`generatedMediaStore.ts:153-181` all use unique temps — the fixed-name stores are the
outliers. None of these paths fsync the temp before rename either.

Expected: Unique-per-write temp names (`crypto.randomUUID()`/`randomBytes`) everywhere,
matching the majority pattern; ideally fsync before rename for durability parity.

Root cause: Copy-pasted minimal atomic-write snippet predating the unique-temp convention;
no shared `atomicWriteFile` utility in main.

Impact: Spurious save failures under concurrent same-record mutations; potential
cross-contamination of record content (one record's JSON body written under another's
staging window is prevented by rename targeting, but the failure modes above are real);
partial durability loss (no fsync) on power failure.

Recommended remediation: Introduce one `writeFileAtomic(target, data)` helper in
`electron/utils` (unique temp, `wx` open, fsync, rename, cleanup) and migrate all listed
call sites.

Required regression tests: concurrent same-id saves from two async loops assert exactly one
winner, no thrown ENOENT, and final content equal to one complete payload; interrupted
write (rename never called) leaves no fixed-name temp debris.

---

## VF-AUD-20260912-P2-007 — Conversation Vault manifest journal is never compacted in production: `saveManifest` has no production caller

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/conversationVault.ts:421-462` (appendManifestOperation /
saveManifest), `electron/services/memoryPuller.ts:170`

Observed: Every `saveConversation`/`deleteConversation` appends one encrypted line to
`manifest.v1.journal.jsonl.enc` (queued under `${profileId}:manifest`), and the manifest
snapshot file is rewritten **and the journal deleted** only inside `saveManifest`
(conversationVault.ts:449-462). Repository-wide grep shows `saveManifest` is invoked only
from `conversationVault.test.ts` — no production caller (the IPC layer in
`systemHandlers.ts:410-501` calls list/get/save/delete/archive only). Result: the journal
grows monotonically for the lifetime of an installation; each profile's first manifest load
per run decrypts and replays the entire history of every upsert/delete (lines 389-419);
memory and startup cost grow linearly without bound, and the manifest snapshot file is
essentially write-once-at-bootstrap dead weight.

Expected: Periodic/transactional `saveManifest` checkpoints (e.g., after N journal entries,
on graceful shutdown, or when the journal exceeds a byte threshold), so replay cost stays
bounded per AGENTS.md §9 durability intent.

Root cause: The checkpoint function exists but was never wired into the production write
paths or shutdown coordinator.

Impact: Unbounded growth of an encrypted-but-undecryptable-without-replay file; linearly
slower vault startup; strictly increasing write amplification (two file writes per record
op, one of them append-forever).

Recommended remediation: Call `saveManifest` from the shutdown coordinator and/or every N
(≈200) journal entries; add a journal byte cap with forced checkpoint.

Required regression tests: after N saves, assert the journal file is truncated and the
snapshot manifest matches replay state; after simulated crash mid-journal, assert replay
reconstructs the manifest.

---

## VF-AUD-20260912-P2-008 — Sync acknowledgement collection requires acks from every device ever registered; devices are never pruned, so event files accumulate forever

Severity: P2 | Confidence: High | Classification: DESIGN RISK

Affected files: `electron/services/syncCheckpoint.ts:15-59` (registerSyncDevice /
collectAcknowledgedEvent); no device-removal API exists anywhere in `electron/services`

Observed: `collectAcknowledgedEvent` (called from `acknowledgeOperation`,
`syncFolderWatcher.ts:399-404`, on every positively-acked blob) returns true only after
verifying a `<operationId>.ack` file for **every** entry in `.vfbackup/devices/`, then
deletes the event file. `registerSyncDevice` only ever adds/re-writes device files; nothing
removes them (device loss, OS reinstall, profile retirement). The first device that stops
acking therefore permanently blocks collection for all subsequent events: blob events and
object checkpoints under `.vfbackup/{blobs,objects}` are retained indefinitely and
re-delivered on every watcher start (`ignoreInitial: false`,
syncFolderWatcher.ts:625-638). Additionally `loadSyncConfig` (syncConfig.ts:29-36) mints a
new deviceId whenever the config file is corrupt/unreadable, silently orphaning the old
device's ack obligations.

Expected: Device liveness/tombstoning (e.g., ack quorum with a configurable device set, or
expiry of stale devices after N days), so retention converges; identity resets should not
silently strand sync retention.

Root cause: Ack model is "all registered devices forever" with no pruning or expiry.

Impact: Unbounded growth of the encrypted sync folder (hostile storage per AGENTS.md §13
treats the folder as untrusted — growth is attacker-influenceable by adding devices),
growing re-delivery/replay cost, and eventually permanent retention of every operation.

Recommended remediation: Add device expiry/tombstone handling and a quorum-based ack rule
(e.g., all devices seen within the last T days); surface stale devices in sync status;
preserve conflict copies per §13 when pruning.

Required regression tests: register two devices, stop acking from one, assert events are
eventually collected under the quorum rule; assert a re-imaged device (new deviceId) does
not block collection.

---

## VF-AUD-20260912-P2-009 — `venice-media://` (and `venice-tts://`, `venice-character-cache://`) grant access to originless requests, resting solely on sha256 unguessability

Severity: P2 | Confidence: Medium | Classification: DESIGN RISK

Affected files: `electron/utils/customProtocolAccess.ts:111-154` (evaluateCustomProtocolAccess,
documented at 12-43), `electron/main.ts:389-434` (protocol.handle wiring)

Observed: `evaluateCustomProtocolAccess` explicitly allows requests with **no Origin** and
no/empty Referer ("treat the request as renderer-initiated", lines 129-137). The
capability-token manager (`createCustomProtocolCapabilityManager`,
customProtocolAccess.ts:244-342) is scaffolding only — main.ts:33-37 and 392-396 say it is
"not yet wired". Consequently any process able to issue a request the scheme handler will
parse (another renderer frame/utility process, or anything that learns a media id) can fetch
`venice-media://<sha256>` and `venice-tts://<profile>/<sha256>` without provenance. The id
space is 256-bit and ids are not enumerable, but media ids transit logs, sync packets
(allowlisted stores), and renderer state.

Expected: Wire the documented capability-token primary gate (verify `?cap=` in the
protocol handler before serving), at least for `venice-media://` which serves
user-generated binary content.

Root cause: Provenance-less media requests are allowed unconditionally; the planned
capability layer was deferred.

Impact: Cross-boundary read of generated media/TTS bytes by non-renderer-authorized
contexts if an id leaks; defense-in-depth gap acknowledged in-code since 2026-08-31.

Recommended remediation: Implement VF-CAPABILITY-PROVENANCE for `venice-media://` (issue
profile/session-bound tokens, verify in `protocol.handle`, revoke on profile switch /
reload / shutdown), keeping the origin check as fallback.

Required regression tests: request without valid `cap` token from an originless context is
rejected once wired; renderer-issued token URLs succeed; tokens revoked on reload.

---

## VF-AUD-20260912-P2-010 — Folder-backup export records integrity counts as hardcoded zeros, an `includesMedia` flag with no media payload, and an excludes list nothing enforces

Severity: P2 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/chatFolderBackupService.ts:127-156` (getBackupPreview),
`electron/services/chatFolderBackupService.ts:177-197` (manifest construction)

Observed:
- Preview counts `attachmentReferences`/`mediaBlobs` by scanning messages (lines 127-144) but
  returns `mediaBlobsTotalBytes: mediaBytes` where `const mediaBytes = 0` (line 130) — the
  byte total is always 0; the real per-blob byte counts are never read from the media store.
- The exported manifest hardcodes `attachmentReferences: 0, mediaBlobs: 0` (lines 186-197)
  regardless of actual content, so the tamper/integrity counts in the encrypted manifest are
  false by construction.
- `includesMedia: input.includeMedia` is recorded (line 193), yet no media payload is ever
  written into the backup (conversations are serialized verbatim, line 196); a backup
  claiming `includesMedia: true` contains no media.
- `excludes` advertises `["api-keys", ..., "absolute-paths", "signed-media-urls", ...]`
  (lines 155, 194), but nothing sanitizes exported conversations: `metadata.attachments`
  (arbitrary string array, `src/types/conversation.ts:88`) and `metadata.injectedContext`
  are exported verbatim, so any absolute path or expiring URL that ever landed in message
  metadata is copied into the backup despite the advertised exclusion.

Expected: Counts reflect reality (computed from the same scan), `includesMedia` is only true
when blob payloads are actually embedded (or the flag is removed), and advertised excludes
are enforced by a stripping pass over conversations before encryption (AGENTS.md §13
"secret exclusion" / "never machine paths in portable payloads").

Root cause: Manifest/preview fields were stubbed and never reconciled with the actual
export content; no sanitizer stage exists.

Impact: Import previews and integrity checks report false information; backups may carry
machine-specific paths the manifest claims are excluded, defeating the portability and
review guarantees of the `.vfbackup` format.

Recommended remediation: Compute counts from the scan results; strip or reject
path/URL-bearing metadata fields during export; make `includesMedia` truthful or remove it
until media embedding lands.

Required regression tests: export a folder containing generated-media references and an
attachment whose value is an absolute path; assert preview byte counts are non-zero,
manifest counts match, and the absolute path is absent from the encrypted payload.

---

## VF-AUD-20260912-P3-011 — `syncConfig.saveSyncConfig` uses a fixed temp name and swallows write failures, so a failed persist is indistinguishable from success

Severity: P3 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/syncConfig.ts:41-53`

Observed: `saveSyncConfig` writes `sync-config.json.tmp` then renames, but the catch only
logs ("Failed to save sync config") and returns normally; `setSyncPath` callers (including
`setSyncFolder`'s commit step, syncFolderWatcher.ts:649) therefore believe the path was
persisted when it may not have been. Fixed temp name also collides under concurrent saves
(same class as VF-AUD-20260912-P2-006 but sync; folded here for the error-swallowing root
cause).

Expected: Write errors propagate to the caller; temp name is unique per write.

Impact: Sync path drift between memory and disk across restarts (sync silently off, or
watching a folder the user changed away from); misleading success returns.

Recommended remediation: Re-throw after logging; use a unique temp.

Required regression tests: inject ENOSPC on write and assert `setSyncPath` rejects and the
previous config file is intact.

---

## VF-AUD-20260912-P3-012 — `listConversations` returns `totalScanned` as the valid-conversation count, contradicting its documented contract

Severity: P3 | Confidence: High | Classification: DOCUMENTATION DEFECT

Affected files: `electron/services/chatStorage.ts:165-178` (interface docs),
`electron/services/chatStorage.ts:235-249` (implementation)

Observed: The `ListConversationsResult.totalScanned` doc says "Total files on disk that
matched the scan, before truncation", but line 249 returns `totalScanned: totalValid` (the
number of successfully parsed, profile-owned conversations in the truncated working set),
while the true file count is discarded after line 205. Callers displaying "N conversations
on disk" under-report whenever corrupt/foreign-profile files exist or the scan capped.

Expected: Return the file-count (`jsonFiles.length`) for `totalScanned` as documented, or
fix the doc to say "valid conversations scanned".

Required regression tests: seed a directory with one corrupt `.json` and one valid
conversation; assert `totalScanned` reflects the documented semantics.

---

## VF-AUD-20260912-P3-013 — Generated-media recovery and quarantine artifacts are never reaped: stale `.pending-*` journals and `.corrupt-*` blobs accumulate without bound

Severity: P3 | Confidence: High | Classification: CONFIRMED DEFECT

Affected files: `electron/services/generatedMediaStore.ts:281` (corrupt rename),
`electron/services/generatedMediaStore.ts:371-409` (recoverPendingGeneratedMediaWrites);
`electron/services/syncOutbox.ts:96-105` (oversize entries skipped, never evicted)

Observed:
- When an existing blob fails the duplicate-content check it is renamed to
  `<sha>.<ext>.corrupt-<ts>` (line 281) and nothing ever deletes those files.
- `recoverPendingGeneratedMediaWrites` retries each `.pending-<sha>.json` journal; on
  failure it logs and leaves the journal in place (lines 401-405). If the referenced temp
  file is gone (e.g., temp cleanup raced recovery), every future run fails the same way and
  the journal persists forever — there is no attempt-count or age-based eviction.
- `drainSyncOutbox` likewise `continue`s past oversized/malformed outbox entries
  (syncOutbox.ts:96-105), leaving them on disk permanently.

Expected: Bounded retention for recovery/quarantine artifacts (count + age, per the custody
spirit of AGENTS.md §11), with orphan journals removed once their temp file is provably
absent and `.corrupt-*` files pruned by age.

Impact: Unbounded disk growth in `userData/media/blobs/sha256` and `userData/sync/outbox`
on long-lived installations; repeated failing recovery attempts at every startup.

Recommended remediation: Add age/attempt eviction to recovery sweeps; delete `.corrupt-*`
files older than a retention window; quarantine oversize outbox entries to a bounded
archive.

Required regression tests: seed a journal whose temp file is missing and assert it is
removed after one failed recovery; seed a `.corrupt-*` file past retention and assert the
sweep deletes it.

---

## VF-AUD-20260912-P3-014 — Storage services log absolute filesystem paths into the durable rotated log, contrary to AGENTS.md §6

Severity: P3 | Confidence: High | Classification: DOCUMENTATION DEFECT (policy deviation)

Affected files: `electron/services/chatStorage.ts:64`; `electron/services/rpSingleFileStore.ts:82`;
`electron/services/characterCardStorage.ts:164`; `electron/services/conversationVault.ts:311,319`;
`electron/services/vaultMigration.ts:118,131,147,233` (migration log lines include full
paths of moved files)

Observed: Corruption/backup log lines embed complete absolute paths, e.g.
`logError("Chat history file corrupt or unreadable", { path: filePath, ... })`
(chatStorage.ts:64) and `logInfo("Corrupt chat file backed up", backupPath)` (line 70).
`logger.ts` persists these to `<userData>/logs/venice-forge.log` with 1 MiB × 4 rotation —
a permanent artifact. AGENTS.md §6 lists "private absolute machine paths in permanent
artifacts" under do-not-log. (Basename-only logging is already used in chatFolderStorage
and chatFolderBackupService, so the convention exists in-repo.)

Expected: Log `path.basename(...)` or repository/userData-relative descriptors; reserve full
paths for transient on-screen diagnostics.

Impact: Privacy hygiene: rotated logs shipped in bug reports leak machine layout and
profile ids.

Recommended remediation: Switch the listed call sites to basename/relative logging; add a
lint/check for `path: <abs>` shapes in logger calls within electron/services.

Required regression tests: log-capture test asserting no log line in these paths contains
the userData absolute prefix.

---

## Rejected candidates

- **`backupCrypto.decryptPayload` AES-256-GCM legacy branch (12-byte IV from file)** —
  nonce is randomly generated per encryption on the write side; legacy-format compatibility
  is deliberate and authenticated (GCM tag verified). No actionable defect beyond the
  documented migration path.
- **`chatFolderLockService` Argon2id `INTERACTIVE` preset** — consistent between lock and
  backup export; passphrase-gated, fail-closed, with attempt backoff. Acceptable.
- **`importBackup` new-folder mode allows duplicate source ids to overwrite each other** —
  reachable only with a hand-crafted backup; legitimate exports contain unique ids per
  profile. Recorded as a hardening note, not a defect.
- **`mediaService.decodePng` does not verify chunk CRCs and tolerates truncated IDAT** —
  malformed input yields throwaway thumbnail garbage (never persisted user data) or the
  renderer canvas fallback (decodeImage returns null for non-PNG/RGBA/gray). Palette PNGs
  (color type 3) and grayscale+alpha (type 4) are excluded but fall back gracefully.
- **`generatedVideoDownload` SSRF posture** — DNS-resolves all addresses, rejects private/
  loopback/link-local/reserved ranges, pins the request to the resolved IP via a custom
  `lookup`, keeps TLS hostname verification intact. Sound for the stated threat model.
- **`characterImageCache.writeMeta` non-atomic + lazy orphan cleanup** — benign: orphaned
  `.bin` files are reaped by `listEntries` during eviction/inventory; worst case is a stale
  cache entry.
- **`chatStorage.listConversations` early-break pagination math** — verified: the
  `+1` overshoot guarantees `truncated` is reported whenever the batch loop broke early;
  legacy array/envelope duality is handled at every in-domain call site
  (chatFolderService.ts:190-191, chatFolderBackupService.ts:123-124, 170-171, 537-542).
- **`conversationVault.getRecordPath` uses `createdAt` in the path** — id and profile are
  validated; `createdAt` only selects `records/<year>/<month>/` inside the validated
  profile root; non-numeric dates degenerate to a `NaN/` folder inside the root. Contained.
- **`readRegularFileNoFollow` (utils/secureFile.ts)** — opens `O_RDONLY|O_NOFOLLOW`,
  fstats through the same descriptor, rejects non-regular files. Correct TOCTOU closure for
  its two call sites.
- **`purgeProfileChatHistory` / `purgeProfileConversationVault` / `purgeRpProfileDirs` /
  `purgeProfileTtsCache`** — all validate `isValidProfileStorageId`, refuse `default`, and
  `rm -rf` only the validated profile subtree; quarantine/backup files live inside the same
  subtree and are removed with it. Compliant with §13 purge expectations.
- **Sync packet path containment (`openSecureWatchedFile`)** — realpath-of-parent allowlist
  (`blobs`/`objects` only), pre/post-open lstat symlink checks, `O_NOFOLLOW`, regular-file
  fstat, 50 MiB cap, per-object serialization via `syncApplyQueue`. Robust.
- **Folder-backup import file approval (`issueBackupFileCapability`)** — dialog-mediated,
  symlink rejected, size-capped, and re-validated (size/mtime/dev/ino/realpath) at resolve
  time with TTL and single-use consumption. Robust; the KDF-param gap (VF-AUD-20260912-P1-001)
  is the one hole in this flow.
