# Venice Forge — Exhaustive Repository Audit & Remediation Handoff

**Repository:** `spearchucker667/Venice_Forge`  
**Target branch:** `main`  
**Audit date:** 2026-09-24  
**Audit mode:** Remote static/evidence audit with false-positive control; local execution blocked by sandbox network isolation  
**Local canonical path from repository instructions:** `/Users/super_user/Projects/Venice_Forge`  
**Prepared for:** A coding/remediation agent that has local access to the repository and GitHub CLI

---

# 1. Executive Summary

This handoff records the findings that could be established from the current public `main` repository surface and indexed GitHub evidence without inventing execution results.

The audit found **six actionable repository defects** with direct evidence:

| ID | Severity | Confidence | Category | Summary |
|---|---|---|---|---|
| REPO-P1-001 | P1 | Confirmed | Agent/bootstrap | Mandatory bootstrap requires `AGENT_REINITIALIZATION.md`, but the root file is absent |
| DOC-P2-001 | P2 | Confirmed | i18n/docs/tooling | README and `AGENTS.md` instruct agents to run an npm script that does not exist |
| LEGAL-P2-001 | P2 | High | Legal/release metadata | GitHub recognizes the root license as Apache-2.0 while README/package metadata still say MIT |
| SEC-P2-001 | P2 | Confirmed | Security documentation | `SECURITY.md` contradicts itself about what Adult Mode disables |
| DOC-P3-001 | P3 | Confirmed | Documentation | README points to a root `FILE_TREE.md` that is absent |
| DOC-P3-002 | P3 | Confirmed | Documentation | README simultaneously claims 35 and 39 built-in themes |

No P0 was proven in this remote pass.

Several potentially higher-impact runtime/CI issues remain deliberately classified as **NEEDS_VERIFICATION** because the environment could not clone the repository, execute npm validation, query current authenticated Actions logs, or launch Electron. They are listed in Section 8 with exact commands for the local agent.

The most important false positive removed during investigation was a suspected Adult Mode child-safety bypass. Current `server.test.ts` explicitly verifies that the mandatory child-safety guard remains active when the optional Family Safe Mode is disabled, including when the client override path is enabled. The defect is therefore **documentation drift**, not a proven safety bypass.

## Repository state reviewed

Public GitHub evidence identifies:

- Default/target branch: `main`.
- Application: Venice Forge, local-first Electron/Vite desktop workspace plus Express web proxy.
- Package version visible in current indexed package metadata: `3.0.0-beta.2`.
- Node engine contract: `>=22.13.0 <23.0.0`.
- npm engine contract: `>=10.0.0`.
- Root repository currently exposes `src/`, `electron/`, `scripts/`, `tests/`, `.github/`, `server.ts`, `package.json`, `SECURITY.md`, `AGENTS.md`, and related build/release files.
- The public repository index currently labels the license as **Apache-2.0**.
- The exact current HEAD SHA could not be independently resolved in this environment. The newest indexed Actions evidence available to this audit references commit `771d1d8`; do **not** assume that is current HEAD. The local agent must record `git rev-parse HEAD` before remediation.

## Audit execution limitation

The audit attempted to use local Git/network access, but the sandbox could not resolve GitHub. The observed failure was equivalent to:

```text
Could not resolve host: github.com
```

Therefore the following were **not executed locally** and must not be represented as passing:

```text
npm ci
npm run lint:eslint
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts
npm run build
npm run ci
npm run dist*
```

This handoff intentionally distinguishes static proof from runtime proof.

---

# 2. Required First Action for the Remediation Agent

Do **not** edit anything until the worktree identity and local state are captured.

Run:

```bash
set -euo pipefail

EXPECTED_ROOT="/Users/super_user/Projects/Venice_Forge"

cd "$EXPECTED_ROOT"

printf '\n== Repository identity ==\n'
pwd -P
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
git log -1 --date=iso-strict --format='%H%n%ad%n%an%n%s'

printf '\n== Toolchain ==\n'
node --version
npm --version

printf '\n== Required root-file probes ==\n'
for f in \
  package.json \
  package-lock.json \
  AGENTS.md \
  AGENT_REINITIALIZATION.md \
  README.md \
  SECURITY.md \
  LICENSE \
  FILE_TREE.md
do
  if [[ -e "$f" ]]; then
    printf 'PRESENT  %s\n' "$f"
  else
    printf 'MISSING  %s\n' "$f"
  fi
done

printf '\n== Pre-existing changes ==\n'
git diff --stat
git diff --name-only
git status --porcelain=v1
```

### Stop condition

If the branch is not `main`, do not auto-switch it.  
If the worktree is dirty, treat all existing changes as user-owned and preserve them.  
Do not reset, clean, stash, rebase, force-push, or discard files.

---

# 3. Validation Baseline

The local agent must fill this table **before making changes**.

| Check | Command | Audit result | Local-agent required result |
|---|---|---|---|
| Repo identity | `git rev-parse HEAD` | Not available | Record exact SHA |
| Branch | `git branch --show-current` | Public target is `main` | Must be `main` unless user explicitly says otherwise |
| Working tree | `git status --short` | Not available | Record; preserve all user changes |
| Node | `node --version` | Not run | Must satisfy `>=22.13.0 <23.0.0` |
| npm | `npm --version` | Not run | Must satisfy `>=10.0.0` |
| Install | `npm ci` | Not run | Record pass/fail and full relevant error |
| ESLint | `npm run lint:eslint` | Not run | Record pass/fail |
| TypeScript | `npm run typecheck` | Not run | Record pass/fail |
| Full tests | `npm test` | Not run | Record pass/fail; follow repo serialization rules |
| Safety verifier | `npm run verify:safety-guard` | Not run | Record pass/fail |
| Markdown verifier | `npm run verify:markdown-links` | Not run | Record pass/fail |
| Contract suite | `npm run verify:contracts` | Not run | Record pass/fail |
| Build | `npm run build` | Not run | Record pass/fail |
| Aggregate CI | `npm run ci` | Not run | Record pass/fail |
| Dist verification | `npm run verify:dist` | Not run | Record pass/fail |
| Current GitHub runs | `gh run list --branch main --limit 30` | Indexed page only; conclusions not reliably exposed | Record status/conclusion/run IDs |
| CodeQL | `gh run list --workflow CodeQL --branch main --limit 20` | Not conclusively verified | Record status/conclusion |

If any validation command fails, preserve the first failure output before making changes.

Recommended capture pattern:

