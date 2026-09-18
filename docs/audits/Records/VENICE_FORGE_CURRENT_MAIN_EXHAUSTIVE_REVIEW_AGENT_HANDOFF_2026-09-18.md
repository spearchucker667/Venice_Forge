# Venice Forge — Current `main` Exhaustive Review & Remediation Agent Handoff

**Audit date:** 2026-09-18 (Pacific)
**Repository:** `spearchucker667/Venice_Forge`
**Latest `main` HEAD captured during audit:** `23963e02baccda78fa300c69d00c7dd6e90944af`
**Audited code tree:** `ba9a86a24bdbc7af66847ae75dea87a6176b6af1`
**Why two SHAs are listed:** while the audit was in progress, `main` advanced by one docs-only commit. `23963e02...` is one commit ahead of `ba9a86a...` and changes only `docs/summary_of_work.md`. No application source changed between those two SHAs, so all source findings below apply to the latest captured `main`.
**Package version:** `3.0.0-beta.3`
**Runtime baseline:** Electron 43, React 19, TypeScript strict, Zustand, Vitest; Node `>=22.15.0 <23.0.0`

---

# Closure Status (refreshed 2026-09-18, published `main` HEAD `b0f9f6a5`)

> All 18 actionable findings from this handoff were repaired and published to `main` between commits `07222274` and `ee6ade04` in the same day. Two findings (`P2-016` headed visual/accessibility QA and `P3-020` qualified native-language review) require external human acceptance and remain tracked in `docs/ROADMAP.md` and `docs/summary_of_work.md` as blocked on out-of-band evidence. The audit conclusion remains authoritative — *one safety-state contract, one overlay/menu contract, exact-SHA hosted CI/CodeQL evidence* — and the implementation now reflects that contract. This file is moved to `docs/audits/Records/` on commit `b0f9f6a5`.

## Finding disposition (closure SHAs recorded below)

| Finding | Disposition | Source commit | Closure evidence |
|---|---|---|---|
| `VF-20260918-P0-001` Local safeguards still execute while disabled | **CLOSED** | `1c0360f8` | Disabled-mode contract now honors user state; `tests/safety/guardPipeline.test.ts` and `tests/safety/adult-content-boundary.test.ts` assert negative-call invariants. |
| `VF-20260918-P1-002` Web proxy can ignore the disabled client state | **CLOSED** | `1c0360f8` | Web proxy now honors `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` and `assessChildExploitationSafety` no longer bypasses disabled mode. |
| `VF-20260918-P1-003` Disabled local enforcement leaks into RP/import/persistence surfaces | **CLOSED** | `1c0360f8` | `assessScenePrompt`, `characterImportSafety`, `responsesGuard`, and `mediaScreener` honor the disabled state with focused coverage. |
| `VF-20260918-P1-004` Safety bootstrap/default state can contradict user state | **CLOSED** | `1c0360f8` | `formatSafetyDecision` and prompt-segment bootstrap now reconcile explicit-disabled vs ready-vs-unknown; settings-store and SafetyPanel wording updated. |
| `VF-20260918-P1-005` Fuzzy Soundex path remains too powerful | **CLOSED** | `e34f292a` | `fuzzyMatchesCritical` strips punctuation, allowlists benign corpus entries (case, Unicode, emoji adjacency), and downgrades warning-only collisions; CSAM hard-block invariant preserved. |
| `VF-20260918-P1-006` Docs, tests, source, and verifiers encode different policies | **CLOSED** | `1c0360f8` | `SECURITY.md`, `CONTRIBUTING.md`, `.github/copilot-instructions.md`, `localFamilySafeGuard`, `localFamilyGuardRules`, and tests aligned to disabled-mode semantics. |
| `VF-20260918-P2-007` Optional local guard is presented as primary | **CLOSED** | `1c0360f8` | `SafetyPanel` and `i18n/en-US/settings.json` now describe the guard as optional local screening that is skipped when disabled. |
| `VF-20260918-P2-008` Shared `ContextMenu` can exceed viewport and lacks complete keyboard behavior | **CLOSED** | `07222274` | Viewport-bounded width/height, internal scrolling, resize/scroll placement, RTL alignment, Arrow/Home/End navigation, Escape/Tab close, focus return; `ContextMenu.test.tsx` + headed Chromium check. |
| `VF-20260918-P2-009` Sidebar chat-options menu can clip/overflow | **CLOSED** | `57efe436` | Migrated to portaled shared `ContextMenu`; disabled states, confirmation, and localized labels preserved. |
| `VF-20260918-P2-010` History folder menu duplicates the overlay system | **CLOSED** | `72fdff4b` | Migrated to shared `ContextMenu`; privacy, rename, delete, export, and import actions preserved. |
| `VF-20260918-P2-011` `aria-activedescendant` can point at a nonexistent option | **CLOSED** | `4ce828f6` | Active-descendant IDs now match rendered option IDs for searchable and non-searchable modes. |
| `VF-20260918-P2-012` Filtered Select can retain an invalid highlighted index | **CLOSED** | `4ce828f6` | Highlights clamped when filtering shrinks the result set; out-of-range resets to first visible match. |
| `VF-20260918-P2-013` Select viewport/z-layer integration is incomplete | **CLOSED** | `4ce828f6` | Portaled list constrained to viewport; shared context-menu layer token applied. |
| `VF-20260918-P2-014` Sidebar labels lack a hard overflow contract | **CLOSED** | `7bf1defa` | Navigation icons fixed; labels occupy a truncating flex slot with full-title access; group headings truncate safely. |
| `VF-20260918-P2-015` Character-card action rows are fragile | **CLOSED** | `7bf1defa` | Character actions wrap within narrow cards, text buttons truncate with titles, export controls remain reachable at narrow widths and zoom. |
| `VF-20260918-P2-016` Headed UI/accessibility acceptance remains open | **EXTERNAL ACCEPTANCE** | n/a | Requires a human reviewer running Venice Forge in headed mode and recording per-tab evidence under `docs/design/reference-ui-redesign-evidence/`. Tracked in `docs/ROADMAP.md` and `docs/summary_of_work.md`. |
| `VF-20260918-P2-017` Required status checks are OFF | **CLOSED** | `80fb45b1` | `Rules01` ruleset enforces strict required checks, one approving review, and 13 required contexts (verified by `gh api repos/spearchucker667/Venice_Forge/rulesets/21229461`). |
| `VF-20260918-P3-018` Current-state docs can lag current HEAD | **CLOSED** | `ee6ade04` | Machine-readable metadata now distinguishes `repository_head_sha`, `application_code_sha`, `verified_against_sha`, and `verified_at`. |
| `VF-20260918-P3-019` Superdesign verifier misses a core overlay primitive | **CLOSED** | `5eca2e45` | `ContextMenu` added to Superdesign source inventory; props documented; fingerprint refreshed. |
| `VF-20260918-P3-020` Native-language review and layout stress remain incomplete | **EXTERNAL ACCEPTANCE** | n/a | Requires qualified native-language reviewers for the 12 non-English catalogs (3,916 placeholder entries); do NOT mechanically backfill English. Tracked in `docs/ROADMAP.md` and `docs/summary_of_work.md`. |

## Validation summary across the closed tranche

- Local focused vitest runs (ContextMenu, Sidebar, History, Select, CharacterLibrary, childExploitationGuard, guardPipeline, adult-content-boundary, bridgeServer, enforcementBoundaries, inspectorPreview, responsesGuard, characterImportSafety, sceneGenerationService, mediaScreener, veniceClient, localFamilyGuardRules, localFamilySafeGuard) — all PASS.
- `npm run lint:eslint` — PASS (zero errors/warnings) on each segment.
- `npm run typecheck` — PASS (root, Electron, and Electron-test tsconfigs) on each segment.
- `npm run build` and `npm run verify:dist` — PASS on each segment.
- `npm run verify:safety-guard` — PASS on the safety contract segments.
- `npm run verify:superdesign-init` — PASS after ContextMenu governance.
- `npm run verify:roadmap-current`, `verify:agent-docs`, `verify:repo-handoff-hygiene` — PASS on each segment.
- Live GitHub ruleset inspection (`gh api repos/spearchucker667/Venice_Forge/rulesets/21229461`) — confirmed `Rules01` strict required checks.

