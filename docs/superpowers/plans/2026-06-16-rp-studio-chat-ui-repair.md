# RP Studio + Chat UI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the RP Studio local-character workflow, chat integration, sidebar history behavior, app mesh overlay polish, and chat memory UX in Venice Forge.

**Architecture:** Keep local RP characters fully local (no Venice.ai hosting), wire them into normal chat via a new `createLocalCharacterConversation` store action, make sidebar Chat History independently collapsible, smooth mesh overlay by replacing hard RP Studio borders with soft separators, and harden chat memory retrieval so it never blocks sending.

**Tech Stack:** React 19 + TypeScript strict, Zustand 5, Tailwind v4, Electron IPC / IndexedDB, Vitest.

---

## File Map

### Changed files
- `src/components/ui/shared.tsx` — fix `PrimaryButton` sm sizing so Save matches Delete.
- `src/components/rp-studio/CharacterEditor.tsx` — use fixed PrimaryButton; add normal-chat action; clarify local-character copy.
- `src/types/conversationVault.ts` — extend `ConversationSource` and `ConversationCharacterMeta` to support local RP characters.
- `src/types/conversation.ts` — update `Conversation.source` union if needed.
- `src/stores/chat-store.ts` — add `createLocalCharacterConversation(card, fallbackModel)` action.
- `src/services/rpHelpers.ts` — add `startNormalChatForCharacter(characterId, opts?)` helper.
- `src/hooks/use-chat.ts` — make memory retrieval fail-safe and visible; ensure local-character system prompt is injected; add `memoryStatus` UI signal.
- `src/components/layout/sidebar.tsx` — make Chat History section independently collapsible/expandable with `aria-expanded`.
- `src/components/rp-studio/CharacterLibrary.tsx` — clarify local vs Venice-hosted copy; add normal-chat action.
- `src/components/rp-studio/RpStudioView.tsx` and sub-views — replace hard `border-b border-border` toolbars with `soft-separator-y` / `mesh-surface` where appropriate.
- `src/styles/components.css` — add/adjust mesh helper tokens if needed.

### Tests to add/update
- `src/components/rp-studio/CharacterEditor.test.tsx` — Save button size/layout assertions; normal-chat action.
- `src/stores/chat-store.character.test.tsx` (exists) — local character conversation creation.
- `src/hooks/use-chat.test.ts` (exists or create) — memory failure fallback.
- `src/components/layout/sidebar.test.tsx` (exists) — History collapse/expand.

---

## Task 1: Fix Save Button Size and Layout

**Files:**
- Modify: `src/components/ui/shared.tsx`
- Modify: `src/components/rp-studio/CharacterEditor.tsx`
- Test: `src/components/rp-studio/CharacterEditor.test.tsx`

- [ ] **Step 1: Add horizontal padding + min-width to PrimaryButton sm size**
  Change `PrimaryButton` sizing so `size="sm"` renders `px-3 py-1.5 text-[13px] min-w-[72px]` (matches `GhostButton` height/padding).
- [ ] **Step 2: Remove explicit `size="sm"` or verify it now renders correctly in CharacterEditor**
  The CharacterEditor toolbar uses `<GhostButton>Delete</GhostButton>` + `<PrimaryButton size="sm">Save</PrimaryButton>`.
- [ ] **Step 3: Add test asserting Save has sane min dimensions and is not a tiny pill**
  `expect(saveBtn).toHaveClass('min-w-[72px]', 'px-3')` or similar.
- [ ] **Step 4: Run targeted test**
  `npm run test -- src/components/rp-studio/CharacterEditor.test.tsx`

---

## Task 2: Make Created Characters Fully Local

**Files:**
- Modify: `src/components/rp-studio/CharacterEditor.tsx`
- Modify: `src/components/rp-studio/CharacterLibrary.tsx`
- Test: `src/components/rp-studio/CharacterEditor.test.tsx`

