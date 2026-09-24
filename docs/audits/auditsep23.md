# Venice Forge — Media, Character, Documents, Theme & Status Remediation Handoff

## Assignment

Perform a root-cause-driven remediation pass over the current Venice Forge `main` worktree covering the newly reported Media Studio, prompt editor, Character Creator, character-chat prompt isolation, Documents, theme contrast, and System → Status defects.

This is an **implementation assignment**, not a speculative redesign.

Do not patch symptoms before tracing the current implementation. Reuse canonical services, request builders, stores, renderers, theme tokens, persistence paths, IPC boundaries, and test infrastructure wherever they already exist.

Repository:

```text
/Users/super_user/Projects/Venice_Forge
```

Expected branch:

```text
main
```

Do not create a feature branch. Never force-push. Preserve all unrelated user changes.

---

# 1. Required repository initialization

Before changing anything:

```bash
set -euo pipefail

cd /Users/super_user/Projects/Venice_Forge

printf '\n=== Repository ===\n'
git rev-parse --show-toplevel
git branch --show-current
git status --short
git log -1 --oneline

printf '\n=== Runtime ===\n'
node --version
npm --version

printf '\n=== Required files ===\n'
test -f AGENTS.md
test -f AGENT_REINITIALIZATION.md
test -f package.json
test -f package-lock.json
test -d src
test -d electron
```

The branch must be `main`.

Do **not** automatically reset, checkout, stash, clean, or discard user-owned changes.

Read, in order:

1. `AGENTS.md`
2. `AGENT_REINITIALIZATION.md`
3. `docs/summary_of_work.md`
4. `docs/DOCS_INDEX.md`
5. `docs/ROADMAP.md`
6. `docs/reference/Venice_swagger_api.yaml`
7. `docs/reference/Venice_api_LLM_info.md`
8. Relevant source/tests for each workstream below

Also inspect the existing `.superdesign/init/` design context, especially theme/layout/component documentation, before making UI-token or layout changes.

Treat historical audits as evidence, not current truth.

---

# 2. Non-negotiable architecture constraints

Preserve these invariants throughout the remediation:

- Renderer must not gain arbitrary filesystem, shell, child-process, secure-storage, or raw-key access.
- Venice requests must continue through the canonical Venice client/adapters.
- Do not introduce component-local `fetch()` calls to Venice.
- Keep Electron and web transports contract-compatible.
- Runtime model metadata remains authoritative for capability gating.
- Do not infer model capabilities solely from model names.
- Generated binary media must remain validated before durable persistence.
- Do not persist large image data URLs inside normal Zustand/task records.
- Media operations must preserve Media Studio lineage and stable media IDs.
- No API key, prompt body, system prompt, image bytes, base64 payload, signed URL, or private filesystem path may be written into diagnostics.
- Family Safe Mode and mandatory safety paths must not be weakened as part of these fixes.
- Do not rewrite tests/verifiers merely to make validation green.
- Visible UI additions must use localization infrastructure rather than new hardcoded English debt.
- Do not introduce a duplicate Markdown renderer, theme engine, prompt composition path, character store, media store, or document ingestion pipeline.

---

# 3. Initial forensic searches

Run targeted searches before editing:

```bash
rg -n \
  "SCHEMA_REPAIR_FAILED|Failed to reach Venice API|schema.?repair|repair request" \
  src electron tests

rg -n \
  "MEDIA CLASSIFIER CAPABILITIES|Registered backend|semantic content classification|classifier" \
  src electron tests

rg -n \
  "upscale|background-remove|background removal|image/edit|multi-edit|Media Studio|MediaStudio" \
  src electron tests

rg -n \
  "format.*webp|format.*png|imageFormat|outputFormat|mime" \
  src electron tests

rg -n \
  "userSystemPrompt|systemPrompt|includeVenice|venice.*prompt|character.*prompt|localCharacter" \
  src electron tests

rg -n \
  "textarea|prompt.*height|resize|overflow-y|Prompt" \
  src electron tests

rg -n \
  "document.*ingest|ingestion|supportedExtensions|mime|file extension|markdown|katex|latex|remark|rehype" \
  src electron tests

rg -n \
  "theme|foreground|muted|popover|menu|contrast|text-primary|text-secondary" \
  src config tests
```

For each reported issue, identify:

