# Summary of Work

> Canonical handoff ledger for AI/dev-agent sessions.
>
> Every agent that modifies this repository must update this document
> before ending its session. See `AGENTS.md` § *Mandatory Session
> Handoff* for the contract.

---

## Current Project State

**App type and stack.** Venice Forge is a local-first desktop + web
client for the Venice AI inference API. The desktop build is Electron
42 with Node 20/22 and a sandboxed, contextIsolated renderer. The web
build is a Vite SPA served by a thin Express proxy. Both transports
share the same React 19 + TypeScript-strict renderer and the same
Zustand 5 state slices.

**Main provider / API architecture.** Single live transport today is
Venice.ai (`api.venice.ai`) over `Bearer` auth. A forward-compat
provider abstraction (`LlmProvider = "venice" | "minimax"` in
`src/config/configSchema.ts`) is in place but `minimax` has no live
transport — every existing call site continues to dispatch to Venice.
Allowed Venice endpoints are allowlisted in `src/shared/validation.ts`
and mirrored in `electron/ipc/validation.ts`. The web proxy in
`server.ts` enforces the same allowlist at the network boundary.

**Safety architecture.** Three independent layers:
1. **Local Family Safe Mode** — runtime-snapshot-backed
   `assessChildExploitationSafety` guard. Authoritative flag lives in
   `electron/services/runtimeSafetySettings.ts`; renderer-supplied
   `localFamilySafeModeEnabled` is intentionally dropped at the IPC
   boundary. The web proxy reads it from the
   `X-Venice-Forge-Family-Safe-Mode` header (renderer-sourced from
   `useSettingsStore`).
2. **Venice provider `safe_mode`** — independent per-request
   parameter, gated by `src/shared/veniceSafeMode.ts`'s
   `VENICE_API_SAFE_MODE_MATRIX` so non-supporting endpoints never
   receive it.
3. **Adult Mode** — explicit "skip local rule engine" path; the
   provider-side `safe_mode` is independent and not affected.

Every Venice-touching IPC entry point routes through
`electron/services/guardPipeline.ts`'s `performGuardedVeniceRequest`
which emits the canonical 451 block shape. Jina / scrape also run
return-content `screenResponseBody` screening.

**Storage architecture.** Dual-mode:
- **Desktop:** atomic JSON files under `userData/chat-history/`
  (temp + rename) for chat history; encrypted IndexedDB AES-GCM in the
  same renderer IDB for Settings, Images, Conversations, Memories,
  Files, Character Cards, Personas, Lorebooks, RP Chats, RP Assets
  (`ENCRYPTED_STORES` in `src/services/storageService.ts`).
- **Web:** unencrypted IndexedDB `conversations` + the encrypted stores
  above. The web mode is for development / preview, not a hardened
  threat surface.
- **Secrets:** Electron uses `safeStorage` (DPAPI on Windows,
  Keychain on macOS). Web uses a server-side `.env`. The local YAML
  config supports `secrets.venice_api_key` / `jina_api_key` /
  `minimax_api_key` for one-time import into the secure store; the
  YAML is then atomically rewritten to redact plaintext.

**Docs / test posture.** `docs/` is the canonical home for security
posture, audit reports, design notes, and per-feature deep-dives.
The 1220-test Vitest suite runs serially (`--fileParallelism=false`)
because it touches IDB and global state. Coverage thresholds are
70% branches / 80% functions+lines+statements. The CI gates are
`lint:eslint`, `typecheck` (renderer + electron), `test`,
`verify:safety-guard`, `verify:markdown-links`, and `build`.

**Active migration / refactor themes.** The MiniMax LLM
provider-scaffold landed in the 2026-06-06 audit batch and is the
largest open refactor. The migration follow-ups (F-1 through F-8)
are tracked in `docs/POST_MINIMAX_M3_AUDIT.md`. None of them are P0
blockers for shippable builds — the existing Venice code path is
fully covered and behaves identically to the pre-audit build.

---

## Latest Session Summary

