# Venice Forge Chat Folders, Agent Media, Documents, and Video — Implementation Checklist

**Work Order:** VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19  
**Created:** 2026-07-19  
**Repository:** /Users/super_user/Projects/Venice_Forge  
**Branch:** main  
**Base Commit:** [to be filled after initial commit]

---

## Phase 0 — Establish a Clean Baseline

### 0.1 Record repository state
- [x] `git status --short` recorded
- [x] `git branch --show-current` = main
- [x] `git rev-parse --show-toplevel` = /Users/super_user/Projects/Venice_Forge
- [x] `node --version` = v22.13.0 ✓ (matches engines.node >=22.13.0 <23.0.0)
- [x] `npm --version` = 10.9.2 ✓
- [x] Typecheck passes: `npm run typecheck` ✓
- [x] Lint passes: `npm run lint:eslint` ✓

### 0.2 Create tracked implementation checklist
- [x] This file created at `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md`

### 0.3 Replace corrupted folder handler module
- [x] **Inspected:** `electron/ipc/handlers/chatFolderHandlers.ts` — current version is clean (180 lines, each channel registered once). The corruption described in the work order appears to have been already addressed.
- [x] Verified `electron/ipc/handlers/common.ts` has duplicate-channel detection
- [x] Verified `electron/ipc/handlers/registration.test.ts` passes

### 0.4 Add IPC uniqueness guard
- [x] Already implemented in `common.ts:registerIpcChannel` with `registeredChannels Set`
- [x] Test exists and passes: `electron/ipc/handlers/registration.test.ts`

### 0.5 Verify existing tests before feature work
- [x] `npm run test:ci` run — 1 pre-existing failure in `tests/theme/meshSurfaceInvariant.test.ts` (DocumentAgentView.tsx hard border)
- [ ] Record any other pre-existing failures

---

## Phase 1 — Separate Standard-Chat and Character-Chat Folders

### 1.1 Use one service with mandatory folder domain
- [ ] `ChatFolderKind = "standard" | "character"` exists in `src/shared/chatFolderContracts.ts` ✓
- [ ] `ChatFolder.kind` field exists ✓
- [ ] Migration logic for legacy folders without kind
- [ ] Migration report written to redacted diagnostics

### 1.2 Derive and enforce conversation kind
- [ ] `getConversationKind(conversation)` helper exists in `chatFolderService.ts` ✓
- [ ] Move operations verify `folder.kind === getConversationKind(conversation)` ✓
- [ ] Cross-domain moves rejected in main process ✓

### 1.3 Separate UI surfaces
- [ ] HistoryView shows "Chats" and "Character Chats" as separate domains with Unfiled sections
- [ ] Standard Chat screen shows only standard folders
- [ ] Character Chat area shows only character folders
- [ ] Global History view shows both domains visually separated

### 1.4 Drag and drop
- [ ] Drag conversation into compatible folder works
- [ ] Drag conversation to "Unfiled" works
- [ ] Reorder folders within same domain works
- [ ] Cross-domain drops rejected with explicit toast
- [ ] Visible valid/invalid drop target indication
- [ ] Optimistic updates with rollback on IPC failure
- [ ] Persist through main process before reporting success
- [ ] Prevent moves while destination is locked
- [ ] Keyboard accessibility: "Move to folder" menu
- [ ] ARIA labels and move announcements

### 1.5 Create, rename, and delete
- [ ] Create: NFC normalization, trim, reject empty, enforce max code points (100), prevent duplicate names (case-folded)
- [ ] Rename: same validation, require unlocked folder, preserve stable ID
- [ ] Delete: explicit options (folder only / folder + chats / cancel), second confirmation with count for destructive option, tombstone/recovery conventions, profile isolation

### 1.6 Store/API shape
- [ ] Zustand store exposes all required operations:
  - [ ] `standardFolders`, `characterFolders` selectors
  - [ ] `load(kind?)`
  - [ ] `create(input)`
  - [ ] `rename(input)`
  - [ ] `reorder(input)`
  - [ ] `moveConversation(input)`
  - [ ] `delete(input)`
  - [ ] `getBackupPreview(input)`
  - [ ] `exportBackup(input)`
  - [ ] `previewImport(input)`
  - [ ] `importBackup(input)`
  - [ ] `lock(input)`
  - [ ] `unlock(input)`
  - [ ] `getLockState(folderId)`
- [ ] Unused IPC APIs removed from preload/types

---

## Phase 2 — Folder Backup, Import, and Locking

### 2.1 Reuse existing encrypted backup stack
- [ ] Extend `.vfbackup` format with `scope: "chat-folder"`
- [ ] Use Argon2id/XChaCha20-Poly1305 path
- [ ] Maintain backward-compatible decrypt where needed

### 2.2 Backup preview
- [ ] Shows folder name/type, chat count, message count, attachment refs, media blobs (count + bytes), media inclusion flag, excluded secrets, estimated encrypted size

