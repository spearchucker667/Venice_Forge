# Venice Forge — Current-Main Deep Audit & Remediation Agent Handoff

> **Audit date:** 2026-09-16  
> **Repository:** `spearchucker667/Venice_Forge`  
> **Canonical local root:** `/Users/super_user/Projects/Venice_Forge`  
> **Branch:** `main`  
> **Audited HEAD:** `59b61c43c2aea95fb806cd081894dad0154714ea`  
> **Commit:** `fix: reject incomplete SSE chat responses`  
> **Package:** `3.0.0-beta.3`  
> **Runtime:** Node `>=22.15.0 <23.0.0`, npm `>=10`  
> **Stack:** Electron / React 19 / Vite / TypeScript strict / Zustand / IndexedDB

## Mission

Remediate every **currently reproducible** issue in this handoff against the then-current `main`. Current source/tests/CI outrank historical audits. If `main` moves, revalidate before changing code.

Operating constraints:

- work only on `main`;
- no feature branches, worktrees, or PRs;
- never force-push or rewrite published history;
- preserve mandatory child-safety, privacy, secure storage, renderer/main isolation, profile isolation, theme/i18n, and release gates;
- write/strengthen regression coverage before behavior changes where practical;
- push only after local validation;
- verify local SHA equals remote `main`;
- verify hosted CI and CodeQL on that exact final SHA.

## Audit Method

This is a fresh current-main review. It combines:

- direct inspection of current source and current four-commit delta;
- revalidation of high-risk trust/safety/network boundaries;
- broad searches for `TODO`, `FIXME`, `not implemented`, skips, `eval`, `child_process`, raw fetches, secret handling, safety-gate call sites, and stale contracts;
- reconciliation against the prior exhaustive audit lineage as **coverage history only**;
- current Electron, Zustand, React, and Google API documentation through Context7;
- Superdesign init-contract review;
- exact-SHA GitHub CI and CodeQL review.

No fresh headed Browser/Computer execution was available in this session. Headed visual, keyboard, screen-reader, funded-provider, clean-install, and two-device checks are therefore explicit acceptance tasks rather than invented pass/fail claims.

## Current Repository Posture

Current exact SHA:

```text
59b61c43c2aea95fb806cd081894dad0154714ea
```

Current CI and CodeQL are green on that SHA. Current CI includes successful lint/typecheck, unit/integration, contracts, coverage, build/release readiness, platform-sensitive tests, and packaged Electron smoke on Linux, Windows, and macOS.

**Do not start this work order by weakening or "repairing" green CI.**

## Executive Findings

| ID | Sev | Area | Finding |
|---|---:|---|---|
| `VF-AUD-20260916-P1-001` | P1 | Safety/SSE | `SafetyGatedSse` screens individual events without bounded cross-event semantic context |
| `VF-AUD-20260916-P2-001` | P2 | Superdesign | Init bundle can contain source-inaccurate component contracts while verifier stays green |
| `VF-AUD-20260916-P2-002` | P2 | Attachments | Selection budgets raw chunk text but not rendered provenance-envelope overhead |
| `VF-AUD-20260916-P2-003` | P2 | Web Chat | Web FSM withholds/replays the full client stream, defeating visible streaming and duplicating memory |
| `VF-AUD-20260916-P2-004` | P2 | Secrets | Google connection tests place API keys in URL queries; redaction does not reliably cover bare `key=` |
| `VF-AUD-20260916-P2-005` | P2 | Media Proxy | FSM media path can hold about 256 MiB per response and then duplicate via `Buffer.concat` |
| `VF-AUD-20260916-P3-001` | P3 | Jina | API-key test lacks bounded timeout and explicit body cleanup |
| `VF-AUD-20260916-P3-002` | P3 | Docs | Current-authority ROADMAP/security/work-summary prose is stale after the last four commits |
| `VF-AUD-20260916-P2-006` | P2 | Media Safety | Semantic image/audio/video classification remains unavailable by default |
| `VF-AUD-20260916-P2-007` | P2 | UI/A11y | Direct visual/headed acceptance does not cover all 22 canonical tabs |

Totals:

```text
P1: 1
P2: 7
P3: 2
Total: 10
```

No fresh P0 was confirmed.


---

## VF-AUD-20260916-P1-001 — Cross-Event SSE Safety Context

**Files:** `src/services/safetyGatedSse.ts`, `server.ts`, `src/shared/safety/localFamilySafeGuard.ts`

