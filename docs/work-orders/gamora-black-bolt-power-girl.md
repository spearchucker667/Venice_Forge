# Venice Forge — Persona Isolation, Folder Portability, Prompt-Layer Inspection, Document Agents, Character Images, CSP, and Locked Media Plan

**Plan date:** 2026-07-20  
**Target repository:** `/Users/super_user/Projects/Venice_Forge`  
**Inspected snapshot:** `Venice_Forge-clean-20260720-221302.zip`  
**Inspected package:** `venice-forge@3.0.0-beta.1`  

## 1. Role

You are the primary implementation agent for Venice Forge. Work as a senior Electron, React, TypeScript, persistence, security-boundary, prompt-architecture, document-agent, and media-storage engineer.

This is not a speculative redesign. Verify each static finding against the live checkout, convert verified findings into a tracked checklist, implement the fixes in dependency order, and record evidence for every completion claim.

Do not treat prior reports or work-order checkboxes as proof. The current snapshot contains functionality that prior reports describe as complete but which remains disconnected or internally inconsistent.

## 2. Mission

Correct the current defects and complete the following product features:

1. Prevent hosted character identity from contaminating later standard chats.
2. Repair the renderer CSP so durable generated images can render through `venice-media://` without allowing arbitrary web or filesystem image sources.
3. Diagnose and repair hosted character avatar resolution failures using classified, non-sensitive diagnostics.
4. Add an accessible chat-folder context menu with Lock/Unlock, Rename, Delete, Import, and Export.
5. Add a versioned, validated, single-JSON chat-folder interchange format that preserves standard-chat and character-chat organization.
6. Add a Traffic Inspector section that records, tests, and displays the effective system-prompt layer stack without leaking raw prompt content by default.
7. Make the immutable tool-knowledge/runtime layer truly first, short, main-process-owned, and non-removable.
8. Replace the disconnected Documents chat surface with a functional, permission-scoped, multi-turn document-agent pipeline.
9. Repair tool-registry/executor mismatches and stop advertising tools that cannot execute.
10. Add a hidden and cryptographically locked image/video vault controlled from the Master Password area.
11. Reconcile stale or over-optimistic implementation reports with the verified current state.

## 3. Scope and Evidence Limitations

The following screenshots were supplied and must be treated as direct QA evidence:

- Repeated `Character image resolution failed` warnings for hosted slugs, with `source: "api-photoUrl"`, `cached: false`, and `errorCategory: "unknown"`.
- Three CSP errors blocking image loads from `venice-media://<sha256>` because `img-src` permits `venice-character-cache:` but not `venice-media:`.
- Documents view showing a generic chat surface beside manually operated Managed Vault and Workspace Files controls, while document/workspace tool use is unavailable from the chat.

The user referred to an attached JSON file, but no JSON/JSONL attachment was present in the supplied upload set. Do not invent findings from a missing traffic export. Ask for or ingest it later if it becomes available.

The uploaded archive contains no `node_modules` and no verified Git metadata. Static inspection was performed; no build or test command was executed during preparation of this plan.

## 4. Mandatory Repository Discovery

Before editing, run and record:

```bash
cd /Users/super_user/Projects/Venice_Forge

pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short
git log -1 --oneline
node --version
npm --version
node -p "require('./package.json').name + '@' + require('./package.json').version"
```

Confirm Node satisfies:

```text
>=22.13.0 <23
```

Create a working implementation log before changing code:

```text
docs/reports/VENICE_FORGE_2026-07-20_REMEDIATION_REPORT.md
```

The report must contain:

```md
# Venice Forge 2026-07-20 Remediation Report

## Repository State
## Verified Findings
## False Positives or Changed Paths
## Implementation Checklist
## Files Changed
## Data Migrations
## Tests Added or Updated
## Commands Executed
## Validation Results
## Manual QA
## Remaining Risks
## Deferred Work
```

Inspect at minimum:

```text
src/stores/chat-stream-manager.ts
src/stores/chat-stream-manager.test.ts
src/stores/character-store.ts
src/stores/chat-store.ts
src/components/chat/StandardChatView.tsx
src/services/promptCompiler.ts or current prompt compiler

src/components/chat/HistoryView.tsx
src/stores/chat-folder-store.ts
src/shared/chatFolderContracts.ts
electron/services/chatFolderService.ts
electron/services/chatFolderBackupService.ts
electron/services/chatFolderLockService.ts
electron/ipc/handlers/chatFolderHandlers.ts
src/types/desktop.ts
electron/preload.ts
src/services/desktopBridge.ts

src/components/layout/inspector-pane.tsx
src/stores/inspector-store.ts
src/services/inspectorTelemetry.ts
src/shared/agentRuntimeContracts.ts
electron/agent/runtime/trusted-agent-request.ts
electron/services/guardPipeline.ts
electron/ipc/handlers/veniceHandlers.ts
electron/ipc/validation.ts

src/components/documents/DocumentAgentView.tsx
src/stores/document-agent-store.ts
src/agent/registry/tool-registry.ts
src/agent/registry/tool-name-map.ts
electron/agent/runtime/chat-agent-runner.ts
electron/agent/runtime/agent-tool-executor.ts
electron/agent/runtime/agent-services.ts
electron/ipc/handlers/documentAgentHandlers.ts
electron/agent/documents/**
electron/agent/workspace/**

src/utils/characterImageResolver.ts
src/hooks/useCharacterImage.ts
src/services/characterImageDiagnostics.ts
electron/services/characterImageCache.ts
electron/utils/characterImageCacheProtocol.ts

electron/utils/rendererCsp.ts
electron/utils/rendererCsp.test.ts
electron/services/generatedMediaStore.ts
src/types/media.ts
src/stores/media-store.ts
src/components/gallery/gallery-view.tsx
src/components/gallery/media-card.tsx
src/components/gallery/media-detail-dialog.tsx
src/components/settings/MasterPasswordDialog.tsx
electron/services/secureStore.ts
```

Also inspect the current canonical reference files before modifying Venice request contracts:

```text
docs/reference/VENICE_API_SYSTEM_PROMPT.md
docs/reference/Venice_swagger_api.yaml
docs/reference/Venice_api_LLM_info.md
```

## 5. Verified Findings

### VF-20260720-001 — P0: Hosted character persona leaks into standard chats

**Verified code:** `src/stores/chat-stream-manager.ts:57-72`

`resolveCharacterSlug()` first checks persisted conversation metadata, then falls back to global `useCharacterStore.getState().selectedCharacterSlug` for any conversation without a hosted slug.

Current behavior:

```ts
const persisted = character?.slug?.trim();
if (persisted) return persisted;
const globalSlug = useCharacterStore.getState().selectedCharacterSlug;
if (globalSlug) return globalSlug.trim();
```

`src/stores/character-store.ts:168-178` persists the selected hosted slug until `clearCharacter()` is explicitly called.

`buildStreamBody()` then inserts the stale slug into:

```ts
venice_parameters.character_slug
```

This makes an ordinary standard chat inherit the last selected hosted character. The request builder is using global UI selection state as provider identity state.

**Required invariant:** Character identity must be conversation-authoritative. A request may contain `character_slug` only when that exact conversation is a hosted-character conversation with a persisted hosted slug.

### VF-20260720-002 — P0: Generated images are blocked by CSP

**Verified code:** `electron/utils/rendererCsp.ts`

Current production directive includes:

```text
img-src 'self' data: blob: venice-character-cache:
```

while generated images use durable URLs from `electron/services/generatedMediaStore.ts`:

```text
venice-media://<sha256>
```

