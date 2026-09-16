# Venice Forge — Current-Main Deep Audit & Remediation Agent Handoff

**Audit date:** 2026-09-14  
**Repository:** `spearchucker667/Venice_Forge`  
**Canonical local root:** `/Users/super_user/Projects/Venice_Forge`  
**Authoritative branch:** `main`  
**Audited HEAD:** `f74d9c7f1c42573b1dfd405424e9424f92428627`  
**Package version:** `3.0.0-beta.3`  
**Runtime contract:** Node `>=22.15.0 <23.0.0`, npm `>=10`  
**Desktop stack:** Electron 43 / React 19 / Vite 8 / TypeScript strict / Zustand / IndexedDB  
**License:** Apache-2.0

---

# 1. Mission

Take ownership of the **current live `main` branch** and remediate every locally actionable current defect, regression, integration gap, accessibility problem, design-system inconsistency, persistence flaw, and missing regression test documented in this handoff.

This is a **current-main remediation work order**, not permission to replay older audit findings.

The repository has advanced substantially since the older August and early-September audits. Historical reports are evidence only. Verify current source before changing anything.

The implementation priorities are:

1. Repair safety/data-integrity violations first.
2. Finish the attachment/context architecture rather than applying another local cap workaround.
3. Repair persistence/hydration/profile-isolation gaps.
4. Finish the recently introduced chat/design-system accessibility work.
5. Close remaining network and Electron defense-in-depth items.
6. Update tests and current documentation.
7. Run the full validation matrix.
8. Work only on `main`; do not create a feature branch or worktree.
9. Never force-push.
10. Do not weaken an existing verifier, CSP rule, safety rule, test, or release gate to make validation pass.

---

# 2. Current Repository Posture

The repository is in substantially better condition than older audit reports imply.

Current hosted CI is green, including:

- lint and TypeScript checks;
- unit/integration suites;
- coverage;
- contract verifiers;
- macOS-sensitive tests;
- Windows-sensitive tests;
- build;
- Linux packaged Electron smoke;
- Windows packaged Electron smoke;
- macOS packaged Electron smoke.

Current CodeQL is also green.

The prior exhaustive review accounted for 1,951 tracked files, including 1,887 substantive files. That audit covered Electron main/preload/IPC, renderer stores/services/components, the Express server, CI/release workflows, scripts, tests, documentation, storage, sync, encryption, API transports, SSE handling, i18n, theme infrastructure, and the generated-media paths.

The important implication is:

> Do not treat green CI as evidence that the application is defect-free. Most findings in this handoff are cross-component semantic failures where the individual units still satisfy their own tests.

---

# 3. Findings Summary

## Newly confirmed current defects

| ID | Severity | Area | Finding |
|---|---:|---|---|
| VF-CUR-P1-001 | P1 | Safety / Persistence | Mandatory-safety-blocked chat turns are still persisted |
| VF-CUR-P1-002 | P1 | Safety / Attachments | Attachment provenance envelope interpolates unescaped user-controlled attributes |
| VF-CUR-P2-001 | P2 | Context Budget | Attachment allowance budgets the wrong effective system prompt |
| VF-CUR-P2-002 | P2 | Attachments | Per-attachment `truncated` metadata is derived from one global flag |
| VF-CUR-P2-003 | P2 | Attachments | Extraction limits remain fixed and model-independent |
| VF-CUR-P2-004 | P2 | Attachments | Admission is all-or-nothing instead of chunk/prefix aware |
| VF-CUR-P2-005 | P2 | Documents | Chat attachment and Document Agent registration limits disagree |
| VF-CUR-P2-006 | P2 | Chat UI | Context meter materially under-reports the pending request |
| VF-CUR-P2-007 | P2 | Chat Context | Prior-conversation selector can represent more context than actually gets sent |
| VF-CUR-P2-008 | P2 | Persistence | `workflow-store` and `playground-store` still lack async hydration arbitration |
| VF-CUR-P2-009 | P2 | Profiles | Volatile profile reset does not clear the complete profile-scoped store inventory |
| VF-CUR-P2-010 | P2 | Accessibility | Newly portaled context selector remains incomplete as an accessible popover/dialog |
| VF-CUR-P2-011 | P2 | Accessibility | Reasoning disclosure lacks expanded/controlled-region semantics |
| VF-CUR-P2-012 | P2 | Accessibility | Chat attachment controls remain below the newer target-size contract |
| VF-CUR-P2-013 | P2 risk | Web Proxy | Web Family Safe Mode still buffers complete SSE responses before inspection |
| VF-CUR-P2-014 | P2 risk | Reliability | Ordinary Venice fetch retries omit transient 502/504 responses |

## Current low-severity/debt items

| ID | Severity | Finding |
|---|---:|---|
| VF-CUR-P3-001 | P3 | Renderer attachment registration still performs a base64 round-trip |
| VF-CUR-P3-002 | P3 | `media-store.patchMany()` can diverge from IndexedDB on partial write success |
| VF-CUR-P3-003 | P3 | Message context labels and `"Message actions"` remain hardcoded English |
| VF-CUR-P3-004 | P3 | Font settings still use extensive arbitrary pixel type sizes |
| VF-CUR-P3-005 | P3 | Font summaries and `"Default"` remain English-only; range value semantics incomplete |
| VF-CUR-P3-006 | P3 | User message width remains `max-w-[78%]`; message actions bypass `Toolbar` |
| VF-CUR-P3-007 | P3 | Shared `Input` primitive itself contains arbitrary pixel typography |
| VF-CUR-P3-008 | P3 | Markdown link underline remains fixed Venice teal across themes |
| VF-CUR-P3-009 | P3 latent | `IconButton.asPlainButton` advertises keyboard behavior it does not implement |
| VF-CUR-P3-010 | P3 latent | `Toolbar` declares ARIA toolbar semantics without implementing toolbar interaction semantics |
| VF-CUR-P3-011 | P3 test debt | `OnboardingSplash` tests still produce asynchronous `act(...)` warning debt |

