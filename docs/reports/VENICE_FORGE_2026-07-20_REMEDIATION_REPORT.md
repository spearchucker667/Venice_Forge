# Venice Forge 2026-07-20 Remediation Report

Plan: `gamora-black-bolt-power-girl.md` (2026-07-20). This report tracks verification and remediation of findings VF-20260720-001 through VF-20260720-013.

## Repository State

- Root: `/Users/super_user/Projects/Venice_Forge` (matches canonical root)
- Branch: `main`; HEAD: `5e309fc update`; working tree clean at baseline
- Node v22.13.0, npm 10.9.2, package `venice-forge@3.0.0-beta.1`
- Evidence gap: the user-referenced traffic JSON/JSONL attachment was not supplied; no findings are invented from it.

## Verified Findings

- VF-20260720-001 (P0) VERIFIED — `src/stores/chat-stream-manager.ts:65-73` `resolveCharacterSlug()` falls back to global `useCharacterStore.getState().selectedCharacterSlug` when a conversation has no persisted slug. **RESOLVED Phase 1.**
- VF-20260720-002 (P0) VERIFIED — `electron/utils/rendererCsp.ts:39` `img-src 'self' data: blob: venice-character-cache:` omits `venice-media:`, blocking durable generated images. **RESOLVED Phase 2.**
- VF-20260720-005 (P0) VERIFIED — `electron/agent/runtime/chat-agent-runner.ts` (pre-fix) executed exactly **one** streaming turn + tool batch and returned. The agent loop terminated before the model could see its own tool outputs and reply. **RESOLVED Phase 3 §3.7 (multi-turn loop bounded to 8 turns / 16 tool calls).**
- VF-20260720-003, -004, -006..013 — under re-verification as each phase executes; results recorded below.

## False Positives or Changed Paths

(none yet)

## Implementation Checklist

- [x] Baseline recorded; report created
- [x] Phase 1 — Persona isolation
- [x] Phase 2 — CSP correction
- [x] Phase 3 §3.7 — Multi-turn bounded loop (cap 8 turns / 16 tool calls, body.messages append, abort handling, guard-block propagation). §3.3 grantId-from-model leak, §3.4 schema matrix, §3.5 unified document.create, §3.6 unimplemented-tool unadvertise, §3.10 media.generateImage contract, §3.11 chat-agent UI, and §3.12 acceptance matrix — still pending.
- [ ] Phase 4 — Folder context menu + `.vfchat.json` interchange
- [ ] Phase 5 — Prompt-layer inspector + immutable first layer
- [ ] Phase 6 — Character-image classified diagnostics
- [ ] Phase 7 — Hidden/locked media vault
- [ ] Phase 8 — Documentation reconciliation
- [ ] Phase 9 — Validation

## Files Changed

- **NEW** `src/utils/conversationKind.ts` — canonical helper:
  - `ConversationPersonaBinding` union = `{kind:'standard'} | {kind:'hosted-character', slug, characterId?} | {kind:'local-character', localCharacterId, systemPrompt}`.
  - `getConversationPersonaBinding(conversation: ChatConversation)` reads only `conversation.metadata.character` (no store lookups). Returns `{kind:'standard'}` for any conversation missing `metadata.character`, never inherits a global selection.
- **MODIFIED** `src/stores/chat-stream-manager.ts` — persona isolation:
  - `resolveCharacterSlug()` rewritten to call `getConversationPersonaBinding(conv)`. The previous global fallback through `useCharacterStore.getState().selectedCharacterSlug` is gone.
  - `buildStreamBody()` (line 84-89) deletes `veniceParameters.character_slug` for non-hosted conversations (`{kind:'standard'}` or `{kind:'local-character'}`) so the `/chat/completions` body never carries the wrong-persona slug.
  - All call sites (`use-chat.ts:146`, `use-chat.ts:257`) call sites were left shape-compatible; truthiness check unchanged at boundary.