The screenshot shows Chromium blocking these image loads. `media-src` already permits `venice-media:`, but `img-src` does not.

**Required invariant:** `venice-media:` must be permitted for images without permitting arbitrary `https:`, `http:`, or `file:` sources.

### VF-20260720-003 — P0: Documents chat is not connected to the document-agent permission/session context

**Verified code:** `src/components/documents/DocumentAgentView.tsx:201-205`

The Documents screen embeds the generic:

```tsx
<ChatView />
```

The Documents component separately owns:

- `agentSessionId`
- permission preset
- selected workspace grant
- managed document selection
- manual create/edit/export controls

The generic chat request path does not consume that Documents runtime context.

**Result:** The visible chat and the visible document/workspace controls are adjacent but not one agent workflow.

### VF-20260720-004 — P0: Document/workspace tool schemas and executor contracts disagree

**Verified examples:**

1. `src/agent/registry/tool-registry.ts` defines `document.create` with:

```ts
{ projectId, relativePath, format, document, overwrite: false }
```

2. `electron/agent/runtime/agent-tool-executor.ts:39-43` expects:

```ts
{ projectId, relativePath, format, blocks, displayName }
```

A schema-valid model call cannot satisfy the executor contract.

3. Workspace schemas expose `workspaceId` but no `grantId`.

4. The executor requires a model-provided `grantId` for every workspace tool.

5. Internal grant IDs should not be model arguments at all. They must be injected by trusted runtime context.

6. Registered tools missing executor branches include at least:

```text
document.export
document.getRevision
document.restoreRevision
document.promoteAttachment
```

7. `document.proposeEdits` uses a hard-coded approval grant:

```ts
grantId: `limited:${profileId}`
```

rather than the active server-side capability grant.

8. The media tool registry requires only `prompt`, while the executor rejects calls without `args.model`.

9. The media executor sends `return_binary: false`, which must be revalidated against the current Venice Swagger and the application’s canonical image request adapter.

### VF-20260720-005 — P0: The “agent loop” stops after tool execution

**Verified code:** `electron/agent/runtime/chat-agent-runner.ts:88-167`

The runner:

1. streams one model response;
2. aggregates tool calls;
3. executes tools;
4. emits appended tool messages;
5. returns.

It does not send the assistant tool-call message plus tool results back to the model for a final assistant response. It is a one-pass tool executor, not a multi-turn agent loop.

**Required invariant:** A completed tool call must be followed by another model turn until the model emits final text, the user cancels, an approval is pending, or a strict iteration limit is reached.

### VF-20260720-006 — P0: Document agent session identity cannot reach the generic Venice stream handler

`electron/ipc/validation.ts` returns only:

```ts
endpoint
method
body
headers
signalId
profileId
fallbackConfig
```

It drops any renderer-provided `agentSessionId`. `veniceHandlers.ts` invokes `runChatAgentLoop(request, ...)`, so the generic path cannot reliably match Documents workspace grants to the Documents agent session.

Do not solve this by trusting a renderer-provided `grantId`. Use a dedicated, typed document-agent IPC or a main-issued opaque runtime token bound to sender/profile/session.

### VF-20260720-007 — P1: Chat folders have backend operations but no required context menu

The current snapshot already has:

- standard vs character folder kind
- CRUD
- drag/drop
- encrypted backup/import
- lock/unlock IPC

`src/components/chat/HistoryView.tsx:282-340` exposes only hover buttons for Rename and Delete. It has no folder `onContextMenu` handler and no Lock/Unlock, Import, or Export submenu.

Do not rewrite the folder service. Complete and harden the missing UI and portable interchange contract.

### VF-20260720-008 — P1: Existing folder backup is encrypted `.vfbackup`, not the requested single JSON interchange format

`electron/services/chatFolderBackupService.ts` implements an encrypted backup envelope. Preserve it as the security-oriented backup path.

The user separately requested portable single-JSON import/export of selected chats with correct folder and character organization. Add a distinct, explicitly named interchange format rather than silently converting secure backups into plaintext.

### VF-20260720-009 — P1: Traffic Inspector has no system-prompt layer model

Current inspector data records request/response/safety metadata and redacts prompt content. It does not record:

- layer order
- layer source
- immutability
- inclusion/omission reason
- prompt length/hash
- character binding source
- Venice default system-prompt flag
- attached tool definitions

The final provider-bound request is composed in the main process, so prompt-layer inspection must be instrumented there rather than reconstructed from renderer assumptions.

### VF-20260720-010 — P1: Tool runtime layer is not immutable and is not first

`src/shared/agentRuntimeContracts.ts` currently declares:

```ts
interface ToolRuntimeLayer {
  kind: 'tool-runtime';
  priority: 10;
  immutable: false;
}
```

The trusted date/time layer is priority `0`. This conflicts with the product requirement that the short tool-knowledge layer be the first instruction layer and not be editable, removable, or reordered by user content.

### VF-20260720-011 — P1: Character image failures are classified as `unknown`

The screenshot shows repeated failures from API-provided `photoUrl` values.

`src/hooks/useCharacterImage.ts` records bridge-declared failures using:

```ts
errorCategory: "unknown"
```

`electron/services/characterImageCache.ts` produces distinct failures for:

- invalid or untrusted URL
- redirect errors
- 401/403/404/upstream status
- timeout/network failure
- unsupported content type
- size limit
- byte-signature mismatch
- cache write/path failure

Those distinctions are flattened before reaching diagnostics, preventing effective triage.

Do not guess that the allowlist is wrong. First capture a safe error code and verify the real API URL host/path and upstream status.

### VF-20260720-012 — P1: Hidden/locked media has no data model or encrypted storage path

`src/types/media.ts` has no visibility/vault fields. Media metadata remains in renderer IndexedDB, and generated image/video/audio bytes are stored as plaintext content-addressed files under:

```text
<userData>/media/blobs/sha256/
```

The existing Master Password implementation stores a salted verifier and currently describes itself as protecting Family Safe Mode changes. It is not a media encryption key-management system.

A visual “Hidden” filter alone is not sufficient for a locked vault.

### VF-20260720-013 — P2: Existing reports overstate closure

The existing work order/report describe Documents, folder operations, and agent tooling as implemented or engine-complete. Current source and runtime screenshots show disconnected contracts and missing UI/tool behavior.

Update the report with explicit reopened findings. Do not delete historical evidence; mark superseded claims and link to the new report.

## 6. Implementation Order

Execute in this order:

1. P0 persona isolation.
2. P0 CSP correction.
3. P0 document-agent contract repair and true tool loop.
4. P1 folder context menu and JSON interchange.
5. P1 prompt-layer inspector and immutable first layer.
6. P1 character-image diagnostics and upstream resolution fix.
7. P1 hidden/locked media vault.
8. Documentation reconciliation, full validation, packaged QA.

Do not combine all work in one unreviewable refactor. Keep commits/implementation checkpoints aligned to the phases below.

# Phase 1 — Character Persona Isolation

## 1.1 Replace global-selection fallback in request construction

Refactor `resolveCharacterSlug()` so it uses only persisted conversation metadata.

Required behavior:

```ts
export function resolveCharacterSlug(conv: Conversation | undefined): string | null {
  const binding = conv?.metadata?.character;
  if (!binding) return null;
  if (binding.localCharacterId) return null;
  const slug = binding.slug?.trim();
  return slug || null;
}
```

Do not use `useCharacterStore` inside the provider request builder.

The selected character store may remain useful for browsing and creating a new character conversation. It must not affect an existing or newly created standard conversation.

## 1.2 Make conversation binding explicit

Add or consolidate a helper such as:

