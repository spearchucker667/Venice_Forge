# Venice Forge — Test Gaps

**Audit date:** 2026-09-12

---

## Missing Tests for Confirmed Defects

| ID | Gap | Relevant Defect |
|---|---|---|
| VF-AUD-20260912-TG-001 | No test that `abortVeniceRequest()` during a Retry-After delay cancels the delay and prevents the retry | VF-AUD-20260912-P1-003 |
| VF-AUD-20260912-TG-002 | No test asserting `parseBody` does not allocate a UTF-8 string for binary content-types | VF-AUD-20260912-P1-001 |
| VF-AUD-20260912-TG-003 | No test asserting that a simulated disk-full error during config save leaves the original `config.yaml` intact | VF-AUD-20260912-P1-002 |

---

## Test Quality Issues

### VF-AUD-20260912-P2-005 — Global console suppression

`tests/setup.ts:29-30` globally replaces `console.warn` and `console.error` with no-op stubs. This hides:
- React missing-key warnings
- React prop-type violations
- Unhandled promise rejections that bubble to the console
- Application-level error logs from real code paths exercised in tests

**Recommendation:** Replace global stubs with per-test `vi.spyOn` usage, or add an `afterEach` that fails if an unexpected error was logged.

### VF-AUD-20260912-P2-006 — Global fileParallelism: false

All test files run serially due to the global `fileParallelism: false` setting in `vitest.config.ts`, despite most files not sharing state that requires serialization. On an 8-core machine this is a significant CI throughput penalty.

**Recommendation:** Remove global setting; keep `--no-file-parallelism` only in scripts that genuinely need it.

---

## Coverage Analysis

| Metric | Threshold | Current | Assessment |
|---|---|---|---|
| Branches | 59% | ~59% | ⚠️ Low — important for a security-sensitive app |
| Functions | 68% | ~68% | Acceptable |
| Lines | 73% | ~73% | Acceptable |
| Statements | 70% | ~70% | Acceptable |

The 59% branch coverage threshold is the most concerning gap. Critical paths with low coverage likely include:
- Error handling branches in the Venice client's retry/fallback logic
- Guard pipeline edge cases (binary media screening)
- Config service failure branches
- Streaming abort and cleanup edge cases

**Recommendation:** Target 70% branch coverage in the next development cycle, prioritizing the security and persistence code paths.

---

## Smoke Test Gaps

The smoke tests in `tests/smoke/` are conditional on `RUN_ELECTRON_SMOKE=true`. They are run in CI only in the packaged smoke jobs (not in `npm test` locally). This means developer-run `npm test` does not include any real Electron launch verification.

No recommended changes — this is an acceptable tradeoff for local iteration speed. The CI enforces smoke testing on all three platforms.

---

## i18n Test Gaps

11 of 12 locales are `first-pass-machine` reviewed (automated translation with no native speaker validation). The `verify:i18n` gate only checks key completeness, not translation quality.

**Recommendation:** Track native speaker review through `docs/i18n/native-review-status.json` and block production locales from `isProductionComplete=complete` until reviewed.