```bash
mkdir -p artifacts/audit-2026-09-24

run_capture() {
  local name="$1"
  shift
  set +e
  "$@" >"artifacts/audit-2026-09-24/${name}.log" 2>&1
  local rc=$?
  set -e
  printf '%s exit=%s\n' "$name" "$rc"
  return "$rc"
}
```

---

# 4. Architecture Map

The repository presents three primary execution surfaces.

## 4.1 Renderer / Frontend

Primary area:

```text
src/
```

Observed contracts:

- React/Vite renderer.
- Zustand application stores.
- IndexedDB/local-first application state.
- Translation catalogs and runtime i18n.
- Chat, media, research, document, RP, workflow, settings, privacy, and diagnostics UI.
- Renderer is not intended to own raw OS/filesystem/secrets/provider credentials.

## 4.2 Electron Main / Preload / IPC

Primary area:

```text
electron/
```

Repository security documentation states that:

- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- sandboxing is enabled.
- renderer receives named typed preload channels rather than raw `ipcRenderer`.
- privileged handlers are supposed to pass through centralized sender validation.
- credentials use OS-provided secure storage on supported platforms.
- generated media and workspace access are main-process owned.

These are **security contracts** to verify against implementation, not assumptions that every handler obeys them.

## 4.3 Web / Express Proxy

Primary entrypoint:

```text
server.ts
```

Observed responsibilities include:

- Venice proxying.
- dev-session credential plumbing.
- request/header normalization.
- Family Safe Mode and mandatory child-safety enforcement integration.
- Jina/scrape proxying and SSRF controls.
- response-body safety screening.
- production Vite/static serving.

## 4.4 Canonical Venice Request Boundary

`AGENTS.md` documents a central rule: Venice requests should use the canonical client / transport boundaries rather than direct ad-hoc fetches.

Local audit must search for bypasses:

```bash
rg -n \
  'fetch\(|axios\.|https?\.request|http\.request|new WebSocket|ipcRenderer|shell\.openExternal|child_process|exec\(|spawn\(' \
  src electron server.ts \
  --glob '!**/*.test.*' \
  --glob '!**/node_modules/**'
```

Every match must be traced before classification.

## 4.5 Safety Architecture

Current documentation and tests establish two conceptual layers:

1. Mandatory child-safety layer — intended to remain active regardless of the optional Family Safe Mode setting.
2. Optional Family Safe Mode/adult-content layer — intended to be disabled in Adult Mode.

The code/test path must preserve this distinction everywhere: renderer preflight, Electron authoritative request path, web proxy, bridge/headless path, research/Jina/scrape, image, audio, video, embeddings, and character/RP paths.

---

# 5. Confirmed Findings

## [REPO-P1-001] Mandatory agent bootstrap requires a root file that is absent

**Severity:** P1  
**Confidence:** Confirmed  
**Category:** Repository / Agent Bootstrap

### Location

- `AGENTS.md` — Section 2, **Mandatory Local Bootstrap**
- `AGENTS.md` — Section 3, **Required Reading Order**
- Repository root

### Summary

The repository's authoritative agent guide makes `AGENT_REINITIALIZATION.md` a mandatory root prerequisite, but the current root repository listing does not contain that file.

The bootstrap uses:

```bash
test -f AGENT_REINITIALIZATION.md
```

and the required reading order begins with:

```text
AGENT_REINITIALIZATION.md
```

A compliant agent therefore exits before substantive work or cannot satisfy the documented reading order.

### Evidence

Current root listing exposes, among other files:

```text
AGENTS.md
CODE_OF_CONDUCT.md
CONTRIBUTING.md
LEGAL.md
LICENSE
PRIVACY.md
PRODUCT.md
README.md
SECURITY.md
SUPPORT.md
electron-builder.config.cjs
eslint.config.mjs
package-lock.json
package.json
server.test.ts
server.ts
...
```

but does not expose `AGENT_REINITIALIZATION.md`.

`AGENTS.md` explicitly requires:

```bash
test -f package.json
test -f package-lock.json
test -f AGENTS.md
test -f AGENT_REINITIALIZATION.md
test -d src
test -d electron
```

and then requires it as the first document read.

### Root Cause

Repository instruction drift: the root guide references an artifact that was deleted, renamed, moved, never committed, or intentionally retired without updating the bootstrap contract.

### Impact

- Every agent that follows `AGENTS.md` exactly fails bootstrap.
- Automated remediation sessions may terminate before inspection.
- Agents may bypass the documented bootstrap to continue, creating inconsistent process behavior.
- Required-reading provenance becomes undefined.

### Reproduction

```bash
cd /Users/super_user/Projects/Venice_Forge

test -f AGENT_REINITIALIZATION.md
echo $?
```

Expected:

```text
0
```

Actual, if local `main` matches the current public root:

```text
1
```

Also run:

```bash
git ls-files --error-unmatch AGENT_REINITIALIZATION.md
```

Expected if the guide is correct:

```text
AGENT_REINITIALIZATION.md
```

Actual expected from current public evidence:

```text
error: pathspec ... did not match any file(s) known to git
```

### Recommended Fix

Choose **one** canonical resolution.

**Option A — file is obsolete:** remove every mandatory reference from `AGENTS.md` and any verifier/agent documentation.

**Option B — file is still required:** restore the file at repository root, register its authority/status in `docs/DOCS_INDEX.md`, and ensure it contains current—not historical—bootstrap instructions.

Do not create a placeholder file solely to make the check green.

### Example Implementation

If the file is obsolete, update the root bootstrap to:

```bash
test -f package.json
test -f package-lock.json
test -f AGENTS.md
test -d src
test -d electron
```

and start required reading at the actual canonical handoff:

```text
1. docs/summary_of_work.md
2. docs/DOCS_INDEX.md
3. docs/ROADMAP.md
...
```

### Regression Protection

Extend `scripts/verify-agent-docs.cjs` so every mandatory literal repository path declared by `AGENTS.md` must resolve to a tracked file/directory.

Required regression test:

```text
AGENTS.md declares a missing root prerequisite
→ verify:agent-docs exits non-zero
→ output names the unresolved path
```

### Validation

```bash
npm run verify:agent-docs
npm run verify:markdown-links
npm run verify:contracts:static
```

Then run the bootstrap block exactly as documented.

### Dependencies / Related Findings

- DOC-P2-001
- DOC-P3-001

---

## [DOC-P2-001] README and AGENTS.md invoke a nonexistent i18n validation script

**Severity:** P2  
**Confidence:** Confirmed  
**Category:** Documentation / Tooling / i18n

### Location

- `AGENTS.md` — **Runtime Localization Contracts**
- `README.md` — **Validation / CI Gates**
- `package.json` — `scripts`

