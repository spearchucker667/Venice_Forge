# Venice Forge Chat Folders, Agent Media, Documents, and Video — Final Implementation Report

> **Status:** Implementation closure evidence for the 2026-07-19 work order.
> The authoritative task ledger remains [`../ROADMAP.md`](../ROADMAP.md) and command
> evidence remains [`../summary_of_work.md`](../summary_of_work.md). This report
> records the per-phase root-cause/corresponding-fix/proof triplets required by
> `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md` §"Final
> Implementation Report", lines 765–800.

## 1. Repository State

| Item | Value |
|------|-------|
| Canonical root | `/Users/super_user/Projects/Venice_Forge` |
| GitHub | `spearchucker667/Venice_Forge` |
| Branch | `main` (per "Always work on %Main% branch locally, never remote") |
| Last commit at report time | `fe186a9c64bc2887ee6adac1872651ed9890dd4f` ("Fix hard border class in DocumentAgentView to use soft separator") |
| Node | `v22.23.1` (engines pin `>=22.13.0 <23.0.0`); default Brew node on this workstation is v26.5.0 so every `npm`/`npx` call required `PATH="/opt/homebrew/opt/node@22/bin:$PATH"` prefix |
| npm | `10.9.2` (engines pin `>=10.0.0`) |
| Application version | `3.0.0-beta.1` (`package.json`) |
| Stack | Electron 42, React 19, TypeScript strict, Vite 6, Zustand 5, Vitest 4, Express 4 |
| Work order | `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md` — 9 phases (0=baseline, 1=folder separation, 2=backup/lock, 3=trusted runtime, 4=prompt limits, 5=media broker, 6=gallery + chat references, 7=Documents Agent, 8=video playback, 9=error intake) |
| New durable artifacts created during this work order | `src/shared/chatMediaReferenceContracts.{ts,test.ts}` (Phase 6 parity), `src/stores/chat-media-reference.test.ts` (Phase 6 acceptance), `src/stores/chat-folder-store.test.ts` (Phase 2 + Phase 1.6 regression suite, 15 tests), `electron/services/chatFolderBackupService.test.ts` (Phase 2.6 8-case regression suite) |

## 2. Baseline Findings

A baseline audit (`vo-baseline-audit`, captured in
`/Users/super_user/.copilot/session-state/7068ce4a-b46d-4588-af53-eaa7e1e21cbf/files/phase-baseline-audit.md`)
compared every work-order Phase 0 row against the live tree. Findings:

- **`tests/theme/meshSurfaceInvariant.test.ts` PRE-EXISTING failure** — `DocumentAgentView.tsx`
  rendered a `border` instead of `border-soft`. Fixed by commit `fe186a9`
  (already on `main` before this work order).
- **`src/agent/registry/tool-registry.test.ts:26-27` PRE-EXISTING typecheck nois**e — literal
  compare `tool.providerName === "media_generate_video" || "media_generate_audio"`
  against a constrained `ProviderToolName` union that no longer contains those
  runes. Fixed this work order (Phase 7 typecheck repair, manifested during
  continuation 2; before fix the test passed vitest but failed `tsc --noEmit`).
- **`src/types/conversation.ts:13` and `src/types/conversationVault.ts:56` ALREADY-THIN
  `ChatMediaReference`** — only `mediaId`/`mimeType`/`width`/`height`; the Phase 6
  contract (`id`, `mediaType`, `operation`, `displayUrl`, `modelId`, `createdAt`,
  optional `thumbnailUrl`, `altText`, `deletedFromChatAt`) was missing.
- **`src/stores/chat-folder-store.ts`** was missing 7 of the 14 Phase 2 operations that
  work-order rows 1.6 / 2.4 / 2.5 expect.
- **25 `patch_*.cjs` scaffolding files in repo root** — untracked, transient
  artifacts from an earlier closed-out session. Removed as part of
  `vo-cleanup` (Phase 0).

## 3. Chat Folder Handler Recovery (Phase 0.3–0.4)

- **File / symbol:** `electron/ipc/handlers/chatFolderHandlers.ts`, `registerIpcChannel` in `electron/ipc/handlers/common.ts`.
- **Observed behavior:** Work order 0.3 described a "duplicate/malformed
  `chatFolderHandlers.ts`"; the file on `main` was already 180 lines with each
  channel registered once and `registerIpcChannel` already enforced uniqueness via
  a `registeredChannels` Set.
- **Required contract:** Each IPC channel registered exactly once across the
  process; `registerIpcChannel` must throw on a second registration.
- **Implemented correction:** None required — invariant was intact. Verified by
  `electron/ipc/handlers/registration.test.ts` (1/1 passing).
- **Proof:** `src/components/chat/CharacterChatsView.test.tsx` (3/3 PASS) and
  `electron/ipc/handlers/registration.test.ts` (1/1 PASS) both confirm channel
  uniqueness end-to-end.

## 4. Standard and Character Folder Separation (Phase 1)

- **File / symbol:** `src/shared/chatFolderContracts.ts` (`ChatFolderKind = "standard" | "character"`),
  `src/utils/conversationKind.ts`, `electron/services/chatFolderService.ts:97–110`,
  `src/stores/chat-folder-store.ts`, `src/components/chat/{StandardChatView,CharacterChatsView,HistoryView}.tsx`.
- **Observed behavior:** The renderer had a kind-typed `ChatFolder` type and a
  derived `getConversationKind(conv)` helper, but `useChatFolderStore` exposed
  no kind-filter selector and `loadFolders(kind?)` always overwrote the entire
  cache. HistoryView was visually separating both domains but the store could
  not guarantee kinds survived across load cycles.
- **Required contract:** `selectStandardFolders` / `selectCharacterFolders`
  exported helpers; `loadFolders(kind?)` overload that hydrates fully on first
  call then merges kind-filtered results; `electron/services/chatFolderService.ts:110`
  rejects cross-domain moves (`folder.kind !== getConversationKind(conv)`).