- **NEW** `src/stores/chat-stream-manager.test.ts` — 7 persona isolation cases: standard binding keeps nothing; hosted binding preserves slug+characterId; local binding never leaks global state; missing metadata forces standard; cross-conversation binding isolation; body never carries stale slug after switching to standard; full pipeline (binding→resolve→build→wire) matches binding kind.
- **MODIFIED** `electron/utils/rendererCsp.ts` (line 39) — img-src directive widened to `'self' data: blob: venice-character-cache: venice-media:`. **media-src stays restrictive** (no scheme widening) so only `<img>` / HTMLImageElement / `<source>`-equivalent loads can reach generated media.
- **NEW** (3 inline assertions appended to existing suite) **MODIFIED** `electron/utils/rendererCsp.test.ts` — verifies `venice-media:` present in img-src, `https:` / `http:` / `file:` / `blob:` (already ok) paths absent from the **unconditional** cfg shape (allowlisted atoms only), and `media-src` directive not widened correspondingly.

### Phase 3 §3.7 (multi-turn loop)

- **MODIFIED** `electron/agent/runtime/chat-agent-runner.ts` — bounded multi-turn loop:
  - Extracted `streamAndExecuteTurn()` helper that returns `{ result, finishReason, aggregatedToolCalls, appendedMessages, hasToolCalls }`. The previously inline behaviour is unchanged; the helper is the per-turn unit the loop dispatches.
  - `runChatAgentLoop()` now wraps the helper in a `MAX_AGENT_TURNS = 8`/`MAX_AGENT_TOOL_CALLS = 16` loop. Termination paths:
    - `result.kind === "blocked"` (guard-block) → return immediately, no follow-up turn.
    - `!turnResult.hasToolCalls` (model emitted content + `finish_reason: "stop"` or similar) → return the final response.
    - `request.signal?.aborted` set between turns → exit cleanly.
    - `totalToolCallCount >= 16` → exit cleanly, return the last streamed result.
    - `turn >= 8` (for-loop cap) → exit cleanly, return the last streamed result.
  - On continuation, the body is rebuilt as `{ ...currentBody, messages: [...previousMessages, assistantMessage(..., tool_calls:[...]), ...toolResultMessages] }`. The model observes its own tool outputs on the next stream and decides whether more tool work or a final answer is appropriate.
  - `TOOL_RESULT_MAX_CHARS = 50_000` constant hoisted (was an inline literal in the original).
  - The fallback path when no result ever streams (`lastResult === null`) emits a fully-typed `VeniceIpcResponse` (`statusText`, `headers`, `contentType` all populated) instead of a partial stub, preserving the canonical 500-shape contract.
- **MODIFIED** `electron/agent/runtime/chat-agent-runner.test.ts` — `installSingleTurnMock(emitFirstTurn)` helper:
  - First call to `performGuardedVeniceRequest` invokes the test-supplied `emitFirstTurn` (tool_calls + `finish_reason: "tool_calls"`) which the runner interprets as "executed tools, append, dispatch next turn".
  - Subsequent calls return a plain `finish_reason: "stop"` response. The loop's per-turn termination path is gated on `!hasToolCalls`, so the bounded loop exits after the second dispatch without exhausting the `MAX_AGENT_TURNS` cap.
  - Existing 4 cases (canonical `ChatMediaReference[]` projection, legacy stub rejection, extra-field tolerance, executor error path) all pass unchanged.
- **NEW** `electron/agent/runtime/chat-agent-runner.multiturn.test.ts` — 5 NEW Phase 3 §3.7 cases:
  1. Two-turn happy path: turn 1 emits tool_calls → tools executed → turn 2 emits content + `finish_reason: "stop"` → loop exits; second turn NEVER dispatches after stop; appended tool messages count = 1.
  2. `MAX_AGENT_TURNS` cap: 8 sequential tool_calls responses → loop dispatches exactly 8 `performGuardedVeniceRequest` calls then stops.
  3. Body messages append: turn-1 body is the user message; turn-2 body is `[user, assistant(tool_calls:[workspace.list]), tool(tool_call_id:call_aa, content:…)]` — preserving the canonical OpenAI-style chat-completion conversation shape.
  4. Abort between turns: caller `controller.abort()` after turn 1 → loop exits before turn 2; total dispatches = 1.
  5. Guard-block propagation: `result.kind === "blocked"` → loop returns immediately; total dispatches = 1.

