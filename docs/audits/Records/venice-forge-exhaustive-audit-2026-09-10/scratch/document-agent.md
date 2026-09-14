# Document Agent Audit — 2026-09-10

**ID prefix:** `VF-AUD-20260910-DOC-NNN`  
**Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`  
**Branch:** `main`  
**Package:** `venice-forge@3.0.0-beta.3`  
**Method:** static review of current sources and tests (no historical audit copied; no test/build commands executed)  
**Scope:** `electron/agent/**`, `src/agent/**`, `electron/ipc/handlers/documentAgentHandlers.ts`, plus the renderer/preload/bridge surfaces those contracts actually reach (`electron/preload.ts` `documentAgent`, `src/services/desktopBridge.ts` `desktopDocumentAgent`, `src/stores/document-agent-store.ts`, `src/stores/chat-stream-manager.ts`, `src/components/documents/DocumentAgentView.tsx`, `src/services/attachmentService.ts`, `electron/ipc/handlers/veniceHandlers.ts`)

---

## Tool / executor parity table

Canonical advertised tools are `createCanonicalToolDefinitions()` in `src/agent/registry/tool-registry.ts` (16 entries) mapped by `src/agent/registry/tool-name-map.ts`. Execution is the `switch (internalName)` in `electron/agent/runtime/agent-tool-executor.ts`. The contracts test `electron/agent/runtime/document-agent-contracts.test.ts` only asserts that no model-callable tool hits the `"not supported yet"` default; it does not prove schema validation, session binding, or UI approval consumption.

| # | Internal name | Provider name | Capability | Registry approval | Executor path | Executor present? |
|---|---|---|---|---|---|---|
| 1 | `document.get` | `document_get` | `document:read` | never | immediate `documents.read` | yes |
| 2 | `document.proposeEdits` | `document_propose_edits` | `document:propose-update` | always | `approvals.prepare` (`document_edit`) | yes |
| 3 | `document.create` | `document_create` | `document:create` | never | immediate `documents.create` | yes |
| 4 | `document.export` | `document_export` | `document:export` | always | `approvals.prepare` (`document_export`) | yes |
| 5 | `document.getRevision` | `document_get_revision` | `document:read-revision` | never | immediate `documents.read` | yes |
| 6 | `document.restoreRevision` | `document_restore_revision` | `document:restore-revision` | always | `approvals.prepare` (`document_restore`) | yes |
| 7 | `document.promoteAttachment` | `document_promote_attachment` | `attachment:promote` | never | immediate `attachments.promote` | yes (session-broken: DOC-002) |
| 8 | `workspace.list` | `workspace_list` | `workspace:list` | never | `workspaceFiles.list` | yes |
| 9 | `workspace.read` | `workspace_read` | `workspace:read` | never | `workspaceFiles.readText` | yes |
| 10 | `workspace.search` | `workspace_search` | `workspace:search` | never | `workspaceFiles.search` | yes |
| 11 | `workspace.createFile` | `workspace_create_file` | `workspace:create-file` | policy | `approvals.prepare` (`workspace_changeset`) | yes (approval UI dead: DOC-001) |
| 12 | `workspace.createDirectory` | `workspace_create_directory` | `workspace:create-directory` | policy | `approvals.prepare` (`workspace_changeset`) | yes (DOC-001) |
| 13 | `workspace.proposeChangeset` | `workspace_propose_changeset` | `workspace:propose-update` | policy | `approvals.prepare` (`workspace_changeset`) | yes (DOC-001) |
| 14 | `workspace.move` | `workspace_move` | `workspace:move` | always | `approvals.prepare` (`workspace_move`) | yes (DOC-001) |
| 15 | `workspace.trash` | `workspace_trash` | `workspace:trash` | always | `approvals.prepare` (`workspace_trash`) | yes (DOC-001) |
| 16 | `media.generateImage` | `media_generate_image` | `media:generate-image` | always | `approvals.prepare` (`media_generate_image`) then `executeApprovedGenerateImagePlan` on decide | yes (approval UI dead: DOC-001) |

**Parity at name/switch level:** 16 advertised / 16 mapped / 16 executor cases / 0 advertised-without-executor / 0 executor-only advertised tools.

**Intentionally absent (not a parity miss):** `media.generateVideo` and `media.generateAudio` are commented out of `toolNameMap` and `DEFINITIONS` until a durable approval pipeline exists.

**Inverse gap (capability without tool):** `attachment:read` is granted by `read_attachments`, `limited_documents`, and `workspace_with_approval`, but no registered tool requires it. `resolveAvailableTools("read_attachments")` therefore advertises **zero** model tools (DOC-012).

**Dead policy module:** `src/agent/policy/capability-policy-engine.ts` `decideCapabilityPolicy()` has no production callers. Registry `requiresApproval: "policy"` is implemented in the executor as unconditional `approvals.prepare` (DOC-011).

---

## Findings

### VF-AUD-20260910-DOC-001

**ID:** VF-AUD-20260910-DOC-001  
**Severity:** P1  
**Status:** CONFIRMED  
**Area:** approvals / UI consumption  
**Classification:** confirmed defect  
**File:** `electron/ipc/handlers/documentAgentHandlers.ts`; `src/components/documents/DocumentAgentView.tsx`; `electron/agent/runtime/agent-tool-executor.ts`; `electron/preload.ts`  
**Lines:** `282-286`; `50-69`, `297-308`, `512-518`; `102-113`, `336-435`; `859-870`  
**Symbol:** `documentAgent:approvals:list`, `restoredProposal`, `executeAgentTool`, `documentAgent.approvals`  
**Evidence:** Agent tools persist pending approvals under three grant-id schemes: `limited:${profileId}` (document edit/restore/export), `media:${profileId}` (image generate), and the real workspace `grant.id` (`grant_<uuid>`). The only list IPC hard-filters to `limited:${profileId}`. The only renderer consumer (`DocumentAgentView.restoredProposal`) accepts `document_edit` and `document_restore` and returns `null` for every other `proposalType`. Tool results return `{ pendingApprovalId }` only — not `proposalHash` — so chat cannot call `approvals.decide`. Preload exposes workspace `choose` / `revoke` / `list` / `read` / `search` and does **not** expose `documentAgent:workspace:proposeChangeset|proposeMove|proposeTrash`, so workspace mutations exist only as agent-created approvals.  
**Expected:** Every advertised approval-gated tool must produce a pending approval the user can list, inspect, and decide; `decide` must receive the bound `proposalHash`.  
**Actual:** `workspace.*` mutation tools and `media.generateImage` create approvals the UI cannot list. Agent `document.export` uses the `limited:` grant so it can appear in the list payload, then is dropped by `restoredProposal`. Paid `executeApprovedGenerateImagePlan` is reachable only through `documentAgent:approvals:decide`, which the UI never invokes for media/workspace.  
**Impact:** Advertised workspace writes never land. Advertised agent image generation never dispatches. Users see a tool-result JSON id with no approval card.  
**Root cause:** Grant-id namespacing and proposal-type UI were not extended when workspace/media plans were added.  
**Related occurrences:** `desktopDocumentAgent.approvals.list/decide` in `src/services/desktopBridge.ts`; no other `proposalHash` consumer under `src/`.  
**Remediation:** List pending approvals by profile/session, not `limited:` grant id. Return `{ pendingApprovalId, proposalHash, proposalType, publicView }` from tool results. Teach the Document Agent (or chat) UI to render media and workspace plans. Bind decide to the same identity.  
**Tests required:** End-to-end: tool prepare → list includes the row → decide executes the stored plan for each `proposalType`. Negative: `limited:` filter must not hide `media:` or `grant_` ids.  
**Validation:** static  
**Compatibility impact:** additive UI/IPC; existing document-edit flow can stay.

### VF-AUD-20260910-DOC-002

**ID:** VF-AUD-20260910-DOC-002  
**Severity:** P1  
**Status:** CONFIRMED  
**Area:** attachment promotion / session scope  
**Classification:** confirmed defect  
**File:** `electron/ipc/handlers/documentAgentHandlers.ts`; `electron/agent/runtime/agent-tool-executor.ts`; `electron/agent/runtime/tool-execution-context.ts`; `src/services/attachmentService.ts`  
**Lines:** `36-38`, `355-365`; `256-262`; `42`; `57-73`  
**Symbol:** `rendererSession`, `documentAgent:attachments:register`, `resolveWithBody`  
**Evidence:** Chat registration (`registerAttachment` → `documentAgent:attachments:register`) stores `sessionId = ${RUNTIME_SESSION_ID}:renderer_${senderId}` with **no** agent suffix. The agent loop always has `agentSessionId` from `useDocumentAgentStore` (`src/stores/chat-stream-manager.ts` `258`) and resolves attachments with `ctx.rendererSessionId = ${runtime}:renderer_${id}:agent_${agentSessionId}`. `AttachmentRegistry.resolveWithBody` requires exact `profileId` **and** `sessionId`. The user-facing IPC promote path uses the suffix-free session and works; the advertised model tool cannot see chat-registered attachments.  
**Expected:** Opaque `attachmentId` values issued for a renderer/profile must be resolvable by the Document Agent tool under the same conversation/session grant.  
**Actual:** `document.promoteAttachment` returns “Attachment not found or access denied” for every chat-registered file whenever `agentSessionId` is present (the production chat path).  
**Impact:** The only model-callable promotion tool is dead in the real chat loop. Users can still promote from the composer button (IPC).  
**Root cause:** Two session-id constructions; register IPC has no `agentSessionId` argument.  
**Related occurrences:** `revokeRendererSession` uses a prefix match, so teardown still works; lookup does not.  
**Remediation:** Register and resolve with the same renderer-session tuple (include agent suffix on register, or resolve by renderer prefix + profile, or key by attachmentId + profile only). Do not let the model supply a session.  
**Tests required:** Register via IPC without agent suffix, execute `document.promoteAttachment` with a tool context that has `agentSessionId`, expect success. Cross-profile and cross-sender must still deny.  
**Validation:** static  
**Compatibility impact:** behavioral fix to session matching.

### VF-AUD-20260910-DOC-003

**ID:** VF-AUD-20260910-DOC-003  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** tool registry vs executor validation  
**Classification:** confirmed defect  
**File:** `electron/agent/runtime/agent-tool-executor.ts`; `src/agent/registry/tool-registry.ts`  
**Lines:** `32-38`, `124-147`, `172-176`; `148-160`, `212-217`, `436-458`  
**Symbol:** `argsValidator`, `executeAgentTool`  
**Evidence:** `RegisteredTool.argsValidator` enforces `additionalProperties: false`, required fields, path bounds, and `overwrite: const false`. `executeAgentTool` `JSON.parse`s arguments and `as`-casts them. Production grep shows `argsValidator.parse` only in tests (`tool-registry.test.ts`, `agent-tool-executor.test.ts` media schema test), never in the executor. Consequences: `document.create` accepts omitted `overwrite`, extra `blocks`/`displayName`, and untyped `format`; `document.proposeEdits` / `workspace.proposeChangeset` accept arbitrary operation/change objects (`items: { type: "object" }` even in the schema); `media.generateImage` extra fields such as `model` are ignored (tested) rather than rejected at the shared validator.  
**Expected:** The executor must run the same runtime validator the registry advertises to the model.  
**Actual:** Two validation stacks. The model-facing schema is not the authorization/parse boundary.  
**Impact:** Argument smuggling, weaker overwrite/path/format enforcement, and unbounded changeset/edit shapes until a later service throws.  
**Root cause:** Registry validators were added for VERIFY-145 tests and never wired into `executeAgentTool`.  
**Remediation:** `resolveProviderName` + `argsValidator.parse` before the switch; map validator errors to `INVALID_ARGUMENTS`.  
**Tests required:** Extra keys, omitted required fields, `overwrite: true`, oversize paths, invalid format enums, malformed operations — all must fail in `executeAgentTool`, not only in `argsValidator` unit tests.  
**Validation:** static  
**Compatibility impact:** behavioral; some previously accepted malformed calls will start failing (desired).

### VF-AUD-20260910-DOC-004

**ID:** VF-AUD-20260910-DOC-004  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** attachment promotion / content-type confusion  
**Classification:** confirmed defect  
**File:** `electron/agent/runtime/agent-tool-executor.ts`; `electron/ipc/handlers/documentAgentHandlers.ts`; `electron/agent/documents/attachment-import-service.ts`  
**Lines:** `243-270`; `310-328`; `63-71`  
**Symbol:** `document.promoteAttachment`, `classifyMime`  
**Evidence:** IPC promote uses `resolved.mimeType` from the registry and rejects `classifyMime === "reject"` before import. The tool path passes **model-supplied** `mimeType` and `sizeBytes` into `attachments.promote`, using the registry only for the body buffer. `classifyMime` then decides text extraction vs metadata-only. A model can label a registered `application/pdf` / `application/zip` / `application/x-msdownload` as `text/plain` and force UTF-8 extraction into a managed document. `sizeBytes` is range-checked against 1..1 MiB and never compared to `attachment.body.length`.  
**Expected:** MIME class and size must come from the trusted registry record, not from tool arguments.  
**Actual:** Tool arguments control extraction mode.  
**Impact:** Prompt-injected promotion can pull binary/secret-bearing bytes into document text (redaction is heuristic, not a MIME boundary).  
**Remediation:** Ignore model `mimeType`/`sizeBytes`; use registry fields; fail if they disagree.  
**Tests required:** Register as `application/pdf`, tool-call with `mimeType: "text/plain"` → metadata-only or deny, never text extract.  
**Validation:** static  
**Compatibility impact:** behavioral.

### VF-AUD-20260910-DOC-005

**ID:** VF-AUD-20260910-DOC-005  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** approval durability  
**Classification:** confirmed defect  
**File:** `electron/agent/approvals/approval-coordinator.ts`; `electron/ipc/handlers/documentAgentHandlers.ts`  
**Lines:** `113-129`; `208-256`  
**Symbol:** `ApprovalCoordinator.decide`, `documentAgent:approvals:decide`  
**Evidence:** `decide` writes `consumedAt` (or `rejectedAt`) and persists **before** returning `privateExecutionPlan`. The IPC handler then re-checks `plan.profileId`, workspace grant, and runs apply/export/media. If `workspaceGrants.get` fails (revoked grant), `applyEdits` throws `STALE_REVISION`, export dialog is canceled after consume, or `executeApprovedGenerateImagePlan` returns `ok: false`, the approval is already spent. There is no restore-to-pending path.  
**Expected:** Consume only after successful execution, or execute under a lock and revert `consumedAt` on failure; canceled native dialogs must not consume.  
**Actual:** One-shot consume-then-execute.  
**Impact:** Lost document edits, lost workspace mutations, and a consumed media plan with no retry id after a post-consume failure. Combined with DOC-001, workspace/media plans are both un-approvable and non-retryable if decide is ever reached.  
**Remediation:** Two-phase decide (validate → execute → consume) or compensate on failure. Do not consume on `canceled: true` export.  
**Tests required:** Approve + apply throw → pending still listable. Approve + revoked grant → not consumed. Approve + canceled save dialog → not consumed.  
**Validation:** static  
**Compatibility impact:** behavioral.

### VF-AUD-20260910-DOC-006

**ID:** VF-AUD-20260910-DOC-006  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** approval integrity  
**Classification:** security risk  
**File:** `electron/agent/approvals/approval-coordinator.ts`; `electron/agent/runtime/approved-media-executor.ts`  
**Lines:** `71-90`; `147-151`  
**Symbol:** `proposalHash`, `privateExecutionPlan`, `plan.wirePayload`  
**Evidence:** `proposalHash` hashes `canonicalToolName`, `validatedArguments`, `baseRevisionIds`, `affectedResources`, `grantId`, and `publicSummary`. It does **not** hash `privateExecutionPlan`. Execution uses the stored plan (`wirePayload`, workspace `changes` including file content, document `operations`). Local `pending-approvals.json` is `0o600` under userData; a same-user or malware writer can keep the public hash stable and swap the private plan (for example a different `model` / extra image fields / different workspace bytes). `decide` only checks id + hash + runtime session.  
**Expected:** The executed plan must be in the proposal hash, or the plan must be reconstructed from hashed `validatedArguments` at execute time.  
**Actual:** Public view and private plan can diverge after persist.  
**Impact:** Integrity gap on the exact payload that performs filesystem writes and paid `/image/generate`.  
**Remediation:** Include a canonical hash of `privateExecutionPlan` in `proposalHash`, or drop stored plans and rebuild from hashed arguments via the same factories.  
**Tests required:** Tamper `wirePayload.model` / `changes[].content` without changing public fields → `APPROVAL_MISMATCH`.  
**Validation:** static  
**Compatibility impact:** hash formula change; in-flight approvals from older builds would fail closed (acceptable).

### VF-AUD-20260910-DOC-007

**ID:** VF-AUD-20260910-DOC-007  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** path containment / symlink TOCTOU  
**Classification:** security risk  
**File:** `electron/agent/workspace/workspace-filesystem-service.ts`; `electron/agent/workspace/workspace-mutation-service.ts`; `electron/agent/workspace/path-policy.ts`  
**Lines:** `27-36`, `54-68`, `95-97`; `69`; `39-50`, `53-66`  
**Symbol:** `list`, `search`, `prepareChangeset`, `assertNoSymlinkComponents`, `readRegularFileBounded`  
**Evidence:** `followSymlinks: false` is a grant invariant. `resolveExistingWorkspacePath` lstats each component then `realpath`s the candidate; `readText` reopens with `O_RDONLY|O_NOFOLLOW`. `list` does not: after resolving the start directory it `readdir`s children, skips `Dirent.isSymbolicLink()` at that instant, then recurses with `fs.promises.readdir` on `path.join(current, name)`. Replacing a listed directory with a symlink between `readdir` and the recursive walk causes `readdir` to follow the link and emit outside names under workspace-relative paths. `search` clones the grant to inject `list` when the grant lacks it (DOC-014) and then reads via `resolveExistingWorkspacePath` (so content read still fails closed on the symlink). `prepareChangeset` uses `fs.promises.readFile(target)` with no `O_NOFOLLOW` after resolution — a file→symlink swap can follow an in-workspace (or, if `isPathInside` loses a race, escaped) target. Path-policy tests cover static hostile strings and pre-existing symlinks, not TOCTOU.  
**Expected:** Every directory walk and mutation read must refuse symlink components at use time (`O_NOFOLLOW` / `lstat` immediately before open), matching `readText`.  
**Actual:** List/search walk and mutation reads are racy vs the documented no-follow contract.  
**Impact:** Directory listing (and search file-name enumeration) can leak names outside the grant; mutation reads are weaker than the read tool.  
**Remediation:** `lstat`+containment on every walk step; `open(..., O_NOFOLLOW)` in `prepareChangeset`; do not inject `list` for search.  
**Tests required:** Replace a child directory with an outside symlink between list pages; mutation readFile after swapping a hashed file for a symlink.  
**Validation:** static  
**Compatibility impact:** behavioral hardening.

### VF-AUD-20260910-DOC-008

**ID:** VF-AUD-20260910-DOC-008  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** delete / trash / recovery  
**Classification:** missing feature + confirmed defect  
**File:** `electron/agent/documents/managed-document-service.ts`; `electron/ipc/handlers/documentAgentHandlers.ts`; `electron/agent/workspace/workspace-mutation-service.ts`; `electron/preload.ts`  
**Lines:** `166-177`; `164-181`; `139-164`; `865-870`  
**Symbol:** `ManagedDocumentService.delete`, `documentAgent:documents:delete`, `restoreTrash`  
**Evidence:** Managed delete removes the document **and all revisions** from `documents.json` with no tombstone, trash, or backup. Main IPC performs the delete with only `documentId` + profile authority; confirmation is renderer-only (`askDecision` in `DocumentAgentView`). Workspace `trash` stages files under `userData/document-agent/workspace-recovery` and returns a `recoveryId`, and `restoreTrash` implements restore, but no IPC/preload/bridge/UI method calls `restoreTrash` (single definition site). Recovery JSON lives next to staged bytes with no expiry/quota.  
**Expected:** Destructive managed-document delete should require a main-validated confirmation token and retain recoverable revisions; workspace trash should expose restore through the same grant/session boundary.  
**Actual:** Managed delete is permanent. Workspace trash is write-only from the product surface.  
**Impact:** User or compromised-renderer delete is unrecoverable for managed docs; agent workspace trash (if DOC-001 is fixed) cannot be undone in-app.  
**Remediation:** Soft-delete or revision-preserving trash for managed documents; `documentAgent:workspace:restoreTrash` with grant/session checks; bound recovery retention.  
**Tests required:** Delete then restore managed document; trash then restore workspace file; restore after grant revoke denied.  
**Validation:** static  
**Compatibility impact:** additive recovery API; delete semantics become reversible.

### VF-AUD-20260910-DOC-009

**ID:** VF-AUD-20260910-DOC-009  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** permission presets / grant authority  
**Classification:** security risk  
**File:** `electron/agent/runtime/agent-permission-state.ts`; `electron/agent/runtime/tool-execution-context.ts`; `src/stores/document-agent-store.ts`; `src/stores/chat-stream-manager.ts`; `src/agent/contracts/capabilities.ts`  
**Lines:** `41-44`; `43-50`; `26-28`; `114-125`; `90-103`  
**Symbol:** `getEffectiveAgentPermissionPreset`, `createToolExecutionContext`, `resolveAvailableTools`  
**Evidence:** Unknown or missing agent sessions default to `limited_documents` (tested as intended). `permissions.set` runs only when the Document Agent UI changes the dropdown — never on startup. `createToolExecutionContext` always sets `capabilityGrant.userInitiated: true`, so `isGrantActive` cannot distinguish an explicit grant. `limited_documents` includes `document:create` and `attachment:promote`, both `requiresApproval: "never"`. `chat-stream-manager` injects those tools into **every** function-calling chat using the Zustand default preset, and also sets `venice_parameters.enable_document_tools` (not in Swagger; DOC-013). Renderer IPC document CRUD does not consult the preset (user UI), which is acceptable; the model path is what this default enables.  
**Expected:** Model document/workspace/media tools should require an explicit main-recorded user grant; missing session should fail closed (`off`). `userInitiated` must be false unless `permissions.set` succeeded.  
**Actual:** Fail-open to create/read/edit/export/restore/promote on all capable chats. A renderer that sends a fresh `agentSessionId` after the user selected `off` also gets `limited_documents` (the honest UI keeps the same id; a compromised renderer can bypass `off` this way — and can also call `permissions.set` directly). Against the model, the default is an implicit grant.  
**Impact:** Prompt injection on ordinary chat can create managed documents and propose edits without the user opening Document Agent.  
**Remediation:** Default `off`; persist preset in main and require `permissions.set` before tools; set `userInitiated` from that record; do not inject tools until main acknowledges the preset.  
**Tests required:** No `permissions.set` → no document tools executed. After `off`, a different `agentSessionId` must not revive `limited_documents`.  
**Validation:** static  
**Compatibility impact:** behavioral; users who relied on the implicit default must opt in once.

### VF-AUD-20260910-DOC-010

**ID:** VF-AUD-20260910-DOC-010  
**Severity:** P2  
**Status:** CONFIRMED  
**Area:** document edit/create integrity  
**Classification:** confirmed defect  
**File:** `src/agent/registry/tool-registry.ts`; `src/agent/documents/document-source.ts`; `electron/agent/documents/document-patch-engine.ts`  
**Lines:** `212-217`, `384-389`; `9-13`; `48-64`, `115-148`  
**Symbol:** `validateDocumentBlocks`, `serializableDocumentToBlocks`, `applyDocumentEdits`  
**Evidence:** Edit `operations` and workspace `changes` schemas are `items: { type: "object" }` with no operation enum, hash fields, or nested bounds. `serializableDocumentToBlocks` accepts any array element with a `type` property. `validateDocumentBlocks` only checks unique id shape; it does not validate block `type`, heading `level`, or text length. `replace_block` clones `operation.block` as-is. Combined with DOC-003 (executor skips `argsValidator`), the model can persist malformed blocks into the revision log and later serialization path.  
**Expected:** Edit/create payloads must satisfy the `DocumentBlock` / `WorkspaceChange` discriminated unions before preview or persist.  
**Actual:** Structural typing is documentary; runtime accepts loosely shaped objects.  
**Impact:** Corrupt revisions, serializer surprises, and large unvalidated bodies (DoS of the in-memory index).  
**Remediation:** Shared runtime parsers for blocks, operations, and workspace changes; enforce max text bytes per block.  
**Tests required:** Invalid `type`, missing `text`, `level: 99`, 201st operation, huge `content` string.  
**Validation:** static  
**Compatibility impact:** stricter validation of previously accepted junk.

### VF-AUD-20260910-DOC-011

**ID:** VF-AUD-20260910-DOC-011  
**Severity:** P3  
**Status:** CONFIRMED  
**Area:** capability policy  
**Classification:** verifier/documentation drift  
**File:** `src/agent/policy/capability-policy-engine.ts`; `electron/agent/runtime/agent-tool-executor.ts`; `src/agent/registry/tool-registry.ts`  
**Lines:** `23-45`; `328-393`; `365-390`  
**Symbol:** `decideCapabilityPolicy`, `requiresApproval: "policy"`  
**Evidence:** `decideCapabilityPolicy` is never imported outside its module. Workspace create/changeset tools are labeled `"policy"` but the executor always prepares an approval. `workspace_autonomous` is still in the policy engine’s “skip approval on modify” branch even though `VALID_PRESETS` rejects it (good) and comments say it is not public.  
**Expected:** Either the policy engine is the approval authority or it is removed from the active tree.  
**Actual:** Dead code that disagrees with the executor.  
**Impact:** Future callers may think autonomous modify is implemented.  
**Remediation:** Delete or wire the engine; keep executor/registry as the single authority.  
**Tests required:** If wired, table-driven preset × risk → allow/approve/deny.  
**Validation:** static  
**Compatibility impact:** none if deleted; behavioral if wired.

### VF-AUD-20260910-DOC-012

**ID:** VF-AUD-20260910-DOC-012  
**Severity:** P3  
**Status:** CONFIRMED  
**Area:** preset / tool surface  
**Classification:** missing feature  
**File:** `src/agent/contracts/capabilities.ts`; `src/agent/registry/tool-registry.ts`  
**Lines:** `31-32`, `91-92`; `186-434`  
**Symbol:** `attachment:read`, `read_attachments`  
**Evidence:** `read_attachments` grants only `attachment:read`. No `DEFINITIONS` entry lists that capability. The UI option “read attachments only” therefore advertises an empty tool list (`resolveAvailableTools`). Attachment bodies are still inlined by the ordinary chat attachment pipeline, not by a Document Agent tool.  
**Expected:** A public preset must either expose a real tool or not be selectable.  
**Actual:** Empty tool grant with a user-visible preset name.  
**Impact:** Users believe the agent can “read attachments” under a tighter grant than `limited_documents`; it cannot via tools.  
**Remediation:** Add a bounded `attachment.getMetadata`/`attachment.readText` tool, or remove the preset.  
**Tests required:** `resolveAvailableTools("read_attachments")` either non-empty and executed, or preset removed.  
**Validation:** static  
**Compatibility impact:** product change.

### VF-AUD-20260910-DOC-013

**ID:** VF-AUD-20260910-DOC-013  
**Severity:** P3  
**Status:** CONFIRMED  
**Area:** Venice request schema  
**Classification:** documentation drift  
**File:** `src/stores/chat-stream-manager.ts`; `src/types/venice.ts`; `docs/reference/Venice_swagger_api.yaml`  
**Lines:** `122-125`; `180-187`; `1474-1551`  
**Symbol:** `enable_document_tools`  
**Evidence:** Stream construction always writes `venice_parameters.enable_document_tools` from the local preset. Current Swagger `venice_parameters` lists character/search/thinking/E2EE flags and does **not** declare `enable_document_tools`. Additional properties are not explicitly `false` on that object, so this may not 400, but it is not an authoritative provider field. Main does not strip it.  
**Expected:** Only documented `venice_parameters` members leave the client. Local Document Agent tools are Forge-side and do not need a provider flag.  
**Actual:** A Forge-only flag is forwarded on `/chat/completions`.  
**Impact:** Provider schema risk; confusion about whether Venice “document tools” exist.  
**Remediation:** Stop sending the field, or document it if upstream added it after snapshot `20260821.193530`.  
**Tests required:** Chat body fixture must not contain the key unless Swagger declares it.  
**Validation:** static  
**Compatibility impact:** drop unknown field (backward compatible).

### VF-AUD-20260910-DOC-014

**ID:** VF-AUD-20260910-DOC-014  
**Severity:** P3  
**Status:** CONFIRMED  
**Area:** workspace grants  
**Classification:** security risk (latent)  
**File:** `electron/agent/workspace/workspace-filesystem-service.ts`; `electron/agent/policy/workspace-grant-service.ts`  
**Lines:** `95-97`; `21-37`  
**Symbol:** `search`, `WorkspaceGrantService.issue`  
**Evidence:** `search` clones the grant and appends `"list"` when missing. Production `issue()` currently defaults to all operations including `list`, and the renderer cannot pass custom `allowedOperations`, so this is latent. It still violates “grant.allowedOperations is authoritative.”  
**Expected:** Missing `list` ⇒ search denied, or search walks without a forged list capability.  
**Actual:** Search self-elevates.  
**Remediation:** Remove the clone; require `list` or implement a search walk that does not call `list()`.  
**Tests required:** Grant with `["search"]` only must not list.  
**Validation:** static  
**Compatibility impact:** none today (defaults include list).

### VF-AUD-20260910-DOC-015

**ID:** VF-AUD-20260910-DOC-015  
**Severity:** P3  
**Status:** CONFIRMED  
**Area:** error mapping / dead paths / model resolution  
**Classification:** confirmed defect (low)  
**File:** `electron/agent/runtime/agent-tool-executor.ts`; `electron/agent/workspace/workspace-filesystem-service.ts`; `electron/agent/runtime/image-model-resolver.ts`; `electron/preload.ts`  
**Lines:** `441-443`; `128-136`; `64-68`; `332-334`  
**Symbol:** `safeToolError`, `createFile`, `resolveGenerateImageModel`, `app:readLocalFile`  
**Evidence:** (1) `PathPolicyError` codes `PATH_OUTSIDE_WORKSPACE` / `SYMLINK_ESCAPE` exist on `ToolError` but the executor catch maps every throw to `INTERNAL_ERROR`. (2) `WorkspaceFilesystemService.createFile` is only used in its unit test; production creates go through approval + mutation service. (3) `resolveGenerateImageModel` documents profile preference as step 1, but `executeAgentTool` calls it with `{ profileId }` only. (4) Preload still exposes `app:readLocalFile` with no main handler and no `src/` caller — not an arbitrary-path primitive in this tree, but a dead privileged-looking channel.  
**Expected:** Typed path errors to the model; no dead filesystem write helper; pass preferred image model from trusted profile settings; remove dead preload.  
**Actual:** Collapsed errors, unused create helper, default/first catalog/`flux-dev` only, stale preload invoke.  
**Impact:** Weaker model recovery; image model may ignore user default; dead IPC name.  
**Remediation:** Map `PathPolicyError.code`; delete or use `createFile`; pass preferred model id from main settings; remove preload method.  
**Tests required:** Path escape → `PATH_OUTSIDE_WORKSPACE`; resolver with preferred id.  
**Validation:** static  
**Compatibility impact:** additive error codes; preload removal is safe (no callers).

---

## Positive controls (not findings)

- **Name-level tool/executor parity is 16/16.** Video/audio tools are not advertised. `document-agent-contracts.test.ts` section A guards the fallthrough.
- **Renderer cannot supply a workspace root or absolute workspace path.** `documentAgent:workspace:choose` uses a main-frame native directory dialog, `realpath`s the root, and returns `publicGrant` without `rootPath`. List/read/search take `grantId` + relative path; `assertRelativeWorkspacePath` rejects `..`, UNC, drive letters, `~`, encodings, reserved Windows names.
- **Grant/session isolation:** `WorkspaceGrantService.get` requires matching `sessionId`; tool executor compares `ctx.workspaceGrant.workspaceId` to the model’s `workspaceId`. `issue()` revokes prior grants for the session (one live grant).
- **Profile authority:** document IPC uses `getProfileSessionId(event.sender)`, not renderer-supplied profile ids. Privileged channels run `validateIpcSender`.
- **Export / picker sender binding:** export and workspace picker reject non-main-frame senders.
- **`media.generateImage` does not dispatch in `executeAgentTool`.** Model `model` argument is ignored; `resolveGenerateImageModel` + `buildGenerateImagePlan` + `submitDurablePaidTask` + `performGuardedVeniceRequest` (Family Safe Mode / 451) is the intended paid path — blocked in practice by DOC-001.
- **`workspace_autonomous` is rejected** by `VALID_PRESETS` in `agent-permission-state.ts`.
- **Attachment registry** does not return bodies on public `resolve`; budgets/TTL exist; renderer promote IPC uses registry MIME (unlike the tool path).
- **Managed documents** are library-relative (`assertRelativeWorkspacePath`), non-overwriting, revision-hashed; edits require `expectedBlockHash` at apply time.
- **Approvals fail closed across runtime restarts** (`sessionId !== RUNTIME_SESSION_ID`).

---

## Renderer arbitrary-path check (in scope)

| Channel | Renderer-supplied path? | Containment |
|---|---|---|
| `documentAgent:workspace:choose` | no (native dialog) | `realpath` directory; grant stored in main |
| `documentAgent:workspace:list/read/search` | relative only + `grantId` | path-policy + grant session |
| `documentAgent:workspace:propose*` | relative + `grantId` | registered in main, **not** in preload |
| `documentAgent:documents:*` | library-relative / opaque ids | profile-scoped JSON, no OS path |
| `documentAgent:documents:export` | suggested file name only | native save dialog; write to user-chosen path |
| `documentAgent:attachments:*` | no filesystem path | in-memory registry |
| `app:readLocalFile` | none (no args) | **no handler** — dead preload |

Out of scope but adjacent: `app:media:import` / `reveal` take renderer `filePath` and are allowlisted in media services, not in the Document Agent.

---

## Counts

| Metric | Count |
|---|---|
| Scope source/test files under `electron/agent`, `src/agent`, plus `documentAgentHandlers.ts` | 52 |
| Additional contract surfaces read (preload, bridge, stores, Document Agent UI, veniceHandlers, attachmentService) | 8 |
| Canonical advertised tools | 16 |
| Provider name mappings | 16 |
| Executor `case` arms | 16 |
| Advertised tools missing an executor arm | 0 |
| Executor-advertised unimplemented video/audio tools | 0 |
| Capabilities with no model tool (`attachment:read`) | 1 |
| Findings total | 15 |
| P1 | 2 |
| P2 | 8 |
| P3 | 5 |
| False positives / not reproducible | 0 |
| Commands executed | 0 (static-only) |
| Tests run | 0 |
| Manual QA | not run |
| Hosted CI/CodeQL | not checked |
| Git commit/push | none; findings file untracked |

**Finding IDs issued:** `VF-AUD-20260910-DOC-001` … `VF-AUD-20260910-DOC-015`.

---

## Remaining risks / deferred

- Windows junction / mount-point follow behavior of `fs.Dirent.isSymbolicLink()` was not dynamically proven on this host.
- `pending-approvals.json` stores `publicSummary` (including a 200-char prompt slice for media) and full `privateExecutionPlan` under userData; acceptable for local approval UX, but it is durable prompt/content storage (DOC-006).
- Chat tool-result JSON includes document block text and pending ids; truncation is 50 000 characters (`TOOL_RESULT_MAX_CHARS`).
- `media_with_approval` is exclusive of document/workspace capabilities; even after DOC-001, users cannot mix media + documents in one preset.
- Web/non-Electron `desktopDocumentAgent` returns “desktop only”; no Express document-agent implementation (by design).
- This audit did not execute Vitest, the workspace verifier, or headed Electron QA.

## Deferred work

- Implement UI + list/decide coverage for every `ProposalType` (blocks DOC-001).
- Unify attachment session identity (blocks DOC-002).
- Wire `argsValidator` and typed operation parsers (DOC-003, DOC-010).
- Consume-after-success approvals and hash-bind private plans (DOC-005, DOC-006).
- TOCTOU-closed workspace walk/open (DOC-007).
- Managed-document recovery and workspace restore IPC (DOC-008).
- Fail-closed default preset (DOC-009).