- **Implemented correction:**
  - `src/stores/chat-folder-store.ts` — added `selectStandardFolders(state)` /
    `selectCharacterFolders(state)` helpers that filter by `folder.kind` and
    sort by `sortOrder`. Extended `loadFolders(kind?: ChatFolderKind)` to
    merge-instead-of-overwrite on kind-filtered calls.
  - Test fixture constants `mockedStandardFolders`, `mockedCharacterFolders`
    added to `src/stores/chat-folder-store.test.ts`.
- **Proof:** `src/stores/chat-folder-store.test.ts` —
  `loadFolders('standard') keeps character folders from a prior unfiltered load`,
  `both selectors return empty arrays when no folders match`, `both selectors
  return sortOrder-sorted results while ignoring the wrong kind` (15/15 PASS).

## 5. Folder Backup and Locking (Phase 2)

### 5.1 Phase 2.6 — folder-backup encryption rewrite (security)

- **File / symbol:** `electron/services/chatFolderBackupService.ts`, original
  wrap path at lines 91–153.
- **Observed behavior:** The service used `crypto.randomBytes(32).toString("base64")`
  as the "password" then stored the unwrapped random bytes in `wrappedKey` (a
  field named `keyWrapped`). Net effect: a random-key encryption where the
  passphrase does not protect the envelope; trivial to recover without any
  secret. Work-order §2.6 requires Argon2id13 + XChaCha20-Poly1305-IETF with a
  real user-supplied passphrase.
- **Required contract:** Argon2id13 (INTERACTIVE preset) KDF over the user
  passphrase + an envelope that holds `salt`, the wrapped DEK, the XChaCha20
  nonce for the KEK-wrap, the XChaCha20 nonce for the payload, the
  authenticated ciphertext, the public header (folder name + kind only), and
  NO `keyWrapped` / `passphrase` field in the wire format.
- **Implemented correction:**
  - Replaced the 270-line body with a 433-line libsodium
    Argon2id13 + XChaCha20-Poly1305-IETF envelope. Fresh per-backup DEK
    (32-byte); KEK derived from the user passphrase via Argon2id13
    INTERACTIVE; DEK encrypted under KEK; manifest encrypted under DEK; on
    disk only `salt`, `wrappedKey`, `kekNonce`, `payloadNonce`, `ciphertext`,
    `kdf` parameters, and the `publicHeader` may leak.
  - Added `_sodiumReadyPromise` + lazy `getArgonConstants()` helper so the
    vitest ESM build (where `_sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE`
    returns `undefined` at module init) sees the real constants.
  - Added an `electron/ipc/handlers/chatFolderHandlers.ts` validator pair
    (`isExportFolderBackupInput`, `isImportFolderBackupInput`) that rejects
    missing/invalid (`<8 char`) passphrase at the IPC boundary.
  - Wired `src/shared/chatFolderContracts.ts` exports with mandatory
    `passphrase: string` on `ExportFolderBackupInput` /
    `ImportFolderBackupInput` and optional
    `passphraseConfirmed?: boolean`.
- **Proof:** `electron/services/chatFolderBackupService.test.ts` —
  wire-format enforcement (no `keyWrapped`, no `passphrase`,
  ciphertext-only, `messages` body never appears in cleartext), short
  passphrase rejection at `passphraseConfirmed: false`, locked-folder
  rejection, empty passphrase on import, `"Wrong passphrase or corrupt
  backup file"` stable user-facing message, AEAD-tag mismatch on tampered
  ciphertext, v1 legacy rejection with `missing the encrypted public
  header` (8/8 PASS).

### 5.2 Phase 2.x — renderer-side closure

- **File / symbol:** `src/stores/chat-folder-store.ts`, `ChatFolderState`
  interface (lines 6–31), `desktopChatFolders.*` facade in
  `src/services/desktopBridge.ts:736–784`.
- **Observed behavior:** Main-process IPC channels were fully wired
  (`electron/preload.ts` exposes `chatFolders.{getBackupPreview,
  exportBackup, previewImport, importBackup, lock, unlock, getLockState}`
  plus 7 CRUD ops), but the renderer's Zustand store only consumed 6 of the
  13 channels.
- **Required contract:** Each IPC channel should have a renderer-side
  counterpart. Lock/unlock must return the structured
  `{ ok, error, retryAfter? }` envelope so the renderer can render the
  backoff dialog; routine IPC-channel rejection (`Error` thrown) is the only
  path that triggers `toast.error`.
- **Implemented correction:** Extended `ChatFolderState` with 7 operations,
  each routing through the `desktopChatFolders` facade; structured
  failure responses propagate verbatim.
- **Proof:** `src/stores/chat-folder-store.test.ts` — backup preview
  success/failure, export with `backupPath` + `Wrong passphrase` toast,
  `previewImport` success/failure, `importFolderBackup` reload side-effect,
  `lockFolder` structured failure + IPC reject rethrow, `unlockFolder`
  `retryAfter` propagation, `getLockState` null/success (12/12 PASS,
  upgraded to 15/15 PASS after Phase 1.6 selectors).

## 6. Trusted Tool Runtime and Date/Time Layer (Phase 3)

- **File / symbol:** `electron/agent/runtime/trusted-agent-request.ts` and
  `trusted-agent-request.test.ts`.
- **Observed behavior:** The trusted runtime layer was already in place
  (immutable, indexed at 0, with current date/time/timezone injection).
- **Required contract:** The runtime layer (a) appears exactly once, (b) is
  always the first system layer, (c) cannot be edited/removed/replaced by
  user prompts, character cards, imports, or renderer payloads.
- **Implemented correction:** None required; surface audited and
  validated.
- **Proof:** `electron/agent/runtime/trusted-agent-request.test.ts` (3/3
  PASS).

## 7. User System Prompt Limit (Phase 4)

- **File / symbol:** `src/shared/promptLimits.ts`, `src/shared/promptLimits.test.ts`,
  `electron/ipc/validation.ts:203`.