- renderer entry point;
- state/store owner;
- IPC boundary if applicable;
- main-process service;
- Venice adapter/request builder;
- persistence owner;
- tests/verifier covering the path.

Document root cause before changing production code.

---

# 4. Workstream A — Media Studio direct image operations

## Reported requirement

Media Studio must allow a selected image to be processed directly using:

- Upscaling:
  - `2×`
  - `4×`
- Background removal
- Inpainting/editing

The user should not need to manually navigate back into Image Studio, re-import the image, and reconstruct context.

## Required behavior

When exactly one compatible image is selected in Media Studio, expose first-class image actions using the existing application design language.

Recommended interaction structure:

```text
Enhance
├── Upscale
│   ├── 2×
│   └── 4×
├── Remove Background
└── Inpaint / Edit
```

Do not duplicate the provider implementation.

The Media Studio action must delegate to the same canonical request/service layer already used by Image Studio.

### Upscaling

Use the existing `/image/upscale` integration.

Request contract must remain compatible with the repository/API contract:

```json
{
  "image": "...",
  "scale": 2
}
```

or:

```json
{
  "image": "...",
  "scale": 4
}
```

Do not add a model parameter unless the current API contract explicitly requires one.

Do not append generation-only fields such as `return_binary`.

### Background removal

Reuse the canonical `/image/background-remove` implementation.

Preserve alpha transparency.

The resulting asset must enter Media Studio as a new derived asset rather than mutating the source record.

### Inpainting / editing

Use the existing Venice image-edit path rather than adding an obsolete `inpaint` parameter to `/image/generate`.

The current public image-edit contract is prompt-driven.

Do not invent or send a `mask` API field unless the checked-in Swagger and current adapter explicitly support it.

If Venice Forge already contains an established edit/inpaint UI, launch or embed that workflow with the selected Media Studio asset preloaded.

The user must not have to locate or re-upload the same asset.

## Lineage

Every derived operation must create correct lineage:

```text
Original
   ↓
Upscaled 4×
```

or:

```text
Original
   ↓
Background Removed
```

or:

```text
Original
   ↓
Edited / Inpainted
```

Preserve at minimum:

- stable media ID;
- parent media ID;
- operation type;
- MIME type;
- byte count;
- dimensions;
- provider/request metadata already permitted by the current schema;
- creation timestamp;
- safe generation metadata.

Do not duplicate source binaries merely for metadata convenience if the current media store already provides content-addressed custody.

## UI states

Handle:

- no selection;
- multiple selections;
- unsupported MIME;
- operation pending;
- cancellation where supported;
- provider 400;
- provider 401/402;
- rate limiting;
- provider 5xx;
- persistence failure;
- recovery/Save As state.

Disable incompatible operations rather than allowing invalid paid requests.

---

# 5. Workstream B — PNG / WEBP output control

## Requirement

Allow the user to select image output as:

```text
PNG
WEBP
```

Do not conflate provider response encoding with file-extension renaming.

## Native image generation

For `/image/generate`, use the provider-supported request parameter:

```json
{
  "format": "png"
}
```

or:

```json
{
  "format": "webp"
}
```

Capability/request building must remain model-aware.

## Edit/background removal

Current edit and background-removal operations are PNG-producing operations.

Do not send unsupported `format` fields merely to make the UI selection appear functional.

If the user selects WEBP for one of these operations:

1. receive and validate the provider PNG;
2. persist/validate the canonical provider result according to the existing media pipeline;
3. convert through a trusted local media conversion path;
4. validate the converted signature/MIME;
5. assign `.webp` only to genuine WebP bytes;
6. preserve transparency;
7. record conversion provenance.

Reuse an existing image conversion dependency if one already exists.

Do not add a heavyweight native dependency before checking whether the existing Electron/media stack already provides a safe conversion path.

## Export

The Media Studio Save/Export workflow should expose:

```text
Original format
PNG
WEBP
```

where applicable.

Never create this invalid state:

```text
filename.webp
Content-Type: image/png
```

or its reverse.

Add signature-level tests.

---

# 6. Workstream C — Long prompt editor overflow

## Reported defect

A long preconfigured prompt expands the prompt area until earlier content can no longer be reached reliably.

The prompt editor currently behaves like page content rather than a bounded editor.

## Required behavior

The prompt input must:

- remain vertically resizable;
- have a sensible minimum size;
- have a bounded maximum size;
- scroll internally once maximum height is reached;
- never push critical controls permanently outside the usable viewport;
- preserve keyboard navigation and text selection;
- handle very long preconfigured prompts;
- handle pasted multiline prompts;
- work with zoomed UI and reduced-height windows.

Recommended CSS behavior:

```css
resize: vertical;
overflow-y: auto;
min-height: <existing tokenized sensible minimum>;
max-height: min(40vh, <desktop cap>);
```

Use project tokens/classes rather than copying those literals blindly.

Do not use JavaScript resize listeners if normal CSS layout can solve the problem.

Test at minimum:

- short prompt;
- 100+ line prompt;
- preconfigured prompt;
- manual resize;
- minimum resize;
- maximum resize;
- 1280×720;
- small-height Electron window;
- 200% zoom if supported.

---

# 7. Workstream D — Character Creator AI generation latency and failures

## Reported behavior

AI-assisted field generation is sluggish and has emitted:

```text
Failed to reach Venice API.
```

and:

```text
SCHEMA_REPAIR_FAILED: Repair request failed: Failed to reach Venice API.
```

Do not suppress these strings without determining where the failure originates.

## Investigation

Trace the complete request:

```text
Character Creator
    ↓
generation command
    ↓
structured response request
    ↓
Venice canonical client
    ↓
response
    ↓
schema parse
    ↓
optional repair
    ↓
field application
```

Instrument safe timings at boundaries:

```text
requestStart
firstResponseAt
requestComplete
parseStart
parseComplete
repairStart
repairComplete
applyComplete
```

Permitted diagnostics include:

- endpoint;
- model ID;
- status;
- elapsed duration;
- retry count;
- normalized error category;
- schema validation success/failure.

Never log:

- generated character body;
- raw system prompt;
- user prompt;
- response text;
- API credentials.

## Important failure classification

Determine whether `SCHEMA_REPAIR_FAILED` represents:

1. a valid provider response that failed schema validation and then experienced a network failure during repair;
2. an initial transport failure incorrectly routed into schema repair;
3. timeout/cancellation misclassified as schema failure;
4. duplicate network requests;
5. a stale endpoint/request schema;
6. renderer/main transport mismatch;
7. model capability mismatch.

If the original request never produced a parseable response, do **not** characterize the failure to the user as a schema repair failure.

Normalize the root error.

Example conceptual classes:

```text
NETWORK_UNREACHABLE
REQUEST_TIMEOUT
RATE_LIMITED
AUTH_FAILED
INSUFFICIENT_BALANCE
INVALID_PROVIDER_RESPONSE
STRUCTURED_OUTPUT_INVALID
SCHEMA_REPAIR_FAILED
CANCELLED
```

Do not add retries around deterministic 400/schema-contract errors.

For transient failures, honor the canonical Venice client's established retry/backoff behavior rather than implementing Character Creator-specific retry logic.

## Performance

Measure before optimizing.

Check for:

- multiple calls per field;
- sequential generation that could safely be one structured request;
- repeated model metadata loads;
- repeated prompt compilation;
- duplicate React effects;
- schema-repair request occurring unnecessarily;
- stale network abort controllers;
- unnecessary state rerenders.

Do not sacrifice schema validation for speed.

---

# 8. Workstream E — Character chat system-prompt isolation

This is a correctness requirement.

## Required model

Treat these as separate prompt concepts:

```text
A. immutable runtime/tool knowledge
B. Venice/default provider system prompt behavior
C. user's custom global system prompt
D. character-specific system/identity prompt
E. conversation/history context
```

Do not collapse B, C, and D into a single boolean.

## Premade/local character chats

When a user enters a character conversation:

- do **not** inject the user's normal custom system prompt into that character unless a future explicit character-level feature intentionally supports it;
- do not render the user's global custom system-prompt editor in Character Chat;
- do not expose irrelevant global prompt controls in a way that suggests they affect the character;
- character identity/prompt state must remain conversation-scoped;
- a previously selected character must never leak into another character or generic chat.

The character's canonical prompt must remain authoritative for character identity.

## Venice default prompt behavior

The choice to use or bypass Venice's default/provider system prompt must remain explicit and independent.

Do not silently disable it merely because the conversation is a character chat.

Do not silently enable it when the user has explicitly selected a supported bypass setting.

Represent this with one canonical state owner.

If the current product supports global inheritance, a safe model is conceptually:

```text
Venice default prompt:
  inherit configured preference
  enabled
  disabled
```

Do not add this exact tri-state unless it fits the current architecture; the important requirement is that the Venice prompt preference is **not coupled to custom user-system-prompt visibility**.

## Regression cases

Add focused tests proving:

```text
generic chat + custom user prompt
generic chat + no custom user prompt
character A
character B
local character
hosted character
character → generic chat transition
character A → character B transition
restored character conversation
Venice default prompt enabled
Venice default prompt explicitly bypassed
```

Assertions should verify prompt-layer composition, not only UI visibility.

---

# 9. Workstream F — Documents: broad source-code ingestion

## Requirement

Documents should accept source-code and developer text files across common programming, configuration, markup, infrastructure, and documentation formats.

Do **not** implement this as `accept="*/*"` plus blind UTF-8 decoding.

That creates incorrect binary ingestion and secret exposure risks.

## Preferred architecture

Use a centralized textual-ingestion capability registry plus content validation.

Support common textual development formats such as:

```text
JavaScript / TypeScript:
.js .jsx .mjs .cjs .ts .tsx .mts .cts

Web:
.html .htm .css .scss .sass .less
.vue .svelte .astro

Python:
.py .pyi

JVM:
.java .kt .kts .scala .groovy

Systems:
.c .h .cc .cpp .cxx .hpp .hh
.rs .go .swift

.NET:
.cs .fs .fsx .vb

Shell / scripting:
.sh .bash .zsh .fish
.ps1 .bat .cmd
.rb .php .pl .lua .r

Data / configuration:
.json .jsonc
.yaml .yml
.toml
.ini .cfg .conf
.xml
.csv .tsv
.properties

Database / query:
.sql
.graphql .gql

Build / infrastructure:
Dockerfile
Containerfile
Makefile
CMakeLists.txt
*.cmake
.gradle
.tf .tfvars
.proto

Documentation:
.md .mdx
.rst
.adoc
.tex
.bib

Other common textual source formats:
.sol
.ex .exs
.erl .hrl
.clj .cljs .edn
.dart
.hs
.ml .mli
.nim
.zig
```

This is illustrative, not an instruction to scatter an extension array across multiple components.

Create/extend one canonical registry.

## Content-based fallback

For unknown extensions:

1. inspect bounded initial bytes;
2. reject NUL-heavy/binary data;
3. validate size limit;
4. perform safe text decoding;
5. classify as textual only when appropriate.

This lets files such as extensionless:

```text
LICENSE
README
Makefile
Dockerfile
Procfile
```

work without effectively enabling arbitrary binaries.

## Sensitive files

Do not casually ingest likely secret containers as ordinary documents.

Review handling for:

```text
.env
.env.*
*.pem
*.key
credentials*
secure-prefs*
```

At minimum warn or reject according to existing Venice Forge policy.

Do not weaken current secret scanning.

## Preserve document security boundary

The renderer must not gain arbitrary path access.

Native file selection and privileged reads remain main-owned.

Enforce:

- file-size limits;
- text-size limits;
- bounded decoding;
- path validation;
- symlink handling;
- workspace grants;
- no shell execution;
- no code execution;
- no automatic dependency installation.

Source code is text to analyze, never executable input.

---

# 10. Workstream G — Markdown and LaTeX rendering in Documents

## Requirement

Document previews/output must correctly display Markdown and LaTeX when those syntaxes are present inline.

Do not build a second renderer.

Locate the canonical Markdown/LaTeX rendering stack already used by Venice Forge chat or other content surfaces and extract/reuse the appropriate safe shared component if necessary.

Required cases:

```markdown
# Heading

**bold**
*italic*
`inline code`

```ts
const value = 42;
```

Inline math: $E = mc^2$

Block math:

$$
\int_a^b f(x)\,dx
$$

| A | B |
|---|---|
| 1 | 2 |
```

Requirements:

- fenced code syntax highlighting;
- inline code;
- GFM tables if already supported;
- ordered/unordered lists;
- links through the existing external-URL security policy;
- inline math;
- display math;
- theme-aware syntax colors;
- theme-aware KaTeX/math colors;
- no unsanitized raw HTML execution;
- no script execution;
- no executable Markdown plugins from document contents.

A source-code document should render as source, not accidentally interpret arbitrary source text as Markdown merely because it contains Markdown-like punctuation.