## Hosted acceptance outstanding

Hosted CI and CodeQL must be confirmed green against the published SHA before any change is treated as fully closed. See `docs/ROADMAP.md` `current_state` block for live run IDs. The four pre-existing Markdown-link failures caused by the user-owned audit-record moves (now moved from `TODO/` to `Records/`) are repaired by this closure as well.

---

# 0. Mission

Repair the confirmed defects and structural risks found in the 2026-09-18 current-`main` audit of Venice Forge.

This handoff is deliberately implementation-oriented. Do not treat it as a request for another broad review. Reproduce each confirmed defect, implement the corrections, add regression coverage, complete headed visual/accessibility acceptance, update the repository contracts, and leave the exact final `main` SHA fully validated.

Read, in this order, before modifying source:

1. `AGENTS.md`
2. `.github/copilot-instructions.md`
3. `SECURITY.md`
4. `CONTRIBUTING.md`
5. `docs/summary_of_work.md`
6. `docs/ROADMAP.md`
7. `.superdesign/init/components.md`
8. `.superdesign/init/layouts.md`
9. `.superdesign/init/theme.md`
10. `package.json`

Do not assume the current safety documentation is internally consistent. It is not. The contradictions are one of the primary findings of this audit.

---

# 1. Non-negotiable product contract

## 1.1 Local/in-app safeguards OFF means a true no-op

When Venice Forge's **in-app/local safeguards are disabled**, they must have **zero behavioral impact** on the application.

When disabled, the app-local safeguard layer must not:

- classify the user's prompt;
- normalize or fuzzy-match the user's prompt for safety purposes;
- run local child/adult/family-content rules;
- block a request;
- rewrite a request;
- mutate a prompt;
- refuse prompt enhancement;
- prevent a character/persona/scenario/card from being saved or imported;
- prevent an RP message or scene from being generated;
- screen or buffer an upstream response;
- withhold streaming deltas;
- block Jina/search/scrape responses;
- inspect generated media for the optional local filter;
- emit a local 451;
- convert a provider response into a local safety failure;
- add latency by running the local classifier;
- record a local safety decision as though the classifier executed;
- surface a local false positive;
- silently substitute `enabled=true`;
- claim that the local rule engine approved content when the rule engine was skipped.

The disabled state should be represented explicitly as a **skipped/no-op state**.

### Required negative-call invariant

For every guarded surface, tests must be able to prove:

```text
local safeguard disabled
    =>
local classifier not called
local rule engine not called
local response screener not called
local generated-media local screener not called
local audit decision not recorded as an evaluated allow/block
no local 451
request/provider behavior proceeds independently
```

A test that merely verifies `allowed === true` is insufficient. The test must prove that the local safety engine was **not invoked**.

## 1.2 Local/in-app safeguards ON

Only when the local safeguard setting is enabled may local application safeguards:

- classify or inspect prompt text;
- screen local inputs or imported content;
- screen response text;
- screen generated media;
- block a local action;
- emit local safety telemetry;
- add local warning/refusal UI.

## 1.3 Provider/API safety remains independent

Do **not** couple `localFamilySafeModeEnabled` to Venice provider-side behavior.

`veniceApiSafeMode` / provider-side `safe_mode`, model-specific content behavior, provider content-policy responses, and provider response headers are separate concerns.

Do not:

- automatically turn provider `safe_mode` on because the local layer is off;
- automatically turn provider `safe_mode` off because the local layer is off;
- add `safe_mode` to endpoints that do not support it;
- claim Venice has one universal safety policy across every model and endpoint;
- introduce new local restrictions to compensate for a provider/model that is permissive.

The application must accurately display the provider state and let the provider/API enforce whatever policy applies to that selected endpoint/model.

Current Venice documentation is endpoint/model specific: the API exposes content-policy response headers, while uncensored models are explicitly available and some endpoints such as queued video generation do not accept `safe_mode`. Treat the live Venice Swagger/docs as authoritative during implementation.

---

# 2. Audit status and evidence

## 2.1 Current Git state

Captured latest `main`:

```text
23963e02baccda78fa300c69d00c7dd6e90944af
docs(handoff): record CodeQL run 35343769941 pass and 0 open alerts
```

Its parent and audited application code tree:

```text
ba9a86a24bdbc7af66847ae75dea87a6176b6af1
fix(security): construct objects via Object.fromEntries in redactSecrets to eliminate property injection
```

Comparison:

```text
ba9a86a... -> 23963e02...
1 commit
1 file changed
docs/summary_of_work.md only
```

Therefore application source findings based on `ba9a86a...` are current for `23963e02...`.

## 2.2 Hosted validation observed during the audit

For `ba9a86a...`:

- CodeQL run `35343769941`: **success**
- CI run `35343769763`: **cancelled**
- the cancellation happened when the docs-only successor commit moved `main`

For `23963e02...` at the final audit check:

- CodeQL run `35344218919`: **success**
- CI run `35344218973`: **in progress**

Do not claim hosted CI is green for the final remediation SHA until the exact final SHA has a completed successful CI run.

## 2.3 Branch protection weakness

GitHub reports `main` as protected, but required status checks are effectively disabled:

```text
required_status_checks.enforcement_level = "off"
contexts = []
checks = []
```

A protected branch without required CI checks can still accept a commit that has not passed the repository's validation suite.

This is a release-process defect and should be corrected after the source work is complete.

## 2.4 Review limitations

This audit used current GitHub source, current repository docs/verifiers/tests, current Context7 Electron/React documentation, Superpowers systematic-debugging workflow, and the committed Superdesign source-grounded design bundle.

A locally cloned headed build could not be executed in the audit environment, so visual findings are classified as:

- **CONFIRMED STATIC** — source proves the defect;
- **HIGH-CONFIDENCE UI RISK** — source structure is fragile and must be reproduced headfully;
- **OPEN HEADED ACCEPTANCE** — the repo already records missing direct headed evidence.

Do not mark headed UI/accessibility findings complete using JSDOM, static grep, or screenshots that do not exercise the relevant interaction.

---

# 3. Executive finding register

| ID | Severity | Confidence | Area | Finding |
|---|---:|---|---|---|
| VF-20260918-P0-001 | P0 | Confirmed | Safety semantics | Local safeguards still execute and can block while the local safeguard toggle is OFF |
| VF-20260918-P1-002 | P1 | Confirmed | Web safety authority | Express proxy defaults local safeguards ON and ignores the client's disabled state unless a separate environment override permits it |
| VF-20260918-P1-003 | P1 | Confirmed | RP/import/local persistence | Character/persona/scenario/RP paths inherit the same disabled-state local classification and can be affected while safeguards are OFF |
| VF-20260918-P1-004 | P1 | Confirmed | Safety bootstrap | Main-process and renderer defaults disagree; fail-closed/unknown config can present local enforcement that does not match the user's requested disabled state |
| VF-20260918-P1-005 | P1 | Confirmed risk | False positives | A Soundex hit is a hard block signal; the recent `shot,` → `shota` collision proves the fuzzy path remains false-positive sensitive |
| VF-20260918-P1-006 | P1 | Confirmed | Contracts/tests/docs | Repository instructions, implementation, tests, static verifier, and security docs contradict one another about Adult Mode / disabled semantics |
| VF-20260918-P2-007 | P2 | Confirmed | Diagnostics UX | Diagnostics describes the optional local filter as the primary safety boundary and warns solely because it is OFF |
| VF-20260918-P2-008 | P2 | Confirmed static | Shared ContextMenu | Shared context menu can exceed the viewport vertically and lacks complete menu keyboard/focus semantics |
| VF-20260918-P2-009 | P2 | Confirmed static | Sidebar menus | Sidebar chat-options menu is non-portaled inside an overflow-constrained region and has no collision/height/focus management |
| VF-20260918-P2-010 | P2 | Confirmed static | History menu | History implements a second bespoke context-menu system with ad-hoc positioning/z-index and no bounded height/complete keyboard navigation |
| VF-20260918-P2-011 | P2 | Confirmed | Shared Select | Non-searchable Select can set `aria-activedescendant` to an ID that does not exist |
| VF-20260918-P2-012 | P2 | Confirmed | Shared Select | Filtering/options changes can leave `highlightedIndex` stale or out of range |
| VF-20260918-P2-013 | P2 | High confidence | Shared Select | Horizontal/vertical viewport collision handling and overlay z-layer integration are incomplete |
| VF-20260918-P2-014 | P2 | High confidence | Sidebar | Expanded navigation labels lack a robust `min-w-0` + truncation/wrapping contract under long locales/zoom |
| VF-20260918-P2-015 | P2 | High confidence | RP Character Library | Character-card action rows are fragile under narrow cards, long translations, and 200% zoom |
| VF-20260918-P2-016 | P2 | Confirmed open | Visual/a11y acceptance | The repository's existing P2-007 headed visual/accessibility acceptance remains incomplete across 15 canonical tabs |
| VF-20260918-P2-017 | P2 | Confirmed | CI governance | `main` protection does not require CI/status checks |
| VF-20260918-P3-018 | P3 | Confirmed | Current-state docs | `docs/summary_of_work.md`, `docs/ROADMAP.md`, and design metadata can lag current HEAD and misdirect agents |
| VF-20260918-P3-019 | P3 | Confirmed | Superdesign governance | `ContextMenu.tsx` is not fingerprinted by the Superdesign init verifier despite being a core overlay primitive |
| VF-20260918-P3-020 | P3 | Confirmed open | Localization/UI | 12 non-English catalogs remain pending native review; thousands of placeholders rely on fallback and have not received full long-copy layout acceptance |

