# Review Coverage — Venice Forge Exhaustive Audit (2026-09-12)

## Inventory baseline

| Metric | Value |
| --- | --- |
| Tracked files (`git ls-files`) | 1899 |
| TypeScript source (`.ts`) | 952 |
| TypeScript React (`.tsx`) | 227 |
| Test files (`.test.ts` / `.test.tsx` / `.spec.ts`) | 520 |
| Markdown documentation | 323 |
| JSON config | 168 |
| CJS scripts | 74 |
| YAML | 55 |
| SVG assets | 20 |
| OGG audio | 20 |
| PNG assets | 17 |
| CI workflow files | 4 |
| `.nvmrc` | 1 |
| `.html` | 1 |
| `.ico` / `.icns` icons | 2 |

## Source-code distribution

| Area | TS files | TSX files |
| --- | --- | --- |
| `src/` | 644 | 227 |
| `electron/` | 220 | 0 |
| `scripts/` (mostly CJS, ~5 .mjs) | 5 | 0 |

## Review scope — this re-verification pass

The audit focused on the highest-risk surfaces that map to the prior 19-finding remediation and to the cross-layer trust boundaries:

### Priority A — IPC trust boundary (manually reviewed)

| File | Lines | Reviewed |
| --- | --- | --- |
| `electron/preload.ts` | 907 | YES |
| `electron/main.ts` | 558 | partial (registration calls) |
| `electron/ipc/handlers/index.ts` | 74 | YES |
| `electron/ipc/handlers/veniceHandlers.ts` | 143 | YES |
| `electron/ipc/handlers/common.ts` | 79 | YES |
| `electron/ipc/handlers/documentAgentHandlers.ts` | 510 | partial (workspace channel parity) |
| `electron/ipc/handlers/imageInspectorHandlers.ts` | ~140 | YES |
| `electron/ipc/handlers/characterCardFileHandlers.ts` | n/a | referenced |
| `electron/ipc/handlers/characterCreatorHandlers.ts` | n/a | YES |
| `src/services/desktopBridge.ts` | 2715 | partial (focused on diff hunks) |
| `src/types/desktop.ts` | ~680 | YES (channel constants) |

### Priority A — Venice API integration (manually reviewed)

| File | Lines | Reviewed |
| --- | --- | --- |
| `electron/services/veniceClient.ts` | 795 | YES (full) |
| `electron/services/veniceClient.stream.test.ts` | 210 | YES (new regression test) |
| `electron/services/veniceClient.error.test.ts` | 107 | YES |
| `electron/services/veniceClient.retryAfter.test.ts` | 397 | YES |
| `electron/services/veniceClient.multipart.test.ts` | n/a | referenced |
| `electron/services/veniceClient.sseParser.test.ts` | n/a | referenced |
| `electron/services/veniceClient.adapters.test.ts` | n/a | referenced |
| `electron/services/providerAdapters.ts` | 733 | YES (focused) |
| `electron/services/guardPipeline.ts` | 349 | YES (full) |
| `src/shared/sseStreamDecoder.ts` | n/a | referenced |
| `src/shared/veniceSafeMode.ts` | n/a | referenced |
| `src/shared/veniceStreamDelta.ts` | n/a | referenced |
| `src/shared/safety/promptPayloadExtractor.ts` | 285 | YES (denylist diff) |
| `src/types/venice.ts` | 474 | YES (max_completion_tokens diff) |

### Priority A — Stores, persistence, and config (manually reviewed)

| File | Lines | Reviewed |
| --- | --- | --- |
| `src/stores/chat-store.ts` | 1682 | YES (diff hunks) |
| `src/stores/chat-stream-manager.ts` | 317 | YES (full) |
| `src/stores/chat-store.flush.test.ts` | n/a | YES (test exists) |
| `src/stores/chat-stream-manager.test.ts` | n/a | YES |
| `src/stores/settings-store.ts` | 485 | YES (full) |
| `src/stores/profile-store.ts` | 230 | YES (full) |
| `electron/services/configService.ts` | 914 | YES (full) |
| `electron/services/chatFolderService.ts` | 348 | YES (any-cast fix) |

### Priority B — Tool registry / agents (manually reviewed)

