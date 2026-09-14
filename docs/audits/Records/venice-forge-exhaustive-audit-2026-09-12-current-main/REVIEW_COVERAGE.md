# Review Coverage

## Baseline

- **Total tracked files:** 1,914
- **Substantive source/config/test files:** ~1,250
- **Generated/vendor/build files:** ~650 (node_modules, dist, dist-electron, coverage, lockfiles, etc.)
- **Audit date:** 2026-09-12
- **Commit:** `84cf5bbe` (main, v3.0.0-beta.3)

## Coverage by subsystem

| Subsystem | Files (tracked) | Review depth | Findings | Notes |
|---|---|---|---|---|
| Electron main-process security (`electron/main.ts`, `preload.ts`, `utils/*`, protocols, CSP, navigation, safeStorage) | ~35 | Deep line-by-line | 4 | Agent completed; all trust-boundary files read |
| Electron IPC (`electron/ipc/**`) | 43 | Deep line-by-line | 9 | Channel inventory built (206 channels); parity gaps found |
| Electron services — guard/secrets/safety (`electron/services/guardPipeline.ts`, `providerSettingsStore.ts`, `secureStore.ts`, etc.) | ~25 | Deep line-by-line | 7 | Taint chains traced |
| Electron services — storage/backup/sync (`electron/services/chatStorage*`, `conversationVault.ts`, `generatedMediaStore.ts`, `sync*`, etc.) | ~40 | Deep line-by-line | 14 | Path containment, atomicity, recovery custody reviewed |
| Venice client & streaming (`src/services/veniceClient/**`, `desktopBridge.ts`, `server.ts`) | ~15 | Deep line-by-line | 9 | Swagger contract compared for used endpoints |
| Renderer stores & persistence (`src/stores/**`, `storageService.ts`, `dbMigrations.ts`) | 87 | Deep line-by-line (agent) + targeted manual | 11 | Agent report lost due to quota; reconstructed manually from verified snippets |
| Chat UI (`src/components/chat/**`) | ~22 | Targeted scan / not line-by-line | 0 new | Subagent quota prevented deep review; no new P1 found in targeted scan |
| Media UI (`src/components/gallery/**`, `src/components/image/**`) | ~25 | Targeted scan / not line-by-line | 0 new | Subagent quota prevented deep review |
| Remaining UI + a11y (`src/components/*` excluding above) | ~170 | Targeted scan / not line-by-line | 0 new | Focus on wiring, modals, focus, keyboard; no new P1 found |
| Theme engine (`src/theme/**`, `config/themes/`) | ~77 | Verifier + targeted scan | 0 new | `verify:theme-tokens` passes; 22 i18n warnings reviewed |
| i18n (`src/i18n/**`) | 155 | Verifier + targeted scan | 0 new | `verify:i18n` passes with warnings; hardcoded-regression verifier passes |
| Domain services & agent parity (`src/services` excl. Venice/storage, `src/agent/**`, `src/lib/**`, `src/hooks/**`, `src/utils/**`, `electron/agent/**`) | ~200 | Targeted scan / not line-by-line | 0 new | Subagent quota prevented deep review; no new P1 in sampled files |
| Tests (`tests/**`, `*.test.ts`) | ~300 | Test-quality scan | 0 new | 3 conditional skips found; no `.only`; no tautological patterns in sample |
| CI/CD (`.github/workflows/**`) | 12 | Standard review | 0 new | Pinned actions, least-privilege, release jobs reviewed |
| Build / packaging / deps (`package.json`, `electron-builder.config.cjs`, `vite.config.ts`, `tsconfig*`) | ~20 | Standard review | 0 new | Versions consistent; no unused deps in sample |
| Documentation (`docs/**`, `README.md`, etc.) | 336 | Spot-check | 0 new | AGENT_REINIT version claims spot-checked against package-lock |

## Explicitly not reviewed

- **Packaged Electron runtime smoke / manual QA:** not executed (requires signed build or `RUN_ELECTRON_SMOKE=true` environment).
- **Signed/notarized artifact verification:** not executed (requires release signing credentials).
- **Paid-provider live calls:** not executed (requires API key and funded account).
- **Full line-by-line review of the second-wave domains** (chat UI, media UI, remaining UI, theme/i18n, domain services, tests/CI/docs) was not completed because the dedicated subagents were stopped by provider quota. Those domains were covered by targeted manual review, static search, and existing verifier scripts instead.

## File-level ledger

See `review-ledger.csv` for a per-file status entry. The CSV marks each tracked file as one of:

- `REVIEWED` — manually or agent-reviewed line-by-line
- `SCANNED` — covered by targeted static search / verifier
- `GENERATED` — build output or generated artifact
- `VENDORED` — third-party or copied-in content
- `BINARY` — non-text asset
- `NOT_APPLICABLE` — not part of the application (e.g. root license files)