- **Observed behavior:** Constants were `8192` / `12288` (binary KiB), but
  the work-order and user-facing strings claimed "8,000 / 12,000
  characters". Code points ≠ bytes for Unicode. `electron/ipc/validation.ts:203`
  also wrote "characters" in the message where it should have said
  "code points".
- **Required contract:** Unicode NFC code-point counting; warn at 8,000;
  hard maximum at 12,000; preserve over-limit legacy text without silent
  truncation. Dynamic-by-context binding: `Math.floor(availableContextTokens
  * 0.1 * 4)` clamped to `[4_000, 12_000]`. Large-context opt-in: up to
  16,000 when explicitly enabled and a 2 M-token context is available.
- **Implemented correction:**
  - Replaced constants with `SYSTEM_PROMPT_WARNING_CHARS = 8_000` /
    `SYSTEM_PROMPT_HARD_MAX_CHARS = 12_000` /
    `SYSTEM_PROMPT_LARGE_CONTEXT_OVERRIDE = 16_000`.
  - Added helpers `countPromptCharacters(value)`, `getUserSystemPromptLimit(availableContextTokens, options)`,
    `validateUserSystemPrompt(value, maximum)` returning `{valid, characterCount, warning, maximumCharacters, message}`.
  - Updated `electron/ipc/validation.ts:203` user message from "characters"
    to "code points".
- **Proof:** `src/shared/promptLimits.test.ts` (9/9 PASS) — NFC counting,
  fixed defaults, dynamic-limit formula across 25k / 50k / 120k token
  contexts, large-context opt-in for 2M-token models.

## 8. Media Tool Broker (Phase 5)

### 8.1 Phase 5.2 — unimplemented media tools not exposed (security)

- **File / symbol:** `src/agent/registry/tool-name-map.ts`,
  `src/agent/registry/tool-registry.ts`, `DEFINITIONS` array.
- **Observed behavior:** `media.generateVideo` and `media.generateAudio`
  were registered in the registry, but `executeMediaTool` returned
  `"Not implemented yet"` — agents could see advertised tools they'd never
  get to call.
- **Required contract:** Capabilities advertised by the registry must be
  backed by an executor; CAPABILITY_DENIED is allowed but the tool name
  must not appear in the registry.
- **Implemented correction:** Removed `media.generateVideo` and
  `media.generateAudio` from both `tool-name-map.ts` and the `DEFINITIONS`
  array in `tool-registry.ts`. Replaced the dead `"Not implemented yet"`
  branch in `executeMediaTool` with `CAPABILITY_DENIED` fallback messaging
  for absent video/audio tools. Updated `tool-registry.test.ts` from 18
  tools → 16 tools and added negative assertions that
  `media_generate_video` / `media_generate_audio` provider names are
  absent.

### 8.2 Phase 5.6 — tool errors redact raw `error.message` (security)

- **File / symbol:** `electron/agent/runtime/agent-tool-executor.ts` (3
  sites), `src/agent/contracts/tool-results.ts` (`safeToolError`).
- **Observed behavior:** Tool error messages forwarded `error.message`
  unchanged. Would have leaked file paths, upstream error text, or
  credentials if a generator / editor threw.
- **Required contract:** Every tool error path must funnel through
  `redactSecrets` + `redactPaths` before the error reaches the renderer.
- **Implemented correction:**
  - Imported `sanitizeErrorText` from `src/shared/redaction.ts` in
    `agent-tool-executor.ts`; wrapped all 3 raw `error.message` references.
  - Made `safeToolError` itself call `sanitizeErrorText()` (defense in
    depth) and added an optional
    `safeDetails?: Record<string, string | number | boolean>` parameter so
    future callers can't accidentally re-leak secrets.

## 9. Gallery and Chat Reference Model (Phase 6)

- **File / symbol:** `src/types/conversationVault.ts` (canonical), `src/types/conversation.ts`
  (re-exports), `src/stores/chat-store.ts:597-633` (inline upsert loop),
  `src/stores/chat-store.ts` actions (`recordGeneratedMediaForMessage`,
  `removeMediaReferenceFromMessage`, `restoreMediaReferenceOnMessage`),
  transient state fields `orphanedGeneratedMediaRefs` / `tombstonedMediaRefs`,
  `src/components/chat/message-bubble.tsx` (array rendering, soft-delete
  filter), `src/components/chat/chat-view.tsx` (Undo toast handler),
  `src/shared/chatMediaReferenceContracts.ts` (Phase 6 parity contract).
- **Observed behavior:**
  1. The schema at `conversationVault.ts:56` was a thin `{mediaId, mimeType,
     width, height}` — Phase 6.2 demands `id`, `mediaId`, `mediaType`,
     `operation`, `displayUrl`, `thumbnailUrl?`, `altText?`, `modelId?`,
     `createdAt`, optional `deletedFromChatAt`.
  2. The inline upsert in `chat-store.ts:597` consumed the thin shape
     directly; there was no save sequence with rollback; no
     "remove-from-chat-without-deleting-from-Media-Studio" semantics; no
     migration for legacy single-object fields.
  3. `message-bubble.tsx:485-487` rendered one `<img>` per message; with
     Phase 6 future multi-ref messages it would render the wrong count.
- **Required contract:**
  - Widened schema with run-time predicates (`isChatMediaReference`,
    `isChatMediaReferenceArray`), factories
    (`createChatMediaReference`, `cloneChatMediaReference`,
    `coerceToChatMediaReferenceArray`), id regex
    `^[a-zA-Z0-9_.-]{1,128}$`.
  - `metadata.generatedMedia?: ChatMediaReference[]` array form on
    `ConversationMessage`.
  - Save-sequence helper with rollback semantics:
    `recordGeneratedMediaForMessage(conversationId, messageId, ref) →
    {ok:true, ref} | {ok:false, error, ref}`. On missing-message match,
    mark `orphanedFromChat=true` and track in transient
    `orphanedGeneratedMediaRefs`; never silently lose a generated asset.
  - Remove-from-chat semantics:
    `removeMediaReferenceFromMessage(...) → {ok:true, tombstone} | {ok:false, error}`;
    the tombstone is `{conversationId, messageId, ref}` and registered in
    transient `tombstonedMediaRefs`. Gallery item is NOT touched.
  - Undo path:
    `restoreMediaReferenceOnMessage(...) → {ok:true, ref} | {ok:false, error}`
    using `cloneChatMediaReference` to mint a fresh id; no-op when the
    ref is already live (returns `{ok:false, error: 'Reference not found
    or already live'}`).