## Security/design hardening still open

- Add `will-redirect` protection in Electron navigation handling.
- Add `session.setPermissionCheckHandler()` alongside the permission request handler.
- Add a fallback renderer `<meta http-equiv="Content-Security-Policy">`.
- Support explicit CORS `OPTIONS` behavior in the web proxy.
- Resolve Windows PowerShell from a trusted system path rather than PATH.
- Decide and document attachment `providerContext` retention semantics.
- Implement the deferred local semantic generated-image classifier or explicitly continue accepting structural-only screening.

## External acceptance remains incomplete

- signed/notarized macOS production artifacts;
- signed Windows production artifacts;
- authorized funded-provider acceptance;
- physical two-device sync/recovery validation;
- headed accessibility testing;
- qualified human review of all non-English locales;
- cross-theme visual acceptance of generated theme variants and recent chat/design-system changes.

---

# 4. P1 — Mandatory-Safety-Blocked Chat Turns Are Persisted

## Affected code

- `src/hooks/use-chat.ts`
- `src/stores/chat-stream-manager.ts`
- `src/stores/chat-store.ts`
- `src/stores/chat-store-helpers.ts`
- `src/shared/safety/childExploitationGuard.ts`

## Current flow

`useChat.send()` does approximately:

```text
build user message
    ↓
addMessage(user)
    ↓
addMessage(empty assistant placeholder)
    ↓
startStream()
    ↓
main-process safety guard
```

When the main-process mandatory guard returns a 451, `chat-stream-manager.ts`:

1. recognizes `SafetyGuardBlockedError` / status 451;
2. removes the last assistant placeholder;
3. adds an error response;
4. leaves the user message in the conversation;
5. runs final conversation persistence.

The safety guard's own contract states that blocked requests are not forwarded **and not persisted**.

The first half is true.

The second half is not.

## Impact

A request rejected by the mandatory non-disableable safety layer can remain in:

- in-memory conversation history;
- encrypted web chat storage;
- encrypted desktop conversation storage;
- subsequent sync/export paths that serialize the conversation.

This is a direct safety/privacy contract violation.

## Required repair

Do not solve this only by deleting the user turn after the 451. A debounced or concurrent save may already have persisted it.

Use one of these architectural approaches:

### Preferred

Create an authoritative preflight transaction:

```text
draft user turn
   ↓
compile exact outbound safety payload
   ↓
main-process safety preflight
   ↓
ALLOW ──► commit user turn to persistent conversation
             ↓
          start provider stream

BLOCK ──► discard transient turn
```

The actual request path must still enforce the guard.

Avoid introducing a renderer-only authority.

A request hash/ticket can bind the preflight result to the exact compiled payload if necessary to prevent divergence between preflight and dispatch.

### Alternative

Add an explicit transient/pending message state that:

- can render in Chat;
- participates in request compilation;
- is excluded by every persistence serializer;
- becomes durable only after the main process confirms safety acceptance;
- is atomically removed on rejection.

## Tests required

Add a cross-layer test that:

1. starts with an existing conversation;
2. attempts an unsafe turn;
3. receives a 451;
4. verifies provider dispatch never occurred;
5. verifies the new user turn is absent from `useChatStore`;
6. verifies the empty assistant placeholder is absent;
7. verifies the durable `ConversationRecordV1` does not contain the blocked text;
8. verifies a valid following message still sends normally.

Also test the failure race with persistence flushing enabled.

## Acceptance criteria

A mandatory guard rejection must result in **zero durable representation of the blocked turn**.

---

# 5. P1 — Attachment Provenance Envelope Is Not Safely Serialized

## Affected code

- `src/hooks/use-chat.ts`
- `src/services/ingestion/xmlEscape.ts`
- `src/shared/safety/childExploitationGuard.ts`
- all ingestion paths returning `IngestedAttachment`

## Current code shape

The outer provider context currently resembles:

```ts
`<external_attachment
  id="${att.id}"
  name="${att.name}"
  mime="${att.mimeType}">
...
${att.text}
</external_attachment>`
```

`att.name` originates from the local user-controlled filename.

`att.mimeType` is also external metadata.

The existing ingestion system already has XML escaping helpers because filenames and document contents cannot safely be interpolated into prompt delimiters raw.

The newly added outer provenance wrapper bypasses that established contract.

## Why this matters

The safety guard now separates instruction text from quoted attachment material by parsing:

```text
<external_attachment ...>
...
</external_attachment>
```

If attacker-controlled metadata can modify that serialized structure, it can corrupt the provenance boundary.

Examples that must be tested include filenames containing:

```text
"
>
<
&
</external_attachment>
<external_attachment>
newlines
```

This can:

- cause attachment content to be reclassified as instruction text;
- resurrect the 451 false-positive class that provenance separation was designed to fix;
- break attachment segmentation;
- invalidate model-facing trust markers.

## Required repair

Do not create a second custom escaping implementation.

Prefer:

```text
single canonical external-attachment envelope builder
    ↓
escapeXmlAttribute(id)
escapeXmlAttribute(name)
escapeXmlAttribute(mimeType)
    ↓
validated/escaped document payload
```

Better still, stop making the safety boundary recover provenance by regex-parsing a serialized prompt.

Preserve structured segments:

```ts
{
  instructionText,
  quotedAttachments: [
    {
      id,
      name,
      mimeType,
      text
    }
  ]
}
```

Run safety classification against those typed segments.

Serialize them into provider text only **after** the safety/provenance decision.

## Tests required

At minimum:

- quotes in filename;
- `<` / `>` / `&`;
- literal closing envelope string;
- nested envelope string;
- newline/control-like filename;
- hostile MIME string;
- benign unusual Unicode filename;
- unambiguous CSAM phrase in quoted attachment still hard-blocks;
- contextual/analytical youth wording in quoted data remains distinguished from user intent;
- same unsafe phrase in instruction text still blocks.