Use file type/content mode to decide rendering.

---

# 11. Workstream H — Theme contrast and unreadable menus

## Reported defect

Some theme foreground/background combinations make text menus difficult or impossible to read.

This must be fixed in Theme Engine V2 rather than by adding per-component hardcoded colors.

## Audit targets

Audit all built-in themes across at least:

```text
primary text
secondary text
muted text
disabled text
placeholder text
links
menu labels
menu shortcuts
selected menu items
hover menu items
dropdowns
popovers
tooltips
context menus
dialog text
form labels
inputs
textarea
tabs
badges
status text
error/warning/success states
code text
syntax highlighting
focus rings
borders
glass surfaces
```

Check translucent/glass surfaces specifically.

A foreground token that looks valid against the base background may fail once rendered over a translucent panel.

## Remediation strategy

Prefer:

```text
semantic token correction
        ↓
shared component correction
        ↓
theme-specific token correction
```

Avoid:

```text
component-local #ffffff
component-local #000000
!important overrides
theme-name conditionals
```

unless there is no legitimate tokenized alternative.

## Accessibility baseline

For ordinary text, target WCAG-compatible contrast behavior.

At minimum use the usual contrast targets:

```text
normal text: 4.5:1
large text: 3:1
interactive/non-text boundaries: 3:1 where applicable
```

Do not alter the visual identity of all themes into one uniform palette merely to achieve this.

Preserve their intended character while repairing semantic contrast.

## Automated regression

Add a theme/token audit where practical.

At minimum verify representative light, dark, pastel, high-saturation, and glass-heavy themes.

Given the current large built-in theme catalog, prefer a data-driven test rather than manually testing only the default theme.

Also verify:

- menu hover;
- menu selected;
- disabled;
- focus;
- high-density menus;
- modal overlays.

---

# 12. Workstream I — System → Status media classifier capabilities

## Reported UI

The Status screen currently displays:

```text
MEDIA CLASSIFIER CAPABILITIES
Image: unavailable
Audio: unavailable
Video: unavailable
Registered backend: no

Family Safe Mode currently performs STRUCTURAL validation only — no semantic
content classification backend is registered. Generation requests are screened
for protocol safety, payload shape, and attachment provenance; image / audio /
video bytes are NOT semantically classified.
```

The complaint is that this does not reflect current/live statistics.

## Do not blindly rewrite this text

First determine whether:

1. no media classifier backend is actually registered;
2. a backend exists but Status is reading stale state;
3. registration happens after Status hydration;
4. the status card is hardcoded;
5. capability discovery fails;
6. renderer and main process use different registries;
7. the status query is cached forever;
8. capability names changed but Status was not migrated.

## Required architecture

There must be one authoritative classifier-capability snapshot.

Conceptually:

```ts
type MediaClassifierStatus = {
  registered: boolean;
  backendId?: string;
  image: CapabilityState;
  audio: CapabilityState;
  video: CapabilityState;
  checkedAt: number;
};
```

Use the project's actual types/naming.

Do not duplicate this exact example blindly.

Useful capability states should distinguish at least:

```text
available
not-supported
not-registered
error
checking
```

Avoid mapping all of those to:

```text
unavailable
```

because it destroys diagnostic value.

## Status screen behavior

The card should show live authoritative state plus:

- backend registration status;
- image capability;
- audio capability;
- video capability;
- last capability refresh/check time if appropriate;
- normalized error when capability probing failed;
- refresh action if the existing Status design supports refresh.

If no semantic media classifier genuinely exists, say so accurately.

Do **not** fake `available` status because the application performs structural validation.

Structural request validation, textual safety rules, MIME/signature validation, and semantic image/audio/video classification are different capabilities.

The Status screen must make that distinction clear.

## Family Safe Mode copy

Review the existing explanatory copy against the actual safety architecture.

If text/prompt safety rules operate semantically while **binary media** lacks semantic classification, write the message narrowly enough to avoid implying that the entire Family Safe Mode only validates structure.

A more precise concept would be:

```text
No semantic media-classification backend is registered for generated image,
audio, or video bytes. Existing request/prompt safety and structural validation
remain active according to the current safety configuration.
```

Do not use that exact text without checking current behavior and localization.

## Tests

The existing status-diagnostics verifier must cover at least:

```text
backend absent
backend present
partial capability support
probe error
refresh
hydration
stale/error transition
```

No secrets or media bytes belong in Status diagnostics.

---

# 13. Priority classification

Treat these approximately as:

## P1

- Character Creator API/repair failure and excessive latency
- Character/global system-prompt leakage or incorrect prompt composition
- Media Studio direct processing actions if the existing Image Studio functionality cannot be reached cleanly
- Documents rejecting normal source-code formats
- Theme combinations rendering important interactive text unreadable

## P2

- PNG/WEBP output preference
- bounded/resizable prompt editor
- Markdown/LaTeX rendering inconsistencies in Documents
- Status classifier card showing stale/ambiguous capability state

Escalate any issue to P0/P1 if investigation reveals data corruption, secret exposure, request duplication causing unexpected charges, or a security-boundary bypass.

---

# 14. Testing requirements

Use test-driven fixes.

For each confirmed defect:

1. reproduce;
2. create a focused failing test;
3. implement the smallest root-cause correction;
4. make focused test pass;
5. run relevant verifier;
6. run broader regression suite.

Do not change unrelated behavior while fixing a failing case.

Relevant repository gates presently include:

```bash
npm run verify:document-ingestion
npm run verify:media-studio-power-tools
npm run verify:status-diagnostics
npm run verify:safety-guard
npm run verify:contracts
```

Visible UI work must also run the repository's i18n verification commands if they exist in the current `package.json`, including the established runtime/hardcoded-string checks.

Before executing any named script, confirm it exists:

```bash
npm run
```

Do not invent a command from a stale report.

---

# 15. Specific regression tests to add

## Media Studio

Verify:

```text
single image → upscale 2×
single image → upscale 4×
single image → background removal
single image → edit/inpaint
operation disabled with invalid selection
derived media gets parent lineage
persistence failure remains recoverable
tab navigation does not cancel background task unexpectedly
```

## Formats

Verify real signatures:

```text
PNG request → PNG bytes → image/png → .png
WEBP request → WEBP bytes → image/webp → .webp
PNG provider result → optional WEBP conversion → valid WebP signature
alpha preserved where applicable
```

## Prompt editor

Verify:

```text
long preset does not expand page indefinitely
internal scroll works
manual vertical resize works
maximum size is bounded
keyboard focus/caret survives
```

## Character Creator

Verify:

```text
transport failure ≠ schema failure
malformed structured response → repair path
repair transport failure → SCHEMA_REPAIR_FAILED with preserved cause
successful structured response → no repair call
cancellation is not displayed as generic network failure
```

## Character chats

Verify exact outbound prompt composition for:

```text
generic chat
hosted character
local character
different character transition
restored character chat
custom global system prompt present globally
Venice default prompt on/off
```

## Documents

Verify:

```text
representative code extensions
extensionless textual developer files
unknown textual extension
binary rejection
oversized text rejection
secret-sensitive file behavior
Markdown preview
LaTeX inline/display rendering
source-code file rendered as source
```

## Themes

Verify semantic contrast for representative built-in themes and all shared menu/dialog primitives.

## Status

Verify authoritative runtime capability state rather than hardcoded strings.

---

# 16. Manual QA matrix

Perform desktop Electron QA, not only web-mode QA.

### Media Studio

1. Generate/import an image.
2. Select it.
3. Run 2× upscale.
4. Run 4× upscale.
5. Remove background.
6. Launch edit/inpaint.
7. Confirm each output appears as a derived child.
8. Switch tabs while an operation is running.
9. Return and confirm progress/state remains correct.
10. Save/export as PNG.
11. Save/export as WEBP.
12. Open exported files externally and verify they decode.

### Prompt editor

Load the longest available preset.

Confirm:

- editor does not take over the page;
- vertical resize works;
- maximum height is bounded;
- internal scrollbar appears;
- beginning/end of prompt remain reachable.

### Character Creator

Run several AI-assisted generation operations.

Capture safe timing information.

Test:

- successful response;
- offline/network failure;
- cancellation;
- malformed response/repair if reproducible.

Confirm the UI differentiates these states.

### Character Chat

Configure a distinctive normal user system prompt.

Enter a premade character chat.

Confirm that prompt is neither shown as an applicable character control nor injected into the character request.

Toggle the supported Venice/default prompt behavior and inspect the sanitized Traffic Inspector evidence to prove the selected policy is actually honored.

