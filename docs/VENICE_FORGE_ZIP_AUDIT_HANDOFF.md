# Venice Forge Zip Audit — Agent Handoff

## Scope

- Repository artifact: `/mnt/data/Windows-Venice-API-connector-clean-20260619-192735.zip`
- Extracted path used for audit: `/mnt/data/vf_audit/Windows-Venice-API-connector`
- Prompt compared: `/mnt/data/Pasted markdown.md`
- Audit mode: report-only, no source modifications
- Product/package: `venice-forge`
- Version in `package.json`: `2.1.0`
- Node used for targeted validation: `v22.16.0`
- npm used for targeted validation: `10.9.2`

## Repository Inventory

| Metric | Count / Value |
|---|---:|
| Total snapshot files, excluding installed `node_modules` | 835 |
| Included by prompt exclusion rules | 827 |
| Excluded by prompt exclusion rules | 8 |
| Test files | 266 |
| GitHub workflow files | 4 |
| Detected `VERIFY-NNN` IDs | `VERIFY-001` through `VERIFY-058`, plus `VERIFY-168` |

## Workflows Present

```text
.github/workflows/ci.yml
.github/workflows/codeql.yml
.github/workflows/dependency-review.yml
.github/workflows/release.yml
```

## Dependency / Command Notes

Dependencies were not present in the zip. I installed them for targeted validation with:

```bash
cd /mnt/data/vf_audit/Windows-Venice-API-connector
npm ci --ignore-scripts --no-audit --no-fund
```

Observed install result:

```text
added 844 packages in 29s
```

Static verify scripts run successfully before or after dependency install:

```text
npm run verify:storage-policy              PASS
npm run verify:network-boundaries          PASS
npm run verify:venice-api-docs             PASS
npm run verify:release-packaging-hardening PASS
npm run verify:ci-contract                 PASS
npm run verify:theme-tokens                PASS
```

Targeted Vitest command run successfully:

```bash
timeout 60s npx vitest run \
  src/utils/idValidation.test.ts \
  electron/services/chatStorage.test.ts \
  electron/services/characterCardStorage.test.ts \
  electron/services/rpChatStorage.test.ts \
  electron/services/rpSingleFileStore.test.ts \
  server.test.ts \
  --fileParallelism=false
```

Observed result:

```text
Test Files  8 passed (8)
Tests       145 passed (145)
```

Important limitation: full `lint:eslint`, `typecheck`, `test:coverage`, `build`, and `verify:dist` were not completed in this sandbox. Do not mark this zip release-certified without running the complete prompt baseline on a local machine or CI runner. Humanity apparently still requires local toolchains.

## Prompt-to-Repo Comparison

The uploaded prompt aligns with the current repository shape better than the repo’s older `docs/BUG_HUNTING_AGENT_PROMPT.md`:

- The repo is actually `venice-forge` version `2.1.0`.
- The expected workflows exist.
- The expected static verify script surface exists.
- The prompt’s zip/local-path fallback is useful because this artifact is a zip snapshot without `.git` metadata.
- The prompt’s high-priority leads mostly match real historical repair areas in this snapshot.

However, the uploaded prompt is not currently canonical inside the repo. `docs/BUG_HUNTING_AGENT_PROMPT.md` is older and less strict. Root-level and `docs/reports` audit artifacts also contain stale metadata and older claims. Treat those as historical notes, not proof.

## Lead Disposition