### 2.3 Backup contents
- [ ] Includes: folder record, conversations, messages, safe metadata, character metadata, attachment refs, optional media blobs
- [ ] Excludes by default: API keys, keychain values, raw diagnostics, browser caches, absolute paths, signed URLs, temp files, folder unlock secrets
- [ ] Portable paths converted to safe relative / content-addressed refs

### 2.4 Import preview and modes
- [ ] Preview shows: new folders, new conversations, changed, conflicts, tombstones, missing/included blobs, source app version, source profile, folder kind, backup time, schema migrations
- [ ] Modes: Import as new folder / Merge into compatible folder / Cancel
- [ ] Cross-kind merge rejected
- [ ] Conflicts preserve both copies unless deterministic merge proven safe
- [ ] Never silently discard messages

### 2.5 Lock semantics
- [ ] Locked folder requires unlock secret for: listing titles/previews/messages, exporting, moving chats in/out, renaming, deleting
- [ ] Lock state: profile-local, session-aware
- [ ] Lockout/backoff after failed attempts
- [ ] Auto-re-engage on restart and optionally after inactivity
- [ ] UI clearly states: access-control/privacy gate vs per-folder encryption

### 2.6 Password/key design
- [ ] Random 32-byte folder key generated
- [ ] Argon2id + random salt → KEK
- [ ] XChaCha20-Poly1305 wraps folder key with random nonce
- [ ] Store only: salt, KDF params, nonce, wrapped key, key ID, verifier metadata
- [ ] Unwrapped key in main-process memory only while unlocked
- [ ] Zero buffers best-effort, documented JS limitations
- [ ] "Remember on this device": store only wrapped unlock key in OS secure storage under strict credential class
- [ ] If conversation vault provides at-rest encryption, reuse it; otherwise label as privacy lock

### 2.7 Lock IPC contracts
- [ ] `LockFolderInput` { folderId, passphrase, rememberOnDevice? }
- [ ] `UnlockFolderInput` { folderId, passphrase?, useRememberedUnlock? }
- [ ] `FolderLockState` { folderId, locked, rememberedUnlockAvailable, failedAttempts, retryAfter? }
- [ ] Passphrases cross IPC only for invocation duration, never logged/persisted/inserted into tool results/sent to Venice

---

## Phase 3 — Trusted Immutable Tool Runtime and Date/Time Awareness

### 3.1 Move trusted request composition to main process
- [ ] Create `electron/agent/runtime/trusted-agent-request.ts`
- [ ] Create `src/shared/agentRuntimeContracts.ts`
- [ ] Renderer provides: messages, user system prompt, character identity, agent preset, model, intent
- [ ] Main process constructs: trusted datetime/timezone, tool env summary, authorized tool list, tool-use rules, layer ordering, provider-safe request body

### 3.2 Required layer order
- [ ] 1. Immutable Venice Forge tool-runtime layer
- [ ] 2. Character system layer or user-created app/chat system layer
- [ ] 3. Approved injected context/memory
- [ ] 4. Conversation messages
- [ ] 5. Tool results from current run
- [ ] Hosted-character API uses `character_slug` — preserve contract
- [ ] Trusted runtime layer doesn't overwrite character prompt, and vice versa

### 3.3 Keep immutable layer short
- [ ] Compact runtime layer template with version
- [ ] Placeholders replaced at request time with trusted main-process values:
  - Local ISO-8601 datetime with offset
  - IANA timezone
  - Optional UTC timestamp for logs

### 3.4 Template compatibility
- [ ] Support `{{time && date}}` placeholder
- [ ] Support `{{current_datetime}}` and `{{timezone}}` if documented
- [ ] Runtime composer (not LLM) performs replacement

### 3.5 Immutability requirements
- [ ] Generated after IPC validation
- [ ] Always first, exactly once
- [ ] Not in user prompt editors
- [ ] Imports cannot replace
- [ ] Character cards cannot replace
- [ ] Tool results cannot instruct removal
- [ ] User may disable optional tools but not minimal runtime integrity layer
- [ ] Layer version explicit for migration/tests

### 3.6 Tool knowledge matches actual availability
- [ ] Prompt describes general rules only; provider `tools` array is canonical
- [ ] Before adding tool schema, verify: model supports function calling, implementation exists, grant authorizes, context exists, safe-mode allows
- [ ] If no tool support: don't attach tools, don't tell model it has tools, show UI notice, offer compatible model, preserve selection unless auto-fallback enabled

### 3.7 Tests
- [ ] Trusted layer is index 0
- [ ] Inserted once
- [ ] User prompts cannot remove/precede
- [ ] Empty user prompts still receive it
- [ ] Hosted/local character requests preserve character behavior
- [ ] Clock/timezone injectable for deterministic tests
- [ ] String not persisted as visible message
- [ ] Tool descriptions don't mention unavailable tools
- [ ] Non-tool-capable models receive no tool schema

---

## Phase 4 — User-Created System Prompt Limits

### 4.1 Product policy
- [ ] `USER_SYSTEM_PROMPT_LIMITS`: warning 8,000, maximum 12,000, large-context override 16,000

