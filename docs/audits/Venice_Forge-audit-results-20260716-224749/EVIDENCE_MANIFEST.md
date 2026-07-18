# Evidence Manifest

## Audited Snapshot

- Archive: `Venice_Forge-clean-20260716-224749.zip`
- Branch: `main`
- Commit: `8cd4ffdcb5ba166e48f8721469ed1feeceda561f`
- App version: `3.0.0-beta.1`
- Audit runtime: Node `v22.16.0`, npm `10.9.2`
- Comparison snapshot: `Venice_Forge-clean-20260716-183918.zip`

## Primary Evidence

- `AUDIT_REPORT.md` — complete current-snapshot audit.
- `delta-from-183918.patch` — source/document delta against the prior snapshot.
- `evidence/workflow-bug-reproduction.log` — direct cross-run output suppression and tab normalization reproduction.
- `evidence/key-evidence.txt` — line-numbered source evidence.
- `evidence/remediation-evidence.txt` — provider/media/docs/archive remediation evidence.
- `evidence/store-all-explicit.log` — aggregate store-shard non-termination output.
- `evidence/store-first-group.log` — first partition pass.
- `evidence/store-remaining-group.log` — remaining partition pass.
- `evidence/stale-version-references.txt` — current nonhistorical stack drift.
- `evidence/import-graph-zero-incoming.txt` — approximate production import candidates.
- `evidence/duplicate-files.txt` — exact hash duplicates.
- `evidence/top-source-lines.txt` and `top-doc-lines.txt` — size/concentration evidence.
- `evidence/EXTRACT_INFO.txt` — clean archive provenance.

## Execution Logs

- `logs/build.log` — production build.
- `logs/eslint_direct.log` — direct ESLint.
- `logs/tsc_renderer.log`, `logs/tsc_electron.log` — TypeScript pipelines.
- `logs/test_electron_isolated.log` — 51 files / 687 tests passed.
- `logs/test_ingestion.log` — ingestion suite.
- `logs/test_ui_layout.log`, `test_ui_chat.log` — UI shards.
- `logs/test_unit_stores.log`, `test_unit_full.log` — aggregate store/unit behavior.
- `logs/verify_contracts.log` — static contracts pass until environment-only Electron runtime download failure.
- `evidence/test-workflow-core.log` — 8 files / 104 tests passed while missing the directly reproduced defects.
- `evidence/verify-markdown-links.log` — 102 Markdown files passed.
- `evidence/verify-doc-release.log` — roadmap/release/bundle checks.

## Limitations

- No paid Venice/provider requests were executed.
- No signed/notarized installer was produced or installed.
- No physical second-device sync test was performed.
- The audit sandbox could not fetch Electron's runtime artifact during one provider contract script. Provider adapter tests otherwise passed in the isolated Electron suite.
- Headed visual, screen-reader, high-zoom, theme, sound, and packaged restart QA remain external/manual evidence.
