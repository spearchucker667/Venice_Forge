# Test Gaps — audit of `main` @ `c6d9bed3`

## TG-1 — No local gate runs the packaged smoke before CI does

- **Evidence:** the C6-P1-001 failure was visible only after `git push`; `bb29350e`'s own
  run was cancelled, and local `npm test` skips the smoke without a packaged binary.
- **Gap:** a contributor who edits the smoke suite (or anything it probes) has no
  inexpensive local signal short of a full package build.
- **Required test/process change:** document and encourage
  `RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/` against a locally built package
  in `docs/DEVELOPMENT/testing.md`; optionally add a `test:smoke:packaged` npm script
  that builds first. Validation of the C6-P1-001 fix *must* include one real packaged
  run per platform in CI (no unit test can stand in).

## TG-2 — No test asserts capability-token bounded memory

- **Evidence:** C6-P3-001 exists because no test observes token accumulation over time;
  existing tests cover issue/verify/revoke semantics only.
- **Required test:** `customProtocolAccess.test.ts` addition — with a fake clock, issue
  600 short-TTL tokens, advance past expiry, issue one more token, and assert
  `metrics().issuedCount` reflects reaping (≤ 1 or bounded threshold) *without* any
  `verify()` calls. This test fails at HEAD and passes after the C6-P3-001 fix.

## TG-3 (observation, not new) — carried from the prior audit

The prior audit's `TEST_GAPS.md` items that were remediated (ipc-parity verifier,
atomic-write regressions, safety-guard direct-call scan) were re-verified present and
green at HEAD. No regression in those gates was found.