Current server streaming is materially improved: bytes are incrementally decoded, complete SSE events are reconstructed, an event is screened, and approved events are released. This preserves approve-before-release.

The remaining weakness is semantic scope. The gate primarily evaluates each current SSE event's data in isolation. Provider chat semantics are continuous across events. A classifier-relevant phrase/relation split across adjacent deltas can be absent from every individual event even though the assembled assistant text is unsafe.

This is a **P1 safety-control completeness risk**, not a claim that an exploit was demonstrated.

### Required repair

Decode provider event JSON and maintain a **bounded rolling semantic window** per relevant choice/index:

```text
upstream bytes
→ UTF-8 decoder
→ SSE decoder
→ extract choices[].delta.content / applicable reasoning
→ append to bounded rolling text
→ classify rolling text including current delta
→ release original event only if allowed
```

Do not accumulate the entire stream indefinitely. Preserve Unicode boundaries and independent choice streams.

Do **not** misstate the product contract: this finding concerns the enabled response-screening path. It is not a claim that mandatory outbound child-safety must screen arbitrary third-party output when optional Family Safe Mode is off.

### Tests

- event A safe in isolation + event B safe in isolation + A+B unsafe → B must not release;
- unsafe semantic relation split across 3 events;
- safe multi-event response;
- UTF-8 split across network chunks;
- JSON/SSE event split across chunks;
- multiple choices;
- reasoning deltas where applicable;
- heartbeat/comment events;
- `[DONE]`;
- classifier exception/failure;
- cancellation;
- incomplete stream handling remains correct.

### Acceptance

Streaming stays incremental, memory is bounded, classifier failure retains fail-closed behavior where required, and split-event unsafe context cannot be released piecewise.


---

## VF-AUD-20260916-P2-001 — Superdesign Init/Verifier Source Drift

**Files:** `.superdesign/init/*`, `scripts/verify-superdesign-init.cjs`, `src/components/ui/AccessibleDialog.tsx`

Concrete current mismatch:

- Superdesign component/extraction material describes an `AccessibleDialog` `open` prop.
- Current `AccessibleDialog.tsx` does **not** expose `open`; current props include `title`, `description`, `children`, `onClose`, `initialFocusRef`, `headerAction`, `panelRef`, `panelClassName`, `closeOnBackdrop`, and `zIndexClassName`.

The verifier still passes because its fingerprints/checks cover only a subset of the source represented by the init artifact. Current `components.md`/`layouts.md` are also more summary-oriented than the strongest current Superdesign existing-codebase contract, which expects source-grounded reusable component/layout context.

The old blue/cyan theme-staleness finding is closed; current init theme material reflects the crimson/near-black redesign.

### Required repair

Regenerate all six files from current HEAD:

```text
components.md
layouts.md
routes.md
theme.md
pages.md
extractable-components.md
```

Track every represented component/layout source in a machine-readable manifest or equivalent aggregate fingerprint. A represented component signature change must make `verify:superdesign-init` fail until regeneration.

### Tests/acceptance

- no nonexistent `AccessibleDialog.open`;
- component/layout signatures are source-derived;
- represented source list is complete;
- mutate a representative prop in a fixture → verifier fails;
- regenerate → verifier passes;
- route/theme snapshots match current sources.


---

## VF-AUD-20260916-P2-002 — Attachment Envelope Overhead Missing From Selection Budget

**Files:** `src/services/ingestion/attachmentChunking.ts`, `attachmentContextSelection.ts`, `chatContextBudget.ts`, `chatPromptCompiler.ts`, `use-chat.ts`

Current attachment handling is model-aware and chunk-based, fixing the old static 1 MiB provider-context ceiling. The remaining accounting mismatch is:

```text
estimate/select RAW chunk text
→ then wrap selected chunks in external_attachment provenance/instruction envelopes
→ compiler later budgets actual rendered request
```

Repeated wrapper text, metadata, separators, long filenames, and MIME strings consume tokens. With many chunks/files near the context ceiling, selection can report that content fits while the compiler subsequently compacts/truncates the rendered provider context.

### Required repair

Budget the actual rendered representation. Either:

1. estimate each chunk **including** its opening/closing envelope, metadata, instructions, and separators; or
2. group selected chunks per attachment into one envelope and estimate that exact rendering.

### Required invariant