- **Date:** 2026-06-06
- **Agent / model:** MiniMax M3 (acting as repo maintainer)
- **Branch:** main
- **Commit / working tree state:** HEAD = `2fc1406a`; 20 files
  modified + 2 new docs (`docs/POST_MINIMAX_M3_AUDIT.md`,
  `docs/summary_of_work.md`); no uncommitted changes outside this
  batch.
- **Primary objective:** Full updated-repo audit + MiniMax LLM
  migration readiness pass, plus a durable session handoff ledger
  (`docs/summary_of_work.md`) that every future agent must update.
- **Files changed:** 20 — see `Session History` entries below.
- **Tests added or changed:** Added 16 cases across 4 files
  (`server.test.ts`, `venice-client.test.ts`, `image-tools.test.tsx`,
  `media-store.test.ts`, `configSchema.test.ts`); 4 new regression
  guards `VERIFY-030`…`VERIFY-033` plus extensions to `VERIFY-006`
  and `VERIFY-020`.
- **Validation commands run:** `npm run lint:eslint`,
  `npm run typecheck`, `npm test`, `npm run verify:safety-guard`,
  `npm run verify:markdown-links`, `npm run build` (audit batch);
  plus `git status --short`, `npm run verify:markdown-links`,
  `npm run lint:eslint` for the docs-only handoff addendum.
- **Validation result:** all green. 1220/1220 tests pass
  (1 Playwright smoke skip on this headless run); 0 ESLint warnings;
  0 typecheck errors; safety-guard, markdown-links (50 → 51 files
  after this handoff addendum), and full build all clean.
- **Known failures:** None.
- **Follow-up required:** 8 migration follow-ups (F-1 through F-8 in
  `docs/POST_MINIMAX_M3_AUDIT.md`); the next agent must start a new
  *Session History* entry and update this ledger as their first
  post-edit step.

---

## Session History

### 2026-06-06 — Post-MiniMax-M3 Audit + Summary Handoff System

**Agent / model:** MiniMax M3
**Branch:** main
**Primary objective:** Full repo audit and MiniMax LLM migration
readiness pass, then introduce a canonical handoff ledger so every
future session is observable.

#### Completed

- Confirmed all 9 audit bug seeds against source:
  BUG-001 (P1, server.ts 403 on `/characters`),
  BUG-002 (P1, blob/formdata AbortSignal dropped),
  BUG-003 (P2, image-tools double-write to IDB),
  BUG-004 (P2, video manual save duplicates),
  BUG-005 (P3, video-view a11y),
  BUG-006 (P1, no provider abstraction),
  BUG-007 (P2, OpenAI-style streaming parser),
  BUG-008 (P2, gallery inspector lineage across pages),
  BUG-009 (P3, dead `TABS` constant).
- Applied 8 safe low-risk fixes (BUG-007 deferred — no live
  transport to validate against).
- Added MiniMax provider abstraction scaffolding to
  `src/shared/configSchema.ts` and `src/config/configSchema.ts`
  (additive only — defaults preserve Venice behavior).
- Added `useMediaStore.loadById(id)` and lineage-resolution effects
  in the gallery inspector.
- Wrote `docs/POST_MINIMAX_M3_AUDIT.md` with the full audit report
  and 8 tracked MiniMax migration follow-ups (F-1 through F-8).
