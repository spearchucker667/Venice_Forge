# Remediation Order — Venice Forge Exhaustive Audit (2026-09-12)

This file sequences the remaining work by **dependency topology** rather than severity alone. There are no P0/P1 confirmed defects outstanding; the remaining items are P3 improvements and design risks.

## Status after this audit re-pass

| Phase | Reference | Status |
| --- | --- | --- |
| Phase 1 | Commit the in-progress remediation | **OPEN** — user-owned remediation in progress (32 dirty tracked files); per AGENTS.md §5 not auto-committed. |
| Phase 2 | IPC parity CI gate (N1) | **DONE** — `scripts/verify-ipc-parity.cjs` + `scripts/verify-ipc-parity.test.ts`; wired into `verify:contracts:static`; passes. |
| Phase 3 | UX cap notifications (N6, N7) | **DONE** — `setCustomThemes` / `saveCustomTheme` warn on truncation; `addProfile` returns `AddProfileResult` with localized messages; i18n keys added in 12 locales (11 carry `__MISSING__:` placeholders pending translation). |
| Phase 4 | Code-style refinements (N3, N4, N5) | **DONE** — `assertPathContained` exact-root fixed; `.finally(release)` inlined; `chat-stream-manager.ts:293` extracted `errStatus` local. |
| Phase 5 | Audit ledger cleanup | **PARTIAL** — `docs/DOCS_INDEX.md` and `docs/summary_of_work.md` updated this session; final commit must include them. |
| Phase 6 | Optional architecture hardening (long-term) | **OPEN** — out of scope. |

## Phase 1 — Commit the in-progress remediation (BLOCKING)

**Blocker.** Without this phase, none of the prior remediation can be hosted on `origin/main`.

| Step | Action |
| --- | --- |
| 1.1 | Review `git diff --stat` (32 modified files from prior remediation + this session's new files) |
| 1.2 | Confirm each modified file is intentional (remediation per `FINDINGS.md`) |
| 1.3 | Stage + commit in logical chunks (security/data-integrity first, then N1-N7 fixes) |
| 1.4 | Push to `origin/main` |
| 1.5 | Verify hosted CI is green on the new SHA |
| 1.6 | Verify CodeQL has no new alerts on the new SHA |
| 1.7 | Translate the 22 `__MISSING__:` i18n placeholders (deferred — not blocking release, but should land before native-language sign-off per AGENTS.md §14) |

**Depends on:** Lead Dev authorization per AGENTS.md §5 / user profile (`do NOT auto-commit/push/PR`).

## Phase 2 — IPC parity CI gate ✅ DONE

**Reference:** `FINDINGS.md` VF-AUD-20260912-N1, `IMPROVEMENTS.md` DR-001.

| Step | Action |
| --- | --- |
| 2.1 ✅ | `scripts/verify-ipc-parity.cjs` added with channel-constant and template-literal resolution. |
| 2.2 ✅ | Wired into `npm run verify:contracts:static`. |
| 2.3 ✅ | Regression test added in `scripts/verify-ipc-parity.test.ts` (2 tests passing). |
| 2.4 | Document the verifier in `docs/reference/ipc-parity.md`. (deferred) |

## Phase 3 — UX cap notifications ✅ DONE

**Reference:** `FINDINGS.md` VF-AUD-20260912-N6 / N7.

| Step | Action |
| --- | --- |
| 3.1 ✅ | `setCustomThemes` and `saveCustomTheme` warn via `console.warn` when truncating; `CUSTOM_THEMES_SOFT_WARNING_THRESHOLD = 90` exported for future UI. |
| 3.2 ✅ | `addProfile` returns `AddProfileResult` with `reason: "empty-name" \| "limit-reached"`. |
| 3.3 ✅ | `DataStoragePanel.tsx` consumes the Result via `toast.error(addResult.message)`. |
| 3.4 ✅ | Regression tests in `profile-store.test.ts` updated for the Result API (24/24 passing). |

## Phase 4 — Code-style refinements ✅ DONE

**Reference:** `IMPROVEMENTS.md` STYLE-1 / STYLE-2 / EDGE-1.

| Step | Action |
| --- | --- |
| 4.1 ✅ | `chat-stream-manager.ts:293` extracted `errStatus` local + `??` (handles `status === 0` correctly). |
| 4.2 ✅ | `veniceClient.ts:749` inlined `.finally(() => { release(); })`. |
| 4.3 ✅ | `configService.ts:160-174` `assertPathContained` treats exact-root match as contained. |

## Phase 5 — Audit ledger cleanup (PARTIAL)

**Reference:** AGENTS.md §7.

| Step | Action |
| --- | --- |
| 5.1 ✅ | This audit package updated in place (`docs/audits/venice-forge-exhaustive-audit-2026-09-12/`). |
| 5.2 ✅ | `docs/DOCS_INDEX.md` audit-evidence citation updated. |
| 5.3 ⏳ | `docs/summary_of_work.md` Session History entry for this fix session — see the post-fix entry appended below. |
| 5.4 | `docs/ROADMAP.md` is not affected — no new roadmap items qualify. |

### Session History entry appended to summary_of_work.md (post-fix)

> ### 2026-09-12 — Audit Re-pass Findings Remediation (VF-AUD-20260912-N1..N7)
>
> Applied 7 new fixes surfaced by the same-day audit re-pass:
> - **N1** Added `scripts/verify-ipc-parity.cjs` (channel-constant + template-literal resolution, emitter tracking, documented-orphan allow-list) and `scripts/verify-ipc-parity.test.ts`. Wired into `verify:contracts:static`. Verifier reports 195 handler-registered / 192 preload.invoke / 10 preload.on / 3 documented orphans.
> - **N3** `configService.ts:160-174` `assertPathContained` treats `resolved === root` as contained.
> - **N4** `veniceClient.ts:749-758` inlined `.finally(() => { release(); })` to remove void-contract coupling.
> - **N5** `chat-stream-manager.ts:290-304` extracted `errStatus` local + `??`.
> - **N6** `settings-store.ts` warns on `MAX_CUSTOM_THEMES` truncation; exports `CUSTOM_THEMES_SOFT_WARNING_THRESHOLD = 90`.
> - **N7** `profile-store.ts:15-92` `addProfile` returns `AddProfileResult`; `DataStoragePanel.tsx` consumes the Result; i18n keys added in 12 locales (11 carry `__MISSING__:` placeholders pending translation).
> - All verifications PASS: lint, typecheck (3 projects), full Vitest suite (5858 passed / 3 skipped), contracts, build, i18n, hardcoded regression (0), safety guard, IPC parity.
> - 3 new test cases added in `profile-store.test.ts` (empty-name Result, Result API).

## Phase 6 — Optional architecture hardening (long-term, OPEN)

**Reference:** `IMPROVEMENTS.md` Architecture observations.

| Step | Action |
| --- | --- |
| 6.1 | Split `electron/services/veniceClient.ts` (795 lines) into per-concern modules. |
| 6.2 | Move `PROVIDER_OPERATION_FIELDS` to `docs/reference/provider-fields.yaml`. |
| 6.3 | Add cross-iteration invariant contract test for the agent tool loop. |

## Release readiness verdict

After Phase 1 completes (commit + push + hosted CI green + CodeQL clean), Venice Forge `3.0.0-beta.3` is **READY** for the audit-stated release line.

Phases 2-4 are DONE. Phase 5 is PARTIAL (committable). Phase 6 is long-term and out of scope.