### Documents

Import:

```text
.ts
.tsx
.py
.rs
.go
.swift
.json
.yaml
.toml
.sql
.sh
Dockerfile
Makefile
.md
.tex
```

Also test:

- binary executable/image rejection;
- extensionless text;
- large source file;
- unusual but valid UTF-8 source.

### Themes

Switch through multiple light/dark/pastel/glass themes.

Open:

- navigation menus;
- dropdowns;
- dialogs;
- popovers;
- tooltips;
- context menus;
- prompt selectors;
- status cards.

Confirm text is legible in default, hover, focus, selected, and disabled states.

### Status

Open System → Status.

Verify capability values derive from runtime state.

Trigger refresh/reconnect if available and confirm the timestamp/state changes rather than remaining hardcoded.

---

# 17. Full validation

After focused checks pass, run the repository-required validation sequence from the current `AGENTS.md`.

At minimum confirm the current scripts and execute the applicable equivalent of:

```bash
npm run lint:eslint
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:contracts
npm run build
npm run ci
```

Because the test suites share state, preserve the repository's required serial execution behavior.

Do not claim a test passed if it was not executed.

If an existing unrelated failure blocks the full suite, record:

- command;
- exact failing test;
- why it is unrelated;
- focused validation proving these changes.

Do not weaken the unrelated test.

---

# 18. Documentation requirements

Before finishing:

Update:

```text
docs/summary_of_work.md
docs/ROADMAP.md
```

Update `docs/DOCS_INDEX.md` only if document authority/topology changed or new documentation was added.

`docs/summary_of_work.md` must record:

- verified root causes;
- files changed;
- focused tests;
- full validation results;
- manual QA;
- failures/skips;
- unresolved work.

Do not write local absolute paths into permanent project documentation.

---

# 19. Git discipline

Remain on:

```text
main
```

Never:

```text
git reset --hard
git clean -fdx
git push --force
git push --force-with-lease
```

Inspect before committing:

```bash
git status --short
git diff --check
git diff --stat
git diff
```

Ensure no:

- API keys;
- environment secrets;
- generated diagnostic dumps;
- local paths;
- unintended binary artifacts;
- unrelated edits

are staged.

If the executing assignment includes authorization to publish the implementation, commit and push only to `main` after validation is green.

---

# 20. Definition of done

This assignment is complete only when all of the following are true:

- Media Studio can invoke existing 2×/4× upscale, background removal, and editing/inpaint workflows directly from a selected compatible image.
- Derived image lineage is correct.
- PNG and WEBP preferences produce real matching media bytes/extensions.
- Long prompt presets remain inside a bounded, internally scrollable, vertically resizable editor.
- Character Creator network/schema failures are correctly classified and the root source of unnecessary latency has been addressed.
- Character chats do not inherit the normal user custom system prompt.
- Venice/default provider prompt behavior remains an explicit independent choice.
- Document ingestion supports broad textual source-code/configuration formats without opening arbitrary binary ingestion.
- Markdown and LaTeX display through the existing safe rendering architecture.
- Theme contrast is repaired through semantic tokens/shared components rather than hardcoded component overrides.
- System → Status reports authoritative classifier capability state and accurately distinguishes semantic media classification from structural/request validation.
- Focused regression tests exist.
- Existing security/safety boundaries remain intact.
- Relevant repository verifiers pass.
- Build passes.
- Manual Electron QA has been completed or explicitly documented as not run.
- `docs/summary_of_work.md` and `docs/ROADMAP.md` are current.
- No unrelated changes or secrets are included.

---

# Required final agent report

Return:

```markdown
# Work Summary

## Repository State
- Branch:
- Starting commit:
- Ending commit:
- Dirty files present before work:

## Verified Root Causes

## Implementation

### Media Studio Operations
### PNG / WEBP Output
### Prompt Editor
### Character Creator API Pipeline
### Character Prompt Isolation
### Document Ingestion
### Markdown / LaTeX Rendering
### Theme Contrast
### Status / Media Classifier Diagnostics

## Files Changed

## Tests Added / Updated

## Commands Executed

## Validation Results

## Manual QA

## Documentation Updated

## Remaining Risks

## Deferred Work

## Git Status
```

Every claim must be backed by code inspection, test evidence, runtime reproduction, or manual QA.

Do not report an issue as fixed merely because the UI changed.
