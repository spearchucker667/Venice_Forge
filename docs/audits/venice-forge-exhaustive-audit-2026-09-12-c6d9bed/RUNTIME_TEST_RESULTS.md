# Runtime Test Results — audit of `main` @ `c6d9bed3`

## Packaged application launch (macOS arm64, local)

- Built from the exact baseline tree: `npm run dist:mac:arm64` →
  `release/mac-arm64/Venice Forge.app` (gitignored; removed from scope of the working
  tree check).
- Launched via Playwright `_electron.launch` exactly as the packaged smoke suite does,
  with a fresh `--user-data-dir` temp profile, `NODE_ENV=production`.

### Observations

| Probe | Result | Interpretation |
|---|---|---|
| App window launch + first paint | OK | packaged bootstrap completes |
| `style-src` negative control (inject inline `<style>`) | violation reported | CSP present and enforced for styles |
| `new Function('return 1')` via `page.evaluate` | **succeeds** | CDP evaluation is CSP-exempt — probe method invalid (finding C6-P1-001) |
| Inline event-handler attribute (`onclick` via `setAttribute` + click) | **blocked** (no execution; `securitypolicyviolation` fired) | production `script-src 'self'` correctly enforced at page level |
| DOM-injected inline `<script>` | **did not execute** | consistent with enforced `script-src` |
| Onboarding/profile bootstrap smoke (`packaged-onboarding-profile-bootstrap.test.ts`) | PASS (5.97 s) | first-run flow works in the packaged binary |
| Packaged executable discovery | PASS | artifact layout correct for arm64 |

### Conclusion

The packaged application itself behaves correctly, including CSP enforcement against
real page-context vectors. The runtime defect is confined to the smoke test's probe
method (`VF-AUD-20260912-C6-P1-001`), which is why the failure is best classified as a
test-infrastructure P1 rather than an application CSP P0: **no evidence of a real CSP
regression was found in the packaged renderer.**

## Reproduction record (C6-P1-001)

1. Command: `npx vitest run tests/smoke/packaged-launch-csp.test.ts`
2. Outcome: `AssertionError: expected true to be false` at
   `tests/smoke/packaged-launch-csp.test.ts:88` — matches hosted run 34743024816 logs on
   all three platforms byte-for-byte in substance.
3. Differential diagnostic (temporary `scratch/csp-diagnostic.mjs`, deleted after the
   run; the `scratch/` directory is gitignored so the tracked tree stayed clean):
   JSON output recorded `evalViaPageEvaluate: true`, `inlineEventHandlerAttr: false`,
   `inlineScriptElement: "no-exec-no-event"`, plus fired `securitypolicyviolation`
   events. This isolates the failure to the CDP exemption, not to a missing CSP.

## Not exercised at runtime (and why)

- Venice API live calls (chat/image/video/audio): require user credentials; repository
  policy and the work order prohibit spending user quota during audits. Contract-level
  verification relied on `verify:venice-api-docs`, `verify:venice-contract-drift`,
  `verify:provider-adapters`, and the Swagger snapshot (see `VALIDATION_RESULTS.md`).
- Two-device sync/recovery: requires a second machine (tracked externally in ROADMAP
  `VF-EXTERNAL-RELEASE-ACCEPTANCE`).
- Screen-reader / headed accessibility pass: requires manual QA environment; the
  automated a11y suites pass (included in `npm test`).
