# Venice Forge Roadmap

This is the canonical ledger for current unfinished work only. Closed execution history and validation evidence belong in `docs/summary_of_work.md`; historical reports belong under `docs/reports/historical/`.

## Current Work

No current implementation tasks. The 2026-07-15 follow-up closed the in-progress `syncPacketImporter` extraction (and the related `vi.mock` spy repair in `src/services/syncEngine.test.ts`), finished the UI-sound wiring across `CollapsibleSection` / `ConfirmModal` / `ErrorBoundary` / `TabButton` / `DataStoragePanel` / `ImportPlanModal` / `shared` / `toaster`, removed an untracked `test-compact.js` debug artifact, and consolidated `docs/developer/image-model-capabilities.md` under `docs/DEVELOPMENT/`. The Open TODO Ledger in `docs/summary_of_work.md` is empty; every `AUDIT-NNN` finding in the authoritative audit YAML remains `status: closed`. Any new work must be raised as a fresh entry here before code lands.

## Authoritative Status Sources

- `docs/audits/exhaustive_repository_file_audit_2026-07-14.yaml` is the authoritative per-finding audit record and contains closure evidence for every finding.
- `docs/summary_of_work.md` records the completed remediation session and commands actually run.