## Non-negotiable

Do **not** fix this by excluding attachment text from the mandatory safety guard.

The current requirement that unambiguous CSAM material remains hard-blocked must remain intact.

---

# 6. P2 — Attachment Budget Uses the Wrong System Prompt

## Affected code

- `src/hooks/use-chat.ts`
- `src/services/chatPromptCompiler.ts`
- `src/components/chat/chat-view.tsx`
- `src/services/chatContextBudget.ts`

There are currently multiple implementations of "what system prompt applies to this chat?"

`compileChatPrompt()` resolves:

- `systemPromptMode`;
- conversation override;
- inherited global prompt;
- character prompt;
- hosted-character behavior.

`ChatContextMeterContent` duplicates similar logic.

Attachment admission in `use-chat.ts`, however, currently feeds the budgeter the global store prompt instead of the exact effective prompt for that conversation.

## Failure examples

### Disabled mode

Actual prompt:

```text
0 tokens
```

Attachment admission reserves:

```text
global prompt tokens
```

Result: attachments are unnecessarily restricted.

### Conversation override

Actual prompt:

```text
large conversation-specific prompt
```

Attachment budget may use:

```text
smaller global prompt
```

Result: too much attachment content is admitted and the compiler later has to compact/truncate.

### Character chat

Attachment budgeting can diverge from character prompt/hosted-character semantics.

## Required repair

Extract one pure canonical function, for example:

```ts
resolveEffectiveChatPromptContext(
  conversation,
  globalSystemPrompt,
  includeVeniceSystemPrompt
)
```

Return enough information for all consumers:

```ts
{
  effectiveSystemPrompt,
  hostedCharacter,
  includeVeniceSystemPrompt,
  characterPromptTokens,
  ...
}
```

Use it from:

- prompt compiler;
- attachment allowance;
- context meter;
- any request preview/debug surface.

There must be one source of truth.

## Tests

Matrix:

| Mode | Conversation | Expected |
|---|---|---|
| inherit | standard | global prompt |
| override | standard | conversation prompt |
| disabled | standard | no user system prompt |
| inherit | local character | character prompt |
| hosted character | hosted | hosted-character semantics |
| override | long prompt | allowance shrinks accordingly |

Run each against at least:

- ~128K model;
- ~200K model;
- ~1M model.

---

# 7. P2 — `truncated` Attachment Metadata Is Not Per-Attachment

## Affected code

`src/hooks/use-chat.ts`

One global `contextTruncated` flag is updated while walking attachments.

That flag is then copied into each later `attachmentRef`.

Once any attachment fails admission, later attachment refs can inherit `truncated: true` even when that specific attachment was successfully included.

Conversely, an attachment already truncated during ingestion can end up recorded as `truncated: false` because `att.extraction.truncated` is not correctly combined with provider admission state.

## Required model

Use distinct state:

```ts
let anyContextOmitted = false;

for (const att of attachments) {
  const omittedByContext = ...
  const extractionTruncated = att.extraction.truncated === true;

  attachmentRefs.push({
    ...
    truncated: extractionTruncated || omittedByContext
  });

  anyContextOmitted ||= omittedByContext;
}
```

If useful, make the metadata more explicit:

```ts
{
  extractionTruncated: boolean,
  omittedByContextBudget: boolean,
  contextIncluded: boolean
}
```

## Tests

Cover:

```text
included text
omitted large text
included small text
image after omitted text
extraction-truncated but otherwise fully admitted
```

Each ref must report its own state accurately.

---

# 8. P2 — Model-Aware Admission Is Still Limited by Model-Unaware Extraction

Current model-aware context admission fixed the previous fixed 1 MiB prompt-budget defect.

That repair does not remove extraction-stage caps.

Current extraction limits still include approximately:

```text
MAX_EXTRACTED_TEXT_CHARS = 100,000
MAX_CODE_CHARS_PER_FILE = 120,000
```

The current roadmap explicitly records this as deferred.

A 1M-token model therefore cannot make meaningful use of its full context window for one large text/code attachment because most of the source is discarded before the model-aware budgeter sees it.

## Do not fix by simply increasing constants

Those limits also provide bounded-memory / denial-of-service protection.

## Required architecture

Move from:

```text
file
  ↓
extract one giant string
  ↓
truncate globally
  ↓
prompt budget
```

to:

```text
file
  ↓
bounded streaming/chunk extraction
  ↓
typed chunks + provenance
  ↓
model-aware available token budget
  ↓
chunk selection
  ↓
provider request
```

Chunk metadata should include:

```ts
{
  attachmentId,
  chunkIndex,
  startOffset,
  endOffset,
  tokenEstimate,
  text,
  provenance
}
```

Preserve enough metadata to tell the UI whether the complete file, a prefix, or selected chunks were sent.

---

# 9. P2 — Attachment Admission Is All-or-Nothing

Even after model-aware allowance was introduced, each extracted `att.text` is admitted as one indivisible unit.

If:

```text
remaining input budget = 70K tokens
attachment = 85K tokens
```

the application can omit the whole document instead of using the 70K available window.

This is particularly wasteful on large-context models.

This should be solved together with chunked extraction rather than by adding a second string-slicing workaround.

## Acceptance

For large text documents:

- maximize useful selected content without exceeding the model budget;
- preserve deterministic ordering;
- report partial inclusion;
- never silently claim the whole document was used.

---

# 10. P2 — Chat Attachment and Document Agent Size Contracts Disagree

## Current behavior

Chat ingestion supports substantially larger files than the renderer-side attachment registry path.

`registerAttachment()` in `src/services/attachmentService.ts` immediately returns `undefined` when:

```ts
file.size > MAX_ATTACHMENT_FILE_BYTES
```

The renderer constant is currently only:

```text
256 KiB
```

The main attachment registry itself currently permits up to 1 MiB per record.

Meanwhile other chat ingestion routes allow larger classes, including multi-megabyte PDF/DOCX/image inputs.

The UI intentionally treats registry registration failure as non-fatal.

The visible consequence is that a file can:

1. successfully attach to Chat;
2. successfully be sent to the model;
3. silently lack an opaque `attachmentId`;
4. therefore never show the normal Document Agent promotion/save path.

This is especially likely with PDFs.

## Required repair

First decide the canonical product contract:

```text
"Files accepted in Chat may also be promoted to Documents"
```

or:

```text
"Some attachments are chat-only"
```

If promotion is expected, do not use the 256 KiB registry path as the limiting bridge.

Prefer:

- direct `Uint8Array` structured clone where bounded;
- main-process temporary file/attachment handles for larger input;
- explicit per-type limits;
- promotion directly from the original `File` while it is still staged.

If large attachments intentionally cannot be promoted, show this explicitly:

```text
This file can be used in Chat but is too large for Document Agent promotion.
```

Do not silently hide the capability.

## Required tests

At minimum test:

- 200 KiB text;
- 300 KiB text;
- 900 KiB text;
- 2 MiB PDF;
- representative near-maximum PDF;
- image;
- failed main registry registration.

---

# 11. P3 — Renderer Still Base64-Encodes Attachment Registration

The main attachment registry explicitly supports `Uint8Array` as the preferred input.

The renderer still:

1. reads an `ArrayBuffer`;
2. converts bytes into a JavaScript binary string;
3. calls `btoa`;
4. transfers base64;
5. decodes again in main.

This creates:

- roughly 33% base64 expansion;
- temporary byte array;
- temporary binary string;
- temporary base64 string;
- extra CPU.

The current low 256 KiB cap masks much of the cost.

If attachment promotion limits are expanded, this path should be repaired simultaneously.

Use structured-cloned `Uint8Array`.

Keep base64 only as a backwards-compatible migration path if actually needed.

---

# 12. P2 — Chat Context Meter Does Not Represent the Pending Request

The current meter calculates from:

- persisted conversation messages;
- current draft text;
- system prompt.

It does not faithfully include all material that can be sent by the next click:

- staged attachment text;
- image token estimates;
- selected prior-conversation context;
- pending memory context;
- approved memory context;
- exact external attachment envelope overhead;
- provider tool schemas;
- other request-time injected context.

The meter therefore may display a comfortable percentage while sending the message triggers:

- compaction;
- attachment omission;
- output-token reduction;
- content truncation.

## Required repair

Build a single `DraftRequestBudget` path based on the same structured inputs used by `send()` and `compileChatPrompt()`.

Suggested shape:

```ts
interface DraftRequestBudgetInput {
  conversation;
  draftText;
  attachments;
  memoryContext;
  priorConversationContext;
  effectiveSystemPrompt;
  selectedModel;
  requestedOutputTokens;
  enabledTools;
}
```

Expose a component breakdown:

```text
Conversation
System
Memory
Attachments
Tools
Output reserve
Remaining
```

Label the result as an **estimate**.

The same budget function must be used for request preparation.

---

# 13. P2 — Prior-Conversation Context UI Can Lie About the Sent Context

Current context selection has multiple caps:

- UI shows only a subset of available conversations;
- sender has a maximum conversation inclusion count;
- per-conversation message count is capped;
- message content is capped;
- aggregate prior-context text is capped.

The UI can visually represent more selected context than ultimately contributes to the request.

A user can therefore think eight conversations are attached while the provider receives only a subset.

## Required repair

Make the builder return structure rather than only text:

```ts
{
  text,
  requestedConversationIds,
  includedConversationIds,
  omittedConversationIds,
  truncatedMessageCount,
  warnings
}
```

The UI should:

- visibly enforce or explain the maximum;
- provide search/show-more rather than silently showing only the first subset;
- identify omitted selections before send;
- surface aggregate truncation;
- include the same estimated tokens in the context meter.

Also repair the current add/remove label composition so localized action text and conversation title do not run together.

---

# 14. P2 — Zustand Async Hydration Race Remains in Workflow and Playground Stores

The September 13 audit identified this issue and current source remains unchanged.

Affected stores include:

- `src/stores/workflow-store.ts`
- `src/stores/playground-store.ts`

They use asynchronous IndexedDB-backed Zustand persistence without:

- `onRehydrateStorage`;
- hydration state;
- explicit merge arbitration.

## Failure mode

Possible sequence:

```text
store initializes with defaults
    ↓
async IndexedDB read starts
    ↓
user creates/edits something
    ↓
rehydration completes
    ↓
persisted snapshot replaces or conflicts with early mutation
```

This creates first-load mutation loss/race behavior.

## Required repair

Add an explicit hydration contract.

For example:

```ts
isHydrated: false
```

then:

```ts
onRehydrateStorage: () => (state, error) => {
  ...
  state?.markHydrated()
}
```

Critical mutations should either:

- wait for hydration;
- merge safely with pending changes; or
- be impossible until hydration completes.

Follow current Zustand guidance rather than assuming synchronous persist semantics.

## Tests

Simulate delayed async storage:

1. start hydration;
2. mutate state before resolution;
3. resolve persisted state;
4. assert the user mutation is retained according to the intended merge contract.

---

# 15. P2 — Profile-Switch Volatile Reset Is Incomplete

`useProfileVolatileReset.ts` currently resets a limited set:

- image workspace;
- inspector logs;
- chats;
- active workflow template;
- background task map.

The prior audit found a larger inventory of profile-scoped persistent/in-memory stores.

The page reload is treated as the ultimate purge, but the hook itself claims to provide a synchronous clean data-layer slate.

Those claims do not currently match.