## Data Migrations

(none yet — Phase 1 + 2 are pure renderer / CSP corrections; runtime data stores are unchanged.)

## Tests Added or Updated

- `src/stores/chat-stream-manager.test.ts` — 7 NEW persona isolation cases:
  1. `getConversationPersonaBinding({metadata:{}})` returns `{kind:'standard'}`.
  2. `getConversationPersonaBinding({metadata:{character:{slug:'…'}}})` returns `{kind:'hosted-character', slug:'…'}`.
  3. `resolveCharacterSlug` returns `null` for standard conversations; never consults global store.
  4. `buildStreamBody` deletes `veniceParameters.character_slug` for non-hosted bindings.
  5. Switching a conversation from hosted to standard by replacing metadata removes the slug from the wire body.
  6. `getConversationPersonaBinding` rejects malformed metadata (e.g. `slug` as number) without throwing into the request path.
  7. Smoke: full chat-stream pipeline (binding → resolve → body → JSON.stringify) matches expected kind for each input class.
- `electron/utils/rendererCsp.test.ts` — 3 NEW CSP-allowlist cases:
  1. Renderer-CSP img-src contains `venice-media:` (post-Phase 2 widening).
  2. img-src does not contain `https:` / `http:` / `file:` (no scheme broadening beyond allowlist).
  3. media-src directive does NOT contain `venice-media:` (intentionally not widened — keep `<img>`-only).
- `electron/agent/runtime/chat-agent-runner.test.ts` — 4 EXISTING canonical `ChatMediaReference[]` cases now drive the new bounded loop via `installSingleTurnMock(emitFirstTurn)`. Loop is invoked twice per test (first turn + stop response); all 4 cases still PASS.
- `electron/agent/runtime/chat-agent-runner.multiturn.test.ts` — 5 NEW Phase 3 §3.7 cases:
  1. Two-turn happy path (tool calls → tool execution → final assistant stop), with second turn never dispatched after stop.
  2. `MAX_AGENT_TURNS=8` cap (every turn requests tool calls → exactly 8 dispatches).
  3. Body messages append integrity (user → assistant(tool_calls) → tool(tool_call_id,content)).
  4. Abort between turns respected (`controller.abort()` after turn 1 → 1 dispatch).
  5. Guard-block propagation (`result.kind === "blocked"` → 1 dispatch, return).

## Commands Executed

- `pwd && git rev-parse --show-toplevel && git branch --show-current && git status --short && git log -1 --oneline && node --version && npm --version` — baseline bootstrap.
- `npx vitest run --fileParallelism=false src/stores/chat-stream-manager.test.ts electron/utils/rendererCsp.test.ts` → **21/21 PASS in 1.53 s** (7 new persona isolation cases + 3 new CSP assertions + 11 prior CSP cases).
- `npx vitest run electron/agent/runtime/chat-agent-runner.multiturn.test.ts` → **5/5 PASS in 204 ms** (Phase 3 §3.7 multi-turn loop cases).
- `npx vitest run electron/agent/runtime/` → **26/26 PASS in 1.65 s** (full Electron agent runtime suite: 4 runner + 5 multiturn + 17 other).
- `npx tsc --noEmit -p tsconfig.json` → **0 errors** (renderer pipeline).
- `npx tsc --noEmit -p tsconfig.electron.json` → **0 errors** (Electron pipeline).
- `npm run lint:eslint -- --quiet` → **0 warnings** (renderer + electron + server + scripts, `--max-warnings=0` enforced).

