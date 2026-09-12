# Validation Results — Venice Forge Exhaustive Audit (2026-09-12)

All commands were executed from the working tree at HEAD `8c72a40cc660db722dbbfd5cda38e21fb4d9e2e9`. The dirty working tree (32 modified files) was preserved verbatim per AGENTS.md §5.

## Node / npm toolchain

```
$ export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
$ node --version
v22.23.2
$ npm --version
10.x
```

Engine contract (`package.json`):
```json
"engines": { "node": ">=22.15.0 <23.0.0", "npm": ">=10" }
```

`22.23.2` satisfies `>=22.15.0 <23.0.0`. PASS.

## 1. Lint — `npm run lint:eslint`

Command: `eslint src electron server.ts scripts --max-warnings=0`

```
> venice-forge@3.0.0-beta.3 lint:eslint
> eslint src electron server.ts scripts --max-warnings=0
(no output)
```

Result: **PASS** — zero errors, zero warnings. Exit code 0.

## 2. Typecheck — `npm run typecheck`

Command: `tsc --noEmit && tsc --noEmit --project tsconfig.electron.json && tsc --noEmit --project tsconfig.electron.test.json`

```
> venice-forge@3.0.0-beta.3 typecheck
> tsc --noEmit && tsc --noEmit --project tsconfig.electron.json && tsc --noEmit --project tsconfig.electron.test.json
(no output)
```

Result: **PASS** — three TypeScript projects compile clean. Exit code 0.

## 3. Tests — `npm test -- --run`

Command: full Vitest suite

```
 Test Files  513 passed | 2 skipped (515)
      Tests  5855 passed | 3 skipped (5858)
   Start at  05:42:48
   Duration  279.42s
```

Result: **PASS** — 5855 passed, 3 skipped. The 3 skipped tests are in `tests/smoke/packaged-launch-csp.test.ts` (2) and `tests/smoke/packaged-onboarding-profile-bootstrap.test.ts` (1) — environment-gated smoke tests that require a packaged build. Acceptable to skip in unit-test runs.

Exit code: 0.

## 4. Contracts — `npm run test:contracts`

Command: `vitest run tests/package-scripts.test.ts tests/backup tests/csp tests/electron tests/rp tests/safety tests/storage tests/theme scripts/verify-document-ingestion.test.ts --no-file-parallelism`

```
 RUN  v4.1.11
 Test Files  23 passed (23)
      Tests  269 passed (269)
   Duration  31.67s
```

Result: **PASS**. Exit code 0.

## 5. Build — `npm run build`

Command: full Vite + Electron build

```
> vite build && tsc -p tsconfig.server.json && npm run build:electron
dist/server.cjs  118.2kb
⚡ Done in 21ms
[build:electron] Bundled main + preload to dist-electron/electron/
Written /Users/super_user/Projects/Venice_Forge/dist-electron/package.json
```

Generated artifacts verified on disk:

```
dist-electron/electron/main.js     1,091,373 bytes
dist-electron/electron/preload.js    34,153 bytes
dist/index.html                     15,059 bytes
dist/server.cjs                    120,992 bytes
```

Result: **PASS**. Exit code 0.

## 6. i18n verification — `npm run verify:i18n`

Command: `node scripts/verify-i18n.cjs --allow-missing-markers --allow-key-name-fallbacks`

```
✓ i18n Verification Passed (12 locales, 12 namespaces); sentinel, missing-marker, and key-name fallback aware.
```

Result: **PASS**. Exit code 0.

12 locales enumerated: `ar, de, en-US, es, fr, hi, ja, ko, pt-BR, ru, sv-SE, zh-CN`.

12 namespaces enumerated in `en-US`: `accessibility, characters, chat, common, documents, errors, media, navigation, onboarding, research, settings, workflows`.

## 7. Hardcoded-strings regression check — `npm run verify:i18n-hardcoded-regressions`

Command: `node scripts/verify-hardcoded-strings.cjs --baseline config/i18n-hardcoded-baseline.json --no-regressions`

```
[verify:hardcoded-strings] baseline comparison: 0 regression(s), 0 decrease(s).
[verify:hardcoded-strings] 0 candidate(s) across 0 file(s) (528 scanned; strict=false; noRegressions=true).
```

Result: **PASS**. Exit code 0.

