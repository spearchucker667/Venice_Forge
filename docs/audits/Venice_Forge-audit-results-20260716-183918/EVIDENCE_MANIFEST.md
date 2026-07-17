# Evidence Manifest

This directory contains the static and executable evidence produced for the audit of `Venice_Forge-clean-20260716-183918.zip`.

Key files:

- `AUDIT_REPORT.md` — complete audit report.
- `inventory.json` — file/type/size inventory.
- `build.log` / `build.status` — production build output.
- `eslint.log` — ESLint output.
- `tsc-renderer.log` / `tsc-electron.log` — TypeScript verification.
- `verify-contracts.log` / `verify-contracts.status` — canonical contract failure evidence.
- `verify-backup-sync.log` — backup/sync verifier output.
- `test-ci-final.log` — aggregate test execution through the environment-only Electron binary stop.
- `recheck-ui-layout.log` / `recheck2-ui-research.log` — corrected isolated UI reruns.
- `markdown-link-analysis.json` — Markdown graph results.
- `markdown-exact-duplicates.json` — exact duplicate groups.
- `static-relative-import-zero-incoming.json` — static import candidates requiring manual verification.
- `source-markers.json` — source marker scan.
- `documentation-evidence.txt` — extracted documentation evidence.
- `prior-issue-reconciliation-evidence.txt` — evidence used to reconcile earlier findings.
- `npm-outdated.json` — dependency update inventory.

Environment limitation: Electron's runtime binary was unavailable because the sandbox had no external package-download access and dependencies were installed with lifecycle scripts disabled. This is not classified as a repository defect.
