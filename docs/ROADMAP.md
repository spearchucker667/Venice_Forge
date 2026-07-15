# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; retained scan reports are audit input, not current status authority.

## Current Work

The 2026-07-15 intended-feature verification report supersedes the unsupported local “100% verified” claim. Local findings `VF-VERIFY-001` through `004` and `006` are closed with evidence in `docs/summary_of_work.md`; only external release evidence remains open.

1. **VF-VERIFY-005 — Produce exact-commit packaged and paid-operation evidence (P1 release work).** Run signed/notarized macOS and signed Windows clean-install/update, secure-storage, paid generation, restart recovery, two-device sync, screen-reader/high-zoom/theme/sound QA, and hosted CI/CodeQL on the eventual exact commit without recording secrets. Local Node 22 CI, first-run desktop/mobile viewport checks, and unsigned Apple-silicon DMG/ZIP build/artifact/checksum verification pass, but they do not substitute for this matrix.

Detailed evidence, root cause, automated validation, manual QA and acceptance criteria are in `docs/reports/INTENDED_FEATURE_VERIFICATION_2026-07-15.md`.

## Audit Input

- `docs/audits/VENICE_FORGE_SCAN_EVIDENCE_2026-07-14/VENICE_FORGE_EXTENSIVE_SCAN_2026-07-14.md` is retained snapshot evidence from `Venice_Forge-clean-20260714-233458.zip`.
- Every claim from that report must be reconciled against the live tree before implementation or closure. Current task status exists only in this roadmap; session evidence belongs in `docs/summary_of_work.md`.