### Summary

Two authoritative developer-facing documents instruct contributors/agents to run:

```bash
npm run verify:i18n-hardcoded-regressions
```

but `package.json` exposes:

```json
"i18n:verify-hardcoded": "node scripts/verify-hardcoded-strings.cjs"
```

and does **not** expose `verify:i18n-hardcoded-regressions`.

### Evidence

`AGENTS.md` says:

```text
Run npm run verify:i18n and npm run verify:i18n-hardcoded-regressions after visible UI changes.
```

README's localization validation section repeats:

```bash
npm run verify:i18n
npm run verify:i18n-hardcoded-regressions
```

The package scripts include:

```json
"verify:i18n": "node scripts/verify-i18n.cjs",
"i18n:verify-hardcoded": "node scripts/verify-hardcoded-strings.cjs"
```

No matching `verify:i18n-hardcoded-regressions` script is visible.

### Root Cause

The hardcoded-string verifier was renamed or introduced under `i18n:verify-hardcoded`, but developer instructions were not updated atomically.

### Impact

Any contributor/agent following the documented validation sequence receives npm's missing-script error instead of performing the intended i18n regression check.

This also weakens confidence in statements that the documentation verifier protects command drift.

### Reproduction

```bash
npm run verify:i18n-hardcoded-regressions
```

Expected:

```text
hardcoded-string regression verifier executes
```

Actual:

```text
npm error Missing script: "verify:i18n-hardcoded-regressions"
```

Confirm the real script:

```bash
npm run i18n:verify-hardcoded
```

### Recommended Fix

Prefer one canonical command name across:

- `package.json`
- `README.md`
- `AGENTS.md`
- CI/workflow docs
- release docs
- agent-doc verifier tests

Two viable approaches:

**Preferred:** update docs to the already-existing:

```bash
npm run i18n:verify-hardcoded
```

**Alternative:** add a compatibility alias:

```json
"verify:i18n-hardcoded-regressions": "npm run i18n:verify-hardcoded"
```

Only retain both names if backward compatibility is intentional.

### Regression Protection

Extend `verify:agent-docs` or add a dedicated npm-command-documentation verifier that:

1. parses literal `npm run <script>` references in active authoritative Markdown;
2. loads `package.json`;
3. fails if a referenced script is absent.

At minimum scan:

```text
AGENTS.md
README.md
CONTRIBUTING.md
SECURITY.md
docs/**/*.md
```

Use an allowlist only for intentionally illustrative commands.

### Validation

```bash
npm run verify:agent-docs
npm run verify:markdown-links
npm run i18n:verify-hardcoded
npm run verify:i18n
npm run verify:contracts:static
```

### Dependencies / Related Findings

- REPO-P1-001
- VERIFY-I18N-001 in Section 8

---

## [LEGAL-P2-001] Repository license identity is inconsistent across release metadata

**Severity:** P2  
**Confidence:** High  
**Category:** Legal / Release Metadata / Documentation

### Location

- Root `LICENSE`
- GitHub repository license detection
- `README.md` — **License**
- `package.json` — `license`

### Summary

The current GitHub repository page identifies Venice Forge as **Apache-2.0**, while `README.md` and indexed `package.json` metadata say **MIT**.

### Evidence

The current repository navigation reports:

```text
Apache-2.0 license
```

The README says:

```text
Venice Forge is open-source software licensed under the MIT License.
```

Indexed `package.json` contains:

```json
"license": "MIT"
```

### Root Cause

The root license appears to have changed to Apache-2.0 without synchronizing release/package/documentation metadata, or the root license is unintended.

### Impact

This is not merely cosmetic.

Consumers, packagers, downstream forks, automated license scanners, SBOM generators, release artifacts, and legal/compliance tooling can receive conflicting licensing terms.

A release should not ship while the project's governing license is ambiguous.

### Reproduction

Run locally:

```bash
printf '%s\n' '== LICENSE header =='
sed -n '1,40p' LICENSE

printf '%s\n' '== package metadata =='
node --input-type=module -e \
  'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync("package.json","utf8")); console.log(p.license)'

printf '%s\n' '== documentation references =='
rg -n -i '\bMIT\b|Apache-2\.0|Apache License|licensed under' \
  README.md LEGAL.md SECURITY.md CONTRIBUTING.md package.json docs .github
```

### Expected

Exactly one intended project license identity is consistently represented.

### Actual

Public evidence currently reports Apache-2.0 at repository level and MIT in README/package metadata.

### Recommended Fix

First make a maintainer decision based on the actual intended license.

If Apache-2.0 is intentional:

```json
"license": "Apache-2.0"
```

and update README, legal documentation, release metadata, SBOM/package verification, and any installer/about copy.

If MIT is intended, restore the MIT `LICENSE` file and ensure GitHub's license detection returns MIT.

Do not silently dual-license unless that is an explicit legal decision and the license expression/files are correctly modeled.

### Regression Protection

Extend `verify:release-metadata` or create `verify:license-consistency` that compares:

- root license fingerprint/SPDX identity;
- `package.json.license`;
- canonical README license text;
- legal docs;
- generated release metadata.

### Validation

```bash
npm run verify:release-metadata
npm run verify:contracts:static

# Optional if installed:
npx licensee detect .
```

Also confirm the GitHub repository page shows the intended license after push.

### Dependencies / Related Findings

None.

---

## [SEC-P2-001] SECURITY.md contradicts the mandatory-vs-optional safety model

**Severity:** P2  
**Confidence:** Confirmed  
**Category:** Security Documentation / Safety Contract

### Location

- `SECURITY.md` — **Content Safety**
- `SECURITY.md` — **Headless Bridge Security**
- `SECURITY.md` — **Local Master YAML Config**
- `server.test.ts` — Family Safe Mode decision matrix / mandatory child safety tests

### Summary

`SECURITY.md` correctly defines two safety layers near the top, then later uses language that says Adult Mode skips "the local check" or "local rule evaluation."

Those later statements are broad enough to contradict the same document's explicit claim that the mandatory child-safety layer always runs and cannot be disabled.

### Evidence

The canonical Content Safety section says, in substance:

```text
mandatory child-safety layer runs on every guarded request regardless of settings
this layer cannot be disabled by the user
```

and:

```text
turning Family Safe Mode off removes adult-oriented restrictions
but does not affect mandatory child safety
```

Later, the Headless Bridge section says:

```text
Adult Mode skips the local check.
```

The Local Master YAML Config section says:

```text
Setting safety.local_family_safe_mode_enabled false selects Adult Mode
and skips local rule evaluation.
```