## Required repair

Do not maintain a fragile hand-authored subset forever.

Create a documented reset registry, e.g.:

```ts
const PROFILE_SCOPED_RESETS = [
  resetChats,
  resetMedia,
  resetProjects,
  resetPrompts,
  resetScenes,
  resetRp,
  resetResearch,
  resetWorkflows,
  ...
]
```

Every profile-scoped store must declare its reset/hydrate behavior.

## Acceptance

Immediately after profile switch notification and before page reload:

- no previous-profile entity should remain accessible through a profile-scoped store;
- no delayed persistence callback may rewrite it into the new profile;
- failed/rejected reload should still leave clean state.

---

# 16. P3 — `media-store.patchMany()` Can Diverge From IndexedDB

This is an unresolved September 13 finding and the current source pattern remains.

`StorageService.bulkPatchMedia(ids, patch)` returns only a count.

If some requested IDs succeed and others fail/miss, `patchMany()` cannot identify which records were actually updated.

Current in-memory update logic can then patch all requested IDs whenever the returned count is nonzero.

## Result

Memory can temporarily claim:

```text
A updated
B updated
C updated
```

while durable storage actually contains:

```text
A updated
B unchanged
C unchanged
```

## Required repair

Change the storage contract to return concrete IDs:

```ts
{
  updatedIds: string[],
  missingIds: string[],
  failedIds: string[]
}
```

Only patch in-memory entities in `updatedIds`.

Add partial-success regression coverage.

---

# 17. P2 — Current Context Popover Still Needs Accessibility/Positioning Completion

Current HEAD introduced the portal fix for the Chat context menu so it is no longer clipped by composer overflow.

That fixes the clipping symptom.

The resulting popover still needs a full accessibility and positioning pass.

Verify/fix:

- trigger `aria-haspopup`;
- `aria-expanded`;
- `aria-controls`;
- accessible popup label/title;
- intentional focus movement;
- focus restoration when closed;
- Escape;
- outside click;
- keyboard navigation;
- screen-reader announcement;
- viewport edge collision;
- scroll tracking;
- window resize tracking;
- dynamic-height repositioning after nested controls expand;
- RTL placement.

The current implementation recalculates for resize but should also be checked when the anchor moves because of scroll/layout changes.

Use a shared popover positioning abstraction rather than expanding one-off coordinate code.

Current source comments state manual UI QA of the newest portal fix has not yet been completed. Treat that as an explicit acceptance requirement.

---

# 18. P2 — Reasoning Toggle Is Missing Disclosure Semantics

In `src/components/chat/message-bubble.tsx`, the reasoning control toggles content using local `reasoningOpen` state.

It needs:

```tsx
aria-expanded={reasoningOpen}
aria-controls={reasoningPanelId}
```

and a corresponding stable panel ID.

Verify keyboard and screen-reader behavior.

A semantic `<details>/<summary>` structure may be considered if compatible with styling and state requirements.

---

# 19. P2 — Attachment Action Controls Are Undersized

Current composer controls include hit targets approximately:

```text
20 × 20
~22 × 22
```

The recently introduced shared `IconButton` small size is 28×28.

Use the shared primitive for:

- image attachment removal;
- document attachment removal;
- save/promote actions where appropriate.

This improves:

- WCAG 2.2 target-size readiness;
- motor accessibility;
- focus consistency;
- theme consistency;
- hover/focus styling.

Do not unnecessarily enlarge the visual glyph; enlarge the interactive target.

---

# 20. P3 — Chat Localization Gaps Remain

`message-bubble.tsx` still contains hardcoded display labels such as:

```text
Memory
Prior context
Approved context
Mixed context
Injected context
Message actions
```

These should be mapped to translation keys.

Do not pass translated strings into state/storage.

Store the enum and translate at render time.

---

# 21. P3 — Typography Panel Has Not Finished Migrating to the Semantic Type System

`FontSettingsPanel.tsx` still contains many values such as:

```text
text-[14.5px]
text-[12px]
text-[12.5px]
text-[11px]
text-[13.5px]
text-[11.5px]
text-[10.5px]
```

The newer design system already defines semantic typography utilities.

Migrate this surface to:

```text
vf-h2
vf-body
vf-meta
vf-tag
```

or corresponding documented semantic tokens.

Do not add another set of arbitrary sizes.

Also inspect the shared `Input` primitive: it currently uses arbitrary pixel text sizes itself, which prevents full semantic-scale consistency.

---

# 22. P3 — Font Settings Localization and Slider Semantics Are Incomplete

Remaining issues include:

- `" · Default"` hardcoded in English;
- option summaries hardcoded English;
- category/description strings bypassing full translation;
- range control lacks useful localized `aria-valuetext`.

A screen reader should receive something equivalent to:

```text
18 pixels, 113 percent
```

or:

```text
16 pixels, 100 percent, default
```

in the selected locale.

Test at least:

- English;
- German or Portuguese for longer strings;
- Arabic for RTL.

---

# 23. P3 — Chat Design-System Migration Is Incomplete

Current user-message layout still contains:

```text
max-w-[78%]
```

instead of a named design token.

The message action row remains a bespoke flex group instead of the new shared `Toolbar`.

Before converting it, fix the Toolbar semantic contract described below.

Use named width/spacing tokens so future theme/layout work does not depend on one-off percentages.

---

# 24. P3 — `IconButton.asPlainButton` Has a False Accessibility Contract

The primitive describes the `div role="button"` mode as supporting keyboard behavior.

It currently provides the role and tab index but does not synthesize Space/Enter activation.

No significant production usage was found, making this a latent defect rather than a currently widespread one.

Preferred remediation:

> Remove `asPlainButton` if there is no concrete need for a faux button.

If it must remain:

- Enter activates;
- Space activates without scrolling;
- disabled behavior is respected;
- focus semantics match a button;
- tests cover keyboard activation.