- Wrote this document (`docs/summary_of_work.md`).
- Updated `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
  `.github/copilot-instructions.md` to require this ledger at
  the end of every session.

#### Files changed

- `server.ts` — BUG-001 fix (canonical `isAllowedVeniceRequest` as
  single source of truth, 405/403 split preserved)
- `src/lib/venice-client.ts` — BUG-002 fix (forward `init.signal`)
- `src/lib/venice-client.test.ts` — VERIFY-031 + VERIFY-006
  extension (4 new cases)
- `src/components/image/image-view.tsx` — BUG-003 fix (remove
  duplicate `StorageService.saveItem`)
- `src/components/image/image-tools.test.tsx` — VERIFY-020 extension
  (assert one `putMedia`, zero `saveItem`)
- `src/components/video/video-view.tsx` — BUG-004 + BUG-005 fixes
  (idempotent save, audio `role="switch"`, a11y labels)
- `src/stores/media-store.ts` — BUG-008 fix (`loadById` action)
- `src/stores/media-store.test.ts` — VERIFY-032 (4 new cases)
- `src/components/gallery/gallery-view.tsx` — BUG-008 fix (parent /
  children `useEffect` for on-demand by-id fetch)
- `src/constants/venice.ts` — BUG-009 fix (mark `TABS` `@deprecated`)
- `src/shared/configSchema.ts` — BUG-006 env layer
- `src/config/configSchema.ts` — BUG-006 YAML layer +
  `PROVIDER_CAPABILITIES` matrix
- `src/config/configSchema.test.ts` — VERIFY-033 (6 new cases)
- `electron/services/configService.ts` — mirror new fields in local
  `YamlConfig` construction sites
- `.env.example` — document new env keys
- `server.test.ts` — VERIFY-030 (4 new cases)
- `docs/POST_MINIMAX_M3_AUDIT.md` — new audit report
- `CHANGELOG.md` — `[Unreleased]` entries + new guard table rows
- `AGENTS.md` — new guard table rows + new "Mandatory Session
  Handoff" section
- `CLAUDE.md` — reference this ledger in the agent flow
- `GEMINI.md` — reference this ledger in the agent flow
- `.github/copilot-instructions.md` — reference this ledger in the
  agent flow
- `docs/summary_of_work.md` — **this file** (new)

#### Tests / validation

```bash
npm run lint:eslint
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run build
```

Result:

- `lint:eslint` — 0 warnings (zero-warnings enforced)
- `typecheck` — 0 errors across renderer + electron main
- `test` — **1220 passed** | 1 skipped (Playwright Electron smoke)
  across 122 test files
- `verify:safety-guard` — all 3 boundary files pass; no raw prompt
  logging or safety bypass patterns
- `verify:markdown-links` — 50 Markdown files checked, no broken
  links
- `build` — `dist/`, `dist-electron/`, `dist/server.cjs` all
  produced

#### Known issues / unresolved risks

- BUG-007 (MiniMax streaming parser) is **deferred** — no live
  transport to validate against. Tracked as F-2 in the audit report.
- The 8 MiniMax migration follow-ups (F-1…F-8) are not in this
  batch; each is its own PR per the audit's "Hard requirement"
  notes (main-process runtime snapshot is the source of truth for
  the active provider, mirroring the existing
  `localFamilySafeModeEnabled` pattern).
- No new safety boundary was weakened. `verify:safety-guard` is
  green against all three boundary files
  (`src/services/veniceClient.ts`, `electron/ipc/handlers.ts`,
  `server.ts`).

#### Next recommended tasks

- F-1: wire MiniMax as a live transport (P0, blocked by F-2/F-3/F-4)
- F-2: MiniMax SSE streaming parser
- F-3: MiniMax endpoint allowlist (new boundary file
  `verify:safety-guard` entry)
- F-4: per-feature flags driven by `PROVIDER_CAPABILITIES`
- F-5: chat / image payload builders per provider
- F-6: MiniMax model discovery
- F-7: tests for the MiniMax path
- F-8: documentation refresh (README / ABOUT / FAQ / REPO TREE /
  CONFIG)

### 2026-06-06 — Add canonical `docs/summary_of_work.md` handoff ledger

**Agent / model:** MiniMax M3
**Branch:** main
**Primary objective:** Add the durable session handoff ledger
required by `AGENTS.md` so every future agent has a single canonical
place to record what changed, what remained unresolved, and which
validation was run.

#### Completed

- Created `docs/summary_of_work.md` with the required top-level
  structure (Current Project State, Latest Session Summary, Session
  History, Active Architecture Notes, Open TODO Ledger, Validation
  Matrix, Agent Update Rules).
- Populated the first *Session History* entry from the just-completed
  2026-06-06 post-MiniMax-M3 audit session (see the entry above).
- Added a new top-level `## Mandatory Session Handoff:
  docs/summary_of_work.md` section to `AGENTS.md` (placed before
  `## Commands` so it is the first thing a future agent sees), and
  added the new doc to the `## Update These Files` list.
- Added the same mandatory handoff instruction to
  `.github/copilot-instructions.md`, `CLAUDE.md`, and `GEMINI.md`.
- Added the new doc to `README.md` under the *Reference* sub-bullet
  list.