Current `server.test.ts` disproves the broad interpretation by asserting that the mandatory child-safety canary is still blocked with HTTP 451 when the optional filter is disabled, including the client-override path.

### Root Cause

Terminology was not updated when the single local-guard concept evolved into two distinct layers.

The document now uses "local check" / "local rule evaluation" to refer sometimes to the optional adult-content filter and sometimes to the entire local safety pipeline.

### Impact

- Maintainers can misunderstand which safety layer must remain invariant.
- A future implementation could incorrectly disable the mandatory layer based on the stale prose.
- Security reviewers can report false bypasses.
- Operators using headless/config modes can misinterpret the runtime behavior.
- The contradiction undermines `SECURITY.md`'s own claim to be the source of truth.

### Reproduction

```bash
rg -n \
  'cannot be disabled|does not affect mandatory child safety|Adult Mode skips|skips local rule evaluation' \
  SECURITY.md
```

Compare those passages side-by-side.

Then run focused tests:

```bash
npx vitest run server.test.ts --no-file-parallelism
npx vitest run tests/safety/guardPipeline.test.ts --no-file-parallelism
npm run verify:safety-guard
```

### Expected

Every document section consistently says:

```text
Adult Mode disables only the optional adult-content / Family Safe Mode layer.
Mandatory child-safety enforcement remains active.
```

### Actual

The top section states the correct two-layer model; later sections imply all local evaluation is skipped.

### Recommended Fix

Replace ambiguous broad statements with explicit layer names.

For example:

```text
Adult Mode disables the optional Family Safe Mode/adult-content layer.
It does not disable the mandatory child-safety layer, which remains active
on every guarded request.
```

For YAML config:

```text
safety.local_family_safe_mode_enabled=false disables only the optional
adult-content filter. Mandatory child-safety evaluation remains active.
```

### Regression Protection

Add a documentation-contract test to `verify:safety-guard` or `verify:agent-docs` that checks active security docs do not describe mandatory child safety as user-disableable.

Do not implement this as a fragile exact-sentence assertion; test for required invariant phrases/sections.

### Validation

```bash
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts:static
npx vitest run server.test.ts tests/safety/guardPipeline.test.ts --no-file-parallelism
```

### Dependencies / Related Findings

None.

---

## [DOC-P3-001] README references a root FILE_TREE.md that does not exist

**Severity:** P3  
**Confidence:** Confirmed  
**Category:** Documentation Drift

### Location

- `README.md` — **Repository Map**
- Repository root

### Summary

README tells readers:

```text
For a complete breakdown of every file, see FILE_TREE.md.
```

The current public root listing does not contain `FILE_TREE.md`.

### Evidence

Current root shows `AGENTS.md`, `README.md`, `SECURITY.md`, package/build files, and application directories, but no `FILE_TREE.md`.

### Root Cause

The file was removed, moved, or never generated while README text remained.

### Impact

- Developer navigation points to a nonexistent artifact.
- Agents may waste time searching for an authoritative repository map.
- Repository-documentation claims are unreliable.

### Reproduction

```bash
test -f FILE_TREE.md
echo $?
git ls-files | grep -Fx FILE_TREE.md
```

Expected:

```text
FILE_TREE.md exists and is tracked
```

Actual, if local main matches public root:

```text
missing
```

### Recommended Fix

Either:

1. restore/generate `FILE_TREE.md` and define who owns its freshness; or
2. remove the reference and point to an existing canonical architecture/index document.

Do not create a generated full file tree unless it has a deterministic updater and verification strategy.

### Regression Protection

Make the reference a real Markdown link so `verify:markdown-links` can detect deletion, or extend the docs verifier to resolve explicitly named repository files.

### Validation

```bash
npm run verify:markdown-links
npm run verify:agent-docs
```

### Dependencies / Related Findings

- REPO-P1-001

---

## [DOC-P3-002] README reports two different built-in theme counts

**Severity:** P3  
**Confidence:** Confirmed  
**Category:** Documentation / Product Metadata

### Location

- `README.md` — **Feature Highlights**
- `README.md` — **Theme System**
- `config/themes/`

### Summary

The same README says Venice Forge supports:

```text
35 built-in themes
```

and later:

```text
Built-in Catalog (39 Themes)
```

The explicit category list in the Theme System section totals 39 names.

### Evidence

Feature Highlights:

```text
Token-Based Styling ... supporting 35 built-in themes
```

Theme System:

```text
Built-in Catalog (39 Themes)
```

The catalog shown beneath it contains:

- 4 pastel themes
- 14 Dracula/dark-palette entries
- 21 entries under Light & High Contrast

Total: 39.

### Root Cause

A theme catalog expansion updated the detailed catalog but not the earlier product summary.

### Impact

Low runtime impact, but public product documentation is self-contradictory and easy for automated release/docs checks to catch.

### Reproduction

```bash
rg -n 'built-in themes|Built-in Catalog' README.md
find config/themes -type f -maxdepth 2 | sort
```

Then determine the actual supported catalog using the same registry the app loads rather than blindly counting filesystem files.

### Recommended Fix

Do not hardcode the count in multiple prose locations.

Preferred:

- make one canonical generated theme-count fact;
- or remove the numeric claim from the feature bullet and leave the detailed catalog as authority.

### Regression Protection

If a numeric claim is retained, have `verify:theme-tokens` expose/validate the canonical theme registry count and compare any generated docs metadata against it.

### Validation

```bash
npm run verify:theme-tokens
npm run verify:markdown-links
```

### Dependencies / Related Findings

None.

---

# 6. GitHub Actions / CI Review

## 6.1 What was proven

The public Actions surface exposes workflows including:

```text
CI
CodeQL
Copilot
Copilot cloud agent
Copilot code review
Dependabot Updates
Dependency Review
Release
```

Repository security documentation states that third-party Actions are pinned to commit SHAs, including checkout, setup-node, artifact actions, CodeQL, and dependency review.

`package.json` also contains a broad aggregate local CI command:

```json
"ci": "npm run lint:eslint && npm run typecheck && npm run test:ci && npm audit --audit-level=moderate && npm run build && npm run verify:contracts && npm run verify:dist"
```

That is a strong declared validation contract.

## 6.2 What was not proven

The indexed Actions page exposes recent run names/durations but did not reliably expose current `status` / `conclusion` for the latest entries. Several indexed CI/CodeQL runs complete in only a few seconds, while some older runs lasted many hours.

Do **not** infer success or failure from duration alone.

The local agent must obtain the authoritative state:

```bash
gh run list \
  --repo spearchucker667/Venice_Forge \
  --branch main \
  --limit 50 \
  --json databaseId,workflowName,headSha,status,conclusion,createdAt,updatedAt,url
```

Then inspect every non-success conclusion:

```bash
gh run view <RUN_ID> \
  --repo spearchucker667/Venice_Forge \
  --json name,headSha,status,conclusion,jobs,url

gh run view <RUN_ID> \
  --repo spearchucker667/Venice_Forge \
  --log-failed
```

## 6.3 CI root-cause rule

For each failing run, record:

```text
Workflow:
Run ID:
Head SHA:
Job:
Step:
Exit code:
Observed error:
First failing assertion/command:
Root cause:
Source/config/environment ownership:
Remediation:
Regression protection:
Proof after fix:
```

Do not label the whole workflow "broken" because a job is cancelled, superseded, infrastructure-stalled, or manually stopped.

## 6.4 Workflow source checks

Inspect all tracked workflows:

```bash
find .github/workflows -maxdepth 1 -type f -print | sort

for f in .github/workflows/*.{yml,yaml}; do
  [[ -e "$f" ]] || continue
  printf '\n===== %s =====\n' "$f"
  sed -n '1,260p' "$f"
done
```

Check:

- least-privilege `permissions`;
- branch triggers;
- concurrency/cancel behavior;
- Node version and `.nvmrc` alignment;
- `npm ci`, never mutable install in CI;
- action SHA pinning;
- timeouts;
- artifact retention;
- CodeQL language/config paths;
- release gating;
- signing/notarization conditions;
- Windows/macOS/Linux coverage;
- dependency review;
- secret handling;
- whether `verify:contracts` and `verify:dist` run in the correct jobs;
- whether failure in one required job can be hidden by conditionals.

---

# 7. Security Review

## 7.1 Confirmed security defect inventory

No exploitable security vulnerability was proven in the remote pass.

One security-documentation contract defect was proven:

```text
SEC-P2-001
```

Do not upgrade it to a vulnerability unless code execution proves a path that disables the mandatory guard.

## 7.2 Investigated but Not Defective

### Adult Mode mandatory child-safety bypass — disproven

Suspicion:

```text
Family Safe Mode off might disable all local safety.
```

Current tests explicitly pin the opposite behavior. `server.test.ts` contains cases that expect the mandatory child-safety canary to return 451 when:

- the optional Family Safe setting is disabled;
- a client header asks for Family Safe Mode off;
- the dev-only client override is enabled;
- the environment override is `false` or `0`.

Classification:

```text
Investigated but Not Defective
```

Remaining action: fix contradictory documentation under SEC-P2-001.

### Renderer-controlled Authorization header injection — no defect established

Indexed `server.ts` evidence shows the proxy removes renderer-supplied:

```text
Authorization
Cookie
Host
```

and then sets the server-owned Venice Authorization header.

No bypass was proven.

### HTTP scrape SSRF before DNS — no defect established

Current `server.test.ts` includes a regression case asserting that an `http:` scrape URL is rejected before DNS/network access.

No bypass was proven from available evidence.

### macOS unsigned local package mode — intentional behavior, not automatically a defect

`electron-builder.config.cjs` explicitly distinguishes local unsigned builds from credentialed CI release signing/notarization.

Do not report "macOS signing disabled" from `identity: null` in isolation. First trace the release job's credential path and actual packaged artifacts.

## 7.3 Security verification queue

The local audit must still inspect:

```text
electron/ipc/**
electron/preload*
electron/utils/validateIpcSender*
electron/services/secureStore*
electron/services/guardPipeline*
electron/services/bridgeServer*
src/services/veniceClient*
src/shared/safety/**
src/shared/urlSecurity*
server.ts
```

Run:

```bash
npm run verify:safety-guard
npm run verify:network-boundaries
npm run verify:custom-protocol-privileges
npm run verify:storage-privacy
npm run verify:storage-policy
npm run verify:character-card-security
npm run verify:image-policy
```

Also search for privileged bypasses:

```bash
rg -n \
  'ipcMain\.handle|ipcMain\.on|ipcRenderer|contextBridge|shell\.openExternal|webContents|setWindowOpenHandler|will-navigate|permission|safeStorage|fs\.|readFile|writeFile|rename|unlink|realpath|child_process|exec\(|spawn\(' \
  electron src server.ts
```

Every reachable privileged handler must be checked for:

- sender validation;
- input schema validation;
- canonical path validation;
- symlink handling;
- size/bounds;
- authorization/profile ownership;
- safe error output;
- secret redaction;
- cancellation/cleanup.

---

# 8. NEEDS_VERIFICATION Queue

These are **not confirmed defects**. A local agent must resolve them before final closure.

## [VERIFY-I18N-001] Determine whether hardcoded-string debt is actually CI-gated

**Severity if confirmed:** P1/P2 depending on uncovered regression exposure  
**Confidence:** Needs Verification  
**Category:** CI / i18n

### Evidence

`package.json` exposes:

```json
"i18n:verify-hardcoded": "node scripts/verify-hardcoded-strings.cjs"
```

but the visible `verify:contracts:static` command includes `verify:i18n` and `verify:prompt-language`, not `i18n:verify-hardcoded`.

The visible `i18n:full-pipeline` also does not explicitly call `i18n:verify-hardcoded`.

### Missing evidence

It is not yet proven whether:

```text
scripts/verify-i18n.cjs
```

internally invokes or reimplements the same hardcoded-string check.

### Required investigation

```bash
sed -n '1,280p' scripts/verify-i18n.cjs
sed -n '1,340p' scripts/verify-hardcoded-strings.cjs

rg -n \
  'verify-hardcoded|hardcoded|verify:i18n|i18n:verify-hardcoded' \
  package.json scripts .github AGENTS.md README.md docs
```

Then run both:

```bash
npm run verify:i18n
npm run i18n:verify-hardcoded
```

If the checks are independent and only the first is in CI, confirm a CI false-green gap.

---

## [VERIFY-CI-001] Resolve current CI/CodeQL conclusions from authoritative run data

**Severity if confirmed:** P1 for required release/CI blocker; otherwise P2/P3  
**Confidence:** Needs Verification  
**Category:** GitHub Actions

### Evidence

Public indexed run history contains unusually short CI/CodeQL entries and older runs with multi-hour durations.

Duration alone is not status.

### Required investigation

```bash
gh run list \
  --repo spearchucker667/Venice_Forge \
  --branch main \
  --limit 50 \
  --json databaseId,workflowName,headSha,status,conclusion,createdAt,updatedAt,url \
  | tee artifacts/audit-2026-09-24/gh-runs.json
```