Native `<button>` should remain the default.

---

# 25. P3 — Toolbar ARIA Contract Is Incomplete

The shared `Toolbar` always emits:

```text
role="toolbar"
```

while its implementation does not supply a complete composite-widget behavior.

Before broadly adopting it, decide one of two contracts:

### Option A — generic visual action group

Do not emit `role="toolbar"` by default.

### Option B — real ARIA toolbar

Provide:

- accessible name;
- documented arrow-key interaction;
- focus strategy/roving tabindex where appropriate;
- orientation where needed;
- tests.

Do not claim semantic behavior the primitive does not implement.

---

# 26. P3 — One Fixed Venice Color Still Leaks Across Themes

`src/styles/theme.css` currently gives Markdown links theme-aware text color but a fixed Venice-teal underline:

```css
text-decoration-color: rgba(110, 231, 211, 0.4);
```

It is explicitly allowlisted from the theme verifier.

The result can look incorrect under:

- Dracula;
- Nord;
- Catppuccin;
- other custom theme accents.

Replace with a semantic expression such as a color mix derived from the active accent.

The allowlist should not be used to preserve avoidable visual inconsistency.

---

# 27. P2 Risk — Web Safe Mode Buffers Complete SSE Responses

The web/Express Family Safe Mode path still collects response chunks and uses `Buffer.concat(...)` before safety inspection.

That has two undesirable effects:

1. true streaming behavior is lost while screening is active;
2. memory consumption scales with the complete generated response.

This is already recorded as an unresolved design risk.

## Required design

Implement bounded incremental inspection.

Possible architecture:

```text
provider SSE
   ↓
SSE event decoder
   ↓
bounded safety accumulator/window
   ↓
guard
   ↓
release safe event to client
```

Keep a strict maximum buffered amount.

Do not simply stream uninspected content first and screen later.

---

# 28. P2 Risk — Normal Venice Fetch Retries Omit 502 and 504

Streaming Chat's retry list already contains:

```text
408, 429, 500, 502, 503, 504
```

The canonical ordinary fetch path still uses a narrower retry set that includes:

```text
429, 500, 503
```

but excludes:

```text
502
504
```

Those are common transient gateway failures.

Reconcile the retry policy in a shared helper.

Respect idempotency:

- do not blindly retry irreversible POST operations;
- retain the existing `resolveRetryEnabled()` policy;
- only expand statuses when the call is already retry-enabled.

Add 502/504 tests.

---

# 29. P3 — Attachment `providerContext` Retention Needs an Explicit Product Contract

Current messages store attachment text in:

```text
message.metadata.providerContext
```

`toConversationRecord()` serializes message objects without stripping that metadata.

Desktop conversation storage is encrypted, and web chat storage is also configured as an encrypted store.

So this is not a plaintext-at-rest finding.

It is a **retention-contract ambiguity**.

The implementation means extracted attachment text can remain part of durable conversation state and therefore be available on subsequent turns.

The current terminology repeatedly calls it "provider-only", which can easily be interpreted as ephemeral provider-request data.

Decide explicitly:

### If persistence is desired

Document that:

- extracted attachment text is retained as encrypted conversation context;
- it may be resent on later turns;
- deletion of the chat deletes that context;
- sync/backup implications are understood.

### If persistence is not desired

Move attachment payload context into an ephemeral/request-scoped store and preserve only safe `ChatAttachmentRef` metadata in the durable message.

Add a retention regression test either way.

---

# 30. P2 Risk — Generated-Media Safety Remains Structural, Not Semantic

Current `mediaScreener.ts` truthfully reports no production semantic classifier by default.

Current image fallback checks structural properties such as:

- MIME/magic consistency;
- tiny tracking-pixel-like images;
- basic validity.

It does **not** semantically classify image content.

Audio/video semantic classification is also unavailable.

This is an acknowledged current roadmap item, not a newly introduced regression.

Do not falsely rename the structural checker a semantic classifier.

If Family Safe Mode requirements demand semantic generated-image inspection, execute a separate classifier integration work order:

1. choose an on-device model;
2. review license/supply chain;
3. define supported platforms;
4. bound memory/startup cost;
5. define confidence thresholds;
6. build false-positive/false-negative test corpus;
7. fail safely if model initialization fails;
8. expose actual capability in diagnostics.

Audio/video should remain explicitly "unavailable" until a real implementation exists.

---

# 31. Current Electron Hardening — Improvements, Not Emergency Vulnerabilities