### 4.2 Dynamic defensive limit
- [ ] `getUserSystemPromptLimit(availableContextTokens)` using 10% of context × 4 chars/token, clamped 4,000–12,000
- [ ] 16,000 override requires: eligible large-context model, explicit user action, clear warning, request-boundary validation, no effect on smaller models

### 4.3 Unicode counting
- [ ] `countPromptCharacters(value)` using `Array.from(value.normalize("NFC")).length`
- [ ] `validateUserSystemPrompt(value, maximumCharacters)` returns { characterCount, warning, valid, maximumCharacters }
- [ ] No UTF-16 `.length` for display/enforcement

### 4.4 Enforce at every entry point
- [ ] Default system prompt settings
- [ ] Per-chat system prompt editor
- [ ] Character/local prompt compilation
- [ ] Prompt-library "apply as system prompt"
- [ ] Imports and migrations
- [ ] Zustand/store setters
- [ ] Request compiler
- [ ] Main-process trusted request boundary

### 4.5 UX
- [ ] Display: "7,942 / 12,000 characters"
- [ ] At 8,000: non-blocking warning explaining space reduction
- [ ] Above 12,000: prevent save/send/apply, preserve text locally, no silent truncation, "shorten prompt" action only if no hidden content sent
- [ ] Existing over-limit prompts: load intact, mark invalid, prevent new requests until edited/exported, no silent truncation migration

---

## Phase 5 — Media Generation Inside Standard and Character Chats

### 5.1 Replace placeholder with real media-tool broker
- [ ] Refactor `electron/agent/runtime/document-tool-executor.ts` → `electron/agent/runtime/agent-tool-executor.ts`
- [ ] Dispatch by domain: `document.*`, `workspace.*`, `media.*`
- [ ] Each domain has own module and tests

### 5.2 Initial tools
- [ ] `media.generateImage` (first)
- [ ] `media.generateVideo` (same durability/approval guarantees)
- [ ] `media.generateAudio` (same durability/approval guarantees)
- [ ] No exposed unimplemented video/audio tools during staged rollout

### 5.3 Tool intent schema
- [ ] `GenerateImageToolInput`: prompt, negativePrompt?, purpose?, preferredQuality?, desiredAspectRatio?, desiredResolution?, outputFormat?, sourceMediaIds?, attachToMessage?, saveToGallery?
- [ ] `ResolvedMediaGenerationPlan`: toolCallId, mediaType, modelId, endpoint, validatedRequest, estimatedCost?, requiresApproval, capabilityEvidence[]

### 5.4 Capability-grounded model prioritization
- [ ] Deterministic planner using: live model catalog, local Swagger, user quality/speed/cost settings, requested operation, required capabilities, safe-mode/privacy, model availability
- [ ] Selection precedence: explicit valid user model → per-chat/char preference → app default → best compatible by policy
- [ ] No compatible model → structured failure, no invented model ID, no malformed paid request

### 5.5 Non-vision chat models supported
- [ ] Text-to-media tool calls work with non-vision models (main process does provider call)
- [ ] Source image ops: pass stable app-managed attachment/media ID, resolve bytes in main process
- [ ] No arbitrary renderer file paths sent

### 5.6 Spend/approval policy
- [ ] Display: resolved model, operation, key params, estimated cost
- [ ] Auto-approve: explicit request in current message + configured spend threshold
- [ ] Require confirmation: high-cost, ambiguous, model changes, multi-variant, source-media transforms
- [ ] Persist approvals by tool call ID (not prompt text)
- [ ] Prompt-injected content cannot approve paid generation

### 5.7 Tool execution result
- [ ] `MediaToolResult`: ok, mediaId, mediaType, modelId, operation, width?, height?, durationSeconds?, mimeType, gallerySaved, chatAttached
- [ ] No base64, raw binary, absolute paths, signed URLs, secrets

### 5.8 Tool loop correctness
- [ ] `chat-agent-runner.ts` uses agent-wide executor
- [ ] Tool args: size-limited + schema-validated
- [ ] Tool errors redacted before returning to model
- [ ] No fake empty assistant message corrupting ordering
- [ ] Max iterations → clear terminal result
- [ ] Abort/cancel propagates to active media jobs
- [ ] One tool call executes once across retries

---

## Phase 6 — Gallery Ownership and Chat Reference Semantics

### 6.1 Gallery owns durable media
- [ ] Generated media persisted through existing generated-media + Media Studio infra
- [ ] Gallery/media record owns: content-addressed blob, metadata, model/op/recipe, generation time, MIME/dimensions/duration, cost metadata, lineage

### 6.2 Structured chat media reference
- [ ] `ChatMediaReference`: id, mediaId, mediaType, operation, displayUrl, thumbnailUrl?, altText?, modelId?, createdAt, deletedFromChatAt?
- [ ] `ConversationMessage.metadata.generatedMedia?: ChatMediaReference[]`
- [ ] Request compiler strips app-only media metadata before provider submission (unless deliberately converted to supported content part)

### 6.3 Save sequence
- [ ] 1. Persist generated blob atomically
- [ ] 2. Create/upsert Media Studio record
- [ ] 3. Create chat media reference
- [ ] 4. Persist conversation message
- [ ] 5. Mark tool call complete
- [ ] If 3/4 fails after gallery save: keep asset, surface "generated but not attached", provide attach action
- [ ] Never auto-delete generated asset