| File | Reviewed |
| --- | --- |
| `src/agent/registry/tool-registry.ts` | YES (tool gating) |
| `src/agent/registry/tool-name-map.ts` | YES (full) |
| `electron/agent/runtime/agent-tool-executor.ts` | partial (workspace propose*) |
| `electron/agent/approvals/plan-factories.ts` | referenced |

### Priority B — Renderer UI surface

| File | Reviewed |
| --- | --- |
| `src/components/chat/message-bubble.tsx` | YES (any-cast diff) |
| `src/components/research/ResearchWorkspaceView.tsx` | partial (i18n scan) |
| `src/App.tsx` | referenced (console.error only) |
| `src/main.tsx` | referenced (console.error only) |

### Priority B — i18n, theme, assets

| Area | Reviewed |
| --- | --- |
| `src/i18n/resources/en-US/*` | YES (catalog exists for 12 namespaces) |
| `src/i18n/resources/{de,es,fr,...}` | enumerated |
| `src/theme/*.ts` | referenced |
| `public/` assets | referenced |

### Priority B — CI / release

| File | Reviewed |
| --- | --- |
| `.github/workflows/ci.yml` | YES (first 100 lines) |
| `.github/workflows/release.yml` | YES (signing + notarization gates) |
| `.github/workflows/codeql.yml` | YES (full) |
| `.github/workflows/dependency-review.yml` | YES (full) |

### Priority C — Generated / vendor / config (excluded)

| Excluded | Reason |
| --- | --- |
| `node_modules/` | vendored dependencies |
| `dist/` | Vite build output |
| `dist-electron/` | Electron bundle output |
| `.git/` | git internals |
| `package-lock.json` | generated artifact |
| `coverage/` | test coverage output |

## Files reviewed in this pass (counted)

- Priority A (IPC + Venice + persistence + config): ~30 files
- Priority B (tool registry + agents + UI + i18n + CI): ~50 files
- Total substantive files reviewed this pass: ~80

The remaining ~1100 source files were covered by the prior audit's `review-ledger.csv` and are not duplicated here. The prior audit's ledger remains the authoritative record of per-file coverage for the full ~1179-file sweep.

## Verification gates executed

| Gate | Status |
| --- | --- |
| Lint (`npm run lint:eslint`) | PASS — 0 errors / 0 warnings |
| Typecheck (`npm run typecheck` × 3 projects) | PASS |
| Tests (`npm test -- --run`) | PASS — 5855 passed / 3 skipped (513 files) |
| Contracts (`npm run test:contracts`) | PASS — 269 passed (23 files) |
| Build (`npm run build`) | PASS |
| i18n (`npm run verify:i18n`) | PASS — 12 locales, 12 namespaces |
| Hardcoded regressions (`npm run verify:i18n-hardcoded-regressions`) | PASS — 0 regressions |
| Contracts verifier (`npm run verify:contracts`) | PASS — 104 contracts |
| Safety guard (`npm run verify:safety-guard`) | PASS |

## Unreviewed surfaces (gap acknowledgement)

Per the audit's priority ordering, the following surfaces were **not** manually reviewed in this re-pass and remain covered only by the prior audit's ledger + the test suite:

- Document agent executors beyond the `workspace.propose*` parity check.
- Sync engine (`electron/services/sync*`, `src/sync*`) beyond enumeration.
- Backup / import / recovery flows (covered indirectly by contract tests).
- Audio / video generation paths (covered by existing tests).
- The full ~1179-file source sweep is delegated to the prior audit's ledger.

The 80-priority-file review above is sufficient to verify the 19 prior-finding remediations and to detect the new design risks and improvements recorded in `FINDINGS.md`. A future exhaustive audit should consider:

1. Full file-by-file review of `electron/agent/runtime/agent-tool-executor.ts` (currently partial).
2. Full review of sync engine internals.
3. Runtime manual testing per AGENTS.md §32 — outside the scope of this re-verification.

## Working tree status at audit close

- Modified tracked files: 32 (pre-existing user-owned remediation; preserved verbatim per AGENTS.md §5)
- Untracked files: 1 directory (this audit package)
- Stash: none
