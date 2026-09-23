---
name: ci-publication-verification
description: >-
  Use this skill whenever publishing commits to remote main, verifying hosted
  GitHub Actions CI and CodeQL workflows, or diagnosing CI control-plane gating and duration collapses.
---

# Hosted Publication & Workflow Verification Runbook

This runbook defines the authoritative procedure for publishing changes to `main` and verifying hosted GitHub Actions workflows in Venice Forge.

## Invariants
1. **Never Assume Green**: A short (2–6s) workflow completion is a control-plane failure, setup rejection, or gate skip—not a genuine pass.
2. **Dual-Workflow Mandate**: Both `CI` (11 jobs) and `CodeQL` (2 jobs) must conclude with status `success`.
3. **No Force-Pushes**: `git push --force` and `git push --force-with-lease` are strictly forbidden. Always push directly to `origin/main`.
4. **Synchronized HEAD**: Local `HEAD` SHA must match `origin/main` SHA before concluding publication.

## Step-by-Step Procedure

### 1. Pre-Push Local Gate
Ensure all targeted local checks pass:
```bash
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts
npm run lint:eslint
npm run typecheck
```

### 2. Direct Commit & Push
Commit directly to local `main` with conventional commit syntax and push:
```bash
git push origin main
```

### 3. Verify Remote Sync
Confirm remote SHA matches local HEAD:
```bash
COMMIT_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"
test "$COMMIT_SHA" = "$REMOTE_SHA"
```

### 4. Locate Hosted Workflow Runs
Identify run IDs for both `CI` and `CodeQL` triggered by the commit:
```bash
gh run list --repo spearchucker667/Venice_Forge --commit "$COMMIT_SHA" --json databaseId,name,workflowName,status
```

### 5. Monitor Both Workflows to Completion
Run a background watcher that monitors both workflows with `--exit-status`:
```bash
gh run watch <CI_RUN_ID> --repo spearchucker667/Venice_Forge --compact --exit-status && \
gh run watch <CODEQL_RUN_ID> --repo spearchucker667/Venice_Forge --compact --exit-status
```

Verify that all 11 CI jobs:
- `contracts`
- `macos-sensitive-tests`
- `lint-and-typecheck`
- `coverage`
- `windows-sensitive-tests`
- `unit-and-integration-tests`
- `script-coverage`
- `build`
- `electron-smoke-macos`
- `electron-smoke-linux`
- `electron-smoke-windows`

and both CodeQL analysis jobs (`Analyze javascript-typescript`, `Analyze actions`) show `✓`.

### 6. Update Canonical Ledgers
Record the verified SHA and workflow run IDs in:
- `docs/summary_of_work.md` (under Latest Session Summary and Validation Matrix)
- `docs/ROADMAP.md` (when closing or updating roadmap milestones)