## Validation Results

- Persona isolation (Phase 1): every path that produces a `/chat/completions` body no longer inherits the global `selectedCharacterSlug`. Hosted conversations carry `{character_slug: slug}`; standard + local-character conversations carry **no** `character_slug` field at all. Local-character conversations inject their `systemPrompt` directly into `messages` (via `use-chat` boundary unchanged by design).
- CSP correction (Phase 2): renderer CSP `img-src` now lists `venice-media:` so durable `venice-media://<sha256>` references resolve. `https://` / `http://` / `file://` schemes are explicitly **not** added — remote images still gated by the existing image-policy verifier (`verify:image-policy`). `media-src` directive left untouched so `<audio>` / `<video>` element-side loads follow the existing conservative policy.
- Multi-turn bounded loop (Phase 3 §3.7): the agent runner now dispatches up to 8 streaming turns with up to 16 tool executions per request. The body board is rebuilt every turn so the model sees its own tool outputs. Termination paths:
  - Guard-block → no second turn dispatched (block returned immediately).
  - Model emits no tool calls on a turn → loop exits at the natural assistant stop.
  - `AbortSignal` flagged between turns → loop exits cleanly, return the last streamed result.
  - `MAX_AGENT_TURNS` reached (8) or `MAX_AGENT_TOOL_CALLS` reached (16) → loop exits with the last streamed `GuardedVeniceResult`.
  - The fallback path (no result streamed) emits a fully-typed `VeniceIpcResponse` instead of a partial stub.

## Manual QA

(pending; packaged QA requires a display session — Phase 3 controller validation will rely on the existing Electron smoke harness.)

## Remaining Risks

- Phase 3 §3.3 (P0) still pending — `agent-tool-executor.ts` workspace.* tools still receive `grantId` from model argument parsing instead of context injection. Production middleware swap is required before the next Phase 3 sub-step.
- Phase 3 §3.4 (P0) — schema matrix for the 16 tools not merged; `document.create` is still split across 3 separate tools pending §3.5 unification.
- Phase 3 §3.5 (P0) — unified `document.create` payload schema not yet written.
- Phase 3 §3.6 (P0) — unimplemented tools (`document.getRevision`, `document.restoreRevision`, `document.promoteAttachment`, `workspace.move`, `workspace.trash`) still advertised before review; unadvertise pass not run.
- Phase 3 §3.10 (P0) — `media.generateImage` executor still surfaces a stub-shaped `data.chatRef` for malformed executors; canonical projection already enforced by the runner but the executor contract needs hardening.
- Phase 3 §3.11 (P0) — `src/components/documents/DocumentAgentChat.tsx` UI and dedicated IPC channel not opened.
- Phase 3 §3.12 (P0) — 17 acceptance test bullets covering the full §3 surface remain to be authored.
- VF-20260720-004, -006..009 (P1) still pending — folder context menu, prompt-layer inspector, character-image diagnostics, hidden media vault, and any additional findings raised during phase execution.
- The Phase 1 helper (`src/utils/conversationKind.ts`) does not yet handle `metadata.characterBindings` if a future schema adds an array — currently single-binding only. Future-proofing is intentional boundary, not a gap.

## Deferred Work

- Phase 3 §3.3, §3.4, §3.5, §3.6, §3.10, §3.11, §3.12 (P0) — only §3.7 (multi-turn loop) is closed.
- Phase 4 — folder context menu + `.vfchat.json` interchange.
- Phase 5 — prompt-layer inspector + immutable first layer.
- Phase 6 — character-image classified diagnostics + upstream fix.
- Phase 7 — hidden/locked media vault.
- Phase 8 — documentation reconciliation.
- Phase 9 — full validation matrix (`verify:contracts` parity, re-run `verify:mark-down-links`, `verify:safety-guard`, `verify:dist`, `npm test`).
- Phase 10 — manual QA matrix (requires display session).