### 6.4 Delete from chat without deleting gallery
- [ ] Action labeled "Remove from chat"
- [ ] Removes/tombstones only `ChatMediaReference`
- [ ] Leaves Media Studio record + blob intact
- [ ] Preserves audit-safe relationship for undo
- [ ] Undo offered during normal toast window
- [ ] Separate "Delete from Media Studio" action checks cross-references (chats, projects, character cards, workflows, documents)

### 6.5 Character chat display
- [ ] Same safe media components as standard chat
- [ ] Preserves character identity + message ordering
- [ ] Never auto-becomes character avatar
- [ ] Explicit "Set as character image" for local characters (approval + persistence)
- [ ] Never mutate hosted provider character record

### 6.6 Tests
- [ ] Non-vision model invokes text-to-image
- [ ] Tool-capable vs non-tool-capable model behavior
- [ ] Invalid invented model ID rejected by planner
- [ ] Model fallback selection
- [ ] Spend approval
- [ ] Successful gallery save + chat attach
- [ ] Gallery save success / chat attach failure recovery
- [ ] Remove from chat preserves gallery
- [ ] Gallery delete warns when referenced
- [ ] Character chat generation
- [ ] App-only media metadata stripped from provider requests
- [ ] Tool result contains no base64/path/secret/signed URL

---

## Phase 7 — Rebuild Documents as an Agent Workspace

### 7.1 Product structure
- [ ] Three-pane layout: Workspace/Files | Agent Chat | Preview/Changes
- [ ] Narrow windows: tabs or resizable stack without clipping composer/approvals
- [ ] Workspace selector, folder tree, search, managed vault
- [ ] Tool-capable model selector, conversation, composer+attachments, tool activity
- [ ] File preview, diff/changeset, approval actions, revisions/export

### 7.2 Agent-only operation
- [ ] Block execution if selected model lacks tools
- [ ] Explain why, offer compatible models
- [ ] No silent plain-text file editing
- [ ] Manual view still allowed

### 7.3 Workspace grant
- [ ] Main-process folder picker creates profile/session-bound grant
- [ ] Display only safe logical workspace ID to renderer/model
- [ ] Never expose absolute root (unless security design requires redacted display name)
- [ ] Reject symlink escape
- [ ] Restrict extensions, bytes, file counts, operations
- [ ] Revoke on app/session termination (unless safe reauthorization design)
- [ ] Fix session/grant identity mismatch — canonical session ID used by IPC grant creation and runtime tool execution
- [ ] Model never provides/invents `grantId`; runtime resolves active grant from trusted session state or injects opaque handle

### 7.4 Complete tool contracts before exposure
- [ ] Audit every tool in `src/agent/registry/tool-registry.ts`
- [ ] Matrix per tool: internal name, provider schema, capability, executor impl, main-process service, approval req, result schema, test file, UI consumer
- [ ] No tool exposed until every column complete
- [ ] Minimum implement and align:
  - [ ] `document.get`, `document.create`, `document.proposeEdits`, `document.applyApprovedEdits`, `document.export`, `document.getRevision`, `document.restoreRevision`, `document.promoteAttachment`
  - [ ] `workspace.list`, `workspace.read`, `workspace.search`, `workspace.createFile`, `workspace.createDirectory`, `workspace.proposeChangeset`, `workspace.move`, `workspace.trash`

### 7.5 Real file tree
- [ ] Root folder, nested folders, supported documents, type, size, modified, read-only/unsupported indicator, search results, pending changes
- [ ] Paginated/lazy directory reads
- [ ] Hidden files excluded unless explicitly permitted
- [ ] Never expose `.git`, key files, app databases, logs, credential stores, ignored secret patterns by default

### 7.6 File-preserving edit model
- [ ] Markdown/TXT/JSON/HTML/CSV: parse, validate, edit, write same type
- [ ] DOCX: parse structured blocks, edit, serialize back to DOCX
- [ ] PDF: generated format; edit structured source when available, or rebuild/export new PDF with fidelity warning — no arbitrary lossless in-place editing claim
- [ ] JSON/CSV: validate syntax/shape before approval, preserve line endings/encoding, avoid destructive reformatting unless requested
- [ ] HTML: sanitize preview, no script execution
- [ ] DOCX/PDF: binary ops in main, revision metadata + safety backup, test opens in external reader

### 7.7 Changeset workflow
- [ ] Read file revision/hash → propose structured changeset → render diff/preview → check external modification → user approve/reject → write temp → validate output → atomic replace → record revision + tool result → refresh tree/preview
- [ ] Base hash changed → reject with conflict, offer re-read/rebase
- [ ] Never overwrite silently

### 7.8 Managed Documents
- [ ] Distinct UI naming: "Managed Vault" vs "Workspace Files"
- [ ] Every managed doc supports: open, agent edit proposal, revision history, restore, export actual format, rename/move if supported, delete/trash with confirmation

