# Venice Forge — Current-Main CI Repair, Exhaustive Repository Audit, and Remediation Report

> [!NOTE]
> **IMMUTABLE HISTORICAL RECORD**
> This report is a point-in-time snapshot of the repository state as of August 26, 2026 (commit `eba90428...`). It is preserved for historical context and is not updated to track current `main`.

**Date:** 2026-08-26  
**Repository:** `spearchucker667/Venice_Forge`  
**Starting SHA:** `eba90428be6c87b85a96e07b83be09e0f383db89`  
**Scope:** Validate current `main`, repair any confirmed defect, perform a full repository-wide audit, and harden governance.

---

## 1. Repository-State Gate

- Branch: `main`
- Worktree: clean at start
- Local HEAD matched `origin/main`: `eba90428be6c87b85a96e07b83be09e0f383db89`
- Node: `v22.23.2`, npm: `10.9.8`
- GitHub CI run `32934003806` for starting SHA: **all jobs green**
  - lint-and-typecheck, unit-and-integration-tests, coverage, contracts, build
  - windows-sensitive-tests, macos-sensitive-tests
  - electron-smoke-windows, electron-smoke-linux, electron-smoke-macos
- CodeQL run `32934003803` for starting SHA: **green**

The P1 items described in the handoff (i18n runtime surface, CI/release-localization separation, 704 key-name translations, Node 22 alignment) were already present in `eba90428`. This session focused on validating that state, performing the exhaustive audit, and fixing the newly discovered P0/P1/P2 findings.

---

## 2. Confirmed Findings and Fixes

| ID | Severity | Area | File(s) | Defect | Fix | Status |
|---|---|---|---|---|---|---|
| DOC-001 | P0 | Roadmap | `docs/ROADMAP.md:83` | Falsely claimed all non-English catalogs were natively reviewed and approved. | Reopened `VF-I18N-NATIVE-REVIEW-001` and stated non-English locales remain `first-pass-machine`. | Fixed |
| DOC-002 | P0 | Roadmap | `docs/ROADMAP.md:123` | Claimed 704 key-name fallback placeholders remained while `verify:i18n:release` passes. | Closed the debt row and referenced the truthful machine-translation state. | Fixed |
| GOV-001 | P1 | CI bypass | `.github/workflows/codeql.yml:25` | CodeQL could be disabled via repository variable `VENICE_FORGE_DISABLE_CODEQL`. | Removed the emergency bypass; CodeQL now runs unconditionally on eligible events. | Fixed |
| GOV-002 | P1 | Bypass inventory | `.github/bypass_actors.md` | Role labels were incorrect and bypass set was overbroad. | Corrected labels, reduced bypass actors to Repository Admin only, and updated live ruleset via GitHub API. | Fixed |
| GOV-003 | P1 | Action pinning | `SECURITY.md:446-447`, `.github/workflows/release.yml:303`, `.github/workflows/codeql.yml:45,52` | Pinned SHAs did not match the claimed versions (`softprops/action-gh-release`, `github/codeql-action`). | Updated SHAs to verified v3.0.2 and v4.37.6 values. | Fixed |
| SEC-001 | P1 | Renderer boot | `src/main.tsx:107` | `Promise.race([hydrationReady, hydrationTimeout]).then(...)` had no `.catch()`, risking an unhandled rejection during boot. | Extracted `bootApp` and added a `.catch` handler that renders a fatal UI message. | Fixed |
| SEC-002 | P2 | Credential namespace | `electron/ipc/handlers/apiKeyHandlers.ts:156` | Generic credential bridge allowed renderer to read/write internal `chat-folder-lock:*` keys. | Reserved the `chat-folder-lock:` prefix in `isReservedCredentialName`. | Fixed |
| DOC-003 | P2/P3 | Docs | Multiple | Stale Node 22.13 references, inconsistent `npm install`/`npm ci`, stale re-init SHA, incorrect theme counts, unindexed documents, stale Copilot instructions. | Updated `README.md`, `CONTRIBUTING.md`, `AGENT_REINITIALIZATION.md`, `docs/RELEASE/release.md`, `docs/DEVELOPMENT/*.md`, `.github/copilot-instructions.md`, `docs/DOCS_INDEX.md`. | Fixed |