| Lead | Disposition | Confidence | Evidence / Notes |
|---|---|---|---|
| LEAD-001 visual workflows raw localStorage | Refuted | High | `visualWorkflows` is included in `ENCRYPTED_STORES`; `workflow-store` migrates legacy `localStorage` then removes it. |
| LEAD-002 prompt dropdown hydration | Refuted | High | `src/components/chat/venice-params.tsx` calls `ensureLoaded()` in `useEffect`. |
| LEAD-003 sidebar eager content indexing | Refuted | High | `sidebar.tsx` returns an empty search index when history is collapsed or search is empty. |
| LEAD-004 split workflow UX | Mostly refuted | Medium | Source has one canonical `WorkflowsView`; stale docs/audit references still need cleanup. |
| LEAD-005 mesh/theme scan too narrow | Refuted | High | `tests/theme/meshSurfaceInvariant.test.ts` recursively scans `src/App.tsx` and `src/components`. |
| LEAD-006 duplicate CodeQL workflows | Refuted | High | Only `.github/workflows/codeql.yml` was present. |
| LEAD-007 Jina/scrape text wrapping | Refuted/changed | Medium | Raw text behavior is intentional; separate 451 response-shape bug remains. |
| LEAD-008 default model hardcoding | Partially confirmed | High | Chat defaults are mostly centralized; workflow/media modality defaults still hard-code model IDs, including stale `wan-2.1`. |
| LEAD-009 character prompt contamination | Refuted by current tests/static path | Medium | Character prompt handling appears guarded; no confirmed contamination found in targeted pass. |
| LEAD-010 VERIFY registry drift | Confirmed | High | `VERIFY-168` exists outside the expected `VERIFY-001` to `VERIFY-058` range. |
| LEAD-011 circuit half-open failures | Refuted | High | `server.ts` resets `circuitFailures` on half-open transition; `server.test.ts` covers recovery. |
| LEAD-012 proxy body caps | Refuted with test gap | High | Routes use `express.json({ limit: MAX_PROXY_BODY_BYTES })`; existing test is weak. |
| LEAD-013 rate-limit trust proxy | Mitigated | Medium | `TRUST_PROXY` gates forwarded IP behavior; no confirmed defect in targeted pass. |
| LEAD-014 guard exception shape | Partially confirmed | High | Request-side canonical shape exists; response-body safety blocks lose canonical fields. |
| LEAD-015 IPC/preload/desktopBridge drift | No confirmed drift in sampled surfaces | Medium | `config:initialize` and sampled surfaces align; full matrix still requires a complete line audit. |
| LEAD-016 Windows filename edge cases | Confirmed | High | Chat storage uses central Windows-safe ID validation; RP/character/single-file stores still use local regex validators. |
| LEAD-017 release signing variable isolation | Refuted | High | Release hardening verify passed; Windows signing uses `WIN_CSC_*`. |
| LEAD-018 artifact verification order | Refuted | High | Release hardening verify passed; workflow has checksum/verify/archive-clean before upload and publish re-verify. |

## Findings

### VF-ZIP-001 — Response-body safety 451s lose canonical metadata

Confidence: Confirmed  
Severity: High  
Domain: safety, api, desktop, web

#### Locations

- `src/shared/safety/localFamilySafeGuard.ts:91-124`
- `server.ts:700-708`
- `server.ts:874-880`
- `electron/ipc/handlers.ts:400-407`
- `electron/ipc/handlers.ts:564-570`
- `tests/safety/guardPipeline.test.ts:247-265`

#### Problem

Request-side safety blocks return the expected canonical 451 shape with `error`, `reasonCode`, `category`, and `severity`. Response-body safety blocks for Jina/scrape return only a user-facing `error`, and one Electron scrape path omits `status: 451` entirely.

#### Evidence

`ResponseBodyScreenResult` only preserves `reason`, `ruleId`, and `userMessage`:

```ts
export type ResponseBodyScreenResult =
  | { allowed: true; skipped: boolean; reason?: string }
  | { allowed: false; reason: string; ruleId?: string; userMessage: string };
```

The web proxy blocks with:

```ts
return res.status(451).json({ error: screen.userMessage });
```

The Electron scrape path blocks with:

```ts
return { ok: false, error: bodyScreen.userMessage };
```

#### Impact

This breaks response-shape consistency across safety boundaries. UI code, tests, diagnostics, and downstream agent logic cannot reliably classify blocked response content. It also weakens the prompt’s required safety invariant that 451 blocks expose stable reason metadata without echoing raw content.

#### Smallest Safe Fix

1. Extend `ResponseBodyScreenResult` to carry canonical safe metadata from the guard decision:
   - `reasonCode`
   - `category`
   - `severity`
   - optionally `ruleId`
2. Add a small helper, for example `toSafetyBlockBody(screen)`, so server and Electron use the same shape.
3. Update web Jina/scrape and Electron Jina/scrape response-screen block paths to return:

```ts
{
  error: screen.userMessage,
  reasonCode: screen.reasonCode,
  category: screen.category,
  severity: screen.severity,
}
```

4. Ensure Electron blocked scrape returns `status: 451`.

#### Required Regression Guard

Add tests proving blocked response bodies return the canonical 451 shape in:

```text
server.test.ts
src/shared/safety/localFamilySafeGuard.test.ts
electron/ipc/handlers.test.ts
```

---

### VF-ZIP-002 — Windows reserved filename protection is not propagated to RP and character file stores

Confidence: Confirmed  
Severity: High  
Domain: desktop, storage, Windows

#### Locations

- `electron/services/rpChatStorage.ts:20,28-37,188-192`
- `electron/services/characterCardStorage.ts:37,49-65,265-285`
- `electron/services/rpSingleFileStore.ts:14,18-20,33,93-101`
- `src/utils/idValidation.ts:6-31`
- `src/utils/idValidation.test.ts:5-13`
- `electron/services/chatStorage.test.ts:131-142`

