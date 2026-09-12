# Improvements — Venice Forge Exhaustive Audit (2026-09-12)

These items are not defects. They are non-blocking improvements observed during the audit re-pass.

## UX-1 — Surface MAX_CUSTOM_THEMES cap (referenced as VF-AUD-20260912-N6)

`src/stores/settings-store.ts:24, 288-304` truncates custom themes to 100 silently. The user is never told that their oldest theme was dropped.

**Suggestion:**
- Warn at 90 themes ("approaching limit").
- Hard-limit at 100 with a localized confirmation dialog.
- Or surface via the same toast pattern used for chat-store save failures (see P2-006 remediation).

## UX-2 — Surface MAX_PROFILES cap (referenced as VF-AUD-20260912-N7)

`src/stores/profile-store.ts:15, 65-68` throws an `Error` when the profile count reaches 20. The user sees a thrown error rather than a graceful limit message.

**Suggestion:**
- Replace `throw` with a returned `Result<{ ok: false; reason: 'limit'; limit: number }>` so the renderer can render a localized limit message.
- Use the same toast pattern as P2-006.

## DR-001 — Add an automated IPC parity verifier (referenced as VF-AUD-20260912-N1)

The IPC parity check (192 main handlers ↔ 192 preload invocations, 10 listeners ↔ main emitters) is currently manual. The prior audit was the first automated check; the next regression would slip through.

**Suggestion:**
Add `scripts/verify-ipc-parity.cjs` to the `verify:contracts` chain. The verifier must:
1. Resolve all `registerPrivilegedIpcChannel(CONST.path)` and template-literal registrations (`documentAgent:workspace:${channel}`) to concrete channel strings.
2. Collect `ipcRenderer.invoke('channel')` and `ipcRenderer.on('channel')` strings from `electron/preload.ts`.
3. Assert set equality (with documented exceptions for channels reachable only via the agent tool framework, e.g. `documentAgent:workspace:propose*`).

## STYLE-1 — chat-stream-manager unusual `?.` syntax (referenced as VF-AUD-20260912-N5)

`src/stores/chat-stream-manager.ts:293` uses `(err as Type)?.field` which is correct but stylistically unusual. Consider extracting to a local `const errStatus = err as { status?: number; statusCode?: number };` and using `errStatus?.status ?? errStatus?.statusCode ?? "unknown"`.

## STYLE-2 — `.finally(release)` depends on void return (referenced as VF-AUD-20260912-N4)

`electron/services/veniceClient.ts:749` uses `.finally(release)` which depends on `releaseVeniceSlot(): void`. Make the contract explicit by inlining a wrapper:

```typescript
.finally(() => { release(); })
```

or add a runtime assertion that `releaseVeniceSlot` returns `undefined`. Either form is robust to future refactors that might inadvertently return a value.

## EDGE-1 — `assertPathContained` exact-root edge case (referenced as VF-AUD-20260912-N3)

`electron/services/configService.ts:155-173` rejects the exact-root case (when `resolved === allowedRoots[i]`) because `path.relative(root, resolved)` returns `""` (falsy). Not exploitable, just overly strict. Replace `relative && ...` with `relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))` to allow exact-root matches.

## DOC-1 — Audit package registration

The audit package `docs/audits/venice-forge-exhaustive-audit-2026-09-12/` must be registered in `docs/DOCS_INDEX.md` per AGENTS.md §7. The audit ledger update is captured as a separate todo and is not auto-applied by this audit (the dirty state must be committed by the Lead Dev).

## DOC-2 — Add a `summary_of_work.md` entry for this audit

Per AGENTS.md §7 each substantive audit must append to `docs/summary_of_work.md`. The entry should record the audit SHA, the re-verification outcome (19/19 repaired, 0 new confirmed defects), and link to this package.

## DOC-3 — Future audits should enumerate contract test count as a release gate

The current `verify:contracts` checks 104 contract assertions. A future audit could surface this as a release-gate count (e.g. require "≥100 contract assertions" in the release readiness verifier). Low priority.

## DOC-4 — `MAX_CUSTOM_THEMES = 100` and `MAX_PROFILES = 20` constants

Both are now extracted to module-level constants. Consider also exporting them through `src/config/limits.ts` so that the renderer can show the user "X of 100 themes" placeholders.

## DOC-5 — Provider field allow-lists in `providerAdapters.ts` could be sourced from a YAML config

Currently `PROVIDER_OPERATION_FIELDS` is hand-written in TypeScript (lines 38-121). This is fine for the current scope, but a future enhancement could move this to `docs/reference/provider-fields.yaml` to reduce drift risk when providers add new fields.

## Performance observations (non-defect)

- `electron/services/veniceClient.ts:749` — `.finally(release).then(response => ...)` is correct but creates an extra microtask. Could be inlined as a single `.then(response => { release(); return response; })` for slightly less overhead. Negligible.

- `src/stores/chat-stream-manager.ts:154-162` — `flushStreamDelta` uses a 40ms timer per conversation. With many concurrent conversations this can fan out to many timers. Consider a single flush loop.

These are not actionable defects; they are noted for future work.

## Architecture observations (non-defect)

- The IPC channel constants live in `src/types/desktop.ts` (renderer side) but are referenced from main-process handler files via deep imports (`from "../../../src/types/desktop"`). This is fine for a single-repo Electron app but would couple badly in a multi-package split. Document this decision in `docs/architecture/ipc.md` if such a split is ever planned.

- `electron/services/veniceClient.ts` is a 795-line file that mixes transport, retry, fallback, SSE parsing, and concurrency. A future refactor into `transport.ts`, `retry.ts`, `fallback.ts`, `sse.ts`, and `concurrency.ts` would improve testability. Out of scope for this audit.

- The `electron/agent/runtime/` directory is the runtime authority for the agent tool loop and could benefit from a per-iteration invariant contract test (the test suite currently covers the surface but not the cross-iteration invariants).

## Accessibility observations (non-defect)

- `src/components/research/ResearchWorkspaceView.tsx` uses `tRuntime` for `aria-label` and `placeholder` — this is correct and matches the rest of the codebase. No new accessibility defects were discovered.

## i18n observations (non-defect)

- All 12 locales and 12 en-US namespaces are validated by `verify:i18n`.
- The hardcoded-strings regression baseline check passes with 0 regressions.
- Non-English locales remain `isProductionComplete: false` until `docs/i18n/native-review-status.json` records a qualified reviewer (per AGENTS.md §14). This is the correct state.
