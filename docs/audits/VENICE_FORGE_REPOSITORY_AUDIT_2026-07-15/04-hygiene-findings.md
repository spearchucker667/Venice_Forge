# Hygiene Findings

## VF-AUDIT-005 — Unreferenced root debug probes

- Priority/confidence: P3 / confirmed
- Files: `debug-webcrypto.cjs`, `test_playwright.js`
- Discovery: `git ls-files`, repository-wide static/dynamic reference search, `package.json`, workflow/build/packaging inspection, and `git log -- <path>`.
- Evidence: neither file has imports, script entries, tests, documentation, CI, packaging or runtime references. Each is a small one-off console probe introduced by a single historical commit. Electron Builder uses an explicit file list that excludes them.
- Impact: low; root clutter can be mistaken for supported validation tooling.
- Remediation: delete both files only after owner review. They were not deleted during this audit.
- Verification: `npm run verify:archive-clean && npm run ci && git ls-files debug-webcrypto.cjs test_playwright.js`.
- Regression risk: low; rollback is restoration from Git.

Ignored `.DS_Store`, build, release, coverage, log and local configuration outputs are correctly excluded. No tracked backups, copy-suffix artifacts, empty files, archives, conflict markers or case collisions were found.
