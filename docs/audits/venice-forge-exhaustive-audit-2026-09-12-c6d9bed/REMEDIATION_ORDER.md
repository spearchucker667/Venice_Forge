# Remediation Order — audit of `main` @ `c6d9bed3`

## Implementation status (updated 2026-09-13)

| ID | Status | Evidence |
|---|---|---|
| VF-AUD-20260912-C6-P1-001 | **FIXED (verified)** | Probe replaced with page-context inline event-handler vector (`tests/smoke/packaged-launch-csp.test.ts`); CDP-exemption guidance added to file header; local-gate instructions added to `docs/DEVELOPMENT/testing.md`. Verified against the real packaged arm64 build: `RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/packaged-launch-csp.test.ts` → 3/3 PASS (probe test 2.0 s). Remaining acceptance: hosted `electron-smoke-*` green after the next push. |
| VF-AUD-20260912-C6-P3-001 | **FIXED (verified)** | `CAPABILITY_TOKEN_REAP_THRESHOLD = 512` opportunistic sweep added to `issue()` in `electron/utils/customProtocolAccess.ts`; TG-2 regression tests added (`reaps expired tokens without any verify call`, `reaping never removes unexpired tokens`) — `customProtocolAccess.test.ts` 21/21 PASS, `test:electron` 1,207 PASS, lint + typecheck PASS. |
| VF-AUD-20260912-C6-DR-001 / IMP-1 | **FIXED (verified)** | All remaining durable main-process writers migrated to the canonical utility: async writers (`conversationVault`, `chatStorage`, `chatFolderStorage`, `chatTtsBridge`, `configService`, `backgroundTaskManager`, `mediaService`, `chatFolderOperationJournal`, `syncOutbox`, `syncFolderWatcher`, `replaceImportRecovery`, `chatFolderBackupService`) via `atomicReplaceFile()` (vault/journal/backup with `sync: true` fsync), sync writers (`secureStore`, `providerSettingsStore`, `huggingfaceDiscovery`) via new `atomicReplaceFileSync()`. Utility extended with `sync` option + sync variant (`atomicFileReplace.test.ts` 4/4). Windows-rich displace-and-restore writers (`generatedMediaStore`, `generatedMediaExport`) intentionally retained per the audit's domain-step guidance. `scripts/verify-backup-sync.cjs` guard patterns updated to assert the canonical call (semantically stronger invariants — 0o600 is the utility default). `test:electron` 1,210/1,210 PASS, `npm test` 5,945/5,945 PASS, lint 0/0, typecheck PASS. |
| TG-1 | CLOSED | Local-gate documentation added to `docs/DEVELOPMENT/testing.md`. |
| IMP-2 | CLOSED | CDP-exemption guidance recorded in the smoke suite header. |
| IMP-3 | OPEN | Release-checklist sentinel-count line. |

Original ordering analysis retained below.

---

Dependency-topology order per work order §46. With only two confirmed defects, phases
collapse; both phases can start immediately and run in parallel (no shared files).

## Phase 1 — CI integrity (release blocker)

| ID | Action | Files | Validation |
|---|---|---|---|
| VF-AUD-20260912-C6-P1-001 | Replace the CDP-based eval probe with a page-context vector (inline event-handler attribute recommended; keep the existing `securitypolicyviolation` assertion). Fix the misplaced eslint-disable. Document the CDP exemption in the suite header (IMP-2). | `tests/smoke/packaged-launch-csp.test.ts`, `docs/DEVELOPMENT/testing.md` | 1. `npm run build` + one packaged build per platform; `RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/` locally green. 2. Push → verify all three hosted `electron-smoke-*` jobs green on the new SHA. |

Rationale for first: every other gate is currently green; hosted `main` CI redness is the
only thing standing between the project and a trustworthy green signal, and it
contaminates the meaning of every future run until fixed.

## Phase 2 — Hardening (can proceed in parallel with Phase 1)

| ID | Action | Files | Validation |
|---|---|---|---|
| VF-AUD-20260912-C6-P3-001 | Add opportunistic reaping of expired capability tokens (sweep on threshold in `issue()`, or `unref()`'d interval cleared in `revokeAll`). | `electron/utils/customProtocolAccess.ts` (+ `customProtocolCapabilities.ts` if interval-owned) | New TG-2 test (fake clock, no-verify reaping assertion); full `test:electron`. |
| VF-AUD-20260912-C6-DR-001 / IMP-1 | Migrate remaining raw temp+rename durable writers to `atomicReplaceFile()` (start with `chatTtsBridge`, `conversationVault`, `chatStorage`, `backgroundTaskManager`, `mediaService`). | listed in `FINDINGS.md` DR-001 | `test:electron` + `test:contracts` + one `windows-sensitive-tests` hosted run. |
| TG-1 / IMP-3 | Add `test:smoke:packaged` npm script + release-checklist sentinel-count line. | `package.json`, `docs/DEVELOPMENT/testing.md`, `docs/RELEASE/release.md` | Script exists and runs; docs link check via `verify:markdown-links`. |

## Sequencing notes

- C6-P1-001 and C6-P3-001 touch disjoint files → **parallel-safe**.
- IMP-1 migrations should be small, per-store commits to keep the Windows CI signal
  attributable; do not batch all stores into one commit.
- After Phase 1 lands, re-run the hosted pipeline and record the green run ID in
  `docs/summary_of_work.md`; hosted-CI verification is part of this audit's acceptance
  (see `CI_REVIEW.md`).
- No i18n catalog changes are required by any finding; the 55 sentinels remain governed
  by the separate native-review workstream.