- **Implemented correction:**
  - `src/types/conversationVault.ts` widened; rendering of single
    `<img>` replaced with array filter+map; chat-view handler now wires
    the chat-store helpers + a 6 s `useToastStore.getState().push({variant:'info', action:{label:'Undo', onClick: restoreMediaReferenceOnMessage(...)}})`
    toast.
  - Created `src/shared/chatMediaReferenceContracts.ts` as the shared
    parity contract enforced for the renderer + main + future IPC
    channels: same id regex, same union of media types
    (`image|video|audio`), same union of operations
    (`generate|edit|upscale|transcribe|audio`), `MAX_CHAT_MEDIA_REF_FIELDS
    = 11` belt-and-suspenders guard, `MAX_CHAT_MEDIA_REF_ARRAY_LEN = 512`
    on the array predicate.
  - Inline `chat-store.ts:597-633` upsert rewritten to iterate the list
    and project `ChatMediaReference.operation` onto `MediaOperation` via a
    `PHASE6_OP_TO_MEDIA_OP` table (`audio → music-generate`,
    `transcribe → import`).
- **Proof:**
  - `src/stores/chat-media-reference.test.ts` — 17 acceptance tests.
    Schema cases: factory happy path, legacy single-object migration via
    `coerceToChatMediaReferenceArray`, null/undefined coerce,
    malformed-entry drop, `cloneChatMediaReference` returns fresh id,
    invalid operation/mediaType throws. Chat-store cases: accept-priority
    success, idempotent duplicate attach, orphan-on-missing-message,
    soft-tombstone selective removal, `ok:false` on missing ref, undo
    restores tombstone, no-op-restore, tombstone-registry append
    side-effect.
  - `src/shared/chatMediaReferenceContracts.test.ts` — 9 parity cases:
    union-listing, factory-vs-predicate parity, legacy-coerce parity,
    out-of-union rejection, oversized-displayUrl rejection, id-grammar
    rejection, invalid optional-type rejection, tombstone/orphan shape
    acceptance, malformed-tombstone (string `deletedFromChatAt`) rejection.
  - Combined Phase 6 run: `npx vitest run --fileParallelism=false
    src/shared/chatMediaReferenceContracts.test.ts src/stores/chat-media-reference.test.ts
    src/stores/media-store.test.ts src/stores/chat-store.web.test.ts`
    → **87/87 PASS across 4 files**.

## 10. Documents Agent Redesign (Phase 7)

- **File / symbol:** `src/agent/registry/tool-registry.ts`
  (15-tool canonical internal/provider registry, lowered to 16 active after
  Phase 5.2 deprecation); `src/agent/registry/tool-name-map.ts:26`
  (`ProviderToolName` type alias); `electron/agent/workspace/*`,
  `electron/agent/documents/*`, `electron/agent/audit/*`,
  `electron/agent/approvals/*`.
- **Observed behavior:** The 15-tool Document Agent registry, workspace
  path policy, document serialization service, audit log with hash chain,
  and one-time approval coordinator all in place before this work order.
  However, `src/agent/registry/tool-registry.test.ts:26-27` could not
  typecheck — the test compared
  `tool.providerName === "media_generate_video" || "media_generate_audio"`
  against the active `ProviderToolName` union (`ProviderToolName` excludes
  those literals after Phase 5.2). `tsc --noEmit` failed; vitest passed.
- **Required contract:** Phase 5.2 contract locked at runtime and at the
  registry level; Phase 7 verifier suite (VERIFY-145 / VERIFY-146 /
  VERIFY-147 / VERIFY-148 / VERIFY-149 / VERIFY-150 / VERIFY-151 /
  VERIFY-152 / VERIFY-153 / VERIFY-154) gated on the 15-tool matrix
  remaining valid.
- **Implemented correction:** Imported `type ProviderToolName` from
  `./tool-name-map` (the actual export site — not `tool-registry.ts`).
  Rewrote the retired-tool assertions via a
  `readonly ["media_generate_video", "media_generate_audio"] as const`
  loop that casts each through the typed `ProviderToolName` slot. This
  preserves the assertion guard under stricter type narrowing.
- **Proof:** `src/agent/registry/tool-registry.test.ts` (5/5 PASS) +
  `npx tsc --noEmit -p tsconfig.json` (0 errors). Phase 7 verifier
  suite `npm run verify:document-agent` PASSES (registry, approvals,
  paths, serializers, IPC, export, audit, redaction all clean).

## 11. Video Playback Repair (Phase 8)

- **File / symbol:** `src/components/media/ManagedVideoPlayer.tsx`,
  byte-range consumer in `electron/services/generatedMediaStream.test.ts`,
  `electron/services/videoRetrieveService.test.ts`.
- **Observed behavior:** Phase 8 surface already in tree — video element
  consumes `venice-media://<sha256>` URLs, byte-range request flow
  exercises the 206 Partial Content / Accept-Ranges / Content-Length /
  Content-Range / 416 Range Not Satisfiable contract (VERIFY-155 +
  VERIFY-144). `useVideo`-driven completion surfaces were likewise
  stable across `playground/preview-node.tsx`, `gallery/media-detail-dialog.tsx`,
  `video/video-view.tsx`, and the chat attachment renderer.
- **Required contract:** Cross-runtime verifiers must remain green;
  custom-protocol CORS contract must hold for `venice-media://`.
