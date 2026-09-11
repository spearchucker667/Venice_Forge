# Venice Forge — Repository Hygiene, Reorganization, and Distribution Cleanup Agent Handoff

## Mission

Perform a complete repository hygiene pass on:

```text
Repository:
https://github.com/spearchucker667/Venice_Forge

Local:
~/Projects/Venice_Forge
```

The objective is to make the repository production-ready for public distribution by:

- Removing obsolete, duplicate, stale, and internal-only files.
- Reorganizing documentation and development artifacts.
- Ensuring every tracked file has a clear purpose.
- Moving local-only artifacts into ignored directories.
- Updating documentation references after structural changes.
- Reducing repository noise without deleting required development history.
- Ensuring the public repository contains only files needed to build, test, document, and distribute Venice Forge.

Do not blindly delete files. Every removal must be justified by usage analysis.

---

# Operating Rules

## Safety Rules

Before making changes:

```bash
cd ~/Projects/Venice_Forge

git status --short --branch
git branch --show-current
git log -1 --oneline
```

Do not:

- Run destructive cleanup commands.
- Use `git clean -fd`.
- Reset user changes.
- Delete files without confirming references.
- Remove build-critical assets.
- Remove legal/license files.
- Remove required CI/CD configuration.

Preserve unrelated local work.

---

# Phase 1 — Repository Inventory

Generate a complete inventory.

Review:

```bash
find . -maxdepth 3 -type f | sort
```

Review:

```bash
du -sh *
```

Identify:

- duplicated files
- abandoned experiments
- generated output
- temporary exports
- old audit reports
- unused documentation
- stale screenshots/assets
- old migration files
- obsolete scripts
- development-only tooling

Create:

```text
docs/audits/repository-hygiene-audit.md
```

Containing:

- Current structure
- Problems found
- Proposed changes
- Files removed
- Files moved
- Files retained
- Reasoning

---

# Phase 2 — Classify Repository Content

Classify every top-level directory.

Recommended categories:

## Public Distribution

Allowed:

```text
src/
electron/
public/
assets/
docs/
scripts/
tests/
.github/
package.json
package-lock.json
tsconfig*
vite.config*
electron-builder*
README.md
LICENSE
```

## Local Development Only

Move into ignored locations:

```text
.local/
.local-dev/
.dev/
scratch/
tmp/
```

Examples:

- personal notes
- debugging captures
- generated reports
- agent outputs
- experimental prototypes
- screenshots
- local test data
- exported conversations
- temporary patches

---

# Phase 3 — Documentation Cleanup

Review:

```bash
find docs -type f | sort
```

Goals:

- One authoritative README.
- Remove duplicate summaries.
- Archive historical reports.
- Remove outdated TODO files.
- Remove abandoned implementation notes.
- Update links after restructuring.

Recommended structure:

```text
docs/
├── architecture/
├── development/
├── security/
├── releases/
├── audits/
└── troubleshooting/
```

Move historical material:

```text
docs/archive/
```

Only keep active documentation in primary locations.

---

# Phase 4 — Remove Stale Development Artifacts

Search:

```bash
find . \
  \( -name "*.log" \
  -o -name "*.tmp" \
  -o -name "*.bak" \
  -o -name "*.old" \
  -o -name "*.patch" \
  \)
```

Review each result.

Delete from repository if:

- generated locally
- contains machine-specific paths
- contains debugging output
- has no reproducible value

Keep only if:

- required for tests
- required for builds
- required documentation example

---

# Phase 5 — Gitignore Hardening

Update `.gitignore`.

Required ignored categories:

## Local Runtime

```gitignore
*.log
*.pid
*.tmp
*.cache
```

## Agent/AI Artifacts

```gitignore
.agent/
.agents/
.ai/
.cursor/
.claude/
.local-ai/
```

## Local Reports

```gitignore
.local-reports/
audit-output/
debug-output/
```

## Build Output

```gitignore
dist/
release/
out/
coverage/
```

## Environment

```gitignore
.env
.env.*
!.env.example
```

## OS Files

```gitignore
.DS_Store
Thumbs.db
```

## IDE

```gitignore
.vscode/*.log
.idea/
```

Do not ignore files required by contributors.

---

# Phase 6 — Source Tree Review

Audit:

```bash
src/
electron/
public/
scripts/
tests/
```

Look for:

- duplicate implementations
- dead components
- unused hooks
- unused services
- unreachable routes
- old feature flags
- commented-out code blocks
- abandoned experiments

For unused code:

1. Search references.
2. Confirm no dynamic imports.
3. Confirm no build references.
4. Remove only after validation.

Commands:

```bash
rg "filename|componentName|functionName"
```

---

# Phase 7 — Package and Build Cleanup

Review:

```bash
cat package.json
```

Check:

- unused dependencies
- duplicate dependencies
- outdated scripts
- broken commands
- scripts referencing deleted files

Validate:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Remove dependencies only after confirming:

```bash
npm ls package-name
```

---

# Phase 8 — Asset Cleanup

Review:

```bash
find public assets -type f | sort
```

Remove:

- duplicate images
- unused icons
- old branding
- screenshots
- temporary exports

Verify references:

```bash
rg "asset-name"
```

Keep:

- application branding
- required icons
- installer assets
- legal assets

---

# Phase 9 — CI/CD Cleanup

Review:

```bash
ls .github/workflows
```

For every workflow:

Check:

- obsolete Node versions
- stale commands
- references to removed files
- unnecessary duplicate jobs
- missing caching
- incorrect permissions

Required:

- CI passes on clean checkout.
- No workflow references deleted files.
- No secrets are exposed.

---

# Phase 10 — README Rewrite

Update README to match the actual repository.

Include:

- Current feature list.
- Supported platforms.
- Installation.
- Development setup.
- Build instructions.
- Architecture overview.
- Screenshots only if maintained.
- Security model.
- Contribution workflow.

Remove:

- old roadmap claims
- completed TODO lists
- inaccurate features
- historical migration notes

---

# Phase 11 — Validation

After cleanup:

Run:

```bash
git status --short

npm ci

npm run lint
npm run typecheck
npm test
npm run build
```

Check repository size:

```bash
git count-objects -vH
```

Search for secrets:

```bash
rg "api[_-]?key|secret|password|token|private_key" .
```

Review every hit.

False positives must be documented.

---

# Required Final Report

Create:

```text
docs/audits/repository-hygiene-final-report.md
```

Include:

## Removed Files

| File | Reason |
|-|-|

## Moved Files

| Old Location | New Location |
|-|-|

## Updated Files

| File | Change |
|-|-|

## Ignored Files

| Pattern | Reason |
|-|-|

## Validation

Include:

- npm install result
- lint result
- typecheck result
- test result
- build result

---

# Definition of Done

The task is complete when:

- Repository contains only distribution-relevant files.
- Local-only artifacts are ignored.
- Documentation reflects current architecture.
- No stale TODO/state reports remain in active documentation.
- No broken references exist.
- CI references valid paths.
- Build succeeds from a clean checkout.
- `.gitignore` prevents future pollution.
- README accurately represents the project.
- Final hygiene report is committed.

Do not leave the repository in a partially reorganized state.