### 7.9 Documents chat behavior
- [ ] Shows: tool calls + statuses, files read, proposed changes, approval required, applied revisions, safe errors
- [ ] Attachments/workspace files as file sources (name, type, size, ID, expandable preview) — no full paste by default

### 7.10 Tests
- [ ] Tool registry/executor schema parity
- [ ] No exposed unimplemented tool
- [ ] Tool-capable-model gate
- [ ] Workspace grant/session binding
- [ ] Path traversal + symlink escape rejection
- [ ] Hidden/secret file exclusion
- [ ] Workspace tree pagination
- [ ] Read/search/list
- [ ] Create file/directory
- [ ] Propose/apply approved changeset
- [ ] External-modification conflict
- [ ] Move/trash
- [ ] Same-format saves (Markdown/TXT/JSON/CSV/HTML)
- [ ] DOCX round trip
- [ ] PDF rebuild/export + warning
- [ ] No direct renderer filesystem access
- [ ] Tool results redact absolute paths + secrets

---

## Phase 8 — Repair Generated Video Playback

### 8.1 Managed media-player component
- [ ] `src/components/media/ManagedVideoPlayer.tsx` reusable
- [ ] Used in: Video generation output, Media Studio detail, Gallery cards/dialogs, Chat media attachments
- [ ] Behavior: key={mediaId??src}, ref, preload="metadata", playsInline, controlsList="nodownload" (or documented choice), loadedmetadata/canplay/waiting/stalled/suspend/error handlers
- [ ] App-level error/retry state without replacing native controls

### 8.2 Verify pointer events and overlays
- [ ] No transparent element covers `<video>` controls
- [ ] No parent `pointer-events: none` or click capture
- [ ] Border/gradient layers behind video
- [ ] Non-zero rendered height
- [ ] Fullscreen not blocked by sandbox/window permissions

### 8.3 Verify custom-protocol byte-range behavior
- [ ] Integration tests against `venice-media://`:
  - [ ] GET no Range → 200, Content-Type video/mp4, Content-Length
  - [ ] GET Range bytes=0-1 → 206, Content-Range, Content-Length, Accept-Ranges: bytes
  - [ ] GET suffix/tail range → 206
  - [ ] Invalid range → 416
  - [ ] Origin/referrer allowed for packaged renderer
  - [ ] Foreign explicit origin → 403
- [ ] If Electron `net.fetch(file://...)` unreliable, implement explicit range parsing/streaming in protocol handler
- [ ] Support HEAD if Chromium issues it

### 8.4 Validate completed MP4 files
- [ ] Non-zero size, ftyp signature, expected MIME
- [ ] Final file size matches persisted metadata
- [ ] Parse enough MP4 boxes to verify valid `moov` box
- [ ] Reject incomplete/truncated output
- [ ] Keep failed bytes quarantined or remove safely
- [ ] If Venice places moov at end, range support must allow metadata loading + seeking

### 8.5 Force correct source lifecycle
- [ ] Durable `venice-media://<sha256>` URL, not expired remote URL
- [ ] Change media element key when media ID changes
- [ ] `load()` only when source transition requires
- [ ] No stale object URL reuse after revocation
- [ ] Task not complete until durable storage commit succeeds

### 8.6 Diagnostics
- [ ] Capture: mediaId, URL scheme only, readyState, networkState, duration, videoWidth/Height, MediaError.code, HTTP/protocol status, Content-Type, Content-Length, Content-Range
- [ ] Never log: signed URLs, absolute paths, API keys, video bytes

### 8.7 Native-control QA
- [ ] Packaged Electron QA on macOS + Windows:
  - [ ] Play/pause
  - [ ] Scrub/seek
  - [ ] Volume/mute
  - [ ] Fullscreen enter/exit
  - [ ] Native controls menu
  - [ ] Replay after ending
  - [ ] Switch tabs + return
  - [ ] Restart app + replay saved
  - [ ] Play from Video Studio, Media Studio, chat attachment

---

## Phase 9 — Developer-Portal Error Intake and Remediation

### 9.1 Collect evidence
- [ ] Exact screenshot
- [ ] Error text from DevTools
- [ ] Timestamp, route/endpoint, HTTP status
- [ ] Sanitized request field names
- [ ] Provider request ID
- [ ] Stack trace
- [ ] Environment: dev / packaged / both
- [ ] Reproduction steps

### 9.2 Use existing diagnostics
- [ ] Add redacted "Copy diagnostic bundle" action excluding: API keys, prompts (unless user opts in), attachment contents, base64, signed URLs, absolute local paths

### 9.3 Classify each error
- [ ] API contract / IPC contract / renderer exception / main-process exception / custom protocol / persistence / permission/grant / model capability / network/DNS/CORS / user validation

### 9.4 For each error: evidence before remediation
- [ ] Observed message
- [ ] Source file/symbol
- [ ] Reproduction
- [ ] Root cause
- [ ] Fix
- [ ] Regression test

---

## Shared Type and IPC Contract Requirements