```ts
export type ConversationPersonaBinding =
  | { kind: 'standard' }
  | { kind: 'hosted-character'; slug: string; characterId?: string }
  | { kind: 'local-character'; localCharacterId: string; systemPrompt: string };

export function getConversationPersonaBinding(
  conversation: Conversation,
): ConversationPersonaBinding;
```

Use it from:

- prompt compilation
- `venice_parameters.character_slug` construction
- Venice default-system-prompt selection
- prompt-layer inspector metadata
- folder-kind validation

## 1.3 Clear stale request fields every turn

For standard chats:

```ts
delete veniceParams.character_slug;
```

Do not inherit character web settings, model override, or disabled Venice system prompt from another conversation.

For hosted-character chats:

- use only the conversation’s stored slug;
- set `include_venice_system_prompt` according to the character contract;
- do not inject the global user system prompt if the product contract excludes it.

For local-character chats:

- never set a hosted `character_slug`;
- use the compiled local character prompt;
- do not reuse a prior hosted slug.

## 1.4 Character selection lifecycle

Review every `selectCharacter()` call. Starting a hosted chat must:

1. create or activate a character-bound conversation;
2. persist the hosted slug in that conversation;
3. keep UI selection separate from request identity.

Opening Standard Chat may clear the transient selection for UX clarity, but correctness must not depend on that cleanup.

## 1.5 Persona isolation tests

Add tests to `src/stores/chat-stream-manager.test.ts` and relevant character-chat suites:

- [ ] Select hosted character A, create standard chat, send message: no `character_slug`.
- [ ] Use hosted character A, switch to existing standard chat, send: no `character_slug`.
- [ ] Use hosted character A, create another standard chat without clearing global selection: no `character_slug`.
- [ ] Hosted character conversation sends its persisted slug.
- [ ] Hosted conversation remains bound after app/store rehydration.
- [ ] Local character conversation sends no hosted slug.
- [ ] Local character prompt remains active only in its own conversation.
- [ ] Standard chat restores configured standard system prompt.
- [ ] Standard chat restores configured Venice default-system-prompt flag.
- [ ] Retry/reconnect rebuilds from the same conversation metadata and does not read global selection.

# Phase 2 — CSP and Durable Image Rendering

## 2.1 Correct the exact CSP directive

Update `electron/utils/rendererCsp.ts` so `img-src` includes both internal schemes:

```text
img-src 'self' data: blob: venice-character-cache: venice-media:
```

Keep:

```text
media-src 'self' blob: venice-media:
```

Do not add:

```text
https:
http:
file:
*
```

## 2.2 CSP tests

Update `electron/utils/rendererCsp.test.ts` and any `tests/csp/**` snapshots/assertions:

- [ ] Production `img-src` includes `venice-media:`.
- [ ] Production `img-src` includes `venice-character-cache:`.
- [ ] Production `img-src` contains no arbitrary `https:`.
- [ ] Production CSP contains no `file:`.
- [ ] `media-src` remains restricted.
- [ ] `object-src 'none'`, `frame-ancestors 'none'`, and `form-action 'none'` remain.

## 2.3 Protocol QA

Verify a generated image returned by `media.generateImage` renders in:

- inline chat
- Image Studio result
- Media Studio grid
- Media Studio detail dialog
- character chat

Verify `venice-media://` still rejects requests from an unauthorized origin/frame under `customProtocolAccess`.

# Phase 3 — Functional Document-Agent Pipeline

## 3.1 Do not keep generic ChatView as the Documents agent

Replace the generic `<ChatView />` inside `DocumentAgentView` with a Documents-specific surface, for example:

```text
src/components/documents/DocumentAgentChat.tsx
```

It must receive or select:

```ts
interface DocumentAgentRuntimeSelection {
  profileId: string;
  projectId: string;
  agentSessionId: string;
  preset: AgentPermissionPreset;
  workspaceGrantId?: string;
  activeDocumentId?: string;
  modelId: string;
}
```

The renderer may identify its session and current selection. The main process remains authoritative for profile, grant lookup, paths, permissions, and execution.

## 3.2 Add a dedicated typed document-agent stream IPC

Preferred design:

```text
documentAgent:chat:start
documentAgent:chat:abort
documentAgent:chat:delta
documentAgent:chat:tool-event
documentAgent:chat:approval-required
```

Do not route workspace-capable agent execution through a generic IPC that drops `agentSessionId`.

The main process must bind the runtime to:

```ts
interface AgentExecutionContext {
  profileId: string;          // sender-derived
  rendererWebContentsId: number;
  agentSessionId: string;     // validated and bound to sender
  runtimeSessionId: string;   // main-derived
  projectId: string;
  preset: AgentPermissionPreset;
  capabilityGrantId: string;
  workspaceGrantId?: string;  // main lookup, never model-authored
  activeDocumentId?: string;
}
```

## 3.3 Refactor executor signature

Replace implicit/global access and model-authored grant IDs with context injection:

```ts
export async function executeAgentTool(
  context: AgentExecutionContext,
  toolCall: AssistantToolCall,
): Promise<ToolResult>;
```

Workspace executor branches must obtain the active grant from `context.workspaceGrantId`, then verify:

- same renderer session
- same profile
- same agent session
- same workspace
- unexpired grant
- requested operation permitted

Remove `grantId` from every provider-visible workspace tool schema.

## 3.4 Reconcile every schema with its executor

Create a matrix in the remediation report:

| Tool | Provider schema | Validated args | Executor | Service | Approval | UI result | Tests |
|---|---|---|---|---|---|---|---|

At minimum reconcile:

```text
document.get
document.proposeEdits
document.create
document.export
document.getRevision
document.restoreRevision
document.promoteAttachment
workspace.list
workspace.read
workspace.search
workspace.createFile
workspace.createDirectory
workspace.proposeChangeset
workspace.move
workspace.trash
media.generateImage
```

No tool may be included in a provider request until all matrix columns are complete.

## 3.5 Fix `document.create`

Choose one canonical payload shape and use it end to end.

Recommended:

```ts
interface DocumentCreateToolInput {
  projectId: string;
  relativePath: string;
  format: DocumentFormat;
  displayName: string;
  document: SerializableDocument;
  overwrite: false;
}
```

The executor converts `SerializableDocument` through the existing serializer/managed-document service. Do not make the model emit one undocumented `blocks` shape while the registry advertises another.

## 3.6 Implement or unadvertise missing document tools

Implement each missing branch using existing services, or temporarily remove it from the model-visible registry.

Required behavior:

- `document.export`: prepare user-confirmed native save flow; never accept renderer/model path.
- `document.getRevision`: bounded immutable revision read.
- `document.restoreRevision`: approval proposal that creates a new revision; never rewrites history.
- `document.promoteAttachment`: use bounded attachment import with secret redaction and no arbitrary path access.

## 3.7 Build a real multi-turn loop

Replace the one-pass runner with a bounded loop:

```text
model turn
  -> zero or more tool calls
  -> validate capabilities/args
  -> approval gate if required
  -> execute allowed tools
  -> append assistant tool_calls message
  -> append tool result messages
  -> next model turn
  -> final assistant text
```

Constraints:

- maximum 8 model turns per user action;
- maximum 16 tool calls per user action;
- one tool-call ID executes at most once;
- cancellation checked before and after each network/tool operation;
- pending approval pauses the loop without executing;
- resume is bound to exact proposal hash, base revisions, session, and tool call;
- tool result body capped and redacted;
- no raw filesystem paths or secrets sent back to the model;
- final assistant response persisted only once.

## 3.8 Tool capability filtering

Before attaching a schema, verify:

1. selected model supports function calling according to the live Venice API model record;
2. tool has an executor;
3. active preset grants every required capability;
4. required project/workspace/document context exists;
5. safe-mode policy allows the action;
6. approval policy is available.

If the selected model lacks tool support:

- show a clear Documents error/state;
- do not advertise tools;
- do not silently switch models unless the user enabled an explicit fallback policy.

## 3.9 Inline chat document tools

Inline standard/character chat may use document tools only after explicit enablement and capability grant issuance.

Do not attach all document schemas solely because a renderer boolean is true. The main process must issue a scoped runtime grant and filter the provider schemas.

## 3.10 Media tool contract repair

For `media.generateImage`:

- schema and executor must agree on model selection;
- either expose optional `model` and validate against the live catalog, or let a main-process planner select the model using requested specifications;
- use the canonical image request adapter;
- reverify `return_binary` against `docs/reference/Venice_swagger_api.yaml` and remove unsupported synthetic fields;
- preserve generated media through `generatedMediaStore`;
- return canonical `ChatMediaReference` metadata;
- obtain paid-action approval when policy requires it.

## 3.11 Documents UI requirements

The Documents screen must include:

- tool-capable model selector;
- current permission preset;
- current workspace and grant status;
- folder tree with expandable directories;
- file search;
- active managed/workspace document;
- agent conversation;
- tool activity timeline;
- pending approval cards;
- exact diff/preview;
- approve/reject controls;
- final assistant response after tool completion;
- clear indication when an operation is manual rather than agent-executed.

Keep direct manual controls as a fallback, but do not present them as proof that chat tools work.

## 3.12 Document-agent tests

Add or update tests for:

- [ ] Documents chat request carries server-bound session context.
- [ ] Renderer cannot choose another profile’s grant.
- [ ] Model never receives raw `grantId`.
- [ ] `document.create` schema-valid input executes.
- [ ] Every advertised tool has an executor.
- [ ] Every unimplemented tool is absent from schemas.
- [ ] Workspace traversal and symlink escape fail closed.
- [ ] Read-only tools execute without approval when allowed.
- [ ] Mutations pause for exact approval.
- [ ] Rejected proposal changes nothing.
- [ ] Approved proposal checks base revision/hash again.
- [ ] Tool result triggers a follow-up model turn.
- [ ] Final assistant text arrives after tool completion.
- [ ] Loop limit stops recursive tool calls safely.
- [ ] Cancellation stops model and tool execution.
- [ ] Non-tool-capable model receives no tools.
- [ ] Inline chat requires explicit capability enablement.

# Phase 4 — Chat Folder Context Menu and Single-JSON Interchange

## 4.1 Add an accessible folder context menu

Create a reusable component such as:

```text
src/components/chat/ChatFolderContextMenu.tsx
```

Open it through:

- right-click / `contextmenu`;
- keyboard Context Menu key;
- `Shift+F10`;
- optional visible overflow button for touch/trackpad discoverability.

Required entries:

```text
Lock / Unlock
Edit name
Delete…
Import chats…
Export chats…
Encrypted backup…
```

Keep encrypted backup separate from portable JSON export so users understand the security difference.

Menu items must be disabled with an explanatory label when:

- folder is locked;
- operation is incompatible with folder kind;
- no chats are selected for export;
- Electron native file APIs are unavailable.

## 4.2 Lock action

Wire the existing main-process lock APIs into the context menu.

Lock requirements:

- lock state changes immediately in all relevant stores/views;
- locked folder hides titles/previews/message counts according to existing lock policy;
- drag in/out, rename, delete, import, and export require unlock;
- unlock failures use existing backoff/lockout;
- no passphrase appears in logs, inspector payloads, backups, or error details.

## 4.3 Delete action

Use an explicit dialog:

```text
Delete folder only (move chats to Unfiled)
Delete folder and contained chats
Cancel
```

For destructive deletion, show standard/character kind and exact chat count. Preserve current tombstone/recovery conventions.

## 4.4 Define a distinct portable JSON format

Add contracts such as:

```ts
export const CHAT_EXPORT_FORMAT = 'venice-forge-chat-export' as const;
export const CHAT_EXPORT_FORMAT_VERSION = 1 as const;

export interface PortableChatExportV1 {
  format: typeof CHAT_EXPORT_FORMAT;
  formatVersion: typeof CHAT_EXPORT_FORMAT_VERSION;
  appVersion: string;
  exportedAt: string;
  sourceProfileId?: string;
  selection: {
    folderIds: string[];
    conversationIds: string[];
  };
  folders: PortableChatFolderV1[];
  conversations: PortableConversationV1[];
  localCharacters: PortableLocalCharacterBindingV1[];
  media?: PortableMediaReferenceV1[];
  excludes: string[];
  integrity: {
    algorithm: 'sha256';
    canonicalPayloadHash: string;
  };
}
```

Use a dedicated extension or descriptive filename such as:

```text
venice-forge-chats-2026-07-20.vfchat.json
```

The file is JSON, but the distinct suffix prevents confusion with generic settings exports.

## 4.5 Preserve folder and character organization

Each exported conversation must retain:

- stable source ID;
- conversation kind (`standard` or `character`);
- source folder ID;
- title and timestamps;
- model ID;
- messages and safe metadata;
- hosted character slug and display metadata when hosted;
- `localCharacterId` and required local character snapshot when local;
- attachment references;
- generated media references;
- deleted/tombstoned state only when explicitly included.

Do not infer character type from title or folder name during import.

## 4.6 Exclusions and data safety

Exclude:

```text
API keys
provider keys
OS secure-storage values
master/folder passwords
raw diagnostic logs
absolute local paths
signed download URLs
session cookies
browser cache
temporary files
workspace grants
capability grant IDs
```

Default JSON export should contain references, not binary media. If a future “include media” option embeds base64 in the same JSON, require explicit opt-in, strict type/size validation, and a hard total-file limit. Do not block the initial folder/chat portability feature on binary embedding.

## 4.7 Main-process import/export service

Implement main-process-owned services, for example:

```text
electron/services/chatFolderInterchangeService.ts
electron/ipc/handlers/chatFolderInterchangeHandlers.ts
```

The renderer must never choose arbitrary write/read paths. Use native open/save dialogs and return only structured previews/results.

Required IPC:

```ts
previewPortableExport(input)
exportPortableJson(input)
previewPortableImport(input)
applyPortableImport(input)
```

## 4.8 Import preview and conflict policy

Preview must show:

- format/app version;
- source timestamp;
- folder count by kind;
- chat count by kind;
- message count;
- hosted/local character count;
- missing character references;
- unsupported schema/version warnings;
- ID conflicts;
- title/name conflicts;
- missing media/attachment references;
- estimated writes.

Import modes:

```text
Create new folders
Merge into selected compatible folder
Preserve source folder layout
```

Conflict behavior:

- remap imported IDs when an unrelated local record already uses the ID;
- preserve all messages;
- never merge a character chat into a standard folder;
- never silently overwrite a locally modified conversation;
- preserve a conflict copy when deterministic merge is unsafe;
- apply all writes transactionally or with a rollback journal;
- create a safety backup before a large destructive merge.

## 4.9 Folder tests

