# Historical finding revalidation — 2026-09-10

**Authority:** scratch working notes for the 2026-09-10 exhaustive audit. Historical audits, ROADMAP prose, and prior handoffs are **hypotheses only**. Status below is from current `main` source, not copied from those documents.

**Repository:** `spearchucker667/Venice_Forge`  
**Branch:** `main`  
**HEAD / baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`  
**Package:** `venice-forge@3.0.0-beta.3` (`package.json:9`)  
**Engines:** Node `>=22.15.0 <23.0.0`, npm `>=10.0.0` (`package.json:31-34`); `.nvmrc` = `22.15.0`  
**Method:** static inspection of current source, tests, Swagger snapshot `docs/reference/Venice_swagger_api.yaml` (`info.version` `20260821.193530`), workflows, and package scripts. No paid provider calls, no packaged rebuild, no live GitHub Rules01 GET, no hosted CI re-run in this pass.

**Sources treated as hypotheses:**

- `docs/audits/Records/venice-forge-exhaustive-audit-2026-08-15/07-P1-FINDINGS.md`
- `docs/audits/Records/venice-forge-exhaustive-audit-2026-08-15/08-P2-FINDINGS.md`
- `docs/audits/Records/venice-forge-exhaustive-audit-2026-08-15/09-P3-FINDINGS.md`
- `docs/audits/Records/VENICE_FORGE_AUDIT_TODO_2026-08-31.md`
- `docs/ROADMAP.md` current-work items

**Classification vocabulary:** `still present` | `partially repaired` | `fully repaired` | `regressed` | `obsolete` | `unable to reproduce`

New current defects (not historical IDs) use `VF-AUD-20260910-HYG-NNN` at the end of this file.

---

## Status table — historical P1 / P2 IDs

| ID | Original title (hypothesis) | Current status |
|---|---|---|
| VF-AUDIT-20260815-P1-001 | `safe_mode` injected into strict schemas that do not declare it | **fully repaired** |
| VF-AUDIT-20260815-P1-002 | Web/Electron SSE parsers violate event, error, UTF-8 boundaries | **fully repaired** |
| VF-AUDIT-20260815-P1-003 | Video builders omit required `duration` and emit unsupported fields | **fully repaired** |
| VF-AUDIT-20260815-P1-004 | Scene generation uses video-only field + invented model ID | **fully repaired** |
| VF-AUDIT-20260815-P1-005 | Normal chat sends tools without runtime function-calling capability | **fully repaired** |
| VF-AUDIT-20260815-P1-006 | Preload drops agent-appended tool-result messages | **fully repaired** |
| VF-AUDIT-20260815-P1-007 | Automatic retry replays partially observed streams | **fully repaired** |
| VF-AUDIT-20260815-P1-008 | Search sends `provider`/`maxResults` instead of `search_provider`/`limit` | **fully repaired** |
| VF-AUDIT-20260815-P2-001 | `prompt_cache_key` nested inside `venice_parameters` | **fully repaired** |
| VF-AUDIT-20260815-P2-002 | Audio queue uses `language` instead of `language_code` | **fully repaired** |
| VF-AUD-20260831-P1-001 | Linux release allowlist uses wrong architecture names | **fully repaired** |
| VF-AUD-20260831-P1-002 | Windows smoke launches Portable wrapper instead of `win-unpacked` | **fully repaired** |
| VF-AUD-20260831-P1-003 | Packaged onboarding + restored-profile bootstrap coverage removed | **fully repaired** |
| VF-AUD-20260831-P1-004 | GitHub Rules01 sync tooling unsafe / wrong check names | **partially repaired** |
| VF-AUD-20260831-P2-001 | CSP/page-error listeners attach after first renderer document | **fully repaired** |
| VF-AUD-20260831-P2-002 | Stale CSP-001 still listed as open in ROADMAP | **fully repaired** |
| VF-AUD-20260831-P2-003 | `builder-debug.yml` published/checksummed as a release asset | **fully repaired** |
| VF-AUD-20260831-P2-004 | No post-build macOS/Windows signature/notarization verification | **fully repaired** (local workflow; production evidence remains `P2-012`) |
| VF-AUD-20260831-P2-005 | Character-cache `stat` then `createReadStream` TOCTOU | **fully repaired** |
| VF-AUD-20260831-P2-006 | Provenance-less custom-protocol requests | **partially repaired** |
| VF-AUD-20260831-P2-007 | Selectable Google Vertex `authMode: "full"` guaranteed to fail | **partially repaired** |
| VF-AUD-20260831-P2-008 | No `Retry-After` / jitter before provider fallback | **fully repaired** |
| VF-AUD-20260831-P2-009 | FSM semantic classifier implied but unimplemented | **fully repaired** (truthfulness); semantic backend still deferred product |
| VF-AUD-20260831-P2-010 | CI contract tests do not exercise real package names / discovery | **fully repaired** |
| VF-AUD-20260831-P2-011 | No packaged-smoke failure diagnostics artifact | **fully repaired** |
| VF-AUD-20260831-P2-012 | External release acceptance matrix (`VF-VERIFY-005`) | **still present** |
| VF-AUD-20260831-P2-013 | Qualified native review of non-English catalogs | **still present** |

No historical P1/P2 ID in these two audits is classified **regressed** relative to the original defect statement. No P0 was claimed in either historical pass; current inspection did not reopen a P0.

---

## 2026-08-15 P1 evidence

### VF-AUDIT-20260815-P1-001 — **fully repaired**

Hypothesis: `ENDPOINTS_WITH_SAFE_MODE` included speech/transcription/embeddings/augment; Web and Electron injected `safe_mode` into `additionalProperties: false` schemas.

Current:

- `src/shared/veniceSafeMode.ts:41-45` allowlist is only `/image/generate`, `/image/edit`, `/image/multi-edit`.
- Same file `26-32` documents audio/embeddings/augment/chat as unsupported.
- `applyVeniceApiSafeMode` (`78-99`) clones payload and **omits** the field unless `endpointSupportsSafeMode` is true.
- Guard tests: `electron/services/guardPipeline.test.ts:251-263` assert unsupported endpoints have no `safe_mode`.
- Tracked Swagger `docs/reference/Venice_swagger_api.yaml` still declares `safe_mode` on image generate/edit (e.g. `2676-2681`, `3027-3031`) and `WebSearchRequest` (`4634-4664`) has `query` / `limit` / `search_provider` only.

Residual: comments in `veniceSafeMode.ts:18` still cite schema version `20260814.194349` while the tracked YAML header is `20260821.193530`. That is comment drift, not a return of the injection bug.

### VF-AUDIT-20260815-P1-002 — **fully repaired**

Hypothesis: Electron dispatched SSE events without a blank-line boundary and decoded each Buffer independently; Web parsed each `data:` line as a complete JSON event and dropped malformed frames.

Current shared decoder `src/shared/sseStreamDecoder.ts`:

- streaming `TextDecoder({ fatal: true })` (`57-58`, `68-80`)
- blank-line event boundary (`13-15`, `140-141`)
- multiline `data:` join (`169`)
- `[DONE]` (`34-35`, `179`)
- EOF flush (`83-111`)
- malformed/error frames via `extractStreamDelta` (`229-258`) and `applyStreamSseEvent` (`308-357`)

Both transports consume it:

- Web: `src/services/veniceClient/stream.ts:250-308`
- Electron: `electron/services/veniceClient.ts:517-578` (`push` + `flush`)

Focused tests: `src/shared/sseStreamDecoder.test.ts`, `electron/services/veniceClient.sseParser.test.ts:81+`. No remaining `parseSseLines` owner.

### VF-AUDIT-20260815-P1-003 — **fully repaired**

Hypothesis: quote/queue `duration` optional; quote sent unsupported `prompt`/`audio_prompt`; queue could send `audio_prompt`, `seed`, `cfg_scale`, `motion_score`, `fps`; workflow defaulted `videoDuration` empty.

Current:

- `buildCanonicalVideoQuotePayload` requires duration (`src/shared/venice-media-contract/payload-builders.ts:235-264`). Quote wire keys: `model`, `duration`, optional `resolution` / `aspect_ratio` / `upscale_factor` / `audio` / `video_url` / `reference_video_total_duration`. No `prompt` / `audio_prompt`.
- `buildCanonicalVideoQueuePayload` requires `model` + `prompt` + `duration` (`267-342`). No `seed` / `cfg_scale` / `motion_score` / `fps` / `audio_prompt`.
- Types: `VideoQuoteWirePayload` / `VideoQueueWirePayload` (`src/shared/venice-media-contract/types.ts:255-290`).
- Workflow schema: `videoDuration` `required: true`, default `"5s"` (`src/lib/workflow-schema.ts:497-508`).
- Engine fail-closed: `src/lib/workflow-engine.ts:259-270`.
- Tests throw on missing duration (`src/shared/venice-media-contract/__tests__/payload-builders.test.ts:166-216`; `src/lib/workflow-engine.test.ts:204-208`).

Related remaining **product** work (not this defect): ROADMAP `VF-GENERATION-CONTRACT-PARITY-2026-09-01` item (3) — whether to expose later Swagger video enhancement/upscaling fields. Current builders already have `upscale_factor` where the 20260821 schema allows it.

### VF-AUDIT-20260815-P1-004 — **fully repaired**

Hypothesis: image generate emitted `reference_image_urls`; static capability invented `venice-character-reference-v1`.

Current:

- Image generate wire is `style_references: [{ image, strength }]` (`src/utils/payloadBuilders.ts:464-485`). Tests forbid `reference_image_urls` (`src/utils/payloadBuilders.modelAware.test.ts:94-186`).
- Invented ID removed from production registry; test `src/config/image-model-capabilities.test.ts:481-485`.
- Scene path uses runtime `supportsStyleReferences` / `maxStyleReferences` (`src/services/characterSceneGenerationService.ts:141-181`; `src/config/image-model-capabilities.ts` `resolveStyleReferenceCapabilities`).
- Types: `src/types/venice.ts:14-23`.
- `reference_image_urls` remains on **video** queue only (`payload-builders.ts:309-310`; `types.ts:279`) which matches Swagger video, not image generate.

### VF-AUDIT-20260815-P1-005 — **fully repaired**

Hypothesis: `buildChatStreamBody` injected tools without `supportsFunctionCalling`; playground gated correctly.

Current choke point `resolveAvailableTools` (`src/agent/registry/tool-registry.ts:533-538`) returns `[]` unless `supportsFunctionCalling(modelInfo)`. Chat stream manager calls it (`src/stores/chat-stream-manager.ts:113-121`) with an explicit P1-005 comment. Playground still gates (`src/components/playground/playground-chat.tsx:163`). Tests mock `getModelById` for supported/unsupported metadata (`src/stores/chat-stream-manager.test.ts:21-27`).

### VF-AUDIT-20260815-P1-006 — **fully repaired**

Hypothesis: preload reconstructed the stream callback without `appendedMessages`.

Current shared envelope `src/shared/veniceStreamDelta.ts:51-73, 145-199` sanitizes and **explicitly** forwards `appendedMessages`. Preload (`electron/preload.ts:46-55`) validates then `toRendererStreamDelta`. Main handler copies the field (`electron/ipc/handlers/veniceHandlers.ts:111-125`). Renderer consumes it (`src/stores/chat-stream-manager.ts:170-172`, `32-35`). Tests: `src/shared/veniceStreamDelta.test.ts:134+`.

### VF-AUDIT-20260815-P1-007 — **fully repaired**

Hypothesis: retry loop resent the same body after observable deltas (up to 3 billed generations).

Current (`src/stores/chat-stream-manager.ts:37-38, 249-285`): `hasCommittedStreamState` is set on content/reasoning/tool_calls/appendedMessages/usage; retryable 408/429/5xx/network retries **only** when `!hasCommittedStreamState`. Abort is never retryable (`40-41`, `274-276`).

Residual test gap (not the original bug): `chat-stream-manager.test.ts:557-578` covers a 502 retry **before** any delta; no focused assertion that a partial `onDelta` blocks replay.

### VF-AUDIT-20260815-P1-008 — **fully repaired**

Hypothesis: Search UI and research provider sent `provider` / `maxResults`.

Current single builder `src/shared/veniceSearchWire.ts:55-68` emits only `query` / `search_provider` / `limit`. Call sites: `src/components/search/SearchScrapeView.tsx:158-161`, `src/research/providers/veniceResearchProvider.ts:89-96`. Tests assert `search_provider` and absence of `maxResults` (`veniceResearchProvider.test.ts:31-84`). Matches Swagger `WebSearchRequest` (`Venice_swagger_api.yaml:4634-4664`).

---

## 2026-08-15 P2 / P3 evidence

### VF-AUDIT-20260815-P2-001 — **fully repaired**

`ChatCompletionRequest.prompt_cache_key` is top-level in types (`src/types/venice.ts:203-204`) and builder (`src/utils/payloadBuilders.ts:154-159`). Tests assert it is not nested (`src/utils/payloadBuilders.test.ts:74-88`). Swagger places the field on `ChatCompletionRequest`, not `venice_parameters` (`Venice_swagger_api.yaml:1291-1295`). Electron adapter allowlists it as a top-level OpenAI-compatible field (`electron/services/providerAdapters.ts:60`).

### VF-AUDIT-20260815-P2-002 — **fully repaired**

`buildCanonicalAudioQueuePayload` maps logical `language` → wire `language_code` (`src/shared/venice-media-contract/payload-builders.ts:399-402`). Wire type: `types.ts:311-312`. Test: `payload-builders.test.ts:265-271`. Swagger `language_code` at `Venice_swagger_api.yaml:4102`.

### VF-AUDIT-20260815-P3-001 — **fully repaired** (included because 09-P3 was in the read set)

`VeniceModel.discount_to_user` (`src/types/venice.ts:102-107`); `ImageConstraints.maxStyleReferences` / `supportsStyleReferenceStrength` (`14-23`). Tests: `src/types/venice.test.ts:49-65`; pricing: `src/utils/pricing.ts:20`.

---

## 2026-08-31 P1 evidence

### VF-AUD-20260831-P1-001 — **fully repaired**

`scripts/verify-dist.cjs:45-90` maps Linux x64 → `x86_64` AppImage/RPM and `amd64` deb. Unit test locks those names (`scripts/verify-dist.test.ts:104-116`). CI Linux job runs `node scripts/verify-dist.cjs --linux` after packaging (`.github/workflows/ci.yml:304-313`).

Residual static ambiguity (not re-packaged in this pass): `electron-builder.config.cjs:140` still uses `artifactName: "Venice-Forge-${version}-${arch}.${ext}"`. Historical live outputs used target-specific arch labels. Classification relies on the verifier mapping plus prior recorded Linux package evidence, not a new `dist:linux` run here.

### VF-AUD-20260831-P1-002 — **fully repaired**

`tests/smoke/electron-smoke.test.ts` is gone. Discovery is `scripts/packaged-executable.cjs` via `tests/smoke/smoke-utils.ts:5-13`. Windows fixture prefers `release/win-unpacked/Venice Forge.exe` over the Portable wrapper (`tests/smoke/packaged-executable-discovery.test.ts:36-48`). Hosted job still smokes then verifies the portable (`ci.yml:264-275`).

### VF-AUD-20260831-P1-003 — **fully repaired**

Split suites exist:

- `tests/smoke/packaged-launch-csp.test.ts`
- `tests/smoke/packaged-onboarding-profile-bootstrap.test.ts`

Onboarding test crosses the 18+ gate, completes steps, rewrites the restored profile, relaunches the same user-data dir, asserts handshake, writes an IPC probe only under `chat-history/profiles/restored-profile/`, and asserts no legacy global `chat-history/<id>.json` (`packaged-onboarding-profile-bootstrap.test.ts:25-124`). ROADMAP no longer claims a missing harness as closed-without-tests.

### VF-AUD-20260831-P1-004 — **partially repaired**

Tooling is repaired:

- `scripts/enforce-github-rules.sh` GETs ruleset `21229461`, then PUTs (`32-88`).
- Required contexts include `script-coverage` and the three `electron-smoke-*` jobs, plus `Analyze javascript-typescript` / `Analyze actions` (`40-55`).
- `--dry-run` supported (`17-18`, `72-75`).
- `bypass_actors` preserved in the PUT payload (`69`).

Live application is **not** done. ROADMAP `VF-RULES01-SYNC-2026-08-31` (`docs/ROADMAP.md:11`) still requires a repository administrator to run the helper against live Rules01. This session did not GET the live ruleset.

---

## 2026-08-31 P2 evidence

### VF-AUD-20260831-P2-001 — **fully repaired**

`tests/smoke/smoke-utils.ts:33-58`: after `firstWindow()`, the harness installs `exposeFunction` / `addInitScript` / `pageerror` / console listeners, then **`page.reload()`** before asserting. Negative control exists (`packaged-launch-csp.test.ts:40-63`).

### VF-AUD-20260831-P2-002 — **fully repaired**

`docs/ROADMAP.md` current-work section has no `CSP-001`. The ID remains only in historical plans/handoffs. `scripts/verify-roadmap-current.cjs` is a current package script (`package.json:44`).

### VF-AUD-20260831-P2-003 — **fully repaired**

`scripts/clean-release-staging.cjs:29-30` deletes `builder-debug.yml` and `.sha256`. Allowlist test forbids both (`scripts/verify-dist.test.ts:131-140`). Cleanup test (`scripts/clean-release-staging.test.ts:60-118`).

### VF-AUD-20260831-P2-004 — **fully repaired** (workflow present)

Release workflow contains `xcrun stapler validate` / `spctl` and `Get-AuthenticodeSignature` (referenced from ROADMAP and `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md:21-28`). This closes the **local job-step** gap. Signed/notarized production artifacts are still incomplete — that remainder is `P2-012` / `VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31`, not a missing workflow step.

### VF-AUD-20260831-P2-005 — **fully repaired**

`electron/main.ts:38` imports `readRegularFileNoFollow`. Character-cache path no longer `stat` + `createReadStream`; it reads via the no-follow helper (`461-476`) with an explicit comment that the old pair is gone (`461`).

### VF-AUD-20260831-P2-006 — **partially repaired**

`createCustomProtocolCapabilityManager` / `parseCustomProtocolCapabilityUrl` exist (`electron/utils/customProtocolAccess.ts:12-42, 245+, 346`). Tests cover issuance/expiry/revocation (`electron/utils/customProtocolAccess.test.ts:176+`).

**Not wired:** comments in `customProtocolAccess.ts:38-42` and `electron/main.ts:33-35, 392-393` state the capability is **not** consulted by `protocol.handle` / `createGeneratedMediaResponse`. `evaluateCustomProtocolAccess()` still allows originless/referer-less requests by design (`customProtocolAccess.ts:14-18`). ROADMAP `VF-CAPABILITY-PROVENANCE-2026-08-31` tracks implementation as deferred.

### VF-AUD-20260831-P2-007 — **partially repaired**

Original selectable-full-mode defect is gone:

- Public type is express-only (`src/types/provider.ts:54-62`).
- UI builds `{ providerId, authMode: 'express', apiKey }` only (`src/components/settings/ProvidersPanel.tsx:90-97`); no `projectId`/`location` fields in that file.
- IPC validation forces express + apiKey (`electron/ipc/validation.ts:196-204`).

Leftover correctness bug in the connectivity type guard (new HYG-005):

```202:216:electron/ipc/handlers/apiKeyHandlers.ts
function isGoogleVertexConfig(credential: unknown): credential is GoogleVertexConfig {
  ...
  if (c.authMode === "express") {
    return (
      typeof c.apiKey === "string" &&
      typeof c.projectId === "string" &&
      typeof c.location === "string"
    );
  }
  if (c.authMode === "full") {
    return typeof c.projectId === "string" && typeof c.location === "string";
  }
```

`buildProviderTestRequest` still has a dead “Full Vertex … not implemented / return null” branch (`239-248`). A UI-saved express credential (apiKey only) fails `isGoogleVertexConfig`, so the test path reports missing-credential (`313-331`). Full OAuth remains intentionally unimplemented (`docs/ROADMAP.md:13`, `VF-VERTEX-FULL-OAUTH-2026-08-31`).

### VF-AUD-20260831-P2-008 — **fully repaired**

Electron `performVeniceRequest` (`electron/services/veniceClient.ts:308-398`): at most one Retry-After-aware retry per provider on 429; parse seconds or HTTP-date; jittered delay; abortable wait; no fallback after stream start (`355-358`). Helpers + tests: `parseRetryAfterMs` / `computeJitteredDelay` in `electron/services/veniceClient.retryAfter.test.ts`. Renderer path already had `src/services/veniceClient/retry.ts:93-114` and `src/services/veniceClient.edge.test.ts:74-165`.

### VF-AUD-20260831-P2-009 — **fully repaired** (narrowing)

`getClassifierCapabilities()` (`src/shared/safety/mediaScreener.ts:177-213`) reports semantic classifiers `"unavailable"` unless a backend is registered. JSDoc states the heuristic is structural, not semantic (`140-148`). Tests: `src/shared/safety/mediaScreener.test.ts:144+`. Implementation of a local on-device backend remains ROADMAP `VF-FSM-CLASSIFIER-2026-08-31` (deferred product, not the original “implied semantic screening” defect).

### VF-AUD-20260831-P2-010 — **fully repaired**

Semantic fixtures: Linux unpacked name, macOS renamed bundle, Windows `win-unpacked` vs Portable (`tests/smoke/packaged-executable-discovery.test.ts:16-48`). Linux allowlist names in `scripts/verify-dist.test.ts:104-116`. Hosted smoke jobs still exist (`ci.yml:216-323`) and are not replaced by static tests.

### VF-AUD-20260831-P2-011 — **fully repaired**

All three packaged-smoke jobs have `if: failure()` capture + upload (`ci.yml:238-247`, `276-287`, `314-323`) via `scripts/capture-smoke-diagnostics.cjs`. Contract verifier asserts those commands (`scripts/verify-ci-contract.cjs:224-226`).

### VF-AUD-20260831-P2-012 — **still present**

External signed/notarized install, paid operations, two-device sync, headed a11y: cannot be closed from the local tree. ROADMAP `VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31` / `VF-VERIFY-005` remain open (`docs/ROADMAP.md:19-21`). This session produced no publication-tag evidence.

### VF-AUD-20260831-P2-013 — **still present**

`docs/i18n/native-review-status.json`: every non-English locale is `first-pass-machine` with `reviewer: null` / `reviewedAt: null` (e.g. `es` at lines 5-8 through `sv-SE` at 55-58). ROADMAP `VF-I18N-NATIVE-REVIEW-001` is OPEN (`docs/ROADMAP.md:23`).

---

## 2026-08-31 P3 (compact; TODO was in the read set)

| ID | Current status | Evidence |
|---|---|---|
| P3-001 Linux desktop identity | **fully repaired** | `package.json:4` `desktopName`; `electron-builder.config.cjs:130-134` `executableName` + `syncDesktopName` |
| P3-002 dynamic `chatTtsController` import | **fully repaired** | static import `src/hooks/use-chat.ts:25` |
| P3-003 duplicate auto-read / `console.error` | **fully repaired** | helper `maybeAutoReadAssistantMessage` `src/hooks/use-chat.ts:137`, used at `693` and `735`; no `console.error` in `use-chat.ts` or `ChatTtsPlayer.tsx` |
| P3-004 `@testing-library/dom` in production deps | **fully repaired** | now `devDependencies` `package.json:225` |
| P3-005 deprecated `@types/libsodium-wrappers` | **fully repaired** | not in `package.json`; runtime dep is `libsodium-wrappers-sumo` `package.json:207` |
| P3-006 transitive deprecations tracker | **fully repaired** | `scripts/verify-transitive-deprecations.cjs`; script `package.json:46` |
| P3-007 oversized modules | **still present** | `CharacterEditor.tsx` 3728, `desktopBridge.ts` 2716, `image-view.tsx` 1831, `chat-store.ts` 1633, `gallery-view.tsx` 1588, `chat-view.tsx` 1509, `preload.ts` 913 lines |
| P3-008 file-level `no-explicit-any` | **still present** | e.g. `src/services/desktopBridge.ts:2` |
| P3-009 exhaustive-deps suppressions | **still present** | six production suppressions (WorkspaceTree, PromptLibrary, chat-view, SceneComposer, image-view, CharacterCreator) |
| P3-010 Theme Engine V2 visual polish | **still present** | ROADMAP `VF-THEME-ENGINE-V2-2026-08-31` deferred visual review |
| P3-011 reverse-image matching deferred | **obsolete as defect** / **still present as deferred product** | UI/docs still disable image-byte matching (`docs/user/IMAGE_INSPECTOR.md:46-57`) — this is the intended hold |
| P3-012 metadata-free ZIP | **fully repaired** | `scripts/create-clean-zip.cjs`; `package.json:47` `archive:clean-zip` |

---

## ROADMAP current-work items (revalidated)

| ROADMAP ID | Current status vs live tree |
|---|---|
| `VF-GENERATION-CONTRACT-PARITY-2026-09-01` | **still present** (bounded remainder). Workflow `imageGen` still uses static defaults (`src/lib/workflow-engine.ts:115-127`: `DEFAULT_IMAGE_MODEL`, `steps ?? 20`, `1024×1024`) and does not call the runtime `/models` capability resolver used by Image Studio. Tracked Swagger is `20260821.193530`; ROADMAP still wants a refresh vs official `20260826.105305`. |
| `VF-THEME-ENGINE-V2-2026-08-31` | Core implemented; **visual polish still present** (P3-010). |
| `VF-RULES01-SYNC-2026-08-31` | Helper repaired; **live apply still present** (P1-004). |
| `VF-VERTEX-FULL-OAUTH-2026-08-31` | Full mode correctly unimplemented; **express test-guard leftover** (P2-007 / HYG-005). |
| `VF-CAPABILITY-PROVENANCE-2026-08-31` | Design + scaffolding only; **not wired** (P2-006). |
| `VF-FSM-CLASSIFIER-2026-08-31` | Truthful capability API present; **ML backend not registered** (P2-009 remainder). |
| `VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31` | **still present** (P2-012). |
| `VF-I18N-NATIVE-REVIEW-001` | **still present** (P2-013). |

---

## Hygiene scans (new current defects only)

### VF-AUD-20260910-HYG-001 — AGENT_REINITIALIZATION.md version/stack/script drift vs `package.json`

**Class:** confirmed documentation drift (unguarded; `scripts/verify-release-metadata.cjs` / `verify-stack-facts.cjs` do not read this file).

| Claim in `AGENT_REINITIALIZATION.md` | Current `package.json` / lockfile |
|---|---|
| Header **Version:** `3.0.0-beta.2` (line 5); changelog still “3.0.0-beta.2 architecture” (line 208) | `"version": "3.0.0-beta.3"` (`package.json:9`) |
| Electron `43.1.1` (line 145) | `"electron": "^43.2.0"` (`package.json:238`) |
| React `19.0.1` (line 145) | `"react": "^19.2.8"` (`package.json:247`) |
| `verify:contracts` = “22+ contract verifiers” (line 187) | `verify:contracts` is `static` + `features` + `release` (`package.json:116-125`); summary-of-work records 104 contract checks |

`AGENTS.md:7` already says `**Version:** 3.0.0-beta.3`. `verify-stack-facts.cjs:17-21` only asserts README/ABOUT majors, so this handoff file can drift silently. Last commit on the file is `f860ac15` (“Harden security-sensitive utilities…”), not a version-sync commit.

### VF-AUD-20260910-HYG-002 — tracked scratch `test-delete-session.js` at repo root

**Class:** confirmed hygiene / dead scratch in the published tree.

- Path: `test-delete-session.js` (tracked; `git ls-files` lists it).
- Contents (entire file): `require('./src/utils/idValidation')` then `assertValidId(<UUID>)`.
- `src/utils/idValidation.ts` is TypeScript ESM (`export function assertValidId` at line 39). A root CJS `require()` of that path is not a runnable Vitest/CI test.
- `.gitignore` does not mention the file.
- Not referenced by `package.json` scripts.

This is leftover investigation debris (timestamp on disk 2026-09-05), not product test coverage.

### VF-AUD-20260910-HYG-003 — Replicate User-Agent fallback pinned to `3.0.0-beta.2`

**Class:** confirmed documentation/code version contradiction.

```68:79:electron/services/replicateService.ts
function getReplicateUserAgent(): string {
  try {
    const version = app.getVersion();
    ...
      return `VeniceForge/${version}`;
  } catch {
    // app may not be ready in some test/utility contexts.
  }
  return "VeniceForge/3.0.0-beta.2";
}
```

Happy path uses `app.getVersion()`. The fallback string contradicts `package.json` `3.0.0-beta.3`. Tests still stub `3.0.0-beta.2` (`electron/services/replicateService.test.ts:21, 110`).

### VF-AUD-20260910-HYG-004 — API source manifest internal version contradiction

**Class:** confirmed documentation drift.

`docs/reference/VENICE_API_SOURCE_MANIFEST.md`:

- Header line 7: Schema Version `20260821.193530` (matches `docs/reference/Venice_swagger_api.yaml:5,13`).
- Body line 15: Tier 1 wire contract still named version `20260814.194349`.

Not a runtime bug; it will mislead agents about which snapshot is authoritative.

### VF-AUD-20260910-HYG-005 — Vertex express connectivity guard still requires full-mode fields

**Class:** confirmed defect (dead leftover causing correctness). See P2-007. UI/IPC persist `{ authMode: "express", apiKey }` (`ProvidersPanel.tsx:90-97`, `validation.ts:196-204`). `isGoogleVertexConfig` still requires `projectId` and `location` for express and still accepts `authMode === "full"` (`apiKeyHandlers.ts:202-216`). Connection test then returns missing-credential (`313-331`) or `null` for full mode (`247-248`).

### VF-AUD-20260910-HYG-006 — ABOUT.md packaged-platform claim vs `dist:linux` script

**Class:** confirmed documentation vs package-script contradiction.

`docs/ABOUT.md:5` and `:15` describe a packaged Electron app for **Windows and macOS**. `package.json:184` defines `dist:linux`; `electron-builder.config.cjs:116-141` ships AppImage/deb/rpm; `.github/workflows/ci.yml:290-313` runs `electron-smoke-linux`. README badges already include Linux (`README.md:28-30`).

---

## Duplicate implementations (scan)

| Pair | Current assessment |
|---|---|
| Electron vs Web SSE parsers | Historical duplicate **repaired**. Both call `SseDecoder` / `applyStreamSseEvent`. |
| `src/utils/payloadBuilders.ts` `buildImagePayload` vs `src/shared/venice-media-contract/payload-builders.ts` `buildCanonicalImageGeneratePayload` | **still present** as two image-generate constructors. Image Studio is capability-aware; workflow `imageGen` (`workflow-engine.ts:115-127`) uses the canonical builder with static defaults. This is the open ROADMAP generation-parity remainder, not a new ID. |
| Dual venice clients (`src/services/veniceClient/*` vs `electron/services/veniceClient.ts`) | Intentional two-transport design; chat streaming now shares the decoder. Not classified as a defect. |

## Dead code / unused exports that cause correctness issues

The Vertex `authMode === "full"` branch and express `projectId`/`location` conjunct in `isGoogleVertexConfig` are the only unused-export-class leftovers shown to break a live path (HYG-005). Historical dead `parseSseLines` / invented character-reference model / nested `prompt_cache_key` are gone.

Oversized-module and `any` suppressions (P3-007/008) are maintainability, not shown here to cause a specific user-facing break.

## Documentation vs `package.json` version/scripts (beyond HYG-001/006)

Aligned:

- `AGENTS.md:7` version `3.0.0-beta.3`
- `README.md` release badge `v3.0.0-beta.3`
- `docs/architecture/data-export-format.md` `3.0.0-beta.3`
- Canonical scripts named in AGENTS.md (`dev:electron`, `dev:web` = `vite`, `lint:eslint`, `typecheck`, `verify:*`, `ci`) exist in `package.json:36-187`

Historical reports under `docs/reports/historical/` and `docs/audits/Records/` still say beta.1/beta.2; those are archived evidence, not current authority.

Fixture versions (`3.0.0-beta.2` inside `scripts/verify-dist.test.ts:73`, `scripts/verify-release-metadata.test.ts:18`) are test inputs, not product claims.

## Environmental note (not a repo defect)

This audit host ran Node `v22.13.1` while `engines.node` / `.nvmrc` require `22.15.0`. Bootstrap only asserted major `22`. Do not treat the host Node patch as a Venice Forge source bug.

---

## Counts

| Bucket | Count |
|---|---|
| 2026-08-15 P1 fully repaired | 8 / 8 |
| 2026-08-15 P2 fully repaired | 2 / 2 |
| 2026-08-15 P3 fully repaired | 1 / 1 |
| 2026-08-31 P1 fully repaired | 3 |
| 2026-08-31 P1 partially repaired | 1 (Rules01 live apply) |
| 2026-08-31 P2 fully repaired | 9 |
| 2026-08-31 P2 partially repaired | 2 (capability tokens; Vertex leftover) |
| 2026-08-31 P2 still present | 2 (external release; i18n native review) |
| New HYG IDs this pass | 6 (`HYG-001` … `HYG-006`) |
| Historical P1/P2 **regressed** | 0 |

Manual QA: not run. Hosted CI/CodeQL: not re-checked against this SHA in this pass. No commit/push.