---

## 3. Findings Left Open or Deferred

These are real gaps identified by the audit but not remediated in this session because they are either product decisions, require external resources, or exceed the safe change budget without further design.

| ID | Severity | Area | File(s) | Defect | Why Deferred |
|---|---|---|---|---|---|
| PROV-001 | P1 | Provider adapters | `electron/services/providerAdapters.ts:504-522` | Venice-specific image parameters (`safe_mode`, `return_binary`, `enable_web_search`, etc.) leak to third-party fallback providers. | Requires provider-aware allowlist design and contract tests; changes request/response behavior for fallback providers. |
| PROV-002 | P2 | Vertex full auth | `src/types/provider.ts`, `electron/ipc/validation.ts`, `electron/services/providerAdapters.ts`, `electron/ipc/handlers/apiKeyHandlers.ts` | `authMode: "full"` is typed but rejected as "not implemented". | Product decision: Express Mode (API key) is the supported path; full OAuth/service-account mode needs separate design. |
| PROV-003 | P2 | Reverse image search | `src/stores/image-inspector-store.ts`, `src/components/image-inspector/ImageInspectorView.tsx` | Only text/query-derived source lookup exists; image bytes are not sent to search providers. | Privacy/product decision: real reverse-image search requires explicit provider selection and consent model. |
| PROV-004 | P2 | Rate-limit fallback | `electron/services/veniceClient.ts:253-265` | Main-process fallback loop ignores `Retry-After` on 429. | Requires backoff policy design across providers; no current quota-burn evidence. |
| PROV-005 | P2 | Image Studio style references | `src/components/image/image-view.tsx:699-726` | Runtime style-reference capabilities are not passed into Image Studio payload builder. | Requires UI/UX decision on how to expose reference controls; character scene generation already supports runtime resolution. |
| SEC-003 | P2 | Custom protocol origin | `electron/utils/customProtocolAccess.ts:87-118` | Allows requests with no `Origin`/`Referrer` for media-element compatibility. | Defense-in-depth gap; mitigated by CSP and content-addressed media IDs. |
| SEC-004 | P2 | Character-cache TOCTOU | `electron/main.ts:429-455` | stat-to-read pattern without `O_NOFOLLOW`. | Low exploitability; cache path is constrained to validated SHA-256 keys. |
| TEST-001 | P2 | Test quality | Multiple | Mock-only provider adapter tests, weak cross-runtime backup crypto test, missing Node 26 localstorage warning test. | Requires larger test-infrastructure investment; incremental unit tests added for this session's code changes. |

---

## 4. GitHub Bypass Inventory (Final State)

Live `Rules01` (ID: `21229461`) bypass actors after this session:

```json
[
  { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
]
```

- **Retained:** Repository Admin (`actor_id: 5`) as the sole documented emergency bypass.
- **Removed:** DeployKey, Triage (`actor_id: 2`), Maintain (`actor_id: 4`), Render integration, Dependabot integration.
- **Previously removed (2026-08-25):** Google Labs Jules, Copilot SWE Agent, ChatGPT Codex Connector, Cursor, Google AI Studio, Qwen Coding Agent, Grok.

Rationale: no integration or role other than repository administration legitimately needs to bypass required CI checks, human review, and last-push approval. Dependabot updates and Render deployments must flow through the standard PR/merge path.

---

## 5. Translation Completion Report

| Locale | Before | After |
|---|---|---|
| es | 54 key-name fallbacks | 0 |
| fr, de, pt-BR, ru, zh-CN, ja, hi, ar, ko, sv-SE (10 locales) | 65 each | 0 |
| **TOTAL** | **704** | **0** |

- `npm run verify:i18n:release` passes with zero sentinel, missing-marker, key-name-fallback, and identical-unapproved leaves.
- All 11 non-English locales remain `first-pass-machine` and `isProductionComplete: false`.
- `VF-I18N-NATIVE-REVIEW-001` remains open until `docs/i18n/native-review-status.json` records qualified human reviewers and dates.

---

## 6. Validation Report

### Local validation (current worktree)

