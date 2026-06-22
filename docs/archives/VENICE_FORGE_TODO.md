# Venice Forge Zip Audit TODO

## P0 — Safety and Storage Blockers

### TODO-001 — Normalize response-body safety block shape across web and Electron

Status: fixed 2026-06-19  
Severity: high  
Source finding: `VF-ZIP-001`

#### Files

```text
src/shared/safety/localFamilySafeGuard.ts
server.ts
electron/ipc/handlers.ts
tests/safety/guardPipeline.test.ts
server.test.ts
electron/ipc/handlers.test.ts
```

#### Required Changes

1. Extend blocked `ResponseBodyScreenResult` so it carries stable metadata:

```ts
reasonCode: string;
category: string;
severity: string;
ruleId?: string;
userMessage: string;
```

2. Add a shared formatter for blocked safety responses. Suggested shape:

```ts
export function safetyBlockBodyFromResponseScreen(screen: Extract<ResponseBodyScreenResult, { allowed: false }>) {
  return {
    error: screen.userMessage,
    reasonCode: screen.reasonCode,
    category: screen.category,
    severity: screen.severity,
  };
}
```

3. Update all web and Electron Jina/scrape response-screen blocks to use that body.
4. Ensure every blocked Electron IPC proxy result includes `status: 451`.

#### Validation

```bash
npx vitest run \
  tests/safety/guardPipeline.test.ts \
  server.test.ts \
  electron/ipc/handlers.test.ts \
  --fileParallelism=false

npm run verify:safety-guard
```

#### Acceptance Criteria

- Request-side and response-side safety blocks expose the same stable metadata.
- No blocked response echoes raw upstream response body.
- Web and Electron paths agree on status `451`.

---

### TODO-002 — Propagate canonical Windows-safe ID validation to all Electron file stores

Status: fixed 2026-06-19  
Severity: high  
Source finding: `VF-ZIP-002`

#### Files

```text
src/utils/idValidation.ts
electron/services/chatStorage.ts
electron/services/rpChatStorage.ts
electron/services/characterCardStorage.ts
electron/services/rpSingleFileStore.ts
src/utils/idValidation.test.ts
electron/services/chatStorage.test.ts
electron/services/rpChatStorage.test.ts
electron/services/characterCardStorage.test.ts
electron/services/rpSingleFileStore.test.ts
```

#### Required Changes

1. Remove local regex-only ID validators from:

```text
electron/services/rpChatStorage.ts
electron/services/characterCardStorage.ts
electron/services/rpSingleFileStore.ts
```

2. Import and use the canonical validator that rejects:

```text
CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9
reserved names with extensions such as con.json
__proto__, constructor, prototype
path traversal
leading dot IDs
```

3. Replace array validation using direct regex checks with `v.every(isValidId)`.

#### Validation

```bash
npx vitest run \
  src/utils/idValidation.test.ts \
  electron/services/chatStorage.test.ts \
  electron/services/rpChatStorage.test.ts \
  electron/services/characterCardStorage.test.ts \
  electron/services/rpSingleFileStore.test.ts \
  --fileParallelism=false
```

#### Acceptance Criteria

- Every file-backed Electron store rejects Windows reserved basenames.
- Existing traversal rejection tests still pass.
- No service defines a private divergent `VALID_ID_RE` unless it delegates to the canonical Windows-safe validator.

---

## P1 — API Defaults and Test Correctness

### TODO-003 — Centralize modality default models and remove stale `wan-2.1`

Status: fixed 2026-06-19  
Severity: medium  
Source finding: `VF-ZIP-003`

#### Files

```text
src/constants/venice.ts
src/lib/workflow-engine.ts
src/components/workflows/workflows-view.tsx
src/components/image/image-view.tsx
src/components/audio/audio-view.tsx
src/stores/media-send-to.ts
src/services/modelService.ts
```

#### Required Changes

1. Add canonical constants for modality defaults:

```ts
export const DEFAULT_IMAGE_MODEL = "z-image-turbo";
export const DEFAULT_TTS_MODEL = "tts-kokoro";
export const DEFAULT_MUSIC_MODEL = "stable-audio";
export const DEFAULT_VIDEO_MODEL = "wan-2.6-text-to-video";
```

2. Replace hard-coded workflow/media defaults with imports from the central registry.
3. Confirm each default exists in `FALLBACK_MODELS` or live model capability selection.
4. Remove stale `wan-2.1` unless current Venice API docs or model list prove it remains valid.

#### Validation

```bash
rg -n "'z-image-turbo'|'tts-kokoro'|'stable-audio'|'wan-2\.1'|\"z-image-turbo\"|\"tts-kokoro\"|\"stable-audio\"|\"wan-2\.1\"" src \
  -g '!src/constants/venice.ts'

npx vitest run \
  src/lib/workflow-engine.test.ts \
  src/components/workflows/workflows-view.test.tsx \
  src/services/modelService.test.ts
```

#### Acceptance Criteria

- No stale `wan-2.1` fallback remains.
- Workflow UI defaults and execution defaults match the same constants.
- Video default is listed in the current fallback registry.

