# Review coverage

Baseline: `c3ae21af2f723111d92b43c7888a60930226d213`
Tracked files: **1834**
Substantive (ledger): **1535**
Non-substantive generated/binary/historical/inactive: **299**

## Honesty statement

This audit **inventoried every tracked file** (`git ls-files` → `review-ledger.csv`).

It did **not** perform a principal-auditor line-by-line reading of all 1535 substantive files in one sitting. Claiming that would be false. Coverage was:

| Depth | What it means | Surfaces |
|---|---|---|
| Deep semantic | Manual read of control flow, trust boundaries, and contracts with file:line evidence | Electron main/preload/IPC/security utils; Venice client (renderer + main); SSE decoder; safety/guard; chat-stream-manager; workflow image/video nodes; package.json/CI/release; swagger snapshot vs implementation |
| Specialist pass | Parallel reviewers assigned to subsystem trees with the same evidence rules | Document agent, persistence/stores, media/paid queue, server proxy, UI/a11y/theme, i18n, tests/CI, historical revalidation |
| Verifier / compiler / tests | ESLint, tsc, vitest shards, `verify:*` scripts | Entire `src/`, `electron/`, `scripts/`, `server.ts` |
| Inventory | Classified, not semantically re-derived | Binary assets, generated i18n catalogs, swagger YAML snapshot, lockfile, historical audit Records |

`review-ledger.csv` uses the assignment’s status vocabulary (`REVIEWED` / `NOT APPLICABLE` / `GENERATED` / `BINARY`). For `REVIEWED` rows, `review_method` records the actual depth. Do not treat every `REVIEWED` cell as “a human read every line.”

## Inventory summary

From `scratch/inventory-summary.json`:

| Kind | Count |
|---|---:|
| source | 728 |
| test | 521 |
| documentation | 192 |
| generated | 146 |
| not applicable (historical/inactive) | 103 |
| configuration | 62 |
| binary | 50 |
| support | 32 |

## Deep-reviewed entry points (principal)

- `electron/main.ts`, `electron/preload.ts`
- `electron/ipc/handlers/**` (registration, venice, apiKey, sync, file, system)
- `electron/utils/{validateIpcSender,customProtocolAccess,urlSecurity}`
- `electron/services/{veniceClient.ts,secureStore.ts,providerSettingsStore.ts,bridgeServer.ts,syncFolderWatcher.ts writePacket}`
- `src/services/veniceClient/**`, `src/shared/sseStreamDecoder.ts`, `src/shared/veniceSafeMode.ts`
- `src/stores/chat-stream-manager.ts`, `src/agent/registry/tool-registry.ts`
- `src/lib/workflow-engine.ts` image/video/audio nodes
- `src/shared/venice-media-contract/payload-builders.ts`, `src/utils/payloadBuilders.ts`
- `server.ts` (principal re-read of `/api/venice` handler, FSM interceptor, `createProxyMiddleware` construction vs `http-proxy-middleware` 4.2 bind-at-constructor; Jina `fetch` redirects)
- `electron/agent/runtime/{agent-tool-executor,tool-execution-context}.ts`, `electron/agent/attachments/attachment-registry.ts`, `documentAgentHandlers.ts` session helpers
- `.github/workflows/*`, `electron-builder.config.cjs`, `package.json`, `scripts/write-signature-evidence.cjs`

## Intentionally not line-reviewed as product behavior

- `docs/audits/Records/**` — historical hypotheses only
- `docs/reference/venice-api-upstream/**` — generated/vendored API docs
- `src/i18n/resources/**` except en-US structure — generated catalogs; `verify:i18n` is the authority
- `package-lock.json` — mechanical; audited via `npm ls` / `npm audit`
- `inactive-features/**` — archived
- Binary icons, fonts, ogg, png, gif

## Remaining unreviewed risk

UI component files not in the deep list (large `src/components/**` set) were covered by tests (`test:ui` in `test:ci`), i18n/hardcoded-string verifiers, and a specialist UI pass. A unique interaction bug in an unopened tab is the largest residual product-risk of incomplete line review.

Headed desktop click-through of every tab was **not** performed in this session (see RUNTIME_TEST_RESULTS.md). Hosted packaged smoke on this SHA did launch the real app on three OSes.

Specialist scratch (`scratch/*.md`) is **not** authority. Continuation 2026-09-10 independently promoted unique confirmed items only (P1-007/008, P2-013–024, P3-008/009). Remaining specialist P2/P3 lists stay in scratch unless revalidated. UI/a11y/theme was static-only (no headed session).