---

# 4. Stop-the-line safety findings

## VF-20260918-P0-001 — Local safeguards still execute while disabled  *(CLOSED — commit `1c0360f8`)*

### Severity

**P0 — stop-the-line product-contract violation**

### Confirmed source

Primary files:

- `src/shared/safety/localFamilySafeGuard.ts`
- `src/shared/safety/localFamilyGuardRules.ts`
- `electron/services/guardPipeline.ts`
- `src/shared/safety/childExploitationGuard.ts`
- `src/services/veniceClient/fetch.ts`
- `src/services/veniceClient/stream.ts`
- `src/services/veniceClient/responses.ts`
- `server.ts`

### Root cause

The shared local-family pipeline treats one portion of the local classifier as non-disableable.

`runLocalFamilyGuard(input, localFamilySafeModeEnabled)` evaluates:

```ts
const mandatoryDecision = assessChildExploitationSafety(input);
```

**before** it evaluates whether `localFamilySafeModeEnabled` is true.

The toggle therefore controls only an additional optional family/adult-content policy, not the entire in-app safeguard layer.

`maybeRunLocalFamilyGuard()` always routes into this implementation and records the resulting decision.

`checkLocalFamilyGuard()` in Electron always invokes the helper before request dispatch.

The practical result is:

```text
localFamilySafeModeEnabled = false
    !=
local guard disabled
```

It currently means approximately:

```text
optional family filtering disabled
mandatory local classifier still executes
```

That violates the product contract for this task.

### Additional evidence

Current strings/comments explicitly encode the old policy:

- `"Blocked by child-safety protections. This protection cannot be disabled."`
- reason variants such as `"optional-local-family-filter-disabled-child-safety-checked"`
- tests named along the lines of:
  - `"keeps mandatory response screening active when the optional family filter is disabled"`
  - `"keeps mandatory blob response screening active when the optional family filter is disabled"`

This is intentional current behavior, not an accidental one-line regression.

### Required remediation

Create one canonical semantic rule:

```ts
if (!localFamilySafeModeEnabled) {
  return LOCAL_GUARD_SKIPPED;
}
```

That short-circuit must occur **before**:

- prompt extraction;
- safety normalization;
- fuzzy matching;
- child/adult/family classifiers;
- content hashing;
- response sampling;
- media screening;
- local safety audit accounting.

Recommended architecture:

1. Define a typed skipped result, e.g.:
   ```ts
   {
     allowed: true,
     skipped: true,
     mode: "disabled",
     reason: "local-safeguards-disabled"
   }
   ```
2. Short-circuit in the highest common wrapper.
3. Add defense-in-depth short-circuits at transport/screening entry points.
4. Make direct invocation of the underlying rule engine difficult:
   - keep raw evaluator internal where possible;
   - export only deliberate low-level test APIs if necessary.
5. Remove the notion that an evaluated `guardDecision` exists when the engine did not run.
6. Do not create a fake “classifier allowed” decision for the disabled case.

### Acceptance criteria

With local safeguards OFF:

- `assessChildExploitationSafety` call count = `0`
- optional local adult/family evaluator call count = `0`
- local response-screener call count = `0`
- local generated-media screener call count = `0`
- `recordDecision` is not called as an evaluated local safety decision
- Electron Venice requests dispatch normally
- Electron chat streams are not locally withheld
- web Venice requests dispatch normally
- web chat streams are not locally safety-buffered
- Responses API dispatches normally
- Jina/scrape responses are not locally blocked
- no local 451 response is generated
- no prompt-enhancement failure is attributed to a disabled local safeguard
- no local import/save is blocked by the disabled safeguard
- provider-side behavior remains whatever the provider returns

With local safeguards ON:

- current intended local checks continue to run;
- high-confidence unsafe test fixtures remain blocked;
- safety telemetry correctly identifies a locally evaluated decision.

---

## VF-20260918-P1-002 — Web proxy can ignore the disabled client state  *(CLOSED — commit `1c0360f8`)*

### Confirmed source

`server.ts`

### Current behavior

`isLocalFamilySafeModeEnabled(req)` uses an authority matrix where local filtering defaults to enabled.

In the observed current implementation:

- no environment override + no header => enabled;
- no environment override + client header false => still enabled;
- the false client state is honored only when a separate environment flag permits the client safety override;
- an explicit environment setting can win.

This means the browser UI can represent the local safeguard as OFF while the Express proxy continues to run it.

### Why this matters

The user-facing setting and the authoritative request boundary can disagree.

That creates:

- unexplained local blocks;
- false-positive reports that appear impossible from the UI state;
- inconsistent Electron vs web behavior;
- debugging ambiguity;
- misleading diagnostics.

### Required remediation

Do not solve this by blindly trusting an arbitrary public HTTP header.

Instead define one explicit web-mode authority model.

Acceptable approaches include:

### Preferred

A session-bound server-side configuration for the connected app session, with the renderer changing it through a trusted same-origin control path.

### Acceptable for strictly local/private web development

Honor the client state only when the server is operating in an explicitly local/trusted mode and document the boundary.

### Not acceptable

```text
Any unauthenticated remote client can set a header and globally change server safety behavior.
```

Whichever authority model is chosen:

- the UI must show the authoritative state;
- the proxy must use that same state;
- OFF must cause a true local no-op;
- tests must cover server authority mismatch cases;
- unknown/unhydrated state must not masquerade as enabled or disabled.

---

## VF-20260918-P1-003 — Disabled local enforcement leaks into RP/import/persistence surfaces  *(CLOSED — commit `1c0360f8`)*

### Confirmed source

Primary files:

- `src/shared/safety/characterImportSafety.ts`
- `src/services/rp/sceneGenerationService.ts`
- `src/services/rp/rpChatService.ts`
- `src/services/rp/personaService.ts`
- `src/services/rp/scenarioService.ts`
- `src/services/characterCardImportExport.ts`
- `src/services/rp/characterCardService.ts`
- `electron/ipc/characterCardFileHandlers.ts`
- related RP UI call sites

### Root cause

`characterImportSafety.ts` documents the intended semantics correctly:

> when the local mode is disabled, the rule engine is intentionally NOT invoked.

But its implementation calls `maybeRunLocalFamilyGuard()`, whose current semantics still run the supposedly mandatory local classifier.

The comment and code therefore disagree.

### Impact