- [ ] Right-click opens menu for standard folder.
- [ ] Right-click opens menu for character folder.
- [ ] Shift+F10 opens the same menu.
- [ ] Focus returns to the invoking folder after close.
- [ ] Lock/Unlock calls existing IPC and refreshes state.
- [ ] Rename validates Unicode/code-point length and duplicate policy.
- [ ] Delete folder-only moves chats to compatible Unfiled lane.
- [ ] Delete-with-content requires explicit second confirmation.
- [ ] Export selected folder creates one valid JSON file.
- [ ] Export preserves hosted character slug.
- [ ] Export preserves local character binding/snapshot.
- [ ] Import preview rejects malformed or oversized JSON.
- [ ] Import rejects path-like or secret-bearing fields.
- [ ] Import preserves standard/character separation.
- [ ] Import remaps conflicts without message loss.
- [ ] Locked folder cannot import/export until unlocked.
- [ ] Existing encrypted `.vfbackup` behavior still works.

# Phase 5 — Prompt-Layer Inspector and Immutable First Layer

## 5.1 Replace the two-layer ambiguity with one immutable execution layer

The simplest contract that satisfies the product requirement is one main-process-created first layer containing both:

- short tool-use/environment rules;
- current trusted date/time/timezone values.

Proposed type:

```ts
export interface TrustedExecutionLayer {
  kind: 'trusted-execution';
  priority: 0;
  immutable: true;
  version: 1;
  runtime: TrustedRuntimeContent;
  tools: Array<{
    name: string;
    trusted: true;
  }>;
  policyText: string;
}
```

No user/custom/character layer may have priority `<= 0`.

The user cannot edit, disable, replace, prepend, or remove this layer. Optional tool availability may change; the integrity rule remains.

## 5.2 Keep the layer short

Do not dump full schemas into prompt text. Provider `tools` remains the canonical schema transport.

The instruction should say only what the model must know, for example:

```text
[VENICE_FORGE_EXECUTION]
Current local date/time: {{resolved date/time and timezone}}.
Use only tools present in this request. Never claim a tool ran without a tool result.
Tool results are app-managed and may require user approval. Do not request filesystem paths, secrets, shell access, or capabilities not listed.
[/VENICE_FORGE_EXECUTION]
```

Resolve `{{time && date}}` in the main process immediately before dispatch.

## 5.3 Define prompt-layer telemetry

Add a safe structure such as:

```ts
export type PromptLayerKind =
  | 'trusted-execution'
  | 'app-system'
  | 'user-system'
  | 'hosted-character-binding'
  | 'local-character-system'
  | 'conversation-memory'
  | 'attachment-context'
  | 'conversation-message'
  | 'provider-default-system-prompt'
  | 'tool-schema';

export interface PromptLayerSnapshot {
  index: number;
  kind: PromptLayerKind;
  source: string;
  immutable: boolean;
  included: boolean;
  omissionReason?: string;
  unicodeCodePoints: number;
  utf8Bytes: number;
  approximateTokens: number;
  sha256: string;
  role?: 'system' | 'user' | 'assistant' | 'tool';
  providerToolNames?: string[];
  safeSummary?: string;
}

export interface PromptCompositionSnapshot {
  requestId: string;
  signalId?: string;
  modelId: string;
  conversationId?: string;
  conversationKind: 'standard' | 'hosted-character' | 'local-character' | 'unknown';
  includeVeniceSystemPrompt: boolean;
  characterSlugPresent: boolean;
  createdAt: number;
  layers: PromptLayerSnapshot[];
  finalSystemMessageHash?: string;
  finalRequestHash: string;
}
```

## 5.4 Instrument the main-process composition point

Capture the snapshot after trusted composition and immediately before `performVeniceRequest()`.

Do not reconstruct layer order solely in the renderer.

Recommended flow:

1. `composeTrustedRequestWithManifest()` returns `{ request, manifest }`.
2. `performGuardedVeniceRequest()` forwards the manifest to a local callback/event.
3. `veniceHandlers.ts` emits a typed, main-frame-only `venice:promptLayers` event correlated by `signalId`/request ID.
4. preload exposes read-only event subscription.
5. inspector store associates the manifest with the matching traffic record.

Do not include the manifest in the upstream Venice request.

## 5.5 Traffic Inspector UI

Add top-level inspector tabs:

```text
Traffic
Prompt Layers
Prompt Lab
```

Prompt Layers view must show:

- exact order;
- immutable badge;
- included/omitted state;
- source;
- code points, bytes, estimated tokens;
- hash;
- hosted character slug present/absent, without exposing private character prompts by default;
- Venice default prompt on/off;
- tool names;
- warnings for contradictory states.

Detect and flag:

- standard chat with `character_slug`;
- local character with hosted slug;
- tools described but no schemas attached;
- schemas attached for unsupported model;
- mutable layer preceding trusted layer;
- duplicated system layers;
- over-limit user system prompt;
- unknown/unclassified system content.

## 5.6 Safe content reveal

Default storage/export contains hashes and measurements only.

An optional “Reveal local prompt text” action may show content in-memory after an explicit warning. It must:

- never reveal API keys/secrets;
- never reveal attachment bytes;
- never persist revealed content to inspector logs;
- never include revealed text in exported diagnostics;
- clear on inspector close/app lock.

## 5.7 Prompt Lab

Add a non-network test surface that lets the user choose:

- model;
- standard/hosted/local character mode;
- user system prompt;
- Venice default prompt flag;
- tool preset;
- date/time fixture;
- attachment summary fixture.

It must display the same composition manifest generated by production composition code. It must not duplicate the algorithm in the UI.

Provide regression fixture:

```text
Select hosted character -> compose hosted request -> compose standard request
```

Expected standard result:

```text
characterSlugPresent = false
conversationKind = standard
```

## 5.8 Prompt inspector tests

- [ ] Trusted execution layer is index 0.
- [ ] Trusted execution layer is immutable.
- [ ] Custom layer cannot use priority 0 or less.
- [ ] `{{time && date}}` resolves deterministically with injected clock.
- [ ] Standard chat manifest contains no hosted slug.
- [ ] Hosted chat manifest contains persisted slug.
- [ ] Local chat manifest contains local-character layer and no hosted slug.
- [ ] Prompt snapshots store hashes/lengths, not raw content.
- [ ] Export contains no raw prompt text.
- [ ] Tool list matches actual attached provider schemas.
- [ ] Prompt Lab and production composer use the same function.

# Phase 6 — Character Image Resolution Diagnostics and Repair

## 6.1 Introduce safe structured error codes

Return a typed error from main process:

```ts
export type CharacterImageErrorCode =
  | 'INVALID_URL'
  | 'UNTRUSTED_HOST'
  | 'REDIRECT_MISSING_LOCATION'
  | 'REDIRECT_UNTRUSTED'
  | 'REDIRECT_LIMIT'
  | 'UPSTREAM_UNAUTHORIZED'
  | 'UPSTREAM_FORBIDDEN'
  | 'UPSTREAM_NOT_FOUND'
  | 'UPSTREAM_STATUS'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'CONTENT_TYPE'
  | 'SIZE_LIMIT'
  | 'SIGNATURE_MISMATCH'
  | 'CACHE_PATH_REJECTED'
  | 'CACHE_WRITE_FAILED'
  | 'PROTOCOL_RESOLUTION_FAILED';
```

Bridge result:

```ts
interface CharacterImageCacheResult {
  ok: boolean;
  url?: string;
  cached?: boolean;
  errorCode?: CharacterImageErrorCode;
  safeMessage?: string;
  upstreamStatus?: number;
}
```

Do not expose the API key, full signed URL, absolute cache path, or raw response body.

## 6.2 Preserve categories in renderer diagnostics

Map `errorCode` to an expanded diagnostic category. Stop recording every bridge-declared failure as `unknown`.

The console warning should contain:

```text
slug
source
cached
errorCode
upstreamStatus (when safe)
```

It should not contain the full URL.