---

### TODO-004 — Split proxy body-limit test into parser-limit and valid-path tests

Status: fixed 2026-06-19  
Severity: medium  
Source finding: `VF-ZIP-004`

#### Files

```text
server.test.ts
server.ts
```

#### Required Changes

1. Rename the current test to clarify it only proves the parser limit is above 100 KB.
2. Add valid Jina and scrape requests that pass validation and use mocked upstream responses.
3. Assert intended behavior instead of `status !== 413` only.

#### Validation

```bash
npx vitest run server.test.ts --fileParallelism=false
```

#### Acceptance Criteria

- One test proves large JSON bodies do not fail at body-parser with `413`.
- Another test proves a valid large Jina/scrape proxy path reaches mocked upstream handling.
- No passing test relies on a request being rejected for the wrong reason.

---

## P2 — Repo Hygiene and Audit Canonicalization

### TODO-005 — Promote the tightened audit prompt or mark it external

Status: fixed 2026-06-19  
Severity: low  
Source finding: `VF-ZIP-005`

#### Files

```text
docs/BUG_HUNTING_AGENT_PROMPT.md
docs/reports/README.md
AGENTS.md
```

#### Required Changes

Choose one:

1. Replace `docs/BUG_HUNTING_AGENT_PROMPT.md` with the tightened uploaded prompt, or
2. Keep the repo prompt as-is but explicitly document that the uploaded prompt is external and newer.

Recommended: promote the tightened prompt, because it better matches v2.1.0 and zip snapshot workflows.

#### Validation

```bash
npm run verify:markdown-links
rg -n "Security, Storage, and Release Audit Agent|Repository Source Selection|LEAD-018" docs/BUG_HUNTING_AGENT_PROMPT.md
```

#### Acceptance Criteria

- There is one obvious canonical bug-hunt prompt.
- Agents are not forced to choose between stale prompt versions like this is a low-budget multiverse.

---

### TODO-006 — Archive stale root-level audit artifacts and reconcile report metadata

Status: fixed 2026-06-19  
Severity: low  
Source finding: `VF-ZIP-005`

#### Files / Patterns

```text
AUDIT-*.md
VALIDATION_REPORT*.md
audit_report.yaml
audit-validation-report-*.md
docs/reports/*.md
docs/audits/*.md
```

#### Required Changes

1. Move old root-level audit artifacts into `docs/reports/archive/` or remove them if intentionally obsolete.
2. Add `docs/reports/README.md` explaining which report is current.
3. Update stale reports so they clearly say `historical` and do not claim current pass/fail status.
4. Add a verify script that fails if new audit reports are created at the repository root.

#### Validation

```bash
find . -maxdepth 1 -type f \( -name 'AUDIT-*.md' -o -name 'VALIDATION_REPORT*.md' -o -name 'audit_report.yaml' -o -name 'audit-validation-report-*.md' \) -print
npm run verify:markdown-links
```

#### Acceptance Criteria

- Current audit artifacts live under `docs/reports/` or an explicit archive directory.
- Root repository is not cluttered with stale handoff reports.
- Historical reports cannot be mistaken for current validation proof.

---

### TODO-007 — Reconcile `VERIFY-168` with the VERIFY registry

Status: fixed 2026-06-19  
Severity: low  
Source finding: `VF-ZIP-005`

#### Files

```text
AGENTS.md
scripts/verify-*.cjs
src/services/storagePrivacyService.test.ts
docs/BUG_HUNTING_AGENT_PROMPT.md
```

#### Required Changes

1. Decide whether `VERIFY-168` is intentional.
2. If intentional, document the expanded VERIFY namespace.
3. If not intentional, renumber it into the canonical sequence or map it in a registry file.
4. Add a verify check that rejects unexpected VERIFY IDs unless allowlisted.

#### Validation

```bash
rg -o "VERIFY-[0-9]{3}" . \
  -g '!node_modules' \
  -g '!dist' \
  -g '!dist-electron' \
  -g '!release' \
  -g '!build' \
  -g '!coverage' \
  | sed 's/.*VERIFY/VERIFY/' \
  | sort \
  | uniq -c
```

#### Acceptance Criteria

- `VERIFY-168` is either explicitly allowed or removed.
- Prompt, `AGENTS.md`, and verify scripts agree on valid VERIFY ID ranges.

---

## P3 — Full Release Revalidation

### TODO-008 — Run the complete baseline gate after fixes

Status: fixed 2026-06-19  
Severity: release-gate

#### Commands

```bash
npm run lint:eslint
npm run typecheck
npm run test:coverage
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:theme-tokens
npm run verify:storage-policy
npm run verify:network-boundaries
npm run verify:venice-api-docs
npm run verify:release-packaging-hardening
npm run verify:ci-contract
npm run verify:contracts
npm run build
npm run verify:dist
```

#### Acceptance Criteria

- Every command passes on a clean checkout or clean zip extract.
- Any platform-specific command that cannot run locally is reproduced in CI.
- Release gate is not marked pass until this is complete.