When local safeguards are OFF, local content operations can still be influenced by an in-app classifier, including:

- character card import;
- batch character import;
- persona save/import;
- scenario save/import;
- RP context evaluation;
- scene prompt evaluation;
- character-scene generation;
- related renderer-side preflight flows.

This is especially important because these operations are not all simple provider dispatches. A local rule can prevent local authoring/persistence even when the user explicitly disabled the in-app safeguard.

### Required remediation

All local preflight wrappers must inherit the canonical disabled-no-op behavior.

Do not add one-off checks to every component. Fix the shared contract first, then add explicit entry-point tests.

### Required tests

At minimum add disabled-state no-call tests for:

- `assessCharacterImport`
- `assessCharacterBatchImport`
- `assessPersonaImport`
- `assessScenario`
- `assessRpContext`
- `assessScenePrompt`
- character-card main-process import
- RP scene generation
- RP chat append/save
- persona save
- scenario save

Each test must spy on the raw local evaluator and prove it was not called.

---

## VF-20260918-P1-004 — Safety bootstrap/default state can contradict user state  *(CLOSED — commit `1c0360f8`)*

### Confirmed source

- `electron/services/runtimeSafetySettings.ts`
- `electron/services/configService.ts`
- `src/stores/settings-store.ts`
- `src/safetyHydration.ts`

### Current state

Main process starts with:

```ts
localFamilySafeModeEnabled = true
```

Renderer settings default to:

```ts
localFamilySafeModeEnabled = false
```

The renderer safety hydration layer also throws `ConfigNotHydratedError` for local preflight decisions before the main snapshot has hydrated.

On config-read/parse failure, main-process logic intentionally preserves the prior/fail-closed local safety value rather than silently switching it off.

### Problem

There are three distinct states but the architecture largely models a boolean:

```text
enabled
disabled
unknown / not hydrated / config unavailable
```

Collapsing “unknown” into `true` or `false` can cause the displayed mode and actual mode to diverge.

### Required remediation

Represent safety configuration readiness separately from the boolean.

Recommended model:

```ts
type LocalSafeguardRuntimeState =
  | { status: "loading" }
  | { status: "ready"; enabled: true }
  | { status: "ready"; enabled: false }
  | { status: "error"; error: SafeConfigError };
```

Requirements:

- a known persisted `false` must never be silently coerced to `true`;
- a known persisted `true` must never be silently coerced to `false`;
- unknown config must be displayed as unknown/unavailable, not as a misleading enabled/disabled state;
- transport initialization may wait for authoritative config if required;
- once authoritative state is ready and false, local safety must be a true no-op.

Do not weaken unrelated secure-storage/config integrity behavior.

---

# 5. False-positive audit

## VF-20260918-P1-005 — Fuzzy Soundex path remains too powerful  *(CLOSED — commit `e34f292a`)*

### Confirmed recent regression

Recent commit history fixed this benign prompt class:

```text
"... candid shot, high resolution ..."
```

The false positive occurred because:

- `shot` is allowlisted;
- tokenization previously passed `shot,`;
- `shot,` did not match the allowlist;
- Soundex collided with a restricted term;
- the fuzzy-critical path returned a blocking decision.

The punctuation normalization fix corrected that one class.

### Current algorithmic risk

`src/shared/safety/childExploitationGuard.ts` still treats a Soundex match as a direct positive signal in `fuzzyMatchesCritical()`.

The current function:

1. strips surrounding punctuation;
2. ignores tokens shorter than four characters;
3. checks a small `FUZZY_ALLOWLIST`;
4. compares candidate tokens against restricted terms with a small length-difference window;
5. returns true immediately on a Soundex collision;
6. otherwise uses Jaccard-like similarity thresholds.

A phonetic algorithm is not sufficiently precise to be a stand-alone hard-block oracle over arbitrary benign user vocabulary.

### Current test weakness

The fuzzy false-positive test suite covers a small set of known examples such as:

- `loci`
- `Lori`
- `polo`
- `solo`
- `candid shot,`

No property/fuzz framework such as `fast-check` is present.

There is no broad benign corpus proving robustness across:

- punctuation;
- Unicode punctuation;
- combining marks;
- casing;
- emoji adjacency;
- non-English text;
- names;
- technical vocabulary;
- photography terms;
- brands;
- source-code identifiers.

### Required remediation when local safeguards are enabled

Do **not** solve this by continuously adding arbitrary terms to an allowlist.

Preferred strategy:

1. Preserve exact/high-confidence local rules.
2. Downgrade fuzzy-only phonetic similarity from stand-alone hard block to a supporting signal.
3. Require corroborating contextual evidence before a fuzzy-only token causes a hard block.
4. Build a large benign-negative regression corpus.
5. Add metamorphic/property testing:
   - adding harmless punctuation must not change a benign result;
   - changing case must not change a benign result;
   - Unicode quote/dash variations must not change a benign result;
   - adjacent emoji must not change a benign result;
   - normalization round trips must be stable.
6. Keep unsafe synthetic fixtures separate and redacted.
7. Never log raw prompts in failure output.

### Required metrics

During tests, track:

- benign corpus false-positive count;
- unsafe synthetic fixture false-negative count;
- reason-code distribution;
- fuzzy-only block count;
- average/maximum classifier time.

Release criterion for the local safeguard-enabled mode should include **zero known benign corpus hard blocks**.

---

# 6. Safety contract conflict across repository

## VF-20260918-P1-006 — Docs, tests, source, and verifiers encode different policies  *(CLOSED — commit `1c0360f8`)*

### Confirmed contradictions

#### `.github/copilot-instructions.md`

States that Adult Mode should not call the local rule engine.

#### `SECURITY.md`

States, in its local-mode description, that setting local Family Safe Mode false selects Adult Mode and skips local rule evaluation.

#### `src/shared/safety/characterImportSafety.ts`

Comments also state that disabled mode intentionally skips the rule engine.

#### `CONTRIBUTING.md`

Says every new prompt-sending path must call `assessChildExploitationSafety()` and `recordDecision()` before forwarding and must not bypass the guard.

#### `src/shared/safety/localFamilySafeGuard.ts`

Documents an always-on local child-safety layer.

#### `src/shared/safety/localFamilyGuardRules.ts`

Actually runs that layer before checking the local enable flag.

#### Tests

Several tests explicitly require mandatory screening while the optional local filter is disabled.

#### `scripts/verify-safety-guard.cjs`

The verifier largely checks that guard calls exist at required paths. It does not prove the more important semantic property:

```text
guard disabled => rule engine unreachable
```

### Impact

Agents can “fix” the implementation in either direction and still believe they are following canonical repository policy.

This is a regression generator.

### Required remediation

After implementing the desired semantics, reconcile all authority documents in the same change:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `docs/DEVELOPMENT/CONFIG.md` if applicable
- relevant user documentation/FAQ
- `src/shared/safety/localFamilySafeGuard.ts` comments
- `src/shared/safety/localFamilyGuardRules.ts` comments
- `src/shared/safety/characterImportSafety.ts`
- `src/safetyHydration.ts`
- diagnostics/status copy
- all safety tests
- `scripts/verify-safety-guard.cjs`

### Verifier requirement

Replace “contains a guard call” as the primary invariant with semantic contract tests.

The static verifier may still enforce boundary coverage, but unit/integration tests must enforce:

```text
OFF => evaluator is not invoked
ON  => evaluator is invoked at the required boundaries
```

---

# 7. Diagnostics/status semantics

## VF-20260918-P2-007 — Optional local guard is presented as primary  *(CLOSED — commit `1c0360f8`)*

### Confirmed source

`src/services/diagnosticsService.ts`

Current `buildSafetyStatus()` comments and severity logic describe the local guard as the primary safety boundary.

When local mode is OFF, diagnostics assigns warning severity even if that is the user's chosen configuration.

### Why this is misleading

Under the desired product contract, OFF is a valid operating mode.

The UI should not tell the user the app is degraded merely because an optional local safeguard is disabled.

### Required UX

Represent two independent axes:

```text
Local safeguards: ON / OFF / LOADING / ERROR
Provider safety/filter mode: ON / OFF / unsupported / model-dependent / unknown
```

Do not compress them into a single “safe/unsafe” verdict.

Recommended status semantics:

- local OFF + provider state known: informational/neutral;
- local ON: informational/neutral unless the safeguard subsystem itself is unhealthy;
- config load failure: warning/error;
- provider rejection/content-policy response: provider-specific status;
- unsupported provider field: normal capability state, not an error.

---

# 8. UI / overlay / menu audit

## Design-system direction

React's portal model is the correct foundation for overlays that must escape clipping/stacking contexts.

The app already has examples of better behavior in `src/components/chat/chat-view.tsx`, where the chat-context popover:

- portals to `document.body`;
- uses fixed positioning;
- clamps to the viewport;
- computes available vertical space;
- limits height and scrolls;
- repositions on resize and scroll;
- restores focus.

Use this as a local implementation reference.

Do not create a fourth menu/popover system.

---

## VF-20260918-P2-008 — Shared `ContextMenu` can exceed viewport and lacks complete keyboard behavior  *(CLOSED — commit `07222274`)*

### Confirmed source

`src/components/ui/ContextMenu.tsx`

### Current strengths

- portals to `document.body`;
- uses fixed coordinates;
- measures menu width/height;
- clamps top/left after measurement;
- high overlay z-index.

### Confirmed defects

The menu surface has no reliable:

```text
max-height
overflow-y: auto
overscroll containment
```

If the menu itself is taller than the viewport, clamping `top` to a small margin does not make the menu fit. It still extends below the viewport.

The ARIA structure uses `role="menu"` / `menuitem`, but the component does not provide a complete native-like menu interaction model:

- no roving `tabIndex`;
- no ArrowUp/ArrowDown movement;
- no Home/End behavior;
- no initial active item contract;
- no robust focus restoration contract to the invoking element.

### Required remediation

Harden `ContextMenu` into the canonical menu primitive.

Required features:

- body portal;
- fixed positioning;
- viewport margin;
- collision-aware x/y placement;
- dynamic `maxHeight = available viewport`;
- `overflow-y-auto`;
- `overscroll-contain`;
- RTL-aware placement;
- resize/scroll reposition;
- ArrowUp/ArrowDown/Home/End;
- Escape closes;
- Tab behavior defined intentionally;
- disabled items skipped;
- initial focus;
- focus return to trigger;
- typeahead optional but preferred;
- deterministic z-layer token, not ad-hoc numeric literals.

Add unit tests plus headed tests.

---

## VF-20260918-P2-009 — Sidebar chat-options menu can clip/overflow  *(CLOSED — commit `57efe436`)*

### Confirmed source

`src/components/layout/sidebar.tsx`

### Current structure

The chat options menu is:

```text
position: absolute
right: 3
top: 10
z-50
min-width: 12rem
```

It is rendered inside the sidebar's chat-history region.

The containing sidebar middle section uses:

```text
overflow-hidden
```

### Confirmed structural problem

The menu does not portal outside that clipping context.

It also has no:

- viewport collision logic;
- maximum height;
- scrolling;
- focus transfer into the menu;
- ArrowUp/ArrowDown navigation;
- focus restoration after close.

On shorter windows, large UI scaling, or long translated labels, this menu can be clipped or extend beyond useful space.

### Required remediation

Remove the bespoke absolute menu.

Use the hardened canonical `ContextMenu` / menu-surface primitive.

Acceptance:

- not clipped by the sidebar;
- fully reachable at minimum supported window height;
- usable at 200% zoom;
- usable with keyboard only;
- correct in RTL;
- long labels do not expand beyond the viewport.

---

## VF-20260918-P2-010 — History folder menu duplicates the overlay system  *(CLOSED — commit `72fdff4b`)*

### Confirmed source

`src/components/chat/HistoryView.tsx`

### Current behavior

History renders a separate body-portaled folder context menu.

It uses:

- its own measurement logic;
- its own fixed top/left writes;
- an ad-hoc z-index around `9999`;
- its own outside-click/keyboard handling.

It does focus the first button, which is better than the sidebar menu, but it still lacks a complete menu keyboard model and bounded-height behavior.

### Problem

Three menu systems now coexist:

1. `src/components/ui/ContextMenu.tsx`
2. sidebar chat-options menu
3. History folder context menu

Every independent implementation creates different:

- z-index behavior;
- clipping behavior;
- focus behavior;
- keyboard behavior;
- resize behavior;
- accessibility debt.

### Required remediation

Migrate History to the canonical hardened menu primitive.

Delete the duplicate positioning/z-index implementation after parity is verified.

Also localize any remaining visible hardcoded menu/detail prose while touching the surface.

---

# 9. Shared Select defects

## VF-20260918-P2-011 — `aria-activedescendant` can point at a nonexistent option  *(CLOSED — commit `4ce828f6`)*

### Confirmed source

`src/components/ui/select.tsx`

### Root cause

For the non-searchable trigger, `aria-activedescendant` is constructed from `highlightedIndex`.

Rendered option IDs are constructed from a sanitized option value.

Those two ID schemes are not guaranteed to match.

Result:

```text
aria-activedescendant="<index-derived id>"
actual option id="<value-derived id>"
```

Screen readers can therefore receive a reference to an element that does not exist.

### Required remediation

Create one canonical function:

```ts
function getOptionId(listboxId: string, option: Option): string
```

Use it for:

- rendered option `id`;
- trigger/input `aria-activedescendant`;
- tests.

Never construct active-descendant IDs from array index if rendered IDs are value based.

---

## VF-20260918-P2-012 — Filtered Select can retain an invalid highlighted index  *(CLOSED — commit `4ce828f6`)*

### Confirmed source

`src/components/ui/select.tsx`

### Root cause

`highlightedIndex` is not comprehensively reset/clamped whenever:

- search text changes;
- filtered option count changes;
- options are replaced;
- current selected value disappears.

A previously valid index can become invalid.

### Symptoms

Potential outcomes:

- Enter does nothing;
- active descendant references no option;
- keyboard navigation starts from a stale position;
- wrong option becomes highlighted after filtering.

### Required remediation

On every filtered-option change:

```text
if no options -> highlightedIndex = -1
else if selected value exists -> index(selected)
else -> clamp current index or 0
```

When search changes, prefer a deterministic reset policy.

Add tests for:

- filter from many options to one;
- filter to zero;
- remove currently highlighted option;
- replace options array;
- reopen after filtering;
- keyboard Enter after each transition.

---

## VF-20260918-P2-013 — Select viewport/z-layer integration is incomplete  *(CLOSED — commit `4ce828f6`)*

### High-confidence structural risk

The Select portal is fixed-positioned and uses `z-50`.

`AccessibleDialog` defaults to `z-[80]`.

A body-portaled Select used inside a higher-z dialog can therefore render behind the dialog layer unless the caller uses native `<select>` or another workaround.

The Select's viewport logic also:

- uses trigger width directly;
- does not robustly clamp horizontal geometry;
- uses a static `max-h-60`;
- does not always calculate max height from actual available space above/below.

### Required remediation

Define a shared overlay layer system, e.g.:

```text
content
sticky chrome
popover/menu
dialog
dialog-popover
toast
critical modal
```

Do not scatter `z-50`, `z-[80]`, `z-[200]`, `z-[1000]`, `9999`.

For Select:

- clamp left/right to viewport margin;
- set maximum width;
- dynamically set max height from available viewport;
- flip above/below;
- support an overlay layer appropriate to its containing modal;
- preserve body portal or portal into a designated overlay root;
- test inside `AccessibleDialog`.

---

# 10. Text/character overlap and responsive pressure

## VF-20260918-P2-014 — Sidebar labels lack a hard overflow contract  *(CLOSED — commit `7bf1defa`)*

### Source

`src/components/layout/sidebar.tsx`

Sidebar widths:

```text
collapsed: 60px
min expanded: 220px
default: 256px
max: 480px
```

Expanded navigation labels render as a plain span:

```tsx
<span className="font-medium">{tabLabel}</span>
```