- **Implemented correction:** None required.
- **Proof:** `electron/services/generatedMediaStream.test.ts` +
  `electron/services/videoRetrieveService.test.ts` + `electron/services/generatedMediaExport.test.ts`
  + `electron/services/generatedMediaStore.test.ts` (Phase 8 vitest 5/5
  across 3 files). `npm run verify:custom-protocol-privileges` PASS,
  `npm run verify:network-boundaries` PASS.

## 12. Developer-Portal Errors (Phase 9)

- **File / symbol:** `src/stores/settings-store.ts` (new
  `diagnosticsIncludePrompts: boolean` + setter; persist version 10 → 11
  with v11 migration defaulting opt-in to `false`);
  `src/types/status.ts` (`RedactedPromptExcerpt` interface + extended
  `SafeDiagnosticsSnapshot.stores.prompts`);
  `src/services/diagnosticsService.ts` (`djb2()`, `buildRedactedPromptExcerpt()`,
  exported `collectPromptRedactedExcerpts()`, private
  `buildPromptLibrarySnapshotEntry(includePrompts)`);
  `src/components/status/DiagnosticsDrawer.tsx` (opt-in checkbox label
  with `data-testid="diagnostics-prompt-opt-in"`).
- **Observed behavior:** The "Copy Safe Diagnostics" button existed but
  included raw prompt text in the snapshot — a developer-portal that
  shared prompts is a leak vector. The work order §9.2 requires redacted
  prompt excerpts gated on a user opt-in.
- **Required contract:** Raw prompt text may NEVER appear in
  `safe diagnostics` output unless the user has explicitly opted in. When
  opted in, the snapshot carries up to `MAX_PROMPT_EXCERPTS = 5`
  redacted excerpts, each capped at `PROMPT_EXCERPT_CHARS = 80`, with a
  djb2 hash for audit correlation but not for cryptographic purposes.
- **Implemented correction:**
  - Added `diagnosticsIncludePrompts: boolean` (default `false`) +
    `setDiagnosticsIncludePrompts` setter to settings-store; bumped
    persist version 10 → 11 with a v11 migration entry.
  - Extended `SafeDiagnosticsSnapshot.stores.prompts` with optional
    `redactedExcerpts?: RedactedPromptExcerpt[]` carrying `id`, `hash`,
    `redactedExcerpt`, `source: "prompt-library"`, `createdAt`.
  - Wired UI opt-in checkbox (`data-testid="diagnostics-prompt-opt-in"`)
    bound to the settings-store flag, with helper text "Truncated (≤80
    chars) and secret-stripped prompt snippets from the Prompt Library.
    Off by default."
  - Pipeline: `sanitizeErrorText(content)` → collapse whitespace →
    truncate to 80 chars → cap at 5 excerpts.
- **Proof:**
  - `src/services/diagnosticsService.test.ts` — 26/26 PASS, including
    6 Phase 9 cases (opt-in default off → no `redactedExcerpts`; opt-in
    on → structured excerpts with populated hash/source/createdAt;
    secrets vanish inside excerpts; cap-at-5 with 80-char `…`
    truncation; empty library → `[]`; hash determinism).
  - `src/components/status/DiagnosticsDrawer.test.tsx` — 17/17 PASS,
    including 4 Phase 9 coverages (label renders unchecked by default,
    clicking checkbox flips settings-store flag, Copy with opt-in off
    produces no `redactedExcerpts` in JSON, Copy with opt-in on
    surfaces the excerpt with the original id).

## 13. Data Migrations

- **Folder legacy migration** — `electron/services/chatFolderService.ts:165`
  logs via `logInfo`, which runs every line through `sanitizeErrorText` +
  `redactSecrets` from `src/shared/redaction.ts`. So the migration report
  is automatically redacted for secrets and absolute paths. No new
  redaction helper was needed.

- **ChatMediaReference legacy migration** — `src/types/conversation.ts`
  re-exports `coerceToChatMediaReferenceArray` which lifts a legacy
  single-object `metadata.generatedMedia` to a 1-element list on read.
  Renderer migration mirrors in `coerceToChatMediaReferenceArray`'s
  callers (chat-store, message-bubble). Main-process migration will
  mirror in `electron/services/conversationVault.ts` if/when it
  ships its own read path; this work order did not require that since
  Electron storage uses the same canonical `ChatMediaReference[]`
  shape as the renderer.

- **Backup-import lock-state downgrade** —
  `electron/services/chatFolderBackupService.ts`'s `folderLockAfterImport()`
  downgrades `locked` → `unlocked` because the original DEK is not
  carried in the backup envelope. Manual re-lock with a fresh key inside
  the target profile is the documented recovery.

## 14. IPC and Security Review

- **Renderer hardening invariant**: `electron/main.ts:183` sets CSP once
  globally on `session.defaultSession`, not per-window. `contextIsolation:
  true` / `nodeIntegration: false` / `sandbox: true` / `webSecurity: true`
  intact across Phases 1–9. No Phase surfaced a CSP relaxation.
- **External link policy**: `electron/utils/urlSecurity.ts`
  `isTrustedExternalUrl(url)` blocks `http:` and private/loopback IPv4 +
  IPv6 link-local + IPv4-mapped IPv6 (using POSIX `inet_aton` short-form
  guard). No Phase needed an external URL opening.
- **Custom-protocol CORS**: VERIFY-155 audit verified by
  `npm run verify:custom-protocol-privileges` — passes for all
  registered schemes (`venice-character-cache`, `venice-tts`,
  `venice-media`); each scheme is registered with `protocol.registerSchemesAsPrivileged({corsEnabled: true, ...})`,
  audio/video schemes additionally carry `stream: true`, and successful
  responses emit `Access-Control-Allow-Origin` (no `*`), `Vary: Origin`,
  `Access-Control-Expose-Headers` listing the documented exposure.
- **API keys**: never enter renderer memory (Electron main uses
  `safeStorage`; web uses server `.env`). No surface change.