| Command | Result |
|---|---|
| `npm run lint:eslint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run verify:contracts` | PASS (104 checks) |
| `npm run verify:release-readiness` | PASS |
| `npm run verify:i18n:release` | PASS |
| `npm run verify:agent-docs` | PASS |
| `npx vitest run electron/ipc/handlers/apiKeyHandlers.reserved.test.ts src/main.boot.test.tsx --no-file-parallelism` | PASS (6 tests) |
| `npx vitest run src/i18n/locale-completion-status.test.ts` | PASS (en-US `runtimeSurfaceCoverage === 100`) |

### Hosted validation (exact-head)

After the remediation commit was pushed, the exact-head runs completed green:

- **GitHub CI run `32941837436`** for code SHA `9f2dc00ced2c97d3920692365a331d1216ce5472`: **all jobs green**
  - lint-and-typecheck
  - unit-and-integration-tests
  - coverage
  - contracts
  - build
  - windows-sensitive-tests
  - macos-sensitive-tests
  - electron-smoke-windows
  - electron-smoke-linux
  - electron-smoke-macos
- **GitHub CodeQL run `32941837430`** for code SHA `9f2dc00ced2c97d3920692365a331d1216ce5472`: **green**
  - Analyze actions
  - Analyze javascript-typescript

Any later documentation-only commit updates this report without changing the validated code or its validation conclusions.

---

## 7. External Acceptance Matrix

`VF-VERIFY-005` remains **BLOCKED — EXTERNAL RESOURCE REQUIRED**:

- Signed production builds (macOS Developer ID, notarization, stapling; Windows signed installer).
- Clean install, upgrade, and uninstall/reinstall on macOS/Windows/Linux.
- Multi-device sync convergence, conflicts, offline edits, reconnect.
- Paid-provider end-to-end acceptance (Venice media, Cohere, Hugging Face, Azure OpenAI, AWS Bedrock, Google Vertex, Replicate) with real credentials.
- Manual accessibility (keyboard-only, VoiceOver, Windows screen reader, 200%+ zoom, reduced motion, contrast, themes).

No local validation can substitute for these. They remain open on `docs/ROADMAP.md`.

---

## 8. Git State

- **Starting SHA:** `eba90428be6c87b85a96e07b83be09e0f383db89`
- **Final SHA:** `9f2dc00ced2c97d3920692365a331d1216ce5472`
- **Branch:** `main`
- **Worktree state:** clean
- **origin/main SHA:** `9f2dc00ced2c97d3920692365a331d1216ce5472`

---

## 9. Files Changed

- `.github/bypass_actors.md` — rewritten with corrected role mapping and least-privilege rationale
- `.github/workflows/codeql.yml` — removed `VENICE_FORGE_DISABLE_CODEQL` bypass; corrected CodeQL action SHA
- `.github/workflows/release.yml` — corrected `action-gh-release` SHA
- `.github/copilot-instructions.md` — updated Node/Express/CI guidance and removed references to deleted docs
- `SECURITY.md` — corrected action SHAs and Jina allowlist reference
- `README.md` — Node badge and theme count
- `CONTRIBUTING.md` — Node prerequisite
- `AGENT_REINITIALIZATION.md` — re-init date, SHA, Node version
- `docs/ROADMAP.md` — truthful i18n completion state
- `docs/summary_of_work.md` — validation matrix and session summary
- `docs/DOCS_INDEX.md` — historical labels and unindexed documents
- `docs/RELEASE/release.md` — Node version and workflow pin description
- `docs/DEVELOPMENT/platform-support.md` — Node version
- `docs/DEVELOPMENT/testing.md` — marked baseline as historical
- `docs/DEVELOPMENT/building.md` — `npm ci`
- `docs/DEVELOPMENT/macos.md` — `npm ci`
- `docs/AGENTS/AGENTS.md` — canonical docs list
- `src/main.tsx` — extracted `bootApp`, added rejection handler
- `electron/ipc/handlers/apiKeyHandlers.ts` — reserved `chat-folder-lock:` namespace
- `electron/ipc/handlers/apiKeyHandlers.reserved.test.ts` — regression tests for reservation policy
- `src/main.boot.test.tsx` — regression test for boot rejection handler
- `Final_Report.md` (root) — removed; superseded by this report