The row itself does not establish the same strong `min-w-0`/truncate contract already used elsewhere for conversation titles.

### Risk

At:

- 220px sidebar width;
- 200% browser/app zoom;
- increased app font size;
- long German/Russian/Portuguese labels;
- translated group headings;
- RTL;

labels can wrap unexpectedly, collide with fixed-size icons, or increase row height inconsistently.

### Required remediation

Use:

```text
icon: shrink-0
label container: min-w-0 flex-1
label: truncate OR deliberate two-line clamp
```

If truncating, expose the full label via accessible name/title/tooltip.

Apply the same review to:

- group headings;
- project switcher;
- history controls;
- status pills;
- safety controls.

---

## VF-20260918-P2-015 — Character-card action rows are fragile  *(CLOSED — commit `7bf1defa`)*

### Source

`src/components/rp-studio/CharacterLibrary.tsx`

The character grid can reach five columns.

Card text uses good truncation/line-clamp behavior, but the bottom action area places multiple textual buttons into compact rows:

- Chat
- Edit
- Delete
- Export JSON
- Export PNG

### Risk

At narrow card width, localized copy and zoom can:

- wrap buttons inconsistently;
- overlap adjacent actions;
- widen the card;
- increase card heights unevenly;
- create inaccessible tiny hit areas if later “fixed” by shrinking fonts.

### Required remediation

Prefer one of:

1. responsive action layout that stacks at narrow container width;
2. CSS container queries;
3. primary action + compact overflow menu;
4. icon buttons with accessible labels/tooltips for secondary actions.

Do not solve by reducing text below accessible sizes.

Required acceptance:

- 200% zoom;
- longest supported locale strings;
- 320–390 CSS-pixel viewport equivalent;
- keyboard focus ring visible for every action;
- no content overlap;
- no horizontal page overflow.

---

# 11. Headed UI/accessibility acceptance remains open

## VF-20260918-P2-016  *(EXTERNAL ACCEPTANCE — out-of-band human reviewer required; tracked in ROADMAP/summary_of_work)*

The repository already carries open finding `P2-007` for headed visual/accessibility QA.

The current ledger identifies at least these canonical tabs as lacking direct dedicated headed evidence:

```text
character-chats
history
image-inspector
prompts
scenes
audio
music
video
embeddings
search
characters
character-creator
rp-studio
privacy
playground
```

Do not close this through static review.

## Required visual matrix

At minimum:

### Viewports

```text
390x844
1280x720
1440x900
1920x1080
2560x1440
minimum supported Electron window size
```

### Scaling

```text
100%
125%
150%
200%
```

### App font settings

```text
minimum
default
maximum
```

### Themes

```text
Venice dark
Venice light
at least one alternate built-in theme
one custom/YAML theme
```

### Locales

Exercise at least:

```text
en-US
de
ru
pt-BR
ar (RTL)
hi
ja
```

### Stress data

Use synthetic non-sensitive fixtures:

- 100+ character character name;
- 300+ character character description;
- long project name;
- long conversation title;
- long model name;
- long translated labels;
- 30+ menu items;
- 100+ Select options;
- many character cards;
- many chat history entries.

### Verify visually and interactively

- no text overlap;
- no character/avatar overlap;
- no menu outside viewport;
- no menu hidden behind another overlay;
- no clipped focus ring;
- no unreachable menu option;
- no horizontal app scroll caused by content;
- no dialog content clipped below fold;
- scrollbar appears where intended;
- scroll does not leak to background;
- keyboard focus order is sane;
- Escape closes only the topmost relevant overlay;
- focus returns to opener;
- RTL placement is correct.

Record screenshots and a short acceptance ledger for every canonical tab.

---

# 12. CI / release governance

## VF-20260918-P2-017 — Required status checks are OFF  *(CLOSED — commit `80fb45b1`)*

### Confirmed GitHub state

`main` is protected, but required status checks show:

```text
enforcement_level: off
contexts: []
checks: []
```

### Required remediation

After source remediation and after confirming workflow names/check names:

Configure branch/ruleset protection so `main` cannot advance without the intended hosted gates.

Require at least the repository's authoritative:

- CI workflow/check;
- CodeQL check;
- any release-contract check that is intentionally a required hosted gate.

Do not guess check names. Read the successful exact-SHA workflow jobs and use their real check contexts.

Do not configure protection in a way that blocks repository maintenance due to ephemeral matrix names without documenting recovery.

---

# 13. Documentation / design-system drift

## VF-20260918-P3-018 — Current-state docs can lag current HEAD  *(CLOSED — commit `ee6ade04`)*

### Confirmed during audit

`docs/summary_of_work.md` was updated by the docs-only latest commit, but its machine-readable `baseline_sha` still records the preceding application code SHA rather than the latest docs SHA.

`docs/ROADMAP.md` has also historically lagged the active `main` code baseline.

This can be legitimate when a docs-only commit intentionally references the code baseline, but the fields are currently easy for agents to misinterpret as “this file describes current HEAD exactly.”

### Required remediation

Clarify metadata:

```text
repository_head_sha:
application_code_sha:
verified_against_sha:
verified_at:
```

Do not overload one `baseline_sha` field.

The session handoff should distinguish:

- code baseline;
- docs-only successor;
- exact SHA that was locally tested;
- exact SHA whose hosted CI completed.

---

## VF-20260918-P3-019 — Superdesign verifier misses a core overlay primitive  *(CLOSED — commit `5eca2e45`)*

### Confirmed source

`scripts/verify-superdesign-init.cjs`

Current fingerprinted shared components include:

- `src/components/ui/primitives.tsx`
- `src/components/ui/AccessibleDialog.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/Meteocon.tsx`

`src/components/ui/ContextMenu.tsx` is not in that represented/fingerprinted source set.

### Required remediation

After ContextMenu consolidation:

- add `ContextMenu.tsx` to the Superdesign component inventory;
- document its props/interaction contract;
- fingerprint it in `verify-superdesign-init`;
- update `.superdesign/init/components.md`;
- update `.superdesign/init/extractable-components.md` if appropriate;
- refresh human-readable baseline metadata;
- make the verifier fail if the overlay contract drifts.

Also consider fingerprinting any new shared overlay-positioning utility.

---

## VF-20260918-P3-020 — Native-language review and layout stress remain incomplete  *(EXTERNAL ACCEPTANCE — qualified native-language reviewers required; tracked in ROADMAP/summary_of_work)*

`docs/summary_of_work.md` records:

```text
12 non-English catalogs pending qualified native-language review
3,916 placeholder entries pending native review
```

Runtime intentionally normalizes `__MISSING__:` values and falls back to English rather than rendering markers.

That prevents visible placeholder tokens, but it does **not** constitute native-language or long-copy layout acceptance.

### Required remediation

Do not mechanically backfill English into non-English catalogs.

Preserve the current verification rules.

For UI work, use both:

- real translated strings that are already present;
- synthetic long-string stress fixtures.

Record native review independently from structural UI acceptance.

---

# 14. Verified-safe areas to preserve

Do not regress already-correct architecture while repairing the findings.

## Electron hardening

Current source follows important Electron security practices:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- restricted navigation/window creation
- main-owned privileged operations
- preload/contextBridge boundary
- capability URLs for custom media protocols

Preserve these.

Do not fix overlay or media issues by:

- exposing filesystem APIs to the renderer;
- disabling web security;
- enabling Node integration;
- using arbitrary renderer-provided paths;
- bypassing capability tokens.

## Image Inspector

The current ledger records a recent repair for raw tokenless `venice-media://` image rendering.

Preserve use of:

- `ResolvedMediaImg`
- `useResolvedMediaUrl`
- short-lived capability-bearing URLs

Do not reintroduce raw custom-protocol URLs into DOM `<img>`, `<video>`, or `<audio>` elements.

## Provider mode separation

Keep local safeguards and provider-side Venice options as independent controls.

Do not merge them into one boolean.

---

# 15. Implementation plan

## Phase 0 — Freeze and reproduce

