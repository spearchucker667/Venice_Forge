# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; retained scan reports are audit input, not current status authority.

## Current Work

The 2026-07-15 intended-feature verification report supersedes the unsupported local “100% verified” claim. The current-commit audit at `docs/audits/Venice_Forge-audit-results-20260716-183918/AUDIT_REPORT.md` supersedes earlier July 16 closure claims where the live tree contradicts them. One external release-evidence item remains open.

1. **VF-VERIFY-005 — Produce signed, paid-operation and manual release evidence (P1 release work; externally blocked).** Run signed/notarized macOS and signed Windows clean-install/update, secure-storage, paid generation, restart recovery, two-device sync, and screen-reader/high-zoom/theme/sound QA without recording secrets. Exact implementation commit `6257f294abfc3e36bef5a55d869f6748e4c162b2` passed hosted Node 22 CI, coverage, CodeQL, macOS/Windows sensitive tests, and packaged Electron smoke jobs. The current dependency-migration tree also passes the complete 3,879-test correctness surface, aggregate contracts, unsigned arm64 and x64 macOS DMG/ZIP builds with checksums, and packaged Electron 43 launch/shutdown smoke. Completion requires resources absent from this environment: GitHub has no release signing secrets, this Mac has no valid code-signing identity, no second device is available, and paid provider operations require explicit expenditure authorization and credentials. These missing prerequisites must not be relabeled as successful QA.

Detailed evidence, root cause, automated validation, manual QA and acceptance criteria are in `docs/reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md`.

The current audit report and its raw executable evidence are retained together under `docs/audits/Venice_Forge-audit-results-20260716-183918/`. Its external QA requirements are represented by the existing `VF-VERIFY-005` item above.

## Audit Input

- `docs/audits/Venice_Forge-audit-results-20260716-183918/AUDIT_REPORT.md` is audit evidence for commit `73f8b83daa1dabd34db63641e3784ed549e5dad2`.
- Every claim from that report must be reconciled against the live tree before implementation or closure. Current task status exists only in this roadmap; session evidence belongs in `docs/summary_of_work.md`.
- `VF-SCAN-20260716-001..024` were reconciled in the 2026-07-16 current-commit session recorded in `docs/summary_of_work.md`. Concrete defects were corrected; architectural proposals were accepted or deferred with explicit rationale rather than represented as runtime failures.
- `VF-AUDIT-001` was completed through the live GitHub APIs on 2026-07-16: `main` is protected with strict required checks, review/code-owner/last-push approval, admin enforcement and conversation resolution; force pushes/deletion are disabled; Actions defaults to read; vulnerability alerts, automated security fixes and private reporting are enabled.
- `VF-AUDIT-006` was completed in bounded runtime/toolchain batches. Express 5, dotenv 17, proxy middleware 4, PDF.js 6, Electron 43, ESLint 10, React Hooks ESLint 7, globals 17, Vite 8 and the React Vite plugin 6 are migrated and validated. `@types/node` intentionally remains on 22 to match the runtime and TypeScript remains on 5.8 because `typescript-eslint` 8.64 declares `<6.1.0`; `npm outdated` showing Node 26 types or TypeScript 7 does not constitute an applicable update for this project.
