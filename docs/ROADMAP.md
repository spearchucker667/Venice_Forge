# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; retained scan reports are audit input, not current status authority.

## Current Work

External signed / paid / two-device / screen-reader release evidence remains the only release blocker:

1. **VF-VERIFY-005 — Produce signed, paid-operation and manual release evidence (P1 release work; externally blocked).** Run signed/notarized macOS and signed Windows clean-install/update, secure-storage, paid generation, restart recovery, two-device sync, and screen-reader/high-zoom/theme/sound QA without recording secrets. Detailed evidence, root cause, automated validation, manual QA and acceptance criteria remain in `docs/reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md`. The dependency-migration tree passes hosted Node 22 CI, coverage, CodeQL, macOS/Windows sensitive tests, packaged Electron smoke jobs, the complete correctness surface, aggregate contracts, and unsigned arm64 and x64 macOS DMG/ZIP builds with checksums. Completion requires resources absent from this environment: GitHub has no release signing secrets, this Mac has no valid code-signing identity, no second device is available, and paid provider operations require explicit expenditure authorization and credentials. These missing prerequisites must not be relabeled as successful QA.

## Active Audit Reconciliation

The most recent local audit lives at `docs/audits/Venice_Forge-audit-evidence-20260717-031029/`. Its twelve findings (`VF-SCAN-20260717-031029-001..012`) are tracked here; session evidence, regression-guard diffs, and validation results belong in `docs/summary_of_work.md`. Status here reflects only the live tree; audit text is immutable.

- **P1 release blockers — all closed in 2026-07-17 session.**
  - `VF-SCAN-20260717-031029-001` (transcription client): closed — canonical `/audio/transcriptions` client with closed allowlists in `src/services/veniceClient/transcription.ts`; wired through `src/hooks/use-audio.ts`. Regression: `src/services/veniceClient/transcription.test.ts`, `src/hooks/use-audio.test.tsx`.
  - `VF-SCAN-20260717-031029-002` (provider `safe_mode` wiring): closed — runtime snapshot sync at `electron/services/runtimeSafetySettings.ts`; web pre-dispatch at `src/services/veniceClient/fetch.ts`; main-process override at `electron/services/guardPipeline.ts:95-104`; persistence at `electron/services/configService.ts`. Regression: `tests/safety/veniceSafeMode.test.ts`, `tests/safety/guardPipeline.test.ts`.
  - `VF-SCAN-20260717-031029-003` + `VF-SCAN-20260717-031029-005` (profile-isolated chat deletion and TTS cache): closed — `electron/services/chatStorage.ts` adds `purgeProfileChatHistory`; `electron/services/chatTtsBridge.ts` rebuilds the cache around per-profile directories; `electron/ipc/handlers/chatTtsHandlers.ts` and `electron/main.ts` route the `venice-tts://` protocol through the active session. Regression: `electron/services/chatStorage.test.ts`, `electron/services/chatTtsBridge.test.ts`, `electron/services/profilePurge.test.ts`, `src/services/chatTtsController.test.ts`.
- **P2 durability — all closed in 2026-07-17 session.**
  - `VF-SCAN-20260717-031029-004` (bounded test runner): closed — `scripts/run-bounded-test-shards.cjs` now kills the full process tree (POSIX group kill + Windows `taskkill /T /F`).
  - `VF-SCAN-20260717-031029-006` (shutdown log race): closed — `electron/services/appShutdownCoordinator.ts` runs durable cleanup in parallel and sequences `flushLogs()` as the final ordered phase; stderr fallback for late diagnostic emissions.
  - `VF-SCAN-20260717-031029-007` (roadmap overstatement): closed — this file.
- **P3 bounded debt — still open.**
  - `VF-SCAN-20260717-031029-008` (verify-provider-adapters portability): tracked only; `vi.mock('electron')` relocation to `tests/setup.ts` deferred to a separate work order.
  - `VF-SCAN-20260717-031029-009` (`enhancePrompt` extraction): tracked only; `@deprecated` no-op fallthrough at `src/shared/safety/promptPayloadExtractor.ts` deferred to a separate work order.
  - `VF-SCAN-20260717-031029-010..012` (documentation trackers): tracked only via `docs/summary_of_work.md` Open TODO Ledger; no code change required.

## Audit Input

- `docs/audits/Venice_Forge-audit-evidence-20260717-031029/EVIDENCE_MANIFEST.md` is immutable audit evidence for the 2026-07-17 03:10 deep scan and the canonical retained evidence path referenced by `verify:roadmap-current`. The current task listing in this roadmap is the only live truth surface for the audit's findings.
- Prior audit evidence bundles (`Venice_Forge-audit-results-20260716-224749`) live under the `docs/audits/Records/` history directory and are no longer authoritative retained evidence.
- `VF-SCAN-20260716-001..024` were reconciled in the 2026-07-16 current-commit session recorded in `docs/summary_of_work.md`.
- `VF-SCAN-20260717-001..012` from the prior local audit were closed in the 2026-07-17 prior session (`docs/summary_of_work.md`), subject to the bounded debt inventory above. Findings `010` and `011` remain accepted incremental architecture guidance rather than runtime defects.
- `VF-SCAN-20260717-013..016` remain product/release scope rather than hidden local defects. Deferred providers/transports stay fail-closed, orphan deletion stays analysis-only pending quarantine/rollback, and signed/paid/two-device/headed proof remains represented only by `VF-VERIFY-005`.
- `VF-AUDIT-001` was completed through the live GitHub APIs on 2026-07-16: `main` is protected with strict required checks, review/code-owner/last-push approval, admin enforcement and conversation resolution.
- `VF-AUDIT-006` was completed in bounded runtime/toolchain batches (Express 5, dotenv 17, proxy middleware 4, PDF.js 6, Electron 43, ESLint 10, React Hooks ESLint 7, globals 17, Vite 8 and the React Vite plugin 6). `@types/node` intentionally stays on 22 to match the runtime and TypeScript stays on 5.8 because `typescript-eslint` 8.64 declares `<6.1.0`. `npm outdated` showing Node 26 types or TypeScript 7 does not constitute an applicable update for this project.