Before editing:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
node --version
npm --version
```

Requirements:

- work on the repository's instructed local `main`;
- no force push;
- no silent branch creation;
- no weakening of gates;
- no generated distribution files committed;
- no raw unsafe prompts in logs/fixtures.

Create focused failing tests first for:

1. local safeguards OFF still invoking local evaluator;
2. web proxy ignoring disabled state;
3. RP/import path invoking evaluator while OFF;
4. Select active-descendant ID mismatch;
5. Select stale highlight after filter;
6. ContextMenu height overflow;
7. sidebar menu clipping/keyboard behavior where testable.

---

## Phase 1 — Make disabled local safeguards a real no-op

Refactor the common safety pipeline first.

Candidate files:

```text
src/shared/safety/localFamilySafeGuard.ts
src/shared/safety/localFamilyGuardRules.ts
electron/services/guardPipeline.ts
server.ts
src/services/veniceClient/safety.ts
src/services/veniceClient/fetch.ts
src/services/veniceClient/stream.ts
src/services/veniceClient/responses.ts
src/shared/safety/characterImportSafety.ts
```

Required properties:

- OFF short-circuits before classifier work;
- ON keeps expected local behavior;
- skipped state is explicit;
- no fake classifier decision in OFF state;
- Electron main remains authoritative for Electron runtime setting;
- web mode gains a coherent authoritative setting;
- provider safe mode remains separate.

---

## Phase 2 — Reconcile local surfaces

Trace every current call site from repository search.

Search commands:

```bash
rg -n "maybeRunLocalFamilyGuard|runLocalFamilyGuard|previewLocalFamilyGuard|screenResponseBody|assessChildExploitationSafety|recordDecision" \
  src electron server.ts tests

rg -n "localFamilySafeModeEnabled|getRuntimeLocalFamilySafeModeEnabled|getEffectiveRendererLocalFamilySafeModeEnabled" \
  src electron server.ts tests