For every non-success:

```bash
gh run view <RUN_ID> \
  --repo spearchucker667/Venice_Forge \
  --log-failed
```

Classify cancellations separately from failures.

---

## [VERIFY-DEP-001] Verify whether @testing-library/dom is incorrectly shipped as a runtime dependency

**Severity if confirmed:** P3  
**Confidence:** Needs Verification  
**Category:** Dependency Hygiene / Packaging

### Evidence

Indexed `package.json` places:

```json
"@testing-library/dom": "^10.4.1"
```

under `dependencies`, while the other Testing Library packages are under `devDependencies`.

Testing Library itself documents this package as a test/development dependency.

### Missing evidence

A production source import has not been ruled out.

### Required investigation

```bash
rg -n \
  'from ["'\'']@testing-library/dom["'\'']|require\(["'\'']@testing-library/dom["'\'']\)' \
  src electron server.ts scripts tests \
  package*.json

npm explain @testing-library/dom
```

If only tests/dev tooling use it, move the direct dependency to `devDependencies` with:

```bash
npm install --save-dev @testing-library/dom@^10.4.1
```

and validate lockfile/package output.

---

## [VERIFY-README-001] Verify stale "Playwright smoke tests" repository-map claim

**Severity if confirmed:** P3  
**Confidence:** Needs Verification  
**Category:** Documentation

### Evidence

README's repository map describes:

```text
tests/  # Playwright smoke tests and accessibility suites
```

The visible package metadata defines Electron smoke testing with Vitest:

```json
"smoke:electron": "vitest run tests/smoke/electron-smoke.test.ts"
```

and the indexed package dependency list does not visibly include Playwright.

### Required investigation

```bash
rg -n -i 'playwright' .
npm ls @playwright/test playwright --depth=0 || true
find tests -maxdepth 3 -type f -print | sort
```

If Playwright is no longer used, repair README.

---

## [VERIFY-RUNTIME-001] Execute the full app workflow matrix

**Severity:** Unknown until reproduced  
**Confidence:** Needs Verification  
**Category:** Runtime / UI / Integration

The remote audit could not launch the app.

The local agent must test at minimum:

```text
startup
first-run/onboarding
API-key save/load/test
model list and model switching
streaming chat
tab switching during stream
attachments
tool calls
document create/edit/revision/export
workspace grants
image generate/edit/inpaint/upscale/background removal
generated-media persistence
Image Inspector
video queue/retrieve/save
audio/music
research/Jina/generic scrape
character creation
character chats
RP Studio
workflow editor/execution
theme switch/import/export
language switch/RTL
restart persistence
failure recovery/offline behavior
settings reset
profile lock/unlock
backup/export/import
sync folder
```

Record defects only with reproducible steps and exact owning paths.

---

# 9. UI / UX Audit Work Order

The remote static pass cannot prove clipping/overlap behavior.

Use at least these viewport classes:

```text
1280x720
1440x900
1728x1117
1920x1080
high-DPI Retina
maximized
non-maximized narrow window
```

Stress every view with:

```text
long prompt templates
long model names
long project names
long filenames
long localized strings
Arabic RTL
200% zoom
keyboard-only navigation
large result histories
large document trees
modal stacked over popover/menu
```

For each UI finding record:

```text
screen
viewport
theme
locale
zoom
exact data/input
screenshot
DOM/component owner
expected
actual
keyboard/focus impact
overflow/scroll container owner
```

Search likely layout hazards:

```bash
rg -n \
  'overflow-hidden|overflow: hidden|position: fixed|position: absolute|z-index|z-\[|max-h-|h-screen|100vh|100dvh|min-width|max-width|truncate|whitespace-nowrap' \
  src \
  --glob '*.{ts,tsx,css}'
```

Do not report a CSS pattern as a bug until the reachable UI reproduces it.

---

# 10. API / Network Contract Audit Work Order

The local agent must trace every API flow end-to-end:

```text
UI
→ store/action
→ service
→ desktop/web transport selector
→ Electron IPC or Express proxy
→ canonical Venice client
→ request payload
→ upstream
→ response parser/SSE
→ normalization
→ persistence
→ UI state
```

Search:

```bash
rg -n \
  'api\.venice\.ai|/api/v1|/chat/completions|/image/|/video/|/audio/|/embeddings|/augment/|safe_mode|venice_parameters|AbortController|ReadableStream|EventSource|text/event-stream' \
  src electron server.ts tests scripts
```

Verify:

- endpoint allowlist consistency;
- method allowlist;
- model-capability gating;
- timeout policy;
- retry/backoff policy;
- abort propagation;
- SSE frame parsing;
- partial/final event handling;
- provider error body parsing;
- HTTP 4xx/5xx normalization;
- rate-limit metadata;
- image output format semantics;
- async video queue lifecycle;
- JSON/schema validation;
- pagination;
- `safe_mode` propagation independently from local optional safety.

Compare implementation with the repository's checked-in Venice API reference before changing behavior.

---

# 11. State / Persistence Audit Work Order

Inventory all stores and persistence layers:

```bash
find src electron -type f \( \
  -iname '*store*' -o \
  -iname '*db*' -o \
  -iname '*persist*' -o \
  -iname '*storage*' -o \
  -iname '*migration*' \
\) -print | sort
```

Trace:

```text
initialization
migration
read
write
transaction
failure
rollback
deletion
restart
profile isolation
backup
restore
sync conflict
tombstone
```

Required failure injection:

- quota full;
- disk read-only;
- corrupted IndexedDB record;
- malformed persisted JSON;
- interrupted media write;
- interrupted backup import;
- duplicate IDs;
- stale migration version;
- profile switch during pending async write;
- app close during write.

A UI update without durable persistence must be reported as a state/persistence defect.

---

# 12. Build / Packaging Audit Work Order

Visible `electron-builder.config.cjs` currently targets:

```text
Windows: NSIS + portable x64
macOS: DMG + ZIP, x64 + arm64
Linux: AppImage + deb + rpm x64
```

macOS release signing/notarization is conditional on CI credentials.

Required validation:

```bash
npm run clean
npm run build
npm run verify:dist

# On macOS:
npm run dist:mac:arm64
npm run verify:dist:mac

# Where supported:
npm run dist:win
npm run verify:dist:win

npm run dist:linux
npm run verify:dist:linux
```

Inspect final artifacts, not just command exit codes:

```bash
find release -maxdepth 2 -type f -print -exec shasum -a 256 {} \;
```

On macOS:

```bash
codesign -dv --verbose=4 release/*.app 2>&1 || true
codesign --verify --deep --strict --verbose=4 release/*.app || true
spctl --assess --type execute --verbose=4 release/*.app || true
xcrun stapler validate release/*.app || true
```

Do not classify unsigned local-development output as a release defect unless the tagged release path is supposed to be signed.

---

# 13. Dependency Audit Work Order

Run:

```bash
npm ci
npm audit --audit-level=moderate
npm outdated || true
npm dedupe --dry-run || true
npm ls --all > artifacts/audit-2026-09-24/npm-ls.txt
```

Do not upgrade everything.

For each proposed dependency change record:

```text
current version
target version
why change is necessary
known incompatibility/vulnerability
runtime vs dev use
Electron/Node 22 compatibility
lockfile impact
test proof
```

Special attention:

```text
Electron
electron-builder
Vite
React
Zustand
Express
i18next/react-i18next
pdfjs-dist
docx/mammoth/pdf-lib
libsodium
http-proxy-middleware
chokidar
```

---

# 14. Tests and Regression Coverage

The package exposes multiple layers of tests and contract verifiers.

The local agent should not rely only on `npm test`; run the repository's intended aggregate/focused commands and inspect skipped tests.

Inventory:

```bash
find src electron tests scripts -type f \
  \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' \) \
  -print | sort \
  > artifacts/audit-2026-09-24/test-files.txt

rg -n \
  '\b(it|test|describe)\.(skip|todo|only)\b|\.skip\(|\.todo\(|\.only\(' \
  src electron tests scripts server.test.ts \
  > artifacts/audit-2026-09-24/skipped-or-focused-tests.txt || true
```

Any `.only` in committed tests is a defect unless a framework-specific false positive is established.

For every P0/P1/P2 implementation bug, require a regression test that fails before the fix and passes after it.

---

# 15. Remediation Plan

Ordering is based on technical dependency, not severity alone.

## Phase 0 — Establish exact local baseline

**Findings:** all  
**Files:** none initially

1. Record HEAD SHA.
2. Record dirty worktree.
3. Record toolchain.
4. `npm ci`.
5. Capture current validation failures.
6. Capture current Actions/CodeQL conclusions.

Do not edit before evidence capture.

## Phase 1 — Repair repository authority and release identity

**Findings:**

```text
REPO-P1-001
LEGAL-P2-001
DOC-P3-001
```

Why first:

- agents need a functioning authoritative bootstrap;
- license identity must be settled before release or broad documentation cleanup;
- missing authority files affect all later agent work.

Validation:

```bash
npm run verify:agent-docs
npm run verify:markdown-links
npm run verify:release-metadata
npm run verify:contracts:static
```

## Phase 2 — Repair validation-command drift

**Findings:**

```text
DOC-P2-001
VERIFY-I18N-001
```

Tasks:

1. select one canonical hardcoded-string verifier command;
2. repair README/AGENTS references;
3. determine whether it is independently CI-gated;
4. add command-reference verification.

Validation:

```bash
npm run verify:i18n
npm run i18n:verify-hardcoded
npm run verify:agent-docs
npm run verify:contracts:static
```

## Phase 3 — Repair security-model documentation

**Finding:**

```text
SEC-P2-001
```

Do not change enforcement code unless focused tests prove a code defect.

Validation:

```bash
npm run verify:safety-guard
npx vitest run server.test.ts tests/safety/guardPipeline.test.ts --no-file-parallelism
npm run verify:markdown-links
```

## Phase 4 — Resolve minor public documentation drift

**Finding:**

```text
DOC-P3-002
VERIFY-README-001
```

Remove duplicate manually maintained counts where possible.

## Phase 5 — Resolve live CI failures

**Finding:**

```text
VERIFY-CI-001
```

Only after authoritative Actions logs are collected.

Do not weaken tests, CodeQL, npm audit, or contract gates to obtain green status.

## Phase 6 — Full runtime/UI/API/persistence audit

Execute Sections 9–13.

Any newly reproduced defects receive stable IDs and must be appended rather than renumbering existing findings.

---

# 16. Regression Test Plan

Add or strengthen the following checks.

## 16.1 Agent-document filesystem contract

`verify:agent-docs` should fail when an authoritative agent guide names a mandatory tracked file that is absent.

Fixture:

```text
AGENTS fixture → "test -f REQUIRED.md"
REQUIRED.md absent
Expected: verifier fails and names REQUIRED.md
```

## 16.2 Documented npm command contract

Parse authoritative docs for literal:

```text
npm run <name>
```

and verify `<name>` exists in `package.json.scripts`.

Allow documented exceptions only through a small reviewed allowlist.

This would prevent DOC-P2-001.

## 16.3 License consistency contract

Compare declared SPDX identity across:

```text
LICENSE
package.json
README
LEGAL docs
release metadata
```

Fail on divergence.

## 16.4 Safety documentation invariant

Protect the invariant:

```text
Adult Mode disables optional adult-content filtering only.
Mandatory child-safety remains active.
```

Do not assert exact wording; assert semantic markers in canonical docs and continue relying on runtime tests for actual enforcement.

## 16.5 Generated product facts

Theme count, language count, supported endpoints, and model-independent capability claims should be sourced from registries/schemas rather than hand-maintained in multiple prose locations.

---

# 17. Investigated but Not Defective

Record these so future agents do not repeatedly raise them without new evidence.

## 17.1 Adult Mode disables mandatory child safety

**Result:** Disproven by current `server.test.ts` evidence.

Do not reopen without a failing runtime test or a reachable code path that bypasses mandatory child-safety enforcement.

## 17.2 Renderer can set upstream Venice Authorization directly

**Result:** No defect established.

Indexed proxy code strips renderer-controlled Authorization/Cookie/Host and sets the server-owned Authorization header.

Reopen only if another reachable proxy path bypasses that helper.

## 17.3 `http:` generic scrape reaches DNS/network

**Result:** No defect established.

Current tests assert rejection before DNS/network for the web proxy path.

Electron path still requires independent verification.

## 17.4 Local unsigned macOS builds prove release signing is broken

**Result:** False inference.

Builder configuration explicitly supports unsigned local builds and conditionally enables hardened runtime/notarization for credentialed CI release builds.

Actual tagged release signing must be assessed from the Release workflow/artifact, not local `identity: null` alone.

---

# 18. Final Acceptance Criteria

The remediation is not complete until all applicable criteria below are satisfied and their exact outputs are recorded against the final SHA.

## Repository and authority