- [ ] **Step 1: Verify local persistence already exists**
  `character-card-store.ts` + `characterCardService.ts` already persist `CharacterCardV1` locally (IDB/Electron). No new persistence layer needed.
- [ ] **Step 2: Add UI copy distinguishing local vs Venice-hosted**
  In `CharacterLibrary` empty state / header add text like "Local characters are stored in Venice Forge only."
  In `CharacterEditor` header subtitle: "Local character — not hosted on Venice.ai".
- [ ] **Step 3: Ensure imported cards normalize to local model**
  `characterCardService.normalizeCard` already coerces imports into `CharacterCardV1`; verify avatar data/cache reference, tags, notes, personality, scenario hooks, timestamps are preserved.
- [ ] **Step 4: Run existing character tests**
  `npm run test -- src/components/rp-studio/CharacterEditor.test.tsx`

---

## Task 3: Allow Chatting With Local Characters in Normal Chat

**Files:**
- Modify: `src/types/conversationVault.ts`
- Modify: `src/stores/chat-store.ts`
- Modify: `src/services/rpHelpers.ts`
- Modify: `src/hooks/use-chat.ts`
- Modify: `src/components/rp-studio/CharacterEditor.tsx`
- Modify: `src/components/rp-studio/CharacterLibrary.tsx`
- Test: `src/stores/chat-store.character.test.tsx`, `src/hooks/use-chat.test.ts`

- [ ] **Step 1: Extend types for local character chat**
  Add `localCharacter` to `ConversationSource` union.
  Extend `ConversationCharacterMeta` with optional `localCharacterId?: string` and `systemPrompt?: string`.
- [ ] **Step 2: Add `createLocalCharacterConversation` to chat-store**
  Use card name, system prompt, modelId, adult flag, id; set `source: 'localCharacter'` and `character: { localCharacterId: card.id, name: card.name, systemPrompt: card.systemPrompt, adult: card.adult, modelId: card.modelId }`.
- [ ] **Step 3: Add `startNormalChatForCharacter` in rpHelpers**
  Calls `chatStore.createLocalCharacterConversation`, sets active tab to `'chat'`, returns conversation id.
- [ ] **Step 4: Wire use-chat to inject local character system prompt**
  In `streamResponse`, if `conv.metadata.character.localCharacterId` exists and `conv.systemPrompt` is set, prepend it as a system message. Do not call `resolveCharacterSlug` for local characters (avoid Venice remote fetch).
- [ ] **Step 5: Add "Chat" action in CharacterEditor and CharacterLibrary**
  CharacterEditor workflow section: new "Chat" button alongside "Start chat" (RP) that calls `startNormalChatForCharacter`.
  CharacterLibrary cards: add "Chat" button.
- [ ] **Step 6: Add/update tests**
  Test `createLocalCharacterConversation` creates a conversation with correct metadata.
  Test `useChat.send` prepends local character system prompt and does not set `character_slug` for local characters.

---

## Task 4: Fix Chat Sidebar History Collapse/Expand

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Test: `src/components/layout/sidebar.test.tsx`

- [ ] **Step 1: Add local collapse state for History section**
  Use `useState<'expanded' | 'collapsed'>('expanded')` or boolean `historyExpanded`.
- [ ] **Step 2: Add accessible toggle button in History header**
  Button with `aria-expanded={historyExpanded}`, `aria-controls="chat-history-list"`, clear label "Collapse History" / "Expand History", keyboard operable.
- [ ] **Step 3: Render conversation list only when expanded**
  Wrap search + list in a div with `id="chat-history-list"`; conditionally render or animate height.
- [ ] **Step 4: Preserve state predictably**
  Keep in component state (per-session UI state) to match current sidebar behavior; do not persist to avoid coupling.
- [ ] **Step 5: Add tests**
  Click collapse button → list hidden (`not.toBeVisible()` or `aria-expanded="false"`); click expand → list visible; conversation selection still works; new chat creation still works.

---

## Task 5: Smooth Mesh Overlay Across App Sections