If attachment selection reports that its selected provider context fits the current allowance, the prompt compiler must not immediately truncate solely because the selector ignored attachment-rendering overhead.

### Tests

Use 1/10/50+ chunks, multiple files, long names/MIME, 128K/200K/1M/unknown models, long system prompt/history/memory/output reserve, and partial inclusion. Verify metadata accurately describes what was actually sent.


---

## VF-AUD-20260916-P2-003 — Web FSM Still Defeats Visible Streaming

**Files:** `src/services/veniceClient/stream.ts`, related web tests

With Family Safe Mode enabled on web, the client accumulates aggregate content/reasoning and a withheld-delta queue until terminal completion, screens the aggregate, then replays approved deltas.

Consequences:

- network streaming does not become visible incremental UI output;
- long responses retain aggregate strings plus the full delta array;
- client duplicates whole-output safety work now that the server has gated SSE.

### Critical ordering

Do **not** delete this aggregate gate before closing `VF-AUD-20260916-P1-001`. At current HEAD, the aggregate client check compensates for the server gate's event-local semantic scope.

### Required sequence

1. fix server cross-event rolling safety context;
2. prove split-event unsafe text is blocked server-side;
3. switch web client to incremental delivery of approved deltas;
4. retain only bounded state required for rendering/completion/recovery or intentional defense-in-depth.

### Acceptance

The first approved safe delta reaches the consumer before `[DONE]`; no duplicate/out-of-order replay; incomplete streams remain rejected; large safe output does not require a duplicate full withheld-delta queue.


---

## VF-AUD-20260916-P2-004 — Google API Keys in Query URLs / Redaction Gap

**Files:** `electron/ipc/handlers/apiKeyHandlers.ts`, `src/shared/redaction.ts`

Current connection tests construct URL-query credentials for Gemini and Vertex Express. Current official Gemini REST documentation supports:

```http
x-goog-api-key: <API_KEY>
```

so the Gemini query credential is avoidable.

Shared redaction recognizes concepts such as `apiKey`, token, secret, credential, and authorization, but a bare URL query parameter `key=` is not a reliable sensitive-key match. Google `AIza...` keys are also not best protected by relying only on generic provider-token patterns.

### Required repair

For Gemini:

```text
URL: https://generativelanguage.googleapis.com/v1beta/models
Header: x-goog-api-key: <key>
```

For Vertex Express, reverify the endpoint-specific auth contract. If a header is supported, prefer it. If query auth is required for that API mode, preserve functionality but guarantee redaction.

Make URL/query redaction context-aware for:

```text
key
api_key
apiKey
x-goog-api-key
```

Avoid blindly treating every ordinary object field named `key` as secret unless policy explicitly wants that behavior.

### Tests

- Gemini request URL contains no secret;
- Gemini header carries key;
- URL redaction masks `?key=`, `?api_key=`, `?apiKey=`;
- diagnostics/errors redact Google keys;
- ordinary non-secret object `key` behavior remains intentional.


---

## VF-AUD-20260916-P2-005 — Family-Safe Media Proxy Heap Amplification

**File:** `server.ts`

Current Family-Safe media handling collects response chunks in memory, permits roughly a 256 MiB response ceiling by default, then creates a combined allocation with `Buffer.concat(chunks)` before screening/release.

Near the cap, one request can therefore retain close to the full body plus a second combined allocation. Concurrent media requests multiply this pressure.

This matters especially because semantic audio/video classification is not currently available by default and image fallback may be structural, so hundreds of MiB can be retained without proportional semantic-screening value.

### Required repair options

Prefer a combination of:

- realistic type-specific caps based on actual provider output limits;
- temp-file spooling for large media with guaranteed cleanup;
- bounded prefix/header/container validation for structural checks;
- separately bounded classifier input rather than full raw media in JS heap.

Do **not** solve memory pressure by releasing bytes before a required screen.

### Tests

Small response, near cap, over cap, client/upstream abort, screen block/error, parallel responses, cleanup of any temporary artifacts, and a resource/memory smoke check.


---

## VF-AUD-20260916-P3-001 — Jina Key Test Timeout/Body Cleanup

**File:** `electron/ipc/handlers/jinaHandlers.ts`

The ordinary Jina request path has bounded cancellation/timeout behavior. `jinaApiKey:test` performs a direct fetch, checks `response.ok`, and returns without equivalent timeout handling or explicit body cancellation/draining.

### Required repair