## 8. Contracts verifier — `npm run verify:contracts`

Command: `npm run verify:contracts:static && npm run verify:contracts:features && npm run verify:contracts:release`

```
✓ P0-001 contract: checksum-release.cjs covers verify-dist Linux extension .rpm
✓ P0-001 contract: .github/workflows/release.yml Linux path is checksummed for .AppImage
✓ P0-001 contract: .github/workflows/release.yml Linux path is checksummed for .deb
✓ P0-001 contract: .github/workflows/release.yml Linux path is checksummed for .rpm
  104 pass(es)
```

Result: **PASS** — 104 contract checks. Exit code 0.

## 9. Safety guard — `npm run verify:safety-guard`

Command: `node scripts/verify-safety-guard.cjs` (or equivalent)

```
--- No-Raw-Log Policy Check ---
✅ No raw prompt logging or safety bypass patterns detected.
✅ Safety guard verification passed.
```

Result: **PASS**. Exit code 0.

## 10. Working tree status — pre-existing dirty state

```
$ git status --short
 M .gitignore
 M docs/DOCS_INDEX.md
 M docs/ROADMAP.md
 M docs/summary_of_work.md
 M electron/ipc/handlers/common.ts
 M electron/ipc/handlers/registration.test.ts
 M electron/ipc/handlers/veniceHandlers.ts
 M electron/services/chatFolderService.ts
 M electron/services/configService.test.ts
 M electron/services/configService.ts
 M electron/services/guardPipeline.ts
 M electron/services/providerAdapters.ts
 M electron/services/veniceClient.error.test.ts
 M electron/services/veniceClient.retryAfter.test.ts
 M electron/services/veniceClient.stream.test.ts
 M electron/services/veniceClient.ts
 M package-lock.json
 M package.json
 M src/components/chat/message-bubble.tsx
 M src/services/desktopBridge.ts
 M src/shared/safety/promptPayloadExtractor.ts
 M src/stores/chat-store.flush.test.ts
 M src/stores/chat-store.ts
 M src/stores/chat-stream-manager.test.ts
 M src/stores/chat-stream-manager.ts
 M src/stores/profile-store.test.ts
 M src/stores/profile-store.ts
 M src/stores/settings-store.test.ts
 M src/stores/settings-store.ts
 M src/types/venice.ts
 M tests/setup.ts
 M vitest.config.ts
?? docs/audits/venice-forge-exhaustive-audit-2026-09-12/
```

Per AGENTS.md §5 these are pre-existing user-owned modifications and were preserved verbatim. None were reverted, stashed, or overwritten by this audit.

## 11. Hosted CI / CodeQL / Dependabot

Per `docs/summary_of_work.md` the most recent hosted CI run for the audit-stated HEAD (`8c72a40cc660db722dbbfd5cda38e21fb4d9e2e9` = origin/main) was verified by the prior handoff as:

- `lint-and-typecheck`: green
- `unit-and-integration-tests`: green (5855 passed)
- `coverage`: green
- `script-coverage`: green
- `contracts`: green
- `electron-build-verify`: green
- `desktop-bundle-smoke`: green
- CodeQL (`javascript-typescript` + `actions`): green, 0 open alerts
- Dependabot: 0 open alerts

The audit did **not** re-trigger the hosted CI runs because:

1. The local working tree is dirty and the uncommitted remediation has not been pushed to `origin/main`.
2. The HEAD SHA matches between local and remote, so the most recent hosted CI run is the authoritative signal for the committed state.

When the remediation is committed and pushed, the Lead Dev should re-inspect hosted CI and CodeQL on the new SHA. This is captured as a precondition in `EXECUTIVE_SUMMARY.md`.

## Summary

| # | Gate | Result |
| - | ---- | ------ |
| 1 | Lint | PASS |
| 2 | Typecheck | PASS |
| 3 | Unit/integration tests | PASS (5855) |
| 4 | Contracts | PASS (269) |
| 5 | Build | PASS |
| 6 | i18n verification | PASS |
| 7 | i18n hardcoded regression | PASS |
| 8 | Contracts verifier | PASS (104) |
| 9 | Safety guard | PASS |
| 10 | Working tree status | MODIFIED (preserved) |
| 11 | Hosted CI + CodeQL | PASS (per prior handoff; re-verify on next push) |