**Files:**
- Modify: `src/components/rp-studio/RpStudioView.tsx`
- Modify: `src/components/rp-studio/CharacterLibrary.tsx`
- Modify: `src/components/rp-studio/CharacterEditor.tsx`
- Modify: `src/components/rp-studio/*` sub-view header/toolbar rows
- Modify: `src/styles/components.css` (if token gaps)
- Test: visual regression via existing tests; no new logic tests required unless borders are testable.

- [ ] **Step 1: Audit RP Studio hard borders**
  Replace `border-b border-border` header/toolbar rows with `soft-separator-y` + `mesh-surface` / `mesh-header`.
- [ ] **Step 2: Audit Prompt Library, Media Studio, Chat hard borders**
  Apply same treatment to major panel seams (preserve semantic borders on input controls and buttons).
- [ ] **Step 3: Ensure overlay does not block clicks**
  `AppMeshOverlay` already has `pointer-events: none` and `z-index: 0`; verify shell regions stay `z-index: 10`.
- [ ] **Step 4: Verify light-theme readability**
  Mesh opacity already scales via `--app-mesh-opacity`; ensure text contrast unchanged.

---

## Task 6: Rework Chat Memory UX and Failure Handling

**Files:**
- Modify: `src/hooks/use-chat.ts`
- Modify: `src/components/chat/chat-view.tsx` (memory status UI)
- Modify: `src/components/chat/chat-input.tsx` (memory indicator)
- Test: `src/hooks/use-chat.test.ts`

- [ ] **Step 1: Ensure memory retrieval never blocks send**
  `pullMemoryContextForSend` already catches errors and returns empty context. Verify it also catches rejections from `desktopConversations.pullContext` and does not throw.
- [ ] **Step 2: Add non-destructive warning on memory failure**
  Return `{ ok: false, error }` from `pullMemoryContextForSend`; in `send`, if memory is enabled but retrieval fails, surface a transient toast/inline warning (not blocking).
- [ ] **Step 3: Add memory status signal**
  Expose `memoryStatus: 'idle' | 'loading' | 'injected' | 'failed' | 'disabled'` from `useChat` so UI can show when memory is active/inactive.
- [ ] **Step 4: Avoid stale/duplicate memory context**
  Dedupe injected context by checking `pendingContext.message === userMessage`; already present. Ensure `injectedContext` metadata is cleared on regenerate or new conversation.
- [ ] **Step 5: Add tests**
  - Memory retrieval failure: chat still sends, warning shown.
  - Disabled memory: no retrieval call.
  - Successful injection: context appears in user message metadata.

---

## Validation Commands

Run after all tasks:

```bash
npm run typecheck
npm run lint:eslint
npm test
npm run build
```

Targeted checks:

```bash
npm run test -- src/components/rp-studio/CharacterEditor.test.tsx
npm run test -- src/hooks/use-chat.test.ts
npm run test -- src/components/layout/sidebar.test.tsx
npm run test -- src/stores/project-store.test.ts
npm run test -- src/stores/chat-store.character.test.tsx
```

Source checks:

```bash
rg -n "prompt\\(|confirm\\(" src
rg -n "CharacterEditor|local character|localCharacter|RP Studio|start chat|chat with" src
rg -n "History|aria-expanded|collapsed|expanded" src/components/layout src/components/chat src/stores
rg -n "memory|retrieve|inject|context" src/hooks src/stores src/services src/components/chat
rg -n "mesh|overlay|border|hard line|app-mesh" src/components src/styles
```

---

## Spec Coverage Self-Review

| Requirement | Task |
|-------------|------|
| Save button fixed | Task 1 |
| Local characters persist | Task 2 (already implemented; clarify copy) |
| Chat with local characters | Task 3 |
| No Venice.ai hosting required | Tasks 2–3 |
| History collapsible | Task 4 |
| Mesh overlay smooth | Task 5 |
| Memory cannot break send | Task 6 |
| Tests pass | All tasks |
| Local vs Venice copy clear | Tasks 2, 3 |