Core Electron posture is currently sound:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
```

privileged IPC uses central sender validation, and external window/navigation handling is constrained.

Do not weaken those controls.

Remaining defense-in-depth work:

## IMP-001 — `will-redirect`

Add a navigation guard for redirects, not just ordinary navigation.

## IMP-002 — Permission check handler

Add:

```ts
session.defaultSession.setPermissionCheckHandler(...)
```

alongside the request handler so check-only permission paths also fail closed.

## IMP-003 — fallback CSP

Add a baseline CSP `<meta>` in `index.html` as defense-in-depth.

The dynamic nonce/header CSP remains authoritative.

Do not introduce a weaker meta policy.

## IMP-004 — pinned PowerShell path

On Windows, resolve the trusted system PowerShell executable directly rather than relying on an unqualified executable name found via PATH.

Follow `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` or another explicitly validated canonical system path.

---

# 32. Web Proxy Improvement — Explicit CORS Preflight

The prior current audit also retained explicit `OPTIONS`/CORS preflight support as an improvement.

If the web frontend is intended to service cross-origin development/configurations, add deterministic OPTIONS handling with the same origin policy as the actual request.

Do not broaden CORS to `*` unless the endpoint contract explicitly requires public cross-origin access.

---

# 33. P3 Test Debt — `OnboardingSplash` Async Warnings

Current tests have historically emitted Testing Library warnings around async splash transitions and missing `act(...)` wrapping.

They do not currently fail CI.

Still fix them.

Warnings in successful tests hide real lifecycle defects and train maintainers to ignore stderr.

Use user-visible state transitions with `findBy*`, `waitFor`, or appropriately wrapped timers rather than suppressing the warnings.

Do not globally silence React testing warnings.

---

# 34. Native-Language Review Is Still Incomplete

All eleven non-English locale review records remain machine-first-pass rather than qualified-human reviewed.

Affected production locales include:

- Spanish;
- French;
- German;
- Portuguese (Brazil);
- Russian;
- Simplified Chinese;
- Japanese;
- Hindi;
- Arabic;
- Korean;
- Swedish.

Structural translation coverage and strict i18n checks are not equivalent to native-quality review.

Do not mark these locales `isProductionComplete: true` until reviewer/date evidence exists.

Arabic must receive explicit RTL visual review.

---

# 35. Visual / Design Acceptance Still Required

The source-level design review found no reason to undo the new design system, but current visual acceptance remains incomplete.

Run headed QA across:

## Representative themes

- Forge Graphite;
- Forge Daylight;
- Venice;
- Dracula;
- Catppuccin;
- Nord;
- at least one custom imported theme.

## Font settings

- minimum size;
- default size;
- maximum size;
- Meslo;
- Inter;
- serif;
- system font.

## Locales

- `en-US`;
- a long-string Latin locale such as `de` or `pt-BR`;
- `ar` RTL.

## Windows/layouts

At least:

```text
1280×720
1440×900
1920×1080
narrow/split-pane configuration
```

## Critical surfaces

- Chat;
- context selector popup;
- attachment cards;
- reasoning disclosure;
- message action controls;
- Settings typography;
- Theme Maker;
- custom theme import/export;
- Media Studio;
- Document Agent;
- RP Studio;
- command palette;
- dialogs/popovers;
- onboarding.

Check:

- clipping;
- popover positioning;
- contrast;
- focus visibility;
- keyboard-only navigation;
- forced-colors;
- reduced-motion;
- RTL;
- text scaling;
- target sizes;
- theme semantic consistency.

---

# 36. External Release Acceptance

These cannot be closed by ordinary unit tests.

Do not claim production release readiness until evidence exists for:

### macOS

- signed release;
- notarization success;
- stapler validation;
- Gatekeeper validation;
- clean-machine launch.

### Windows

- Authenticode-valid installer;
- clean install;
- launch;
- uninstall;
- user-data retention behavior.

### Paid providers

With explicit authorization only:

- image;
- video;
- audio/music;
- any paid provider adapter that current release claims to support;
- restart/recovery of paid queued tasks.

### Sync

Use two real devices or VMs:

```text
A edits
B receives
B edits
A receives
delete/tombstone
conflict
offline/reconnect
restart recovery
```

### Accessibility

Headed keyboard and screen-reader validation.

### Localization

Qualified native review evidence.

---

# 37. Findings Explicitly Excluded Because They Are Already Fixed

Do **not** reopen these unless current reproduction proves regression.

## Model normalization / 8K fallback

Current main now canonically normalizes:

```text
model_spec.availableContextTokens
context_length
contextLength
```

into the chat model contract.

The previously observed silent 8,192-token fallback caused by raw model metadata has been remediated.

## Fixed 1 MiB request admission

Attachment provider-context admission is now model-aware.

The remaining issue is extraction/chunking, not the old fixed request ceiling.

## Attachment safety provenance false positives

The guard now distinguishes quoted `<external_attachment>` content from direct user instruction for contextual heuristics.

Do not remove this behavior.

The current finding is about unsafe **serialization of that provenance boundary**, not whether the boundary should exist.

## Long single-message context overflow

The prompt compiler now has content truncation/compaction fallback for a too-large newest turn.

Do not remove it.

## Typography root scaling

Changing font size no longer scales every `rem`-derived geometry token.

Already fixed.

## Theme accent-soft semantic color

Already repaired.

## Status Pill semantic foregrounds

Already repaired.

## Persisted invalid font IDs

Canonicalization was added.

Already repaired.

## Sidebar drag high-frequency persistent store writes

Already remediated.

Do not replay the stale HQE finding.

## September 13 P1 findings

Already repaired:

- strict i18n placeholder release blocker;
- profile-switch dirty-chat flush race;
- remote tombstone mutation authority mismatch;
- CRLF SSE split decoding defect.

## Current CI

Do not begin by "fixing CI".

Current hosted CI and CodeQL are green.

---

# 38. Recommended Implementation Order

## Phase 0 — Baseline

Before changing source:

```bash
cd /Users/super_user/Projects/Venice_Forge