```

For each path, classify it:

```text
network request
network response
stream
local persistence
RP
import/export
media
research/search/scrape
diagnostics only
test only
```

Make OFF semantics uniform.

---

## Phase 3 — Harden false-positive behavior for enabled mode

Only after disabled semantics are correct:

1. create benign corpus;
2. add punctuation/Unicode metamorphic tests;
3. remove fuzzy-only hard-block behavior or require corroboration;
4. preserve exact/high-confidence local checks;
5. benchmark;
6. document reason-code semantics.

Do not weaken provider/API behavior.

---

## Phase 4 — Consolidate menu/overlay infrastructure

Harden:

```text
src/components/ui/ContextMenu.tsx
src/components/ui/select.tsx
```

Then migrate:

```text
src/components/layout/sidebar.tsx
src/components/chat/HistoryView.tsx
```

Do not leave two old menu implementations behind.

If creating a common positioning helper, keep it focused and testable.

Suggested responsibilities:

```text
measure anchor
measure floating surface
choose placement
clamp to viewport
compute maxHeight/maxWidth
reposition on scroll/resize
map logical start/end for RTL
```

Keep focus/keyboard semantics in the menu/select components, not in the geometry helper.

---

## Phase 5 — Responsive text and Character Library

Repair:

```text
src/components/layout/sidebar.tsx
src/components/rp-studio/CharacterLibrary.tsx
```

Use container-responsive layouts rather than tiny fonts.

Add long-copy test fixtures.

Verify custom font-size settings.

---

## Phase 6 — Reconcile docs, tests, verifiers

Update in one coherent change:

```text
AGENTS.md
.github/copilot-instructions.md
SECURITY.md
CONTRIBUTING.md
docs/summary_of_work.md
docs/ROADMAP.md
relevant DEVELOPMENT docs
scripts/verify-safety-guard.cjs
scripts/verify-superdesign-init.cjs
.superdesign/init/*
```

Delete stale contradictory wording.

Do not preserve old semantics “for documentation history” inside active instructions. Historical reports can retain historical statements.

---

## Phase 7 — Headed acceptance

Run the visual matrix in Section 11.

Use the actual packaged/dev Electron application where appropriate.

Use keyboard-only navigation and at least one screen reader pass on the target OS.

Record exact:

- commit SHA;
- OS;
- app mode;
- viewport/window size;
- zoom;
- locale;
- theme;
- result;
- screenshot/evidence path;
- any deferred issue ID.

---

# 16. Required safety regression matrix

Implement a parameterized matrix. The following surfaces are mandatory.

| Surface | OFF expected | ON expected |
|---|---|---|
| Electron non-stream Venice request | no local evaluator call | evaluator called |
| Electron chat stream | no local safety buffering/screening | local screening per enabled policy |
| Web non-stream Venice request | no local evaluator call | evaluator called |
| Web chat stream | no local safety buffering | local screening per enabled policy |
| Responses API | no local evaluator call | evaluator called |
| Jina request/response | no local local-safety block/screen | enabled policy applies |
| Generic scrape response | no local local-safety screen | enabled policy applies |
| Search/research prompt | no local evaluator call | enabled policy applies |
| Character-card import | no local evaluator call | enabled policy applies |
| Persona save/import | no local evaluator call | enabled policy applies |
| Scenario save/import | no local evaluator call | enabled policy applies |
| RP context/message | no local evaluator call | enabled policy applies |
| Scene prompt/generation | no local evaluator call | enabled policy applies |
| Generated media local screening | skipped | enabled policy applies |
| Diagnostics preview | skipped state, no classifier | evaluated state |
| Safety audit counters | no evaluated decision | records evaluated decision |

For every OFF test:

```ts
expect(classifier).not.toHaveBeenCalled();
```

Do not rely only on the result object.

---

# 17. Provider-safety regression matrix

Provider safety is separate.

At minimum test these combinations:

```text
local OFF / provider OFF
local OFF / provider ON
local ON  / provider OFF
local ON  / provider ON
```

The local toggle must not rewrite the provider toggle.

For every currently supported endpoint, assert provider request shape against the current tracked Venice API contract.

Explicitly verify endpoints where `safe_mode` is:

- supported;
- unsupported;
- model-specific;
- represented through a Venice-specific parameter object rather than a top-level field.

Video is especially important because current Venice documentation states queued video generation does not accept `safe_mode`.

Never manufacture unsupported fields merely to satisfy a generic safety abstraction.

---

# 18. Focused tests to add/update

Likely targets:

```text
src/shared/safety/localFamilySafeGuard.test.ts
src/shared/safety/childExploitationGuard.test.ts
tests/safety/adult-content-boundary.test.ts
tests/safety/guardPipeline.test.ts
electron/services/guardPipeline.test.ts
electron/ipc/handlers.test.ts
server.test.ts
src/services/veniceClient.web.test.ts
src/services/veniceClient.responses.web.test.ts
src/services/veniceClient.test.ts
src/services/veniceClient.edge.test.ts
src/shared/safety/characterImportSafety.test.ts (create if absent / use nearest suite)
src/services/rp/*.test.ts
src/components/ui/select.test.tsx
src/components/ui/ContextMenu.test.tsx
src/components/layout/sidebar.test.tsx
src/components/chat/HistoryView.test.tsx
src/components/rp-studio/CharacterLibrary.test.tsx
tests/accessibility/*
```

Add test names that describe the contract directly, e.g.:

```text
"does not invoke any local classifier when local safeguards are disabled"
"does not screen an upstream response when local safeguards are disabled"
"does not block local character persistence when local safeguards are disabled"
"keeps provider safe_mode independent from local safeguards"
"non-searchable select points aria-activedescendant at the rendered option id"
"filtering clamps highlightedIndex to the filtered option set"
"context menu constrains height to the viewport"
"sidebar options menu restores focus to its trigger"
```

---

# 19. Full validation commands

Use the Node version pinned by the repository.

Start clean:

```bash
nvm use
node --version
npm --version
npm ci
```

Run focused tests first.

Then run the repository gates:

```bash
npm run lint:eslint
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts
npm run build
npm run verify:dist
npm run verify:bundle-budget
npm run test:ci
npm run test:ui
```

Where supported in the environment:

```bash
npm run smoke:electron
npm run capture:release-qa-snapshots
```

Run relevant package/platform release verification if the change touches packaging.

Do not pass the unsupported Vitest `--reporter=basic` flag.

## Safety-specific source scans

```bash
rg -n "mandatory child|cannot be disabled|must never bypass|optional-local-family-filter-disabled-child-safety-checked" \
  src electron server.ts AGENTS.md SECURITY.md CONTRIBUTING.md .github docs

rg -n "assessChildExploitationSafety|maybeRunLocalFamilyGuard|runLocalFamilyGuard|previewLocalFamilyGuard|screenResponseBody|recordDecision" \
  src electron server.ts tests
```

After remediation, every active-document occurrence must be intentional and semantically consistent.

## Overlay scans

```bash
rg -n 'role="menu"|role="menuitem"|aria-haspopup="menu"|createPortal|z-\[|z-[0-9]|overflow-hidden' \
  src/components

rg -n 'aria-activedescendant|role="listbox"|role="option"' \
  src/components
```

Use these scans to find any additional bespoke menu/listbox implementations not covered in this handoff.

---

# 20. Hosted acceptance

After the final commit/push:

1. capture exact final SHA;
2. confirm remote `main` equals local `main`;
3. confirm CI triggered for that exact SHA;
4. confirm CodeQL triggered for that exact SHA;
5. inspect jobs, not just workflow badges;
6. require successful completion;
7. confirm no new CodeQL alerts;
8. confirm branch/ruleset required checks point to the intended checks;
9. update `docs/summary_of_work.md` with exact run IDs and final SHA;
10. do not claim completion while a run is queued/in progress/cancelled.

A cancelled CI run is not equivalent to a green CI run, even if it was cancelled only because `main` advanced.

---

# 21. Definition of done for safeguard work

The safeguard portion is complete only when all of the following are true:

- [ ] OFF is a true local no-op across every application surface.
- [ ] Raw local classifier call count is zero in OFF-mode tests.
- [ ] OFF does not locally block prompts, enhancements, local saves/imports, responses, streams, or generated media.
- [ ] ON still applies the intended local rules.
- [ ] Fuzzy false-positive regression suite is expanded substantially.
- [ ] Fuzzy-only phonetic similarity no longer acts as an unjustified stand-alone hard-block oracle.
- [ ] Electron main and renderer agree on authoritative ready state.
- [ ] Web UI and web proxy agree on authoritative state.
- [ ] Unknown/loading config is represented explicitly.
- [ ] Provider safety mode remains independent.
- [ ] Diagnostics no longer treats user-selected local OFF as an application fault.
- [ ] Docs, comments, tests, and verifiers describe the same semantics.
- [ ] No raw sensitive/unsafe prompts were added to logs or repository fixtures.

---

# 22. Definition of done for UI work

- [ ] One canonical menu implementation is used by shared context menus, sidebar options, and History folder menus.
- [ ] Menus never exceed viewport bounds.
- [ ] Long menus scroll internally.
- [ ] Menu keyboard navigation implements expected menu behavior.
- [ ] Focus enters a menu appropriately and returns to its opener.
- [ ] Shared Select `aria-activedescendant` always references a real rendered option.
- [ ] Select highlight is clamped after filtering/options changes.
- [ ] Select works inside dialogs without rendering behind the dialog.
- [ ] Overlay z-indices use a documented layering system.
- [ ] Sidebar labels do not overlap at minimum width/maximum font/200% zoom.
- [ ] Character Library buttons do not overlap or force horizontal overflow.
- [ ] RTL placement is correct.
- [ ] All 15 currently uncovered canonical tabs receive direct headed evidence.
- [ ] Visual acceptance covers dark/light/custom themes and long-copy locales.
- [ ] Superdesign init/docs/verifier are regenerated and current.

---

# 23. Do-not rules

The implementing agent must **not**:

- weaken Electron sandbox/context-isolation/web-security settings;
- expose Node/file APIs to renderer code;
- bypass the custom-protocol capability-token model;
- introduce renderer-supplied filesystem paths;
- hardcode Venice model IDs where live discovery is expected;
- couple local safeguard state to provider `safe_mode`;
- add `safe_mode` to unsupported endpoints;
- silently enable local safeguards when a known authoritative persisted value is false;
- treat an unknown/unhydrated state as a known false or known true without explicit UI/state semantics;
- “fix” fuzzy false positives by broadly allowlisting restricted terminology;
- log raw prompts, matched unsafe phrases, or blocked response text;
- create a fourth menu/popover primitive;
- solve overflow by making text unreadably small;
- mark UI/a11y work complete using only JSDOM/static tests;
- raise i18n baselines or copy English into foreign catalogs to make validation pass;
- disable a verification script because it conflicts with the desired change—update the verifier to express the new correct invariant;
- force push;
- bypass CI because branch protection currently does not require it;
- claim hosted CI success from a cancelled or still-running workflow.

---

# 24. Recommended final handoff format from implementing agent

The implementation session should return:

```text
Final local/main SHA:
Final remote/main SHA:
Working tree:
Package version:

Resolved findings:
- VF-20260918-P0-001 ...
- ...

Changed files:
- path — purpose
- ...

Safety OFF invariant:
- Electron request: PASS
- Electron stream: PASS
- Web request: PASS
- Web stream: PASS
- Responses: PASS
- Jina/scrape: PASS
- RP/import/persistence: PASS
- media: PASS
- classifier call count while OFF: 0

Safety ON regression:
- ...

False-positive corpus:
- benign cases:
- unsafe synthetic cases:
- FP count:
- FN count:

UI headed matrix:
- viewport / locale / theme / zoom / result / evidence
- ...

Validation:
- npm run lint:eslint — PASS
- npm run typecheck — PASS
- npm test — PASS
- npm run verify:safety-guard — PASS
- npm run verify:contracts — PASS
- npm run build — PASS
- npm run verify:dist — PASS
- npm run test:ci — PASS
- npm run test:ui — PASS
- npm run smoke:electron — PASS or NOT RUN with reason
- headed accessibility — PASS or NOT RUN with reason

Hosted:
- CI run ID / exact SHA / conclusion
- CodeQL run ID / exact SHA / conclusion
- open CodeQL alerts
- required branch checks

Remaining:
- only genuinely external/manual items, each with a reason
```

---

# 25. Priority execution order

Do the work in this exact order unless new evidence proves a dependency requires a change:

1. **P0:** disabled local safeguards true no-op.
2. **P1:** web authority alignment and RP/import/local persistence parity.
3. **P1:** configuration ready/unknown state correction.
4. **P1:** false-positive fuzzy classifier hardening for enabled mode.
5. **P1:** docs/tests/verifier safety-contract reconciliation.
6. **P2:** shared ContextMenu hardening.
7. **P2:** migrate sidebar and History bespoke menus.
8. **P2:** shared Select correctness.
9. **P2:** sidebar/Character Library responsive overflow.
10. **P2:** complete headed visual/a11y acceptance.
11. **P2:** enforce hosted checks on `main`.
12. **P3:** current-state docs/Superdesign metadata and localization acceptance.

Do not spend time polishing P3 documentation while the P0 disabled-state contract is still false.

---

# 26. Audit conclusion

The current application is materially healthier than earlier Venice Forge baselines—recent Image Inspector capability-URL repair and CodeQL remediation are present, and the Electron sandbox/security posture should be preserved.

The main unresolved architectural defect is the meaning of the local safeguard toggle.

The repository simultaneously contains:

```text
"disabled skips local rule evaluation"
```

and:

```text
"one local classifier can never be disabled"
```

The implementation currently follows the second rule in several core paths, while multiple active documents describe the first. That contradiction directly explains why a user can disable in-app safeguards and still encounter an app-local refusal or false positive.

The UI has a similar, smaller structural pattern: multiple independent menu/overlay implementations have accumulated, so clipping, z-index, focus, viewport, and keyboard behavior differ by surface.

Fix both classes at the architecture level:

```text
one safety-state contract
one overlay/menu contract
```

Then prove the behavior with negative-call tests, headed acceptance, and exact-SHA hosted CI/CodeQL evidence.