- Added a `[Unreleased] / Added` entry to `CHANGELOG.md` describing
  the new ledger.

#### Files changed

- `docs/summary_of_work.md` — new file (this document)
- `AGENTS.md` — new `## Mandatory Session Handoff` section + added
  the new doc to `## Update These Files`
- `.github/copilot-instructions.md` — new `## Mandatory Session
  Handoff` section after the *Commands* block
- `CLAUDE.md` — added the new doc to the pre-read list and tightened
  the API-key policy note
- `GEMINI.md` — added the new doc to the pre-read list and tightened
  the API-key policy note
- `README.md` — added the new doc to the *Reference* sub-bullet
- `CHANGELOG.md` — new `[Unreleased] / Added` entry

#### Tests / validation

```bash
git status --short
npm run verify:markdown-links
npm run lint:eslint
```

Result:

- `git status --short` — 20 modified files from the audit batch + 1
  new doc + the new `summary_of_work.md`; no other surprises.
- `npm run verify:markdown-links` — 50 → 51 Markdown files checked
  after the new doc was added, no broken links.
- `npm run lint:eslint` — 0 warnings (zero-warnings enforced).
- `npm run typecheck` — not re-run for docs-only changes; the
  audit batch's typecheck result is the latest known good status
  (recorded in the *Validation Matrix*).
- `npm test` — not re-run for docs-only changes; the audit batch's
  result (1220 passed, 1 skipped) is the latest known good status.

#### Known issues / unresolved risks

- None introduced by this batch (docs + agent-instruction surface
  only).
- The pre-existing 8 MiniMax migration follow-ups (F-1 through F-8)
  remain in the *Open TODO Ledger* under their respective priorities.

#### Next recommended tasks

- F-1 through F-8 from the prior session entry.

---

## Active Architecture Notes

### Provider / API Layer

- Single live transport: Venice.ai over `Bearer` auth.
- Forward-compat provider abstraction in place: `LlmProvider = "venice"
  | "minimax"` is accepted by the YAML and env layers, defaults to
  `"venice"`, and is gated through `PROVIDER_CAPABILITIES` for the
  renderer.
- `src/shared/validation.ts` is the canonical endpoint allowlist,
  mirrored into `electron/ipc/validation.ts`. The `isAllowedVeniceRequest`
  predicate understands both the static list AND the parameterized
  `/characters/{slug}` family. The web proxy (`server.ts`) uses this
  predicate as the single source of truth (post-2026-06-06 fix);
  status-code split (405 vs 403) is decided by consulting the static
  list + `isAllowedCharactersRequest`.
- MiniMax endpoint allowlist does not exist yet; F-3 is the work.

### Safety Layer

- **Family Safe Mode:** local-only. Authoritative flag in
  `electron/services/runtimeSafetySettings.ts` (main process).
  Renderer-supplied `localFamilySafeModeEnabled` on `VeniceIpcRequest`
  is dropped at the IPC boundary (back-compat tolerated, no error
  throw). Web proxy reads the toggle from the
  `X-Venice-Forge-Family-Safe-Mode` header (renderer-sourced).
- **Adult Mode:** explicit "skip the local rule engine" path. Does
  not affect provider-side `safe_mode` (intentionally independent).
- **Provider-side safety:** Venice's `safe_mode` parameter, gated by
  `src/shared/veniceSafeMode.ts`'s `VENICE_API_SAFE_MODE_MATRIX`. The
  chat / image / streaming payload builders all route through
  `applyVeniceApiSafeMode`. Non-supporting endpoints never receive
  the field, preventing Venice's 400-on-unknown-field.
- **CSAM / child exploitation guard:** the local rule engine lives
  in `src/shared/safety/`. The public orchestration API is
  `assessChildExploitationSafety`; the conditional pipeline is
  `maybeRunLocalFamilyGuard` (skips in Adult Mode without invoking
  the rule engine). The IPC layer routes every prompt-bearing
  request through `performGuardedVeniceRequest` /
  `checkLocalFamilyGuard`; the web proxy uses
  `maybeRunLocalFamilyGuard` directly with fail-closed behaviour on
  thrown errors. Return-content screening (`screenResponseBody`)
  covers Jina and scrape endpoints.