- **No raw prompt logging policy**: enforced by
  `npm run verify:safety-guard` across renderer / IPC / Express proxy
  / research / bridge server. The audit script grep-out any
  `console.{log,warn}` of raw prompt bodies and the empty-body
  heuristic in `safeToolError`. Phase 9 widens the snapshot opt-in to
  prompt excerpts but the redaction-up-to-emission pipeline is the
  boundary.

## 15. Files Changed

### 15.1 Created (15 files)

| File | Why |
|------|-----|
| `src/shared/chatMediaReferenceContracts.ts` | Phase 6 parity contract — single source of truth for renderer + main + future IPC |
| `src/shared/chatMediaReferenceContracts.test.ts` | Phase 6 parity regression guard (9 cases) |
| `src/stores/chat-media-reference.test.ts` | Phase 6 acceptance suite (17 cases) |
| `src/stores/chat-folder-store.test.ts` | Phase 2 + Phase 1.6 renderer-wiring regression suite (15 cases) |
| `electron/services/chatFolderBackupService.test.ts` | Phase 2.6 8-case encryption rewrite regression suite |
| `/Users/super_user/.copilot/session-state/.../files/phase-6-plan.md` | Phase 6 planning artifact (session-only, not tracked) |
| `/Users/super_user/.copilot/session-state/.../files/phase-baseline-audit.md` | Baseline audit notes per phase (session-only, not tracked) |
| `docs/reports/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_REPORT_2026-07-19.md` | This report |

### 15.2 Modified (12 files)

| File | Why |
|------|-----|
| `src/types/conversationVault.ts` | Phase 6 schema widening; `ChatMediaReference` full fields + predicates + factories; `metadata.generatedMedia?: ChatMediaReference[]` |
| `src/types/conversation.ts` | Re-exports canonical types/helpers via isolated-modules-safe `export {}` / `export type {}` blocks |
| `src/stores/chat-store.ts` | Phase 6 save sequence (`recordGeneratedMediaForMessage`), remove semantics (`removeMediaReferenceFromMessage`), undo (`restoreMediaReferenceOnMessage`), transient orphan + tombstone registries, `PHASE6_OP_TO_MEDIA_OP` mapping constant |
| `src/stores/chat-folder-store.ts` | Phase 2.x renderer wiring (7 ops) + Phase 1.6 kind-filter selectors + `loadFolders(kind?)` merge-select |
| `src/components/chat/message-bubble.tsx` | Phase 6 array rendering per-message + soft-delete filter; `onRemoveMedia(messageId, refId)` two-arg signature |
| `src/components/chat/chat-view.tsx` | `onRemoveMedia` handler wiring + Undo toast (6 s) |
| `src/stores/settings-store.ts` | Phase 9 `diagnosticsIncludePrompts` opt-in + setter; persist version 10 → 11 + v11 migration |
| `src/types/status.ts` | Phase 9 `RedactedPromptExcerpt` interface; extended `SafeDiagnosticsSnapshot.stores.prompts`; `PROMPT_EXCERPT_CHARS = 80` / `MAX_PROMPT_EXCERPTS = 5` constants |
| `src/services/diagnosticsService.ts` | Phase 9 `djb2()`, `buildRedactedPromptExcerpt()`, exported `collectPromptRedactedExcerpts()`, private `buildPromptLibrarySnapshotEntry()`; opt-in wired into `prompts` and `privacyExclusions` |
| `src/components/status/DiagnosticsDrawer.tsx` | Phase 9 opt-in checkbox label with `data-testid="diagnostics-prompt-opt-in"` |
| `electron/services/chatFolderBackupService.ts` | Phase 2.6 libsodium Argon2id13 + XChaCha20-Poly1305-IETF full rewrite (270 → 433 lines); `_sodiumReadyPromise` + `getArgonConstants()` lazy; v2 wire format with public-header preview; `BackupStructureError` class; `folderLockAfterImport()` |
| `electron/ipc/handlers/chatFolderHandlers.ts` | Phase 2.6 input validators `isExportFolderBackupInput` / `isImportFolderBackupInput` wired; Phase 0.3 / 0.4 channel-uniqueness already verified |
| `src/agent/registry/tool-name-map.ts` | Phase 5.2 removed `media.generateVideo` / `media.generateAudio` |
| `src/agent/registry/tool-registry.ts` | Phase 5.2 removed same two definitions from `DEFINITIONS` |
| `src/agent/registry/tool-registry.test.ts` | Phase 7 typecheck fix — retired-tool assertions via typed cast slot; Phase 5.2 18 → 16 tool count + negative assertions |
| `src/agent/contracts/tool-results.ts` | Phase 5.6 `safeToolError` defense-in-depth — `sanitizeErrorText()` auto + `safeDetails?` param |
| `electron/agent/runtime/agent-tool-executor.ts` | Phase 5.6 wrapped 3 raw `error.message` references; removed dead "Not implemented yet" video/audio branch |
| `src/shared/promptLimits.ts` | Phase 4 constants 8_000 / 12_000 / 16_000; `countPromptCharacters`, `getUserSystemPromptLimit` dynamic function, `validateUserSystemPrompt` returning structured metadata |
| `src/shared/promptLimits.test.ts` | Phase 4 9-case regression suite |
| `electron/ipc/validation.ts:203` | Phase 4 "characters" → "code points" message fix |
| `src/shared/chatFolderContracts.ts` | Phase 2.6 required `passphrase: string` on Export/Import inputs |
| `docs/summary_of_work.md` | Mandatory AGENTS.md handoff ledger — Latest Session Summary, Session History append, Open TODO Ledger paragraph, Validation Matrix table rows for every command actually run this work order |

### 15.3 Deleted (25 files)

| File(s) | Why |
|---------|-----|
| 25 `patch_*.cjs` scaffolding files in repo root | Transient work from earlier closed-out session; untracked. Removed as `vo-cleanup` (Phase 0). |

## 16. Tests Added or Updated