#### Problem

`chatStorage` and the central ID validator reject Windows reserved basenames such as `CON`, `NUL`, and `COM1`, but RP chat storage, character-card storage, and RP single-file storage still use local regex-only validators.

#### Evidence

Central validator rejects Windows reserved names:

```ts
const WINDOWS_RESERVED_BASENAMES = new Set(["con", "prn", "aux", "nul", ...]);
```

But `rpChatStorage.ts` has:

```ts
const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
export function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}
```

That accepts IDs like `con`, then writes:

```ts
const target = rpChatPath(chat.id); // <userData>/rp-chats/con.json
await fs.rename(tmp, target);
```

Character card storage and RP single-file storage repeat the same pattern.

#### Impact

On Windows, saving or loading RP chats, character cards, or single-file RP records with reserved basenames can fail, behave inconsistently, or create platform-specific data-loss bugs. This is exactly the kind of Windows packaging foot-gun humans keep lovingly preserving across files.

#### Smallest Safe Fix

1. Replace local regex validators in the affected Electron services with the central Windows-safe validator, or move the validator into a shared package safe for Electron main-process imports.
2. Replace any direct `VALID_ID_RE.test(...)` array validation with the same canonical `isValidId(...)` function.
3. Keep path traversal rejection tests.
4. Add Windows reserved-name tests for each affected service.

#### Required Regression Guard

Add tests asserting these are rejected by each file-backed store:

```text
con
CON
nul
NUL
prn
aux
com1
lpt1
con.txt
nul.json
```

Run:

```bash
npx vitest run \
  src/utils/idValidation.test.ts \
  electron/services/chatStorage.test.ts \
  electron/services/characterCardStorage.test.ts \
  electron/services/rpChatStorage.test.ts \
  electron/services/rpSingleFileStore.test.ts \
  --fileParallelism=false
```

---

### VF-ZIP-003 — Workflow/media default model IDs are still hard-coded and one video fallback is stale

Confidence: Confirmed  
Severity: Medium  
Domain: api, config, workflow, media

#### Locations

- `src/lib/workflow-engine.ts:151-218`
- `src/components/workflows/workflows-view.tsx:61-69`
- `src/components/image/image-view.tsx:71`
- `src/components/audio/audio-view.tsx:55`
- `src/constants/venice.ts:20-32`

#### Problem

Chat defaults are mostly centralized now, but workflow/media nodes still hard-code modality defaults. The video default is especially stale: workflow code uses `wan-2.1`, while fallback video models in `src/constants/venice.ts` are `wan-2.6-text-to-video`, `wan-2.6-image-to-video`, and `topaz-video-upscale`.

#### Evidence

`workflow-engine.ts`:

```ts
model: data.model || 'z-image-turbo'
model: data.model || 'tts-kokoro'
model: data.model || 'stable-audio'
model: data.model || 'wan-2.1'
```

`workflows-view.tsx`:

```ts
imageGen: 'z-image-turbo',
tts: 'tts-kokoro',
music: 'stable-audio',
video: 'wan-2.1',
```

`constants/venice.ts` fallback video list:

```ts
wan-2.6-text-to-video
wan-2.6-image-to-video
topaz-video-upscale
```

#### Impact

New workflow nodes can default to a model ID that no longer appears in the fallback registry. This can create provider 400s, confusing UI defaults, and mismatches between model capability cards and payload generation.

#### Smallest Safe Fix

1. Add canonical constants:

```ts
export const DEFAULT_IMAGE_MODEL = "z-image-turbo";
export const DEFAULT_TTS_MODEL = "tts-kokoro";
export const DEFAULT_MUSIC_MODEL = "stable-audio";
export const DEFAULT_VIDEO_MODEL = "wan-2.6-text-to-video";
```

2. Import those constants in workflow engine, workflow UI defaults, Image Studio, Audio Studio, and media send-to paths.
3. Prefer deriving these defaults from current model service capability selection where feasible.
4. Add a verify guard that fails if known modality defaults are hard-coded outside `src/constants/venice.ts` or a dedicated default-model registry.

#### Required Regression Guard

Add a test or verify script asserting:

```text
DEFAULT_VIDEO_MODEL exists in FALLBACK_MODELS.video
workflow default model map equals the canonical defaults
workflow-engine fallback model IDs equal the canonical defaults
```

---

### VF-ZIP-004 — Proxy body-limit test passes even when both tested requests are rejected before proving the intended path

