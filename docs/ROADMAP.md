# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; retained scan reports are audit input, not current status authority.

## Current Work

The 2026-07-15 intended-feature verification report supersedes the unsupported local “100% verified” claim. Local findings `VF-VERIFY-001` through `004` and `006` are closed with evidence in `docs/summary_of_work.md`. The comprehensive repository audit fixed three additional local issues and added the following still-open external/maintenance work.

1. **VF-VERIFY-005 — Produce signed, paid-operation and manual release evidence (P1 release work).** Run signed/notarized macOS and signed Windows clean-install/update, secure-storage, paid generation, restart recovery, two-device sync, and screen-reader/high-zoom/theme/sound QA without recording secrets. Exact implementation commit `6257f294abfc3e36bef5a55d869f6748e4c162b2` passed hosted Node 22 CI, coverage, CodeQL, macOS/Windows sensitive tests, and packaged Electron smoke jobs. Local first-run desktop/mobile viewport checks and unsigned Apple-silicon DMG/ZIP build/artifact/checksum verification also pass, but none substitute for the remaining signed, authenticated, multi-device and accessibility matrix.

2. **VF-AUDIT-001 — Enforce documented GitHub repository safeguards (P1 governance).** Live `main` has no branch protection and repository Actions tokens default to write, contrary to `docs/RELEASE/repository-settings.md`. Require reviews and current checks, disallow force pushes/deletion, set the default token to read, and retain only explicit job-level write permissions. Verify through the GitHub branch-protection and Actions-permissions APIs.

3. **VF-AUDIT-005 — Remove obsolete root debug probes after owner approval (P3 hygiene).** `debug-webcrypto.cjs` and `test_playwright.js` have no source, script, workflow, package, test, documentation or dynamic references and are excluded by explicit packaging inputs. The audit work order prohibited automatic deletion; remove them only after approval, then run archive-clean and full CI.

4. **VF-AUDIT-006 — Refresh direct dependencies in bounded batches (P3 maintenance).** Current audit reports zero vulnerabilities, but `npm outdated` identifies patch/minor and major updates. Update supported-runtime dependencies in small batches, isolate major toolchain/framework migrations, regenerate the lockfile with supported npm, and require CI plus platform packaging before merge.

Detailed evidence, root cause, automated validation, manual QA and acceptance criteria are in `docs/reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md`.

The new audit findings, deletion contracts and verification commands are in `docs/audits/VENICE_FORGE_REPOSITORY_AUDIT_2026-07-15/`.

## Audit Input

- `docs/audits/VENICE_FORGE_SCAN_EVIDENCE_2026-07-14/VENICE_FORGE_EXTENSIVE_SCAN_2026-07-14.md` is retained snapshot evidence from `Venice_Forge-clean-20260714-233458.zip`.
- Every claim from that report must be reconciled against the live tree before implementation or closure. Current task status exists only in this roadmap; session evidence belongs in `docs/summary_of_work.md`.