- [ ] Zod/TypeScript schemas for all new IPC payloads (no independent handwritten shapes)
- [ ] Minimum coverage:
  - [ ] ChatFolder
  - [ ] Folder backup preview/export/import
  - [ ] Folder lock/unlock/state
  - [ ] Agent run context
  - [ ] Trusted runtime metadata
  - [ ] Media generation intent/plan/result
  - [ ] ChatMediaReference
  - [ ] Workspace grant summary
  - [ ] Workspace tree entry
  - [ ] Document changeset
  - [ ] Video player diagnostics
- [ ] Preload: only serialized, renderer-safe values (no Node buffers, file handles, paths, keys, credentials)
- [ ] Contract parity tests comparing: shared schema, preload method, handler input, service input, returned public view

---

## Required Tests

### Folder tests
- [ ] Handler registration uniqueness
- [ ] Legacy migration → standard/character domains
- [ ] Mixed-folder split migration
- [ ] Create/rename validation with Unicode NFC
- [ ] Cross-domain move rejection
- [ ] Drag/drop rollback on IPC failure
- [ ] Delete folder only
- [ ] Delete folder + chats with tombstones
- [ ] Profile isolation
- [ ] Locked-folder operation rejection
- [ ] Unlock backoff
- [ ] No raw password persistence
- [ ] Backup preview accuracy
- [ ] Encrypted backup round trip
- [ ] Wrong passphrase rejection
- [ ] Tampered backup rejection
- [ ] Import conflict preservation
- [ ] Optional media inclusion

### Runtime/system prompt tests
- [ ] Trusted layer first and exactly once
- [ ] Date/time/timezone replacement
- [ ] Renderer cannot supply/replace trusted layer
- [ ] Character prompt preserved
- [ ] User system prompt warning at 8,000 code points
- [ ] Hard rejection above 12,000 code points
- [ ] Emoji/non-Latin count by Unicode code point after NFC
- [ ] Main-process enforcement even when UI bypassed
- [ ] No silent truncation

### Agent/media tests
- [ ] Registry/executor parity
- [ ] No unimplemented tools exposed
- [ ] Model tool-capability filtering
- [ ] Deterministic media-model planning
- [ ] Invalid model ID rejection
- [ ] Paid operation approval
- [ ] Non-vision chat model generates media through tool
- [ ] Durable media save before chat reference
- [ ] Remove from chat preserves gallery
- [ ] Gallery deletion reference warning
- [ ] Tool result redaction
- [ ] Tool-call idempotency
- [ ] Abort/cancel behavior

### Documents tests
- [ ] Workspace grant/session alignment
- [ ] Tool schema/executor parity
- [ ] Workspace tree pagination
- [ ] Path containment + symlink escape rejection
- [ ] Hidden/secret exclusion
- [ ] Same-format saves
- [ ] Approval required where configured
- [ ] Base-revision conflict
- [ ] Atomic write + rollback
- [ ] DOCX/PDF output validation
- [ ] Renderer cannot perform direct filesystem operations

### Video tests
- [ ] Durable media URL used after retrieval
- [ ] Full custom-protocol response
- [ ] Byte ranges
- [ ] Invalid ranges
- [ ] CORS/origin decisions
- [ ] Valid MP4 box validation
- [ ] Stale-source replacement
- [ ] Player error/retry UI
- [ ] Media Studio and chat player reuse

### Security tests
- [ ] No API keys/passwords in logs
- [ ] No absolute paths in model tool results
- [ ] No base64 media in persisted conversations
- [ ] No renderer access to encryption keys
- [ ] Invalid IPC payload rejection
- [ ] Profile mismatch rejection
- [ ] Tool call denied without active grant
- [ ] Prompt-injected file content cannot grant permission or approve paid action

---