Confidence: Confirmed  
Severity: Medium  
Domain: testing, api

#### Location

- `server.test.ts:859-883`

#### Problem

The test named `accepts large JSON bodies for jina and scrape proxies` only asserts that responses are not `413`. In the targeted test run, both requests returned `403`, so the test passed without proving the route accepts valid large JSON bodies.

#### Evidence

Test body:

```ts
const jinaResponse = await request(app)
  .post("/api/proxy-jina")
  .send({ url: "https://example.com", body: largeString });
expect(jinaResponse.status).not.toBe(413);

const scrapeResponse = await request(app)
  .post("/api/proxy-scrape")
  .send({ url: "https://example.com", body: largeString });
expect(scrapeResponse.status).not.toBe(413);
```

Observed targeted test output included:

```text
POST /api/proxy-jina 403
POST /api/proxy-scrape 403
```

#### Impact

This test can miss regressions in the intended valid request path. It proves “not rejected by body-parser as too large,” but the test name and expected invariant imply more than that.

#### Smallest Safe Fix

Split the test into two explicit tests:

1. Parser limit test: verifies large payload does not produce `413`.
2. Valid proxy path test: uses allowed URL/provider mocks and asserts expected success or expected mocked upstream behavior.

#### Required Regression Guard

For Jina, use a URL format that passes `validateJinaUrl`. For scrape, use a URL that passes SSRF validation with mocked DNS/upstream request. Assert route-specific success semantics, not merely `not.toBe(413)`.

---

### VF-ZIP-005 — Audit prompt and repo audit artifacts are not canonicalized

Confidence: Confirmed  
Severity: Low  
Domain: docs, repo-hygiene, agent-handoff

#### Locations

- `docs/BUG_HUNTING_AGENT_PROMPT.md:1-18`
- root audit/report files such as `VALIDATION_REPORT_AUDIT_001_080.md`, `audit_report.yaml`, `audit-validation-report-022-051.md`
- `docs/reports/BUG_HUNT_SUMMARY.md:1-35`
- `docs/audits/exhaustive-bug-hunt-2026-06-19.md`
- `AGENTS.md:228`

#### Problem

The uploaded prompt is stricter and more accurate for the current repo than the repo’s existing `docs/BUG_HUNTING_AGENT_PROMPT.md`. Existing report files contain stale metadata and historical claims, including prior commit/working-tree data that does not apply to this zip snapshot. `AGENTS.md` also includes `VERIFY-168`, outside the expected `VERIFY-001` to `VERIFY-058` range.

#### Evidence

Current repo prompt title:

```markdown
# System Prompt — Venice Forge Exhaustive Bug-Hunt, Security, and Release Audit Agent
```

Uploaded prompt title:

```markdown
# System Prompt — Venice Forge Exhaustive Bug-Hunt, Security, Storage, and Release Audit Agent
```

`docs/reports/BUG_HUNT_SUMMARY.md` contains stale audit metadata from a different local state, including a different commit and file counts.

`AGENTS.md` contains:

```markdown
| `VERIFY-168` | Safe summary redacts user titles and names from issue messages | `src/services/storagePrivacyService.test.ts` |
```

#### Impact

Agents may follow stale reports, stale scope rules, or inconsistent `VERIFY` registries. That causes duplicate work, false closure claims, and that uniquely human achievement: audits about audits that no longer audit anything.

#### Smallest Safe Fix

1. Promote the uploaded prompt into `docs/BUG_HUNTING_AGENT_PROMPT.md` if it is the desired canonical prompt.
2. Move root-level audit artifacts into `docs/reports/archive/` or mark them superseded.
3. Add a small `docs/reports/README.md` explaining current vs historical audit artifacts.
4. Reconcile `VERIFY-168`: either document why the ID intentionally jumps, or renumber/registry-map it.
5. Add `verify:repo-handoff-hygiene` to detect root-level stale audit reports and unexpected `VERIFY` IDs.

## Recommended Repair Order

1. Fix canonical safety response shape for response-body screening.
2. Replace local file-ID validators in RP/character/single-file stores with Windows-safe canonical validation.
3. Centralize workflow/media modality defaults and update stale video model default.
4. Strengthen proxy body-limit and proxy-valid-path tests.
5. Canonicalize the audit prompt and archive stale audit reports.
6. Reconcile `VERIFY-168` and add a registry check.
7. Run the complete baseline gate locally/CI:

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

## Release Gate

```text
Pass: false
```

Reason: at least two high-confidence high/medium defects remain, and the full baseline gate was not completed in this sandbox.
