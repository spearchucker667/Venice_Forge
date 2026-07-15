# Security Findings

## VF-AUDIT-001 — Repository protections are weaker than release policy

- Priority/confidence: P1 / confirmed; open external action
- Evidence: live GitHub API returned 404 for `branches/main/protection`; Actions permissions returned `default_workflow_permissions: write` and `can_approve_pull_request_reviews: true`. `docs/RELEASE/repository-settings.md:6-13` requires protected `main`, review/status-check enforcement and no force push.
- Impact: a compromised workflow or maintainer token has more write authority than necessary, and direct/forced changes to `main` are not blocked by the documented controls.
- Remediation: enable branch protection/ruleset for `main`; require current CI checks and reviews; disallow force pushes/deletion; set default workflow permission to read and grant job-scoped writes only.
- Verification: repeat the two GitHub API queries and inspect effective rulesets.
- Regression risk: medium operational risk; ensure release automation's explicit permissions remain sufficient.

## VF-AUDIT-002 — TTS protocol check/read race

- Priority/confidence: P2 / confirmed; fixed
- Prior path/line: `electron/main.ts:309-311` at baseline.
- Discovery: live CodeQL alert 178 (`js/file-system-race`) followed by source review.
- Prior behavior: path containment and `stat()` preceded a separate path-based `readFile()`, allowing the filesystem object to change between validation and consumption.
- Impact: a local process able to mutate the user's TTS cache could race a symlink/file swap and cause unintended bytes to be served through the custom protocol.
- Remediation: `electron/utils/secureFile.ts` opens with `O_NOFOLLOW`, validates the opened descriptor as a regular file, and reads through that descriptor. `electron/main.ts:310` uses it.
- Verification: `electron/utils/secureFile.test.ts` covers regular files, directories and symlinks; targeted tests, lint and both typechecks pass.
- Regression risk: low; Windows skips the symlink-specific assertion but retains regular-file validation.

## CodeQL disposition

Six live high-severity alerts were reviewed. Alert 178 is fixed above. Alerts 183/185 in `syncFolderWatcher.ts:111` are defended: `O_NOFOLLOW`, descriptor `stat`, descriptor size check and descriptor read are visible at lines 111-119 and 651-661; the paired test alert is test-only. Alerts 181/182 flag local documentation URL substring checks in a verifier, not a request authorization boundary. These five should be dismissed with the cited reasoning after the fixed commit is analyzed.

Tracked high-signal secret candidates were inspected and were placeholders, synthetic test fixtures, API examples, or data-URL markers. Local `.env` and config files are ignored and mode 0600. No credential was copied into this report.