git status --short
git branch --show-current
git rev-parse HEAD
node --version
npm --version
```

Required baseline:

```text
branch: main
HEAD: f74d9c7f1c42573b1dfd405424e9424f92428627
```

If `main` advanced, treat the new SHA as authoritative and revalidate each finding before touching it.

Do not reset away unrelated local work.

---

## Phase 1 — Safety and Trust-Boundary Repairs

Repair only:

1. VF-CUR-P1-001 blocked-turn persistence;
2. VF-CUR-P1-002 attachment provenance serialization.

Write failing tests before implementation.

Run focused safety/chat tests after each fix.

Do not bundle UI refactoring into this phase.

---

## Phase 2 — Unify Chat Context Accounting

Implement:

1. shared effective-system-prompt resolver;
2. per-attachment truncation metadata;
3. exact attachment envelope token accounting;
4. structured draft context budget;
5. prior-context structured result/warnings.

Make:

```text
meter
attachment admission
compiler
final request
```

derive from the same contracts.

---

## Phase 3 — Attachment Chunking and Document Promotion

Implement:

1. bounded chunk extraction;
2. model-aware chunk selection;
3. partial-use metadata;
4. promotion contract;
5. `Uint8Array` registration;
6. user-visible large-file behavior.

Do not globally remove file-size safety caps.

---

## Phase 4 — Persistence / Profile Correctness

Repair:

1. workflow async hydration;
2. playground async hydration;
3. complete profile-scoped reset registry;
4. `media-store.patchMany` partial-success semantics.

Add deterministic delayed-storage tests.

---

## Phase 5 — Chat/UI/Accessibility Completion

Repair:

1. context popover semantics/positioning;
2. reasoning disclosure ARIA;
3. attachment target sizes;
4. i18n labels;
5. semantic typography;
6. font slider semantics;
7. message action Toolbar migration;
8. named width tokens;
9. shared primitive semantics.

Then run headed visual QA.

---

## Phase 6 — Network / Electron Hardening

Address:

1. 502/504 retry parity;
2. streaming Safe Mode inspection design;
3. redirect guard;
4. permission-check handler;
5. CSP fallback;
6. OPTIONS handling;
7. trusted PowerShell path.

Do not disturb the existing Electron sandbox or IPC sender-validation architecture.

---

## Phase 7 — External Acceptance

Only after local and hosted automated validation is green.

---

# 39. Required Regression Tests

At minimum add or extend coverage for:

```text
safety-block persistence
attachment delimiter/attribute injection
system prompt mode × attachment budget
character prompt × attachment budget
per-attachment truncation state
extraction truncation state
partial/chunked attachment admission
large PDF promotion
registry Uint8Array path
context meter staged attachments
context meter memory context
context meter prior-context selection
prior-context max conversation cap
prior-context aggregate truncation
delayed workflow hydration
delayed playground hydration
profile switch full volatile reset
media patchMany partial success
context popover keyboard/focus
context popover scroll reposition
reasoning aria-expanded
attachment target size
font aria-valuetext
RTL font/settings layout
502 retry
504 retry
web Safe Mode streamed inspection
```

Do not write tests that merely reproduce implementation details.

Test user-visible and contract-level behavior.

---

# 40. Validation Matrix

After each logical phase run targeted tests.

Before publication run the repository's canonical complete validation.

At minimum:

```bash
npm ci

npm run lint:eslint
npm run typecheck

npm test

npm run verify:contracts
npm run verify:safety-guard
npm run verify:theme-tokens
npm run verify:i18n
npm run verify:i18n-hardcoded-regressions
npm run verify:release-readiness

npm run build
npm run verify:dist
```

Also run every dedicated verifier touched by the modified subsystem.

For packaged/runtime-affecting changes, execute the current packaged Electron smoke suite on all supported platforms or rely on hosted matrix execution after publication.

For UI changes, automated tests are not sufficient. Perform headed acceptance.

---

# 41. Git Rules

Work exclusively on `main`.

Do not:

```text
create feature branches
create worktrees
open a PR
force push
rewrite published history
weaken branch/ruleset protections
skip failing tests
delete a verifier because it fails
```

Before commit:

```bash
git status --short
git diff --check
```

Commit coherent phases with descriptive subjects.

Push only after the complete required validation for the chosen scope is green.

After push:

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

The remote `main` SHA must equal the validated local SHA.

Then inspect hosted CI and CodeQL on that exact SHA.

---

# 42. Documentation Requirements

At completion update the authoritative current surfaces, not historical reports.

At minimum:

```text
docs/summary_of_work.md
docs/ROADMAP.md
```

Update feature/design docs only where behavior actually changed.

For every closed finding record:

```text
finding ID
root cause
files modified
tests added
commands executed
local result
hosted result
remaining limitations
commit SHA
```

Do not alter historical audit reports to make old findings appear retroactively fixed.

Record remediation in current documentation.

---

# 43. Definition of Done

This work is **not complete** merely because TypeScript compiles.

It is complete when:

- both P1 findings have regression tests and are fixed;
- blocked mandatory-safety requests cannot enter durable chat history;
- attachment provenance cannot be corrupted by hostile metadata;
- context admission, context meter, and compiler use shared prompt/budget contracts;
- attachment truncation metadata is per-file and truthful;
- large-context models can consume useful chunked document context without unbounded extraction;
- Chat/Document attachment limits have a coherent user-facing contract;
- async persistent stores cannot overwrite early user mutations during hydration;
- profile switches purge the complete profile-scoped in-memory state;
- `patchMany` cannot diverge memory and IndexedDB;
- current chat controls satisfy their intended keyboard/ARIA contracts;
- remaining hardcoded Chat/font labels are localized;
- recent design-system surfaces are visually tested across representative themes/locales;
- network retries and web Safe Mode behavior have explicit tested contracts;
- Electron hardening does not weaken current sandbox/IPC controls;
- full canonical validation passes;
- headed/manual acceptance is recorded where required;
- `docs/summary_of_work.md` and `docs/ROADMAP.md` reflect reality;
- local and remote `main` point to the same validated commit;
- hosted CI and CodeQL are green on that exact SHA.

---

# 44. Final Agent Instruction

Do not optimize for the shortest patch.

Optimize for restoring **one authoritative contract per subsystem**.

The recurring architectural smell behind most remaining defects is duplicated authority:

```text
multiple prompt resolvers
multiple context estimates
multiple attachment limits
multiple accessibility patterns
multiple persistence assumptions
```

Where possible, eliminate that duplication instead of patching every consumer independently.

At the same time, do not convert this remediation into an uncontrolled rewrite.

For every finding:

```text
reproduce
write failing test
identify root cause
make smallest architectural fix that removes the root cause
verify focused tests
verify adjacent subsystem
continue
```

If three attempted fixes expose new coupling at different layers, stop adding patches and reassess the architecture before continuing.

Preserve the application's local-first privacy model, mandatory child-safety boundary, profile isolation, encrypted storage, Electron sandbox, direct-main workflow, and existing release gates throughout the work.