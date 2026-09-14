# Improvements — audit of `main` @ `c6d9bed3`

Non-defect hardening and quality recommendations. None of these block release.

## IMP-1 — Consolidate durable writers on `atomicReplaceFile()`

See design risk `VF-AUD-20260912-C6-DR-001` in `FINDINGS.md`. Migrating the ~15 remaining
raw temp+rename writers to the existing Windows-safe utility removes duplicated
durability logic and pre-empts the Windows rename-on-existing failure class the project
already fixed once. The Windows-sensitive CI job exists precisely to validate this.

## IMP-2 — Version-pin and drift-check the smoke probe's Chromium assumption

The C6-P1-001 root cause (CDP evaluation is CSP-exempt) is a Chromium/Playwright
behavioral contract the team now knows about but nothing records. A short note in the
smoke suite header (why the probe must be page-context, why `page.evaluate` is exempt)
plus the negative-control test pattern (already present for style-src) will prevent the
same class of mistake in future renderer-policy probes (e.g., when verifying
`form-action` or `frame-ancestors` hardening later).

## IMP-3 — Surface `__MISSING__` sentinel progress in the release checklist

55 i18n sentinel placeholders remain across non-en locales (expected under the
`--allow-missing-markers` contract; native review is tracked as ROADMAP
`VF-I18N-NATIVE-REVIEW-001`). The strict `verify:i18n:release` gate will fail at the
next tag until they are translated. Recommend adding one line to
`docs/RELEASE/release.md` linking the sentinel count to `npm run i18n:locale-status` so
the release driver discovers this at checklist time rather than at the gate.