```text
[ ] branch is main
[ ] exact final SHA recorded
[ ] no unrelated user changes lost
[ ] every mandatory AGENTS.md path exists
[ ] authoritative docs have no stale command references
[ ] license identity is unambiguous and consistent
```

## Static quality

```bash
npm run lint:eslint
npm run typecheck
```

Both must exit 0.

## Tests

```bash
npm test
npm run test:ci
```

All required suites pass with no accidental `.only` and no unexplained skipped coverage.

## Security and contracts

```bash
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:agent-docs
npm run verify:i18n
npm run i18n:verify-hardcoded
npm run verify:contracts
```

All must exit 0.

## Build

```bash
npm run build
npm run verify:dist
```

Both must exit 0.

## Aggregate CI

```bash
npm run ci
```

Must exit 0 without disabling checks.

## Hosted GitHub

```text
[ ] current main CI succeeds
[ ] current main CodeQL succeeds
[ ] required security workflows succeed
[ ] no required run is indefinitely queued/stuck
[ ] release workflow succeeds for the intended release event
```

## Runtime

```text
[ ] desktop launches
[ ] onboarding completes
[ ] API key save/load/test works
[ ] model selection works
[ ] streaming survives navigation as intended
[ ] media workflows persist and export
[ ] documents persist and revision/export flows work
[ ] restart persistence verified
[ ] offline/timeouts recover
[ ] safety toggles affect only intended optional layers
[ ] mandatory child-safety remains active
[ ] profile isolation holds
[ ] backup/import recovery works
[ ] key UI views pass overflow/focus/keyboard checks
[ ] Arabic RTL and long-string layouts are exercised
```

## Release

```text
[ ] package/release metadata matches the chosen license
[ ] platform artifacts generated where applicable
[ ] signing/notarization validated for release artifacts
[ ] checksums generated
[ ] no secrets or local absolute paths in artifacts
```

---

# 19. Required Final Implementation Handoff Format

After remediation, produce a new final handoff with:

```text
Repository:
Branch:
Starting SHA:
Ending SHA:
Dirty-worktree state at start:
Files changed:
Findings fixed:
Findings disproven:
Findings remaining:
Commands executed:
Exact pass/fail results:
Hosted CI URLs/run IDs:
Manual QA performed:
Manual QA not performed:
Security impact:
Migration/persistence impact:
Release impact:
Deferred work:
```

For every unresolved item, state exactly what evidence is missing.

---

# 20. Evidence Index

The remote audit used the following public repository evidence classes:

1. **Current repository root listing**
   - established branch `main`;
   - established visible root directories/files;
   - established absence of `AGENT_REINITIALIZATION.md` and `FILE_TREE.md` from the current root listing;
   - GitHub currently labels the repository license `Apache-2.0`.

2. **`AGENTS.md`**
   - mandatory bootstrap checks;
   - required reading order;
   - runtime localization contract;
   - agent evidence/validation rules.

3. **`package.json`**
   - version/engines;
   - build/test/CI scripts;
   - actual i18n script name;
   - dependency classification;
   - MIT license metadata in indexed package content.

4. **`README.md`**
   - MIT license prose;
   - nonexistent i18n command;
   - `FILE_TREE.md` reference;
   - 35-vs-39 theme-count contradiction.

5. **`SECURITY.md`**
   - two-layer safety model;
   - mandatory child-safety invariant;
   - contradictory Adult Mode prose;
   - action pinning/security process claims.

6. **`server.test.ts`**
   - mandatory child-safety canary behavior under Family Safe Mode off/override permutations;
   - HTTP scrape pre-DNS rejection test.

7. **`electron-builder.config.cjs`**
   - platform packaging targets;
   - conditional macOS signing/notarization behavior.

8. **GitHub Actions index**
   - workflow inventory;
   - indexed run IDs/durations/SHAs;
   - insufficient authoritative conclusion data for the newest indexed runs, therefore kept in NEEDS_VERIFICATION.

---

# 21. Non-Negotiable Remediation Rules

- Do not invent defects.
- Do not inflate severity.
- Do not claim a command passed unless its output was observed in the local checkout or authoritative CI.
- Do not interpret a short/long Actions duration as success/failure without `conclusion`.
- Do not weaken safeguards, schemas, CSP, IPC validation, tests, CodeQL, npm audit, or contract verifiers to make CI green.
- Do not replace narrow errors with broad catch-and-ignore handling.
- Do not add `any`, `@ts-ignore`, test skips, or lint disables as a shortcut.
- Do not rewrite stable subsystems without evidence.
- Do not force-push.
- Do not discard user-owned worktree changes.
- Work on `main` only unless the user explicitly changes that constraint.
- Prefer root-cause fixes and add regression protection for every material defect.
- Preserve the distinction between the optional Family Safe Mode layer and mandatory child-safety enforcement.
- Treat public docs, comments, prior audits, and old TODOs as evidence—not truth—until verified against the checked-out SHA.

---

# 22. Immediate Remediation Checklist

The next agent can begin with this exact sequence:

```bash
cd /Users/super_user/Projects/Venice_Forge

# 1. Identity and user-owned state
git branch --show-current
git rev-parse HEAD
git status --short

# 2. Reproduce confirmed repository drift
test -f AGENT_REINITIALIZATION.md || echo "CONFIRMED missing AGENT_REINITIALIZATION.md"
test -f FILE_TREE.md || echo "CONFIRMED missing FILE_TREE.md"
npm run verify:i18n-hardcoded-regressions || true
npm run i18n:verify-hardcoded

# 3. Prove license state
sed -n '1,40p' LICENSE
node --input-type=module -e \
  'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync("package.json","utf8")); console.log(p.license)'
rg -n -i '\bMIT\b|Apache-2\.0|Apache License|licensed under' \
  README.md LEGAL.md package.json docs .github

# 4. Prove security-document contradiction and runtime invariant
rg -n \
  'cannot be disabled|does not affect mandatory child safety|Adult Mode skips|skips local rule evaluation' \
  SECURITY.md
npx vitest run server.test.ts tests/safety/guardPipeline.test.ts --no-file-parallelism
npm run verify:safety-guard

# 5. Establish full validation baseline
npm ci
npm run lint:eslint
npm run typecheck
npm test
npm run verify:contracts
npm run build
npm run ci

# 6. Pull authoritative hosted CI state
gh run list \
  --repo spearchucker667/Venice_Forge \
  --branch main \
  --limit 50 \
  --json databaseId,workflowName,headSha,status,conclusion,createdAt,updatedAt,url
```

Do not start broad refactoring until this baseline is captured.

---

**End of handoff.**