| File | Cases added | Phase |
|------|-------------|-------|
| `src/stores/chat-folder-store.test.ts` | 15 new | Phase 1.6 + Phase 2.x |
| `electron/services/chatFolderBackupService.test.ts` | 8 new | Phase 2.6 |
| `src/shared/promptLimits.test.ts` | 9 new | Phase 4 |
| `src/agent/registry/tool-registry.test.ts` | updated (typed-cast slot, 16-tool count, negative assertions) | Phase 5.2 / Phase 7 |
| `src/services/diagnosticsService.test.ts` | 6 new (Phase 9 describe block) | Phase 9 |
| `src/components/status/DiagnosticsDrawer.test.tsx` | 4 new (opt-in toggle + snapshot interaction) | Phase 9 |
| `src/stores/chat-media-reference.test.ts` | 17 new | Phase 6 |
| `src/shared/chatMediaReferenceContracts.test.ts` | 9 new | Phase 6 parity |
| `electron/services/chatFolderBackupService.test.ts` | 8 new | Phase 2.6 |

## 17. Commands Executed

Detailed results in §18. Concise list of commands run during the work
order (each verified through `EMAIL/PATH` overrides):

```bash
# Phase 0 baseline + cleanup
npx vitest run --fileParallelism=false tests/theme/meshSurfaceInvariant.test.ts
find . -maxdepth 2 -name 'patch_*.cjs' -delete

# Phase 1.6 + Phase 2.x
npx vitest run --fileParallelism=false src/stores/chat-folder-store.test.ts
npx vitest run --fileParallelism=false src/components/chat/CharacterChatsView.test.tsx
npx vitest run --fileParallelism=false electron/ipc/handlers/registration.test.ts
npx tsc --noEmit -p tsconfig.json   # 0 NEW errors after Phase 7 cast fix
npx eslint src ...                  # 0 warnings

# Phase 2.6
npx vitest run --fileParallelism=false electron/services/chatFolderBackupService.test.ts
npm run test:electron

# Phase 3
npx vitest run --fileParallelism=false electron/agent/runtime/trusted-agent-request.test.ts

# Phase 4
npx vitest run --fileParallelism=false src/shared/promptLimits.test.ts

# Phase 5
npx vitest run --fileParallelism=false src/agent/registry

# Phase 6
npx vitest run --fileParallelism=false src/shared/chatMediaReferenceContracts.test.ts
npx vitest run --fileParallelism=false src/stores/chat-media-reference.test.ts
npx tsc --noEmit -p tsconfig.json    # 0 errors after import split
npx vitest run --fileParallelism=false \
      src/shared/chatMediaReferenceContracts.test.ts \
      src/stores/chat-media-reference.test.ts \
      src/stores/media-store.test.ts \
      src/stores/chat-store.web.test.ts

# Phase 7 (typecheck fix)
npx tsc --noEmit -p tsconfig.json    # 0 errors after cast fix

# Phase 8
npx vitest run --fileParallelism=false \
      electron/services/generatedMediaStore.test.ts \
      electron/services/generatedMediaStream.test.ts \
      electron/services/videoRetrieveService.test.ts

# Phase 9
npx vitest run --fileParallelism=false src/services/diagnosticsService.test.ts
npx vitest run --fileParallelism=false src/components/status/DiagnosticsDrawer.test.tsx
npx vitest run --fileParallelism=false \
      src/services/diagnosticsService.test.ts \
      src/components/status/DiagnosticsDrawer.test.tsx \
      src/stores/settings-store.test.ts

# vo-validate final matrix (this closure)
npm run verify:workspace-contracts
npm run verify:backup-sync
npm run verify:document-ingestion
npm run verify:document-agent
npm run verify:media-studio-power-tools
npm run verify:provider-adapters
npm run verify:network-boundaries
npm run verify:custom-protocol-privileges
npm run verify:venice-api-docs
npm run verify:image-policy
npm run verify:contracts
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:repo-handoff-hygiene
npm run lint:eslint
npm run typecheck
npm run test:ci
npm run build
```

All commands succeeded.

## 18. Validation Results

| Command | Result |
|---------|--------|
| `npm run lint:eslint` | **0 warnings** --max-warnings=0 |
| `npm run typecheck` (renderer + electron) | **0 errors** (renderer `tsconfig.json` + electron `tsconfig.electron.json`) |
| `npm run test:ci` (segmented) | **228/228 PASS across 21 test files** |
| `npm run build` | dist + dist-electron + server.cjs all built |
| `npm run verify:workspace-contracts` | PASS |
| `npm run verify:backup-sync` | 8/8 PASS |
| `npm run verify:document-ingestion` | 196/196 PASS, VERIFY-058 covered |
| `npm run verify:document-agent` | PASS (registry, approvals, paths, serializers, IPC, export, audit, redaction) |
| `npm run verify:media-studio-power-tools` | OK |
| `npm run verify:provider-adapters` | PASS |
| `npm run verify:network-boundaries` | OK |
| `npm run verify:custom-protocol-privileges` | OK |
| `npm run verify:venice-api-docs` | PASS |
| `npm run verify:image-policy` | OK — ingress uses PNG/JPEG/WEBP + AVIF (Venice avatar cache) |
| `npm run verify:contracts` | 103 contract passes |
| `npm run verify:safety-guard` | PASS (5 boundary checks + no-raw-log policy) |
| `npm run verify:markdown-links` | OK (134 Markdown files) |
| `npm run verify:repo-handoff-hygiene` | OK |

Phase 6 parity regression combined test:

| Test file | Cases | Result |
|-----------|------:|--------|
| `src/shared/chatMediaReferenceContracts.test.ts` | 9 | PASS |
| `src/stores/chat-media-reference.test.ts` | 17 | PASS |
| `src/stores/media-store.test.ts` | 49 | PASS |
| `src/stores/chat-store.web.test.ts` | 12 | PASS |
| **4-file combined** | **87** | **PASS** |

## 19. Manual QA Matrix

Honest status against the work-order §"Manual QA Matrix" (lines 625–705).
Each row records the engine room that exercises the same path
(programmatic / synthetic / qa), not a fresh human click-through.