## Validation Commands

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run verify:workspace-contracts`
- [ ] `npm run verify:backup-sync`
- [ ] `npm run verify:document-ingestion`
- [ ] `npm run verify:document-agent`
- [ ] `npm run verify:media-studio-power-tools`
- [ ] `npm run verify:provider-adapters`
- [ ] `npm run verify:network-boundaries`
- [ ] `npm run verify:custom-protocol-privileges`
- [ ] `npm run verify:venice-api-docs`
- [ ] `npm run verify:image-policy`
- [ ] `npm run verify:contracts`
- [ ] `npm run test:ci`
- [ ] Focused test files before full suites

---

## Manual QA Matrix

### Standard chat folders
- [ ] Create standard-chat folder
- [ ] Rename it
- [ ] Drag standard chat into it
- [ ] Move chat to Unfiled (drag + keyboard menu)
- [ ] Reject character chat dropped into it
- [ ] Reorder standard folders
- [ ] Delete folder only → preserve chats
- [ ] Delete folder + contained chats → explicit confirmation

### Character chat folders
- [ ] Create character-chat folder
- [ ] Rename it
- [ ] Drag hosted + local character chats into it
- [ ] Reject standard chat dropped into it
- [ ] Verify character avatar/identity intact after move
- [ ] Reorder character folders

### Backup and lock
- [ ] Preview folder backup
- [ ] Export encrypted backup without media
- [ ] Export encrypted backup with media
- [ ] Import as new folder
- [ ] Merge into compatible folder
- [ ] Reject wrong passphrase
- [ ] Reject tampered backup
- [ ] Lock folder
- [ ] Confirm titles/messages/previews unavailable while locked
- [ ] Unlock with correct passphrase
- [ ] Verify backoff after failed attempts
- [ ] Restart app → confirm auto-lock

### System prompt/runtime
- [ ] Current date/time/timezone correct
- [ ] Runtime layer not visible/editable
- [ ] User prompt cannot remove it
- [ ] Character prompt remains active
- [ ] 8,000-character warning
- [ ] 12,000-character hard maximum
- [ ] Emoji counted once per Unicode code point

### Media tools
- [ ] Generate image from standard chat (non-vision tool-capable model)
- [ ] Generate image from character chat
- [ ] Main-process planner chooses valid model/spec
- [ ] Paid-operation approval behavior
- [ ] Result appears in chat + Media Studio
- [ ] Remove from chat → remains in Media Studio
- [ ] Gallery delete while referenced → warning
- [ ] Cancel active generation
- [ ] Restart → durable result remains available

### Documents
- [ ] Select workspace
- [ ] Browse complete bounded folder tree
- [ ] Search files
- [ ] Ask agent to read file
- [ ] Ask agent to create each supported text format
- [ ] Ask agent to edit + save same format
- [ ] Review diff + approve
- [ ] Reject proposal → no write
- [ ] Trigger external-modification conflict
- [ ] Revoke workspace access → tool denial
- [ ] DOCX output opens
- [ ] PDF output opens + fidelity warning accurate

### Video
- [ ] Generate/retrieve video
- [ ] Play/pause
- [ ] Adjust volume/mute
- [ ] Seek
- [ ] Enter/exit fullscreen
- [ ] Open native player menu
- [ ] Switch tabs + return
- [ ] Play from Media Studio
- [ ] Play from chat attachment
- [ ] Restart app + play again

---

## Acceptance Criteria

### Folder acceptance
1. [ ] Standard chats and character chats have separate folder domains
2. [ ] Cross-domain folder moves rejected in renderer and main process
3. [ ] Drag/drop and keyboard movement both work
4. [ ] Create, rename, reorder, delete-folder-only, delete-with-content work
5. [ ] Each folder IPC channel registered exactly once
6. [ ] No backup/import handler returns placeholder data or placeholder success
7. [ ] Folder backups encrypted and previewed before export/import
8. [ ] Import preserves conflicts, never silently drops messages
9. [ ] Folder passwords never stored raw
10. [ ] Locked folders enforce documented access behavior after restart

### Runtime/system prompt acceptance
11. [ ] Trusted tool-runtime layer generated in main process
12. [ ] Always first system layer, occurs once
13. [ ] Includes trusted current date/time and timezone
14. [ ] Cannot be edited/removed/replaced by user prompts, character cards, imports, renderer payloads
15. [ ] User-created system prompts warn at 8,000 Unicode code points
16. [ ] User-created system prompts rejected above 12,000 Unicode code points by UI, store/compiler, main-process boundary
17. [ ] No prompt silently truncated

### Media acceptance
18. [ ] No media tool exposed unless implemented, authorized, supported by selected model
19. [ ] Deterministic planner selects valid model/parameters from current capabilities
20. [ ] Non-vision chat model can request text-to-media through tools
21. [ ] Generated media saved durably before tool success reported
22. [ ] Generated media appears in Media Studio and originating chat
23. [ ] Removing media from chat does not delete from Media Studio
24. [ ] Tool results contain no base64, absolute paths, credentials, signed URLs
25. [ ] Paid media operations obey configured approval/spend policy

### Documents acceptance
26. [ ] Documents provides agent chat, workspace tree, preview/diff, approvals, revision/activity state
27. [ ] Only tool-capable models can run document agents
28. [ ] Every exposed document/workspace tool has matching executor and test
29. [ ] Workspace grants profile/session bound, cannot escape approved root
30. [ ] Supported files written as intended file types, not pasted inline
31. [ ] Writes atomic and conflict-checked
32. [ ] DOCX and PDF behavior accurately described and validated
33. [ ] Renderer never gains direct filesystem access

### Video acceptance
34. [ ] Retrieved videos use durable `venice-media://` sources
35. [ ] Custom protocol passes full and byte-range integration tests
36. [ ] Incomplete MP4 files rejected before playback
37. [ ] Play, pause, volume, seek, fullscreen, native controls work in packaged Electron
38. [ ] Saved videos remain playable after app restart

### Quality/security acceptance
39. [ ] Typecheck, lint, build, relevant verifiers, focused tests, `test:ci` pass (or pre-existing failures documented with evidence)
40. [ ] No Electron security boundary weakened
41. [ ] Logs/diagnostics redact secrets, absolute paths, signed URLs, media payloads
42. [ ] Final implementation report lists every changed file, test, command, result, migration, remaining risk

---

## Final Implementation Report

**To be created at:** `docs/reports/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_REPORT_2026-07-19.md`