- **IPC / proxy enforcement boundaries:** three boundary files in the
  `verify:safety-guard` allowlist —
  `src/services/veniceClient.ts` (renderer transport),
  `electron/ipc/handlers.ts` (Electron main),
  `server.ts` (web proxy). Adding a new Venice endpoint requires
  coordinated updates in `src/shared/validation.ts`,
  `electron/ipc/validation.ts`, and `server.ts`.

### Storage Layer

- **Desktop chat history:** atomic JSON files in `userData/chat-history/`
  via the main-process filesystem store. The renderer also keeps a
  dirty map of pending writes and flushes on debounce, `pagehide`, and
  `beforeunload`.
- **Web chat history:** encrypted IDB `conversations` store
  (renderer-side AES-GCM).
- **Encrypted IDB stores** (`ENCRYPTED_STORES`):
  Settings, Images, Conversations, Memories, Files,
  Character Cards, Personas, Lorebooks, RP Chats, RP Assets.
- **Plaintext at rest:** desktop chat history is intentionally
  plaintext on disk (the recommended encrypted path is the AES-GCM
  Export flow). Documented in `README.md` under *Data Storage &
  Privacy*.
- **Import / export behaviour:** Export writes a sanitized bundle
  that strips API keys. Import shows a 3-way prompt
  (Import all / Keep current safety / Cancel) when the imported
  `family-safe-mode-settings` would disable a guard.

### Media Studio

- **Persistence:** the `images` IDB store. The migration from legacy
  `GalleryImage` to canonical `MediaItem` is idempotent and additive
  (`migrateGalleryImageToMediaItem`).
- **Lineage:** every `MediaItem` carries `parentId: string | null`
  and `childrenIds: string[]`. Cross-page lineage is resolved by
  `useMediaStore.loadById(id)` (post-2026-06-06 fix) which fetches
  a single record from IDB and merges it into the in-memory cache.
- **Pagination:** `MEDIA_PAGE_SIZE = 60`, ordered by `timestamp` desc.
  `refresh()` resets; `loadMore()` appends. Off-screen cards use
  `content-visibility` to skip layout/paint.
- **Known limitations:** the inspector loads parent/children on
  demand; if a record was deleted from IDB but a stale child still
  references it, the inspector surfaces a missing-parent state. No
  automated repair path yet.

### Config System

- **YAML config:** optional `config.yaml` + `themes.yaml`. Locations
  follow env-override > repo-local (dev) > userData (packaged) >
  built-in defaults. Schema version 1.
- **Secure key import:** plaintext keys in `secrets.{venice,jina,
  minimax}_api_key` are imported into `safeStorage` on startup and
  the YAML is atomically rewritten to redact them. Awaited
  temp-file + rename; failure leaves the original YAML intact and
  surfaces an initialization error.
- **Env vars:** `VENICE_API_KEY`, `JINA_API_KEY`, `MINIMAX_API_KEY`
  (forward-compat), `VENICE_API_HOST`, `VENICE_API_BASE_PATH`,
  `VENICE_API_TIMEOUT_MS`, `MINIMAX_API_HOST`, `MINIMAX_API_BASE_PATH`,
  `DEFAULT_PROVIDER`, `PORT`, `HOST`, `RATE_LIMIT_*`, `MAX_PROXY_BODY_BYTES`,
  `NODE_ENV`, `TRUST_PROXY`, `VENICE_FORGE_CONFIG_FILE`,
  `VENICE_FORGE_THEMES_FILE`,
  `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE`,
  `VENICE_FORGE_DEBUG_DEVTOOLS`.
- **Redaction rules:** `sanitizeConfig` strips raw `secrets.*_api_key`
  values and replaces them with `has_*: boolean` flags. URL paths
  are rejected via `looksLikeUrl`. Control characters in paths are
  rejected. Unknown enum values fall back with a warning.

---

## Open TODO Ledger

> Living list. The MiniMax migration follow-ups are tracked in detail
> in `docs/POST_MINIMAX_M3_AUDIT.md` (F-1 through F-8).

### P0 — Must fix before release

