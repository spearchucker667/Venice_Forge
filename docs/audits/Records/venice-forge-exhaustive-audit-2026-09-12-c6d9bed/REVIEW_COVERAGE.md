# Review Coverage — audit of `main` @ `c6d9bed3`

## Coverage numbers

| Category | Count | Status |
|---|---|---|
| Tracked files (git ls-files) | 1,938 | all accounted for below |
| Renderer TypeScript/TSX (`src/**`) | 866 | prioritized review (see ledger) |
| Electron TypeScript (`electron/**`) | 222 | prioritized review (see ledger) |
| Scripts (`scripts/*`) | 120 | verified by execution + spot review |
| Documentation (`docs/**/*.md` + root) | ~330 | verified via `verify:markdown-links` (335 files, 0 broken) + fact spot-checks |
| CI/workflows (`.github/`) | 12 | fully reviewed (see `CI_REVIEW.md`) |
| Build/packaging config (root + `electron-builder.config.cjs` + tsconfigs + vite/vitest/eslint configs) | 20 | fully reviewed |
| i18n resources (`src/i18n/resources/**`, 12 locales × 12 namespaces) | 144 | verified via `verify:i18n` + regression gate |
| Generated / vendor / binary (lockfile, assets, fonts, fixtures, snapshots) | remainder | NOT APPLICABLE / GENERATED / BINARY |
| Tests reviewed in-depth | 40+ files | regression tests for every prior P1 read; smoke suite read in full |

## Review depth statement

Per the work order's own honesty rules, this audit does **not** claim a literal
line-by-line reading of all 1,088 source files. Coverage is:

1. **Fully read (line-by-line, this session):** every file implicated in the two
   remediation commits' security/data-integrity surfaces — `customProtocolAccess.ts`,
   `customProtocolCapabilities.ts`, `atomicFileReplace.ts`, `rendererCsp.ts`,
   `conversationVault.ts` (key + atomic-write paths), `promptPayloadExtractor.ts`
   (reservation logic), `guardPipeline.ts` (withholding path), `chatTtsBridge.ts`,
   `chat-stream-manager.ts` (in full, 413 lines), `veniceClient/stream.ts` (in full,
   438 lines), `sseStreamDecoder.ts` (in full, 357 lines), `systemHandlers.ts`
   (`conversations:save`), `fileHandlers.ts` (capability issuance + PNG/JPEG/WEBP
   validation), `main.ts` (protocol handlers + window + CSP wiring),
   `chat-store.ts` (persistence/flush), `background-task-store.ts` (URL persist),
   `character-card-store.ts` (detach), `workflowRunner.ts` (in full),
   `media-request-adapter.ts` (edit/upscale/bg-remove builders),
   `smoke-utils.ts` + `packaged-launch-csp.test.ts` (in full), both CI/release
   workflows (in full), `electron-builder.config.cjs` (signing/notarization excerpts),
   `.github/workflows/codeql.yml`, `activeProfile.ts` + `safe-storage.ts`.
2. **Verified by execution + targeted reading:** every `verify:*` contract (25+
   verifiers), the 5,936-test suite, lint/typecheck, build/dist, npm audit.
3. **Static-search reviewed with every hit classified:** the §28 pattern set across
   `src/`, `electron/`, `server.ts`.
4. **Not re-reviewed line-by-line in this pass** (explicit remainder): the majority of
   view components under `src/components/**` beyond the chat/RP/media persistence
   surfaces read above, and the bulk of `scripts/*.cjs` beyond their verifier outputs.
   These were covered by the full test suite, contract verifiers, and the same-day
   prior audit's targeted review; they were not independently line-audited here. This
   remainder is exactly where future audit effort should start.

## Ledger

`review-ledger.csv` records per-subsystem status (REVIEWED / VERIFIED-BY-EXECUTION /
STATIC-SEARCH / NOT APPLICABLE / GENERATED / BINARY / REMAINDER-UNREVIEWED). Row counts
follow the inventory above; the CSV is the machine-readable companion required by §39.