Use a shared or explicit `AbortController` timeout (prefer existing product constants; otherwise a short 10–15 s connection-test bound), clear the timer in `finally`, and cancel/drain an unused body.

Map errors distinctly:

```text
invalid key
timeout
network unavailable
provider failure
```

without leaking credentials.

### Tests

Success, 401/403, provider 5xx, never-resolving fetch with fake timers, AbortError mapping, body cancellation, timer cleanup.


---

## VF-AUD-20260916-P3-002 — Current Authority Docs Lag Current HEAD

**Files:** `docs/ROADMAP.md`, `docs/summary_of_work.md`, `SECURITY.md`

Current-authority prose still contains state from before the last remediation commits, including claims equivalent to:

- SSE completion handling is uncommitted;
- remediation work is uncommitted;
- hosted CI/CodeQL have not been rerun;
- older remediation baseline still pending exact-SHA verification.

Current HEAD is already the incomplete-SSE fix and CI/CodeQL are green.

`SECURITY.md` also describes sender validation in terms of preferring `senderFrame` over a `sender.getURL()` fallback, while current `validateIpcSender.ts` has already been hardened to fail closed without initiating-frame identity. Response-screening architecture has also evolved.

### Required repair

Keep immutable historical records historical, but refresh explicit **current state** sections.

Recommended current-state metadata:

```text
baseline SHA
verified timestamp/date
package version
CI status
CodeQL status
open finding IDs
external acceptance still outstanding
```

Optionally make only this small state block machine-readable to reduce drift; do not build a brittle prose parser.


---

## VF-AUD-20260916-P2-006 — Semantic Generated-Media Screening Gap

**File:** `src/shared/safety/mediaScreener.ts`

This is a capability gap, not a hidden broken classifier.

Current defaults truthfully indicate:

- image semantic classifier unavailable unless a runtime backend is registered;
- structural image validation exists;
- audio semantic classifier unavailable;
- video semantic classifier unavailable.

Preserve:

```text
structural validation != semantic content classification
```

If semantic screening is a release requirement, create a separate approved implementation plan covering local/private architecture, model license/provenance, supply-chain validation, macOS/Windows/Apple-Silicon footprint, model distribution, offline behavior, calibration corpus, false-positive/false-negative evaluation, failure policy, and diagnostics.

Do not silently send user/generated media to an external moderation service if that conflicts with local-first/privacy promises.

Definition of done is either a real tested semantic backend or an explicit truthful "unavailable" capability state.


---

## VF-AUD-20260916-P2-007 — Incomplete Direct Visual/Headed Acceptance

**Files:** `src/config/tabs.ts`, `docs/design/reference-ui-redesign-evidence/EVIDENCE_MANIFEST.json`

Current canonical registry has 22 tabs:

```text
Chat
Character Chats
History
Image Studio
Media Studio
Image Inspector
Prompt Library
Scene Composer
Audio
Music
Video
Embeddings
Search
Characters
Character Creator
RP Studio
Workflows
Documents
Privacy
Playground
Settings
Status
```

Current reference-redesign evidence records 36 captures across 9 surface families, 4 presets, 5 viewport categories, with no capture failures. That is useful evidence but not direct per-tab acceptance.

At least these 15 canonical tabs lack direct dedicated surface evidence:

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

### Required headed acceptance

Every canonical tab: at least default dark + desktop headed render.

Higher-risk surfaces: representative light/alternate-dark, Arabic RTL, compact/narrow/mobile where supported, and ultrawide where useful.

Also cover overlays:

```text
API-key dialogs
Task Center
Inspector
Diagnostics Drawer
Command Palette
first-run/onboarding
master-password/security dialogs
confirmation/text dialogs
popovers/context menus
model picker
theme import/export
```

Representative complex screens additionally need keyboard-only navigation, logical/visible focus, modal focus trap/restore, Escape, screen-reader accessible names, 200% zoom, reduced motion, and RTL.

No fresh Browser/Computer execution was available during this audit, so this remains an acceptance gap rather than a claim that those screens visually fail.


---

## Security Non-Regression Rules

Do not weaken any of the following while fixing the audit:

### Mandatory child safety

- never remove/bypass/optionalize mandatory child-safety checks;
- do not "fix" false positives by skipping required user/attachment/memory content;
- use provenance/context-aware interpretation rather than bypasses.

### Response safety

- do not release bytes before required screening;
- do not treat classifier failure as allow where fail-closed is required;
- do not disable Family Safe Mode to restore streaming.