- None outstanding at the end of the 2026-06-06 audit. The next
  release-blocking item is F-1 (wire MiniMax as a live transport),
  but that is a feature migration, not a release blocker for the
  Venice-only path.

### P1 — Should fix before release

- **F-3 MiniMax endpoint allowlist** — add
  `ALLOWED_MINIMAX_ENDPOINTS`, `MINIMAX_ENDPOINT_METHODS`, a
  `validateMiniMaxIpcRequest`, and `/api/minimax/*` proxy routes.
  Update `verify:safety-guard` to include the new boundary file.
- **F-1 Wire MiniMax as a live transport** — guarded by F-2/F-3/F-4.
- **F-4 Per-feature flags driven by `PROVIDER_CAPABILITIES`** — add a
  hydration-gated helper next to `assertConfigHydratedForSafety`.

### P2 — Hardening / follow-up

- **F-2 MiniMax SSE streaming parser** — sibling `extractMiniMaxStreamDelta`
  with a documented event shape and a synthetic fixture test.
- **F-5 Chat / image payload builders per provider** — dispatch on
  `LlmProvider` and emit a `ProviderRequest` discriminated union.
  Strip `venice_parameters.character_slug` on non-Venice transports.
- **F-6 MiniMax model discovery** — provider-aware hook in
  `src/hooks/use-models.ts`; per-provider `FALLBACK_MODELS` tables.
- **F-7 Tests for the MiniMax path** — extend the
  `tests/safety/guardPipeline.test.ts` template to cover MiniMax
  transport dispatch, payload builder shape, and local guard
  behaviour.
- **Inspector non-mutating telemetry expansion** — `VERIFY-016`
  currently locks the preview path; the same audit log is the
  natural place for a per-provider column.

### P3 — Polish / backlog

- **F-8 Documentation refresh** — mention the new provider in
  README / ABOUT / FAQ / REPO TREE / CONFIG; surface the active
  provider next to the safety toggles in Settings UI.
- **Media Studio automated repair for dangling parent refs** —
  the gallery inspector currently surfaces a missing-parent state
  with no recovery path.
- **Remove the deprecated `TABS` constant** from
  `src/constants/venice.ts` once enough time has passed; it's
  marked `@deprecated` as of 2026-06-06.

---

## Validation Matrix

> Latest known status of core commands as of the 2026-06-06 audit
> batch. Update this table only for commands actually run in the
> current session; "Not yet recorded" is the honest default for a
> fresh session that hasn't run a given command.

| Command                                      | Latest known result | Date       | Notes                              |
| -------------------------------------------- | ------------------: | ---------- | ---------------------------------- |
| `npm run lint:eslint`                        |   0 warnings, clean | 2026-06-06 | Zero-warnings enforced (`--max-warnings=0`) |
| `npx tsc --noEmit -p tsconfig.json`          |   0 errors, clean   | 2026-06-06 | Part of `npm run typecheck`        |
| `npx tsc --noEmit -p tsconfig.electron.json` |   0 errors, clean   | 2026-06-06 | Part of `npm run typecheck`        |
| `npm test`                                   | 1220 passed, 1 skipped | 2026-06-06 | Playwright Electron smoke is the 1 skip (no display) |
| `npm run verify:safety-guard`                |   3/3 boundaries pass | 2026-06-06 | No raw prompt logging or safety bypass patterns |
| `npm run verify:markdown-links`              | 50 Markdown files, no broken links | 2026-06-06 |  |
| `npm run build`                              |   dist + dist-electron + dist/server.cjs all built | 2026-06-06 |  |

---

## Agent Update Rules

Every future agent must:

1. Read this file before starting substantive work.
2. Update `Latest Session Summary` before ending work.
3. Append a new dated entry under `Session History`.
4. Update the `Open TODO Ledger` with any new, completed, or
   reprioritized tasks.
5. Update the `Validation Matrix` only for commands actually run.
6. Record failed commands honestly — do not silently omit them.
7. Link or name relevant files changed.
8. Preserve unresolved risks in their dedicated section.
9. Avoid secrets, API keys, private machine paths, and raw unsafe
   prompt payloads.
10. Keep entries factual, concise, and useful for the next agent.