## 6.3 Verify the real upstream contract

Using a development API key and Traffic Inspector metadata, verify for at least three failing slugs:

- raw `photoUrl` field shape;
- hostname;
- pathname pattern;
- whether auth is required;
- first response status;
- redirect target/status;
- content type;
- byte signature.

Compare against `Venice_swagger_api.yaml` and actual `/characters` output.

Do not add arbitrary CDN hosts until verified from real API output and documented.

## 6.4 Control fan-out

The Characters view triggers many avatar resolutions simultaneously. Add:

- in-flight dedupe by canonical URL/hash;
- bounded concurrency, e.g. 4-6 upstream fetches;
- negative-cache TTL for 404/invalid records;
- retry only for transient network/5xx failures;
- no repeated retry on every React render;
- cancellation or stale-result protection when list/filter changes.

## 6.5 Avatar fallback

Failure must produce initials/placeholder without broken-image chrome. The view should remain functional even when every upstream image fails.

## 6.6 Character image tests

- [ ] API `photoUrl` trusted host succeeds.
- [ ] Relative trusted path resolves.
- [ ] Synthetic fallback path succeeds when valid.
- [ ] Untrusted host rejects before fetch.
- [ ] 401/403 optional authenticated retry is bounded.
- [ ] 404 returns `UPSTREAM_NOT_FOUND` and negative-caches.
- [ ] Redirect to untrusted host fails.
- [ ] Wrong content type fails.
- [ ] Signature mismatch fails.
- [ ] Cache write failure has safe code.
- [ ] Concurrent same-URL requests dedupe.
- [ ] Renderer maps error codes correctly.
- [ ] No raw URL or path appears in normal diagnostics.

# Phase 7 — Hidden and Locked Media Vault

## 7.1 Define product semantics before implementation

Implement two distinct states:

```text
Visible — normal Media Studio behavior
Hidden + Locked — removed from normal views and encrypted at rest; access requires Master Password unlock
```

Do not ship a “locked” label over plaintext files.

A simple Hide-only state may be added later, but the requested hidden section must be password-gated and cryptographically protected.

## 7.2 Do not repurpose the current verifier as an encryption key

The existing master-password service stores a salted verifier and currently allows a 4-character minimum in the UI. A verifier cannot decrypt media, and a 4-character password is not sufficient for a new encrypted vault.

Implement a media-vault key hierarchy:

1. Generate a random 32-byte Media Vault Key (MVK).
2. Derive a Key Encryption Key (KEK) from the entered master password and a random per-vault salt.
3. Wrap the MVK with authenticated encryption.
4. Store only salt/KDF parameters/wrapped MVK/nonce/version.
5. Keep unwrapped MVK only in main-process memory during an unlocked session.
6. Zero/replace buffers where practical on lock; document JavaScript memory limitations honestly.

Preferred KDF:

- Argon2id if an already-reviewed dependency exists in this repository.

Acceptable fallback:

- `scrypt` from Node crypto with documented parameters.
- PBKDF2-SHA-256 only if project constraints make the above unavailable; use a dedicated high iteration count and unique salt.

Authenticated encryption:

- XChaCha20-Poly1305 if the existing libsodium stack is approved and packaged correctly;
- otherwise AES-256-GCM with unique random nonces.

## 7.3 Master Password migration and UX

Do not silently turn an existing low-entropy Family Safe Mode password into a vault encryption password.

In Master Password settings add:

```text
Master Password status
Media Vault: Not configured / Locked / Unlocked
Set up Media Vault
Change Master Password
Lock Media Vault now
Auto-lock timeout
Lock on app restart
Recovery warning
```

Requirements:

- new vault setup requires a stronger minimum, recommended 12 characters;
- existing short master-password users must upgrade before vault setup;
- changing password rewraps the MVK, not every media blob;
- clearing password is blocked while vault contains items unless user exports/deletes or explicitly destroys the vault;
- lost password warning states that locked media may be unrecoverable.

## 7.4 Add media-vault data contracts

Extend `MediaItem` using additive, versioned fields:

```ts
export type MediaVisibility = 'visible' | 'vaulted';

export interface MediaVaultReference {
  vaultVersion: 1;
  vaultMediaId: string;
  encryptedMetadataId: string;
}

// MediaItem additions
visibility: MediaVisibility;
vaultRef?: MediaVaultReference;
vaultedAt?: number;
```

For vaulted items, renderer IndexedDB must not retain sensitive plaintext prompt, negative prompt, note, tags, source path token, or thumbnail. Store a redacted placeholder record and keep sensitive metadata in the encrypted main-process vault.

## 7.5 Encrypted storage layout

Proposed main-process layout:

```text
<userData>/media-vault/
  vault.v1.json
  blobs/
    <random-id>.bin.enc
  metadata/
    <random-id>.json.enc
  thumbnails/
    <random-id>.thumb.enc
  journal/
    migration.v1.json
```

Do not reuse plaintext content hashes as public filenames if that leaks unwanted equality information. Use random vault IDs; keep SHA-256 inside encrypted metadata.

## 7.6 Atomic vault migration

“Hide & Lock” flow:

1. Verify/unlock master password in main.
2. Resolve the durable source bytes through trusted media ID.
3. Read and validate bytes.
4. Encrypt to a temporary vault file.
5. fsync and rename atomically.
6. Encrypt sensitive metadata and thumbnail.
7. update media record to a redacted vault reference.
8. verify decrypt/read round trip.
9. remove plaintext source only after all previous steps succeed.
10. write recovery journal entries throughout.

On failure, retain the original visible item and remove incomplete temporary vault files.

## 7.7 Protocol enforcement

The renderer must not decrypt vault media.

Either extend `venice-media://` or add a narrowly privileged vault scheme. Main-process protocol resolution must:

- verify request origin/frame through existing custom-protocol access guard;
- verify vault session is unlocked;
- resolve only validated vault IDs;
- decrypt/stream bytes without writing plaintext temp files when practical;
- support byte ranges for locked video playback;
- return 423/403 or a neutral placeholder when locked;
- never expose vault filesystem paths or keys.

Do not add broad CSP sources.

## 7.8 Media UI

Add actions to media-card overflow/context menus and bulk toolbar:

```text
Hide & Lock
Move out of Hidden Vault
Export unlocked copy…
Delete permanently…
```

Add Media Studio section/filter:

```text
Library
Favorites
Hidden Vault
```

Hidden Vault behavior:

- shows locked state before unlock;
- asks for Master Password through the shared dialog/service;
- auto-locks on configured timeout, app restart, profile switch, and explicit Lock Now;
- no thumbnails or prompt snippets appear while locked;
- search does not leak vaulted metadata while locked;
- clipboard/drag/export disabled while locked.

## 7.9 Export/import/backup policy

- exporting a vaulted item requires current unlock and a native save dialog;
- folder/chat JSON export does not include vault bytes by default;
- encrypted app backup may include vault ciphertext without decrypting it;
- sync/backup manifests mark vault content as encrypted opaque blobs;
- no master password, KEK, or MVK is exported in plaintext.

## 7.10 Media vault tests

- [ ] Setup creates wrapped key metadata, not plaintext key.
- [ ] Wrong password fails with lockout and no oracle details.
- [ ] Existing short password requires upgrade before vault enablement.
- [ ] Hide & Lock encrypts image bytes and removes plaintext source after verification.
- [ ] Hide & Lock encrypts video bytes and preserves range playback after unlock.
- [ ] Failure mid-migration rolls back safely.
- [ ] Locked protocol request cannot read bytes.
- [ ] Unlock permits only current profile/session.
- [ ] Restart returns vault to locked state.
- [ ] Auto-lock clears access.
- [ ] Renderer never receives key or absolute path.
- [ ] Locked IDB record contains no prompt/note/tags/thumbnail.
- [ ] Export requires unlock.
- [ ] Delete removes ciphertext and metadata atomically/recoverably.
- [ ] CSP remains restricted.