### Electron

Preserve:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
strict IPC sender-frame validation
navigation/new-window restrictions
permission controls
preload allowlists
```

Do not reintroduce the old privileged sender URL fallback.

### Files/secrets

- do not broaden arbitrary renderer filesystem access;
- preserve capability-scoped media/file access;
- keep API keys out of logs/diagnostics/renderer persistence/URLs when avoidable;
- do not introduce unsanitized HTML injection.

### Gates

Do not delete/skip tests or turn security/contract failures into warnings merely to get green.


---

## Previously Fixed — Do Not Reopen Without Current Reproduction

The following older findings are closed/superseded on current main:

```text
model normalization / silent 8K fallback
old fixed 1 MiB provider attachment-context ceiling
attachment provenance false-positive architecture
attachment metadata escaping
safety-blocked turn persistence
workflow/playground async hydration arbitration
profile volatile reset coverage
media patchMany partial-success contract
502/504 retry parity
general Electron BrowserWindow/session hardening
privileged IPC missing-frame fallback
Windows PowerShell path
strict i18n blocker
respectRobotsTxt no-op public option
duplicate theme border tokens
old "20 top-level tabs" AGENT_REINITIALIZATION drift
old blue/cyan Superdesign theme snapshot
whole-response server chat buffering
missing SSE [DONE] completion enforcement
failing CI/CodeQL
```

Current HEAD itself is the incomplete-SSE rejection fix.

Do not reintroduce old architecture while closing the new findings.


---

## External / Manual Acceptance — Track Separately

These are release-readiness tasks, not automatically source defects.

### macOS

```text
signed artifact
notarization
stapling
codesign verification
Gatekeeper/spctl
clean-machine install/launch
upgrade behavior
```

### Windows

```text
signed NSIS installer
signature verification
clean-machine install
first launch
upgrade
uninstall
data retention/deletion behavior
```

### Funded provider E2E

Only with explicit authorization and funded credentials. Cover paid image/video/audio/music integrations claimed by release docs, including cancellation, failure propagation, restart/task recovery, and cost metadata where supported.

### Two-device sync

```text
A creates → B receives
B edits → A receives
delete/tombstone
concurrent conflict
offline edit
reconnect
restart
interruption recovery
```

### Native-language review

`en-US` has human-review status; production locales such as `ar`, `de`, `es`, `fr`, `hi`, `ja`, `ko`, `pt-BR`, `ru`, `sv`, and `zh-CN` remain machine-first-pass/unreviewed in current review-status data.

### Headed accessibility

Keyboard, screen reader, focus order/trap/restore, zoom, reduced motion, RTL, and long-string/high-density states.


---

## Remediation Order

### Phase 0 — Freeze baseline

```bash
cd /Users/super_user/Projects/Venice_Forge
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --oneline
node --version
npm --version
```

Expected handoff baseline:

```text
main
59b61c43c2aea95fb806cd081894dad0154714ea
```

If changed, revalidate every finding first.

### Phase 1 — Safety streaming

1. close `P1-001` with rolling cross-event semantic screening;
2. prove split-event unsafe text is blocked;
3. then close `P2-003` by restoring visible web streaming without weakening safety.

### Phase 2 — Secret custody/resource safety

Close `P2-004` and `P2-005`.

### Phase 3 — Attachment budget correctness

Close `P2-002` and add the selector↔compiler invariant test.

### Phase 4 — Tooling/reliability/docs

Close `P2-001`, `P3-001`, and `P3-002`.

### Phase 5 — Capability/acceptance

Address `P2-006` and `P2-007` via explicit approved implementation/acceptance work; do not fake closure.

### Phase 6 — External release acceptance

Signing/notarization, clean installs, funded-provider tests, two-device sync, native-language review, headed accessibility.


---

## Required Regression Matrix

### SSE safety

```text
2-event split unsafe
3-event split unsafe
safe multi-event
UTF-8 chunk split
JSON/SSE network split
multi-choice
reasoning content
heartbeat/comment
[DONE]
missing [DONE]
classifier error
client/upstream cancel
```

### Web stream

```text
safe first delta visible pre-DONE
no duplicate replay
no out-of-order replay
incomplete stream rejected
large completion without duplicate withheld queue
```

### Attachments

```text
1 / 10 / 50+ chunks
multiple attachments
long names/MIME
128K / 200K / 1M / unknown model
large system/history/memory/output reserve
partial inclusion
```

### Secret redaction

```text
Gemini header auth
no Gemini query secret
?key=
?api_key=
?apiKey=
x-goog-api-key
Google key in errors/diagnostics
ordinary non-secret object "key"
```

### Media proxy

```text
small
near-cap
over-cap
abort
screen block/error
parallel responses
temp cleanup if used
```

### Superdesign

```text
six files
non-empty
source-current component signatures
complete represented-source manifest
signature mutation invalidates verifier
current routes/theme/baseline
```

### Jina

```text
success
401/403
5xx
timeout
AbortError
body cleanup
timer cleanup
```


---

## Local Validation

Run focused tests continuously.

Before final publication, run at minimum:

```bash
npm ci
npm run lint:eslint
npm run typecheck
npm test
npm run verify:contracts
npm run verify:safety-guard
npm run verify:theme-tokens
npm run verify:i18n
npm run verify:i18n-hardcoded-regressions
npm run verify:superdesign-init
npm run verify:release-readiness
npm run build
npm run verify:dist
```

Run every additional subsystem verifier touched by the changes.

If a new verifier is added, wire it into the appropriate canonical gate rather than leaving it optional.


---

## Visual / Theme / Locale Matrix

Representative themes:

```text
Venice/default dark
light
Nord
one custom theme
one YAML-imported theme
```

Representative locales:

```text
en-US
de
pt-BR
ar
```

Representative viewports:

```text
1280×720
1440×900
1920×1080
compact
narrow/mobile where supported
ultrawide for multi-pane views
```

Drive tab scope from `src/config/tabs.ts`, not copied prose.


---

## Git / Publication Rules

Work only on `main`.

Never:

```text
create a feature branch
create a worktree
open a PR
force-push
force-with-lease
rewrite published history
discard unrelated user changes
weaken tests/verifiers
```

Before each commit:

```bash
git status --short
git diff --check
```

Push:

```bash
git push origin main
```

Then verify:

```bash
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
printf 'local  %s
remote %s
' "$LOCAL_SHA" "$REMOTE_SHA"
test "$LOCAL_SHA" = "$REMOTE_SHA"
```

Inspect hosted CI and CodeQL for that exact final SHA.


---

## Documentation Requirements

After implementation, update current authority as appropriate:

```text
docs/summary_of_work.md
docs/ROADMAP.md
SECURITY.md
docs/DOCS_INDEX.md
AGENT_REINITIALIZATION.md
docs/design/
.superdesign/init/
```

Do not rewrite historical audit records.

For each closed finding record:

```text
finding ID
root cause
files changed
tests added
focused validation
full validation
commit SHA
hosted CI
CodeQL
remaining limitations
```


---

## Definition of Done

Complete only when:

- cross-event SSE semantic safety is bounded and proven;
- web FSM visibly streams approved deltas without losing safety;
- attachment selector includes rendered envelope overhead;
- Gemini test no longer puts its key in URL; any unavoidable key query is redaction-safe;
- large FSM media responses no longer imply excessive duplicated JS heap;
- Superdesign init signatures are source-current and verifier scope matches artifact scope;
- Jina key-test timeout/resource cleanup is fixed;
- current authority docs match actual final behavior/SHA;
- semantic media capability is real or explicitly remains unavailable;
- all 22 canonical tabs have direct headed visual evidence;
- representative accessibility/RTL/theme/viewport matrix is complete;
- focused and full local tests pass;
- build/release readiness passes;
- final `main` is pushed without rewrite;
- remote SHA equals local SHA;
- hosted CI and CodeQL pass on that exact SHA;
- any incomplete external/manual acceptance remains explicitly open.


---

## Required Final Agent Report

Return:

```text
Starting SHA:
Final local SHA:
Final remote SHA:

Findings closed:
Findings rejected — not reproducible:
Findings intentionally left open:
New findings discovered:

Files changed:

Tests added/updated:

Focused validation:
Full local validation:
Build/release validation:

Hosted CI:
CodeQL:

Visual QA:
Accessibility QA:
Theme matrix:
Locale/RTL matrix:

External acceptance outstanding:

Docs updated:

Known limitations:
```

If a listed finding cannot be reproduced on the then-current `main`, do not patch it. Mark:

```text
REJECTED — NOT REPRODUCIBLE ON CURRENT HEAD
```

and include the evidence.