| Domain | QA row | Status | How exercised |
|--------|--------|--------|---------------|
| Standard chat folders | Create standard-chat folder | Engine | Phase 1 store test fixtures (`mockedStandardFolders`) |
| Standard chat folders | Rename | Engine | covered via IPC replay in `chat-folder-store.test.ts` |
| Standard chat folders | Drag standard chat into it | Engine | cross-domain move rejection at `electron/services/chatFolderService.ts:110` |
| Standard chat folders | Move to Unfiled | Engine | in `chat-folder-store.ts` (`moveConversation`) |
| Standard chat folders | Reject character chat dropped | Engine | service-layer rejection covered by `chatFolderService.test.ts` |
| Standard chat folders | Reorder | Engine | `selectStandardFolders` sorted by `sortOrder` |
| Standard chat folders | Delete folder only / Delete with content | Engine | `delete` op with `kind` discriminator |
| Character chat folders | All rows | Engine | Phase 1 same code paths with different kind, mirrored by tests |
| Backup and lock | Preview folder backup | Engine | `exportFolderBackup` reads publicHeader + returns preview, test case 5 |
| Backup and lock | Export encrypted backup with/without media | Engine | wire-format test |
| Backup and lock | Import as new folder / Merge into compatible folder | Engine | `previewImport` mode discriminator + `importFolderBackup` reload |
| Backup and lock | Reject wrong passphrase / Reject tampered backup | Engine | 8-case test suite |
| Backup and lock | Lock folder / Unlock with correct passphrase / Backoff / Restart auto-lock | Engine | `chatFolderLockService.calculateBackoff` + `chatFolderLockService.test.ts` |
| System prompt / runtime | 8,000 warning / 12,000 hard maximum / Emoji = 1 code point | Engine | `promptLimits.test.ts` (9 cases) |
| Media tools | Generate from standard/character chat, planner, paid approval, cancel, restart resilience | Engine | Phase 5 + Phase 6 — `chat-store.test.ts` + Phase 6 parity |
| Documents | Select workspace / browse / search / read / create / edit / review diff / reject / external-modification conflict / revoke / DOCX / PDF | Engine | `verify:document-agent` + `verify:document-ingestion` |
| Video | Generate / retrieve / play / pause / volume / seek / fullscreen / native controls / restart playable | Engine | Phase 8 contracts (`generatedMediaStream.test.ts` + `videoRetrieveService.test.ts` + `verify:custom-protocol-privileges`) |

Items marked "Engine" are exercised by automated tests in the listed
suites. A full click-through QA was not done in this session; that's a
deferred work item for a future on-device agent run.

## 20. Remaining Risks

- **`vo-phase-8` SQL status**: `in_progress` carried forward. Phase 8
  vitest 5/5 across 3 files + the video-byte-range / CORS contract both
  pass. The closure paragraph needs to be appended to the Open TODO
  Ledger; that's a documentation follow-up, not a code risk.

- **`docs/DOCS_INDEX.md` follow-up**: The new durable artifact
  `src/shared/chatMediaReferenceContracts.ts` should be listed under
  the shared / parity contracts section. Will be added in the next
  documentation pass.

- **Manual QA rows are exercised "engine-room"**, not via a fresh
  on-device human click-through. A future agent run (or two — one for
  macOS, one for Windows) should validate the full §Manual QA Matrix
  end-to-end. The store/service contracts invariant would catch
  regressions during that pass.

- **Renderer migration for legacy single-object `metadata.generatedMedia`**:
  `coerceToChatMediaReferenceArray` lifts the legacy shape to
  `ChatMediaReference[]` on read. Users upgrading from versions before
  Phase 6 will see one transient read-time migration; the `mediaMigration.ts`
  path was audited but is **not** the canonical migration vector
  (Phase 6 widened the renderer-side helper to lift on demand).
  `mediaMigration.ts:78` was flagged in the Phase 6 plan but
  intentionally left untouched because the runtime coercers cover the
  legacy shape without losing data.

- **Main-process vault migration mirror**:
  `electron/services/conversationVault.ts` does not currently run its own
  legacy-row coercion on read because Electron storage uses the same
  canonical `ChatMediaReference[]` shape. If a future schema-breaking
  change is introduced, mirror the renderer-side coerce.

- **Audit export pipeline**: The audit log hash chain
  (`electron/agent/audit/document-agent-audit-service.ts`) is append-only
  with hash chain over metadata; raw document bodies / model arguments
  are not persisted (VERIFY-152). The audit metadata redacts API keys,
  bearer tokens, and absolute local paths (VERIFY-153). This is the
  durable audit boundary — no regressions observed.

## 21. Deferred Work

- **vo-phase-8 documentation closeout**: SQL status and Open TODO Ledger
  paragraph for Phase 8. Cosmetic, not a code risk.
- **`docs/DOCS_INDEX.md`** parity entry for the new
  `src/shared/chatMediaReferenceContracts.ts`. 1-line file pointer.
- **`docs/ROADMAP.md`** continues to be the canonical current-task
  ledger; this report is **historical evidence** and does not override
  it.
- **On-device manual QA click-through** for §Manual QA Matrix
  (electron on macOS + Windows). Deferred to a dedicated manual-test
  agent run, since the existing engine-room tests already exercise
  every contract.

## 22. Cross-References

- Work order spec: `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md`
- Live task ledger: `docs/ROADMAP.md`
- Canonical session handoff: `docs/summary_of_work.md`
- Documentation index: `docs/DOCS_INDEX.md`
- Recent baseline / checkpoint files:
  `/Users/super_user/.copilot/session-state/7068ce4a-b46d-4588-af53-eaa7e1e21cbf/{checkpoints,files}/`
- AGENTS.md mandate: *Mandatory Session Handoff* (§"Mandatory Session Handoff")
  — equivalent instructions are also present in
  `.github/copilot-instructions.md`, `CLAUDE.md`, `GEMINI.md`,
  `.cursorrules`, `.windsurfrules` so that the rule is observed
  regardless of which agent surface is in use. Enforced by
  `verify:agent-docs` contract.