# Phase 8 — Documentation and Report Reconciliation

## 8.1 Update current docs

Update or create:

```text
docs/reports/VENICE_FORGE_2026-07-20_REMEDIATION_REPORT.md
docs/developer/prompt-layer-architecture.md
docs/developer/document-agent-runtime.md
docs/developer/chat-folder-interchange-format.md
docs/security/media-vault.md
docs/user/chat-folders.md
docs/user/documents-agent.md
docs/user/media-vault.md
```

Use existing documentation placement conventions if those paths differ.

## 8.2 Reconcile prior completion claims

Review:

```text
docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md
docs/reports/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_REPORT_2026-07-19.md
```

Do not delete them. Add a supersession/reopened-findings note identifying:

- character persona request-state leakage;
- CSP omission;
- generic Documents ChatView disconnect;
- schema/executor drift;
- missing multi-turn tool loop;
- missing folder context menu;
- no portable JSON interchange;
- no media vault.

## 8.3 Add migration notes

Document migrations for:

- any conversation/persona metadata normalization;
- prompt-layer telemetry schema;
- portable chat export versioning;
- MediaItem vault fields;
- plaintext-to-vault migration journal;
- existing master-password upgrade behavior.

# Phase 9 — Validation

## 9.1 Focused tests first

Use exact scripts present in `package.json`. At minimum:

```bash
npm run typecheck

npx vitest run --no-file-parallelism \
  src/stores/chat-stream-manager.test.ts \
  src/stores/chat-store.character.test.ts

npx vitest run --no-file-parallelism \
  electron/utils/rendererCsp.test.ts \
  tests/csp

npx vitest run --no-file-parallelism \
  src/agent/registry/tool-registry.test.ts \
  electron/agent/runtime/agent-tool-executor.test.ts \
  electron/agent/runtime/chat-agent-runner.test.ts \
  electron/ipc/handlers/documentAgentHandlers.test.ts

npx vitest run --no-file-parallelism \
  src/stores/chat-folder-store.test.ts \
  electron/services/chatFolderService.test.ts \
  electron/services/chatFolderBackupService.test.ts \
  electron/services/chatFolderLockService.test.ts

npx vitest run --no-file-parallelism \
  src/hooks/useCharacterImage.test.tsx \
  src/utils/characterImageResolver.test.ts \
  electron/services/characterImageCache.test.ts \
  electron/utils/characterImageCacheProtocol.test.ts

npx vitest run --no-file-parallelism \
  src/stores/media-store.test.ts \
  src/components/gallery/gallery-view.test.tsx \
  src/components/gallery/media-detail-dialog.test.tsx \
  electron/services/generatedMediaStore.test.ts
```

Adjust exact filenames only after verifying repository test conventions.

## 9.2 Contract verifiers

Run:

```bash
npm run verify:document-agent
npm run verify:workspace-contracts
npm run verify:custom-protocol-privileges
npm run verify:media-studio-power-tools
npm run verify:network-boundaries
npm run verify:venice-api-docs
npm run verify:storage-privacy
npm run verify:storage-policy
npm run verify:backup-sync
npm run verify:contracts:features:chat
npm run verify:contracts:features:image
```

Then:

```bash
npm run lint
npm run build
npm run test:electron
npm run test:ui:chat
npm run test:ui:media
npm run test:contracts
npm run verify:contracts
npm run test:ci
```

Do not claim a command passed unless it was actually run to completion.

For failures:

1. record command;
2. record exact failed suite/assertion;
3. identify whether caused by this work;
4. fix related failures;
5. mark unrelated pre-existing failures with evidence rather than editing unrelated code to force green.

# Phase 10 — Manual QA Matrix

## Persona isolation

- [ ] Start a hosted character chat and receive a character response.
- [ ] Open Standard Chat without clearing the Characters selection.
- [ ] Send to three different standard LLM models.
- [ ] Confirm none uses former character persona.
- [ ] Inspect request: no `character_slug` in standard chat.
- [ ] Return to hosted character chat: correct slug/persona remains.
- [ ] Open local character chat: local prompt works, no hosted slug.
- [ ] Restart app and repeat.

## CSP and generated images

- [ ] Generate an image through Image Studio.
- [ ] Generate an image through chat tool call.
- [ ] Confirm inline image renders without CSP error.
- [ ] Confirm Media Studio card/detail render.
- [ ] Confirm no arbitrary remote image source was added to CSP.

## Character avatars

- [ ] Load Characters view with at least 20 hosted characters.
- [ ] Confirm successful images cache once.
- [ ] Confirm failures show initials rather than broken images.
- [ ] Confirm diagnostics show classified safe error codes.
- [ ] Confirm no repeated warning storm on rerender.

## Folder menu and portability

- [ ] Right-click standard folder.
- [ ] Right-click character folder.
- [ ] Lock/unlock.
- [ ] Rename.
- [ ] Delete folder-only.
- [ ] Delete with chats.
- [ ] Export selected folder to one `.vfchat.json` file.
- [ ] Import into empty profile.
- [ ] Verify folder hierarchy and character bindings.
- [ ] Import into profile with ID/name conflicts.
- [ ] Confirm no message loss and no cross-kind assignment.
- [ ] Confirm encrypted `.vfbackup` remains available separately.

## Prompt Inspector

- [ ] Inspect standard chat layer order.
- [ ] Inspect hosted character layer order.
- [ ] Inspect local character layer order.
- [ ] Confirm immutable execution layer is first.
- [ ] Confirm date/time fixture/substitution.
- [ ] Confirm tool names equal actual schemas.
- [ ] Export inspector logs and verify no raw prompt text.
- [ ] Run persona-leak Prompt Lab fixture.

## Documents

- [ ] Select tool-capable model.
- [ ] Grant Limited Documents.
- [ ] Ask agent to create Markdown document.
- [ ] Confirm tool call executes and final model response follows.
- [ ] Read document through tool.
- [ ] Propose edit and review exact diff.
- [ ] Reject: file unchanged.
- [ ] Approve: new revision created.
- [ ] Restore old revision as new revision.
- [ ] Export original format through save dialog.
- [ ] Grant workspace.
- [ ] List nested folders and files.
- [ ] Search and read supported file.
- [ ] Propose multi-file change.
- [ ] Revoke grant and confirm immediate denial.
- [ ] Select non-tool-capable model and confirm no tools are advertised.

## Hidden Media Vault

- [ ] Configure strong Media Vault password/key wrapper.
- [ ] Hide & Lock an image.
- [ ] Hide & Lock a video.
- [ ] Confirm both disappear from normal Library.
- [ ] Confirm locked Hidden Vault shows no thumbnail/prompt.
- [ ] Wrong password fails safely.
- [ ] Correct password reveals items.
- [ ] Play locked video with seeking/volume/fullscreen after unlock.
- [ ] Restart app: vault locked.
- [ ] Auto-lock occurs.
- [ ] Export unlocked copy through save dialog.
- [ ] Move item back to visible library.
- [ ] Confirm no plaintext duplicate remains after successful migration.

# Acceptance Criteria

The work is complete only when all are true:

1. Standard conversations never receive a globally selected hosted `character_slug`.
2. Character binding comes only from the active conversation’s persisted metadata.
3. Standard system-prompt and Venice-default settings recover after leaving a character chat.
4. `venice-media://` images render under a narrowly updated CSP.
5. CSP does not permit arbitrary remote or filesystem image sources.
6. Character image errors are classified and safe.
7. The source of current avatar failures is verified rather than guessed.
8. Folder context menu supports keyboard and pointer access.
9. Folder menu provides Lock/Unlock, Rename, Delete, Import, Export, and Encrypted Backup.
10. One versioned JSON file preserves selected folder/chat/character organization.
11. JSON import has preview, validation, conflict handling, and rollback/safety behavior.
12. Encrypted `.vfbackup` remains distinct and functional.
13. Traffic Inspector displays main-process-derived prompt layer order.
14. Prompt telemetry defaults to hashes/measurements, not raw text.
15. Immutable tool/date runtime layer is first and cannot be changed by user content.
16. Documents chat uses a Documents-specific, session-bound agent runtime.
17. Model-visible workspace tools do not accept internal grant IDs.
18. Every advertised tool has matching schema, validator, executor, service, approval, result, and tests.
19. Tool execution is followed by a model turn that produces final assistant output.
20. Pending approvals pause execution and are exact-hash/base-revision bound.
21. Non-tool-capable models receive no tool schemas.
22. Hidden media is encrypted at rest, not only filtered in the UI.
23. Media Vault keys never enter renderer state.
24. Locked media cannot be read through a copied custom-protocol URL.
25. Locked videos retain working range playback after unlock.
26. Existing media and master-password data migrate without silent loss.
27. Documentation reflects the actual current state.
28. Focused tests, typecheck, lint, build, contract verification, and relevant test suites pass or have explicitly evidenced unrelated failures.

# Strict “Do Not” Rules

- Do not fix persona leakage by merely clearing UI selection on tab switch.
- Do not read global character selection from the provider request builder.
- Do not persist `character_slug` in global Venice parameters for standard chats.
- Do not broaden CSP to arbitrary `https:`, `http:`, `file:`, or `*`.
- Do not expose filesystem paths or grant IDs to the model.
- Do not trust renderer-supplied profile, grant, or workspace authorization.
- Do not advertise unimplemented tools.
- Do not retain schema/executor mismatches.
- Do not stop the agent after emitting tool results without a final model turn.
- Do not let the renderer execute filesystem, crypto, key-management, or raw provider download operations.
- Do not overwrite documents without proposal/approval rules.
- Do not replace the encrypted `.vfbackup` path with plaintext JSON.
- Do not import JSON without preview, schema validation, size limits, and conflict handling.
- Do not log raw prompt text, API keys, character system prompts, attachment contents, absolute paths, or signed URLs.
- Do not classify every character image failure as `unknown`.
- Do not add unverified avatar hosts to an allowlist.
- Do not call a media item “locked” while its bytes, thumbnail, or sensitive metadata remain plaintext.
- Do not derive encryption directly from the stored password verifier.
- Do not use a four-character password as the new media-vault cryptographic baseline.
- Do not delete plaintext media until encrypted write and decrypt verification succeed.
- Do not claim prior work-order checkboxes prove runtime behavior.
- Do not claim tests, packaged QA, or build success without execution evidence.

# Agent Implementation Checklist

## Baseline

- [ ] Record Git state, commit, Node/npm versions, package version.
- [ ] Create the 2026-07-20 remediation report.
- [ ] Reverify every finding against the live checkout.
- [ ] Record missing JSON attachment as an evidence gap rather than inventing details.

## Persona isolation

- [ ] Remove global selected-character fallback from request construction.
- [ ] Add canonical conversation persona-binding helper.
- [ ] Ensure standard request deletes stale `character_slug`.
- [ ] Verify hosted and local character prompt behavior.
- [ ] Add cross-chat/restart/retry persona-isolation tests.

## CSP

- [ ] Add `venice-media:` to `img-src` only.
- [ ] Update CSP unit/contract tests.
- [ ] Verify generated images render in all surfaces.
- [ ] Verify custom-protocol origin/access restrictions remain.

## Documents agent

- [ ] Replace generic Documents `<ChatView />` with session-aware Documents chat.
- [ ] Add dedicated typed document-agent stream IPC.
- [ ] Bind execution context to sender/profile/session in main.
- [ ] Remove model-authored workspace grant IDs.
- [ ] Reconcile `document.create` schema and executor.
- [ ] Implement or unadvertise all missing document tools.
- [ ] Correct approval grant binding.
- [ ] Implement bounded multi-turn model/tool loop.
- [ ] Add model capability and permission filtering.
- [ ] Fix media image tool schema/model/request contract.
- [ ] Add tool activity and approval UI.
- [ ] Add document/workspace security and loop tests.

## Chat folders

- [ ] Add accessible right-click/keyboard context menu.
- [ ] Wire Lock/Unlock.
- [ ] Wire Edit name.
- [ ] Add explicit delete modes.
- [ ] Define versioned `.vfchat.json` contract.
- [ ] Implement main-process export service and native save dialog.
- [ ] Implement import open dialog, validation, and preview.
- [ ] Preserve standard/character folder separation.
- [ ] Preserve hosted/local character bindings.
- [ ] Add conflict remapping and rollback/safety behavior.
- [ ] Keep encrypted `.vfbackup` separate.
- [ ] Add UI/service/IPC/import-export tests.

## Prompt layers

- [ ] Replace mutable tool layer with immutable first execution layer.
- [ ] Combine short tool rules and trusted date/time context.
- [ ] Enforce immutable priority floor.
- [ ] Generate safe prompt-composition manifests in main.
- [ ] Correlate manifests with inspector request IDs.
- [ ] Add Traffic / Prompt Layers / Prompt Lab UI.
- [ ] Add persona/tool/prompt contradiction warnings.
- [ ] Keep raw prompt text out of persistence/export.
- [ ] Add deterministic clock and production parity tests.

## Character images

- [ ] Add safe main-process character-image error codes.
- [ ] Preserve error code through IPC and renderer diagnostics.
- [ ] Verify real `photoUrl` host/path/status/content type.
- [ ] Fix only the verified upstream contract issue.
- [ ] Add in-flight dedupe, bounded concurrency, and negative cache.
- [ ] Preserve initials fallback.
- [ ] Add resolver/cache/diagnostic tests.

## Hidden Media Vault

- [ ] Define visible/vaulted media schema.
- [ ] Add strong vault setup in Master Password settings.
- [ ] Generate random Media Vault Key.
- [ ] Derive KEK and wrap MVK in main process.
- [ ] Add encrypted blob/metadata/thumbnail store.
- [ ] Add atomic migration journal and rollback.
- [ ] Remove sensitive plaintext metadata from vaulted IDB records.
- [ ] Enforce unlock in custom protocol.
- [ ] Support byte-range video playback after unlock.
- [ ] Add Hidden Vault UI and context/bulk actions.
- [ ] Add auto-lock/profile-switch/restart behavior.
- [ ] Add vault crypto, migration, protocol, UI, and export tests.

## Documentation and validation

- [ ] Reopen inaccurate prior completion claims with evidence.
- [ ] Document prompt-layer architecture.
- [ ] Document document-agent runtime and permissions.
- [ ] Document chat JSON interchange format.
- [ ] Document Media Vault threat model and recovery limits.
- [ ] Run focused tests.
- [ ] Run typecheck/lint/build.
- [ ] Run contract verifiers.
- [ ] Run relevant UI/electron/full CI suites.
- [ ] Complete packaged manual QA.
- [ ] Record every changed file and command result.
- [ ] Leave a precise remaining-risk/deferred-work section.