Structure:
- Repository State
- Baseline Findings
- Chat Folder Handler Recovery
- Standard and Character Folder Separation
- Folder Backup and Locking
- Trusted Tool Runtime and Date/Time Layer
- User System Prompt Limit
- Media Tool Broker
- Gallery and Chat Reference Model
- Documents Agent Redesign
- Video Playback Repair
- Developer-Portal Errors
- Data Migrations
- IPC and Security Review
- Files Changed
- Tests Added or Updated
- Commands Executed
- Validation Results
- Manual QA Results
- Remaining Risks
- Deferred Work

For every root cause:
- File path
- Symbol or line range
- Observed behavior
- Required contract
- Implemented correction
- Test proving correction

---

## Strict Agent Checklist (from work order)

### Baseline
- [x] Record Git, Node, npm, package state
- [x] Create tracked work-order checklist
- [x] Replace duplicated/malformed `chatFolderHandlers.ts` — **already clean**
- [x] Add duplicate IPC registration detection — **already exists**
- [x] Record pre-existing test/build failures — **1: meshSurfaceInvariant (DocumentAgentView.tsx)**

### Folder data model
- [x] Add `ChatFolderKind` with `standard` and `character` — **done**
- [x] Add profile-bound kind to every folder record — **done**
- [ ] Add deterministic migration for legacy folders
- [ ] Split mixed legacy folders without losing conversations
- [x] Enforce conversation/folder kind compatibility in main process — **done in chatFolderService.ts**
- [x] Add separate standard and character folder UI projections — **HistoryView filters by kind**

### Folder operations
- [ ] Implement accessible drag/drop and keyboard move
- [ ] Implement create, rename, reorder, Unfiled movement
- [ ] Implement delete-folder-only
- [ ] Implement delete-folder-and-content with second confirmation
- [ ] Add optimistic rollback and explicit errors

### Backup and lock
- [ ] Reuse existing encrypted `.vfbackup` stack
- [ ] Implement accurate folder backup preview
- [ ] Implement encrypted folder export
- [ ] Implement import preview and conflict preservation
- [ ] Implement optional media-blob inclusion
- [ ] Remove all placeholder backup/import responses
- [ ] Replace raw password storage with KDF/wrapped-key design
- [ ] Implement lock/unlock/backoff/auto-lock
- [ ] Align shared types, preload, handler, and service contracts

### Trusted runtime
- [ ] Move runtime-layer composition to Electron main
- [ ] Add trusted current date/time/timezone replacement
- [ ] Make tool-runtime layer first and immutable
- [ ] Ensure appears once, not persisted visibly
- [ ] Preserve hosted and local character prompt behavior
- [ ] Filter tool schemas by model capability and grant

### System prompt limits
- [ ] Add Unicode NFC code-point counting
- [ ] Add warning at 8,000 characters
- [ ] Add hard maximum at 12,000 characters
- [ ] Enforce in every editor, store, import, compiler, main boundary
- [ ] Preserve over-limit legacy text without silent truncation

### Media tools
- [ ] Refactor document-only executor into agent-wide executor
- [ ] Implement media planning and execution services
- [ ] Implement only tools that are exposed
- [ ] Resolve model/specification from current capabilities
- [ ] Add cost/approval policy
- [ ] Persist media durably before reporting success
- [ ] Return compact safe tool results
- [ ] Add idempotency and cancellation

### Chat/gallery media model
- [ ] Add `ChatMediaReference` metadata
- [ ] Strip internal metadata from provider requests
- [ ] Attach generation results to originating chat
- [ ] Save same result in Media Studio
- [ ] Implement "Remove from chat" without gallery deletion
- [ ] Warn before deleting referenced gallery media
- [ ] Reuse safe media renderers in standard and character chats

### Documents
- [ ] Replace primary single-paragraph UI with workspace tree + agent chat + preview/changes
- [ ] Gate execution to tool-capable models
- [ ] Fix workspace grant/session identity
- [ ] Align every provider schema with executor arguments
- [ ] Implement every exposed document/workspace tool
- [ ] Add atomic, revision-checked writes
- [ ] Preserve output file type
- [ ] Add explicit DOCX/PDF behavior and validation
- [ ] Keep renderer filesystem-free

### Video
- [ ] Create reusable managed video player
- [ ] Add playback lifecycle diagnostics
- [ ] Verify no overlay captures player controls
- [ ] Add full and range custom-protocol tests
- [ ] Implement explicit range handling if Electron `net.fetch` insufficient
- [ ] Validate MP4 structure beyond `ftyp`
- [ ] Use durable source and correct element lifecycle
- [ ] Complete packaged native-control QA

### Developer portal
- [ ] Obtain missing screenshot or sanitized error export
- [ ] Classify each exact error with evidence
- [ ] Add regression test for every confirmed root cause
- [ ] Do not implement speculative fixes

### Validation and release
- [ ] Run focused tests
- [ ] Run typecheck and lint
- [ ] Run build
- [ ] Run workspace, backup, document-agent, media, provider, network, protocol, API-doc, image-policy, contract verifiers
- [ ] Run `test:ci`
- [ ] Complete manual QA matrix
- [ ] Write final implementation report with evidence