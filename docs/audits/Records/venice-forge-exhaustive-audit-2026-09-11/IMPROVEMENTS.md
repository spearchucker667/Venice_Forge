# Improvements and hardening

These are not counted as confirmed defects.

## IMP-001 — Make validation aliases monotonic

Keep `npm run ci` as the canonical pre-publication alias: it includes lint, typecheck, the complete segmented matrix (including CSP invariants), dependency audits, build, contracts, and dist verification. Avoid reporting `verify:contracts` alone as equivalent to the full release gate.

## IMP-002 — Add a clean diagnostic-output mode for i18n release verification

The i18n release verifier rewrites tracked status timestamps/counts before checking cleanliness. A deterministic check-only mode or explicit staged-state mode would avoid expected first-run nonzero results when catalogs and generated counts change together.

## IMP-003 — Eliminate current diff hygiene noise

Remove the legacy Markdown hard-break whitespace in `AGENT_REINITIALIZATION.md` and keep `git diff --check` in final staged review.

## IMP-004 — Reduce large-change acceptance ambiguity

The 122-path remediation diff combines many subsystems. This tranche performed per-path inventory, secret scanning, canonical local CI, package smoke, and staged review; future large tranches should preserve that acceptance mapping.
