# Venice Forge — Theme-Aware Syntax-Colorized Code Rendering Agent Handoff

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this handoff task-by-task. Use test-first changes and preserve the repository's current direct-`main` workflow.
>
> **Repository:** `spearchucker667/Venice_Forge`  
> **Canonical local root:** `/Users/super_user/Projects/Venice_Forge`  
> **Authoritative branch:** `main`  
> **Remote `main` observed while preparing this handoff:** `3e590d7a541b89949703901d070576d7673e65c0`  
> **Declared release line:** `3.0.0-beta.3`  
> **Toolchain contract:** Node `>=22.15.0 <23.0.0`, npm `>=10`  
> **Handoff date:** 2026-09-01 (America/Los_Angeles)
>
> The execution agent must verify the actual local HEAD, package version, toolchain, dirty state, and remote state before editing. The SHA above is evidence from handoff preparation, not permission to reset or overwrite the local worktree.

---

## 1. Mission

Upgrade Venice Forge so **every user-visible code surface is theme-aware**, and fenced/multiline Markdown code blocks receive real syntax highlighting whose colors track the active Venice Forge theme.

The finished behavior must satisfy all of the following:

1. Fenced/multiline Markdown code blocks are syntax-colorized for recognized languages.
2. Inline Markdown code spans use dedicated theme-aware code colors even when no language is available.
3. Switching the Venice Forge theme recolors already-rendered code immediately through CSS variables; theme changes must not require code re-tokenization.
4. The Theme Maker gains a dedicated **Code & Syntax** editor with:
   - a syntax preset selector,
   - code-surface colors,
   - syntax-token colors,
   - light/dark editing,
   - live syntax preview,
   - contrast warnings.
5. Every current built-in theme family has an explicit code-syntax preset assignment for **both light and dark variants**.
6. Custom themes preserve their code-syntax configuration through save, restart, export, import, and duplicate/create-from-active flows.
7. Existing/legacy themes that do not contain code-syntax data continue to load and receive a deterministic compatible fallback.
8. Copy-code behavior must preserve the exact raw source text.
9. Unknown or unsupported language identifiers must render safely as plain code rather than throwing.
10. No raw HTML injection, `dangerouslySetInnerHTML`, `eval`, or user-controlled dynamic imports may be introduced.

This is a theme-engine extension plus Markdown rendering upgrade. It is **not** a general chat redesign.

---

## 2. Confirmed Current State

The implementation agent must independently verify these findings against the checked-out repository before changing code.

### 2.1 Markdown/code rendering

Primary path:

```text
src/components/chat/message-bubble.tsx
  -> src/components/chat/ChatMarkdown.tsx
  -> react-markdown
```

`ChatMarkdown.tsx` currently:

- uses `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, and `rehype-sanitize`;
- preserves `language-*` classes;
- distinguishes inline code from block code;
- renders fenced code as raw text inside `<code>`;
- displays a language label and copy button;
- does **not** tokenize or syntax-highlight code;
- must retain its URL sanitization and KaTeX sanitation behavior.

Current `PreRenderer` styling is built from general surface/text theme classes rather than dedicated code-theme tokens.

### 2.2 Global Markdown CSS

`src/styles/theme.css` currently styles:

```css
.prose-venice code
.prose-venice pre
.prose-venice pre code
```

using general theme variables such as:

```text
--surface
--surface-elevated
--border
--text-primary
```

There is no `.token.*` syntax palette.

### 2.3 Theme model

Current durable theme model is Theme Engine V2:

```ts
interface ThemeFamily {
  schemaVersion: 2;
  id: string;
  name: string;
  variants: {
    light: ThemeVariant;
    dark: ThemeVariant;
  };
}

interface ThemeVariant {
  tokens: ThemeTokens;
}
```

`ThemeTokens` currently covers UI semantic/legacy colors only.

### 2.4 Built-in catalog

The uploaded repository snapshot exposes **43 built-in theme families** through:

```text
src/theme/builtins/index.ts
```

The implementation must enumerate `BUILTIN_THEME_FAMILIES` at runtime/tests rather than copy a stale hard-coded count into new logic.

Current observed families:

```text
venice
dark
light
obsidian-ember
midnight-cobalt
terminal-forest
porcelain-sky
sandstone
obsidian-bloom
harbor-fog
circuit-mint
amber-archive
neon-dusk
aurora-boreal
sakura-terminal
basalt-noir
solar-ash
cyber-orchid
arctic-glass
desert-copperfield
toxic-limewire
midnight-velvet
porcelain-daybreak
synthwave-harbor
moss-circuit
ember-monastery
glacial-ink
ultraviolet-rain
copper
dracula
gruvbox-dark
rosepine
nord
tokyo-night
catppuccin
solarized
one-dark
monokai
github-light
cotton-candy-console
sweet-nightmare
dual-persona
polaroid-board
```

If the local registry differs, the **local registry wins** and all current families must be covered.

### 2.5 Theme application

`src/theme/applyTheme.ts` currently converts resolved UI tokens to CSS variables on `document.documentElement`.

There are no code/syntax CSS variables yet.

### 2.6 Theme Maker

`src/components/ThemeMaker.tsx` currently:

- edits `ThemeFamily`;
- edits one light/dark variant at a time;
- exposes grouped `ThemeTokens`;
- live-applies the draft;
- persists custom themes;
- imports/exports YAML;
- contains no code-syntax editor or preset selector.

`src/components/ThemePreview.tsx` previews general UI controls but not highlighted source code.

### 2.7 Persistence and YAML

Relevant paths include:

```text
src/theme/themeTypes.ts
src/theme/yaml/validate.ts
src/theme/yaml/normalize.ts
src/theme/yaml/serialize.ts
src/theme/yaml/parse.ts
electron/services/themeService.ts
src/stores/settings-store.ts
src/App.tsx
```

Important constraints:

- V2 YAML validation is strict.
- `ALLOWED_VARIANT_KEYS` currently accepts only `tokens`.
- V2 serialization currently emits only `tokens`.
- Electron's local `ThemeFamilyV2` persistence shape currently contains only UI tokens.
- `ThemeMaker` converts a family variant into the legacy single-mode `Theme` object for settings persistence.
- `settings-store` persists `customTheme` / `customThemes` as `Theme`, so adding code data only to `ThemeFamily` would silently lose it unless this compatibility path is also extended.
- `App.tsx` writes the theme bootstrap cache to `vf.theme.bootstrap`.

### 2.8 Highlighting dependency

The observed package manifest contains no Prism/Refractor/Shiki/highlight.js syntax-highlighting dependency.

For this task, prefer a semantic-class tokenizer rather than a style-object highlighter so syntax color remains controlled by Venice Forge CSS variables.

---

## 3. Required Architecture

### 3.1 Use semantic code-theme tokens

Do **not** hardcode syntax colors in `ChatMarkdown.tsx`, `theme.css`, or the highlighter.

Introduce a dedicated code-theme contract. A recommended shape is:

```ts
export interface CodeThemeTokens {
  background: string;
  foreground: string;
  border: string;
  headerBackground: string;
  headerForeground: string;
  inlineBackground: string;
  inlineForeground: string;
  selectionBackground: string;

  comment: string;
  punctuation: string;
  property: string;
  tag: string;
  boolean: string;
  number: string;
  constant: string;
  symbol: string;
  deleted: string;
  selector: string;
  attribute: string;
  string: string;
  character: string;
  builtin: string;
  inserted: string;
  operator: string;
  entity: string;
  url: string;
  atRule: string;
  keyword: string;
  function: string;
  className: string;
  regex: string;
  important: string;
  variable: string;
}
```

The exact field names may change if a cleaner naming convention already exists locally, but the final contract must cover the Prism/Refractor token classes actually emitted by the chosen grammar set.

### 3.2 Extend each theme variant

Preferred durable shape:

```ts
export interface ThemeVariant {
  tokens: ThemeTokens;
  code: CodeThemeConfig;
}

export interface CodeThemeConfig {
  preset: CodeSyntaxPresetId;
  tokens: CodeThemeTokens;
}
```

Rules:

- `tokens` must be fully resolved before `applyTheme`.
- `preset` is metadata for Theme Maker and migration/debugging.
- exported custom themes must remain self-contained; do not require the destination app to reconstruct user colors solely from a preset name.
- old themes with no `code` property must be normalized to a complete fallback.

### 3.3 Centralize preset definitions

Create a focused preset registry, for example:

```text
src/theme/codeSyntaxTypes.ts
src/theme/codeSyntaxPresets.ts
src/theme/codeSyntax.ts
```

The registry must:

- define the canonical code-token key list;
- define preset IDs;
- define safe default derivation/fallback;
- resolve a full `CodeThemeTokens`;
- validate preset references;
- provide a deterministic fallback for legacy themes.

Every built-in family variant must explicitly identify its code preset.

For existing editor-inspired families, the code palette should preserve that visual identity. For custom Venice Forge themes, derive a coherent palette from the theme's existing colors and then tune it for readability.

### 3.4 Preset coverage requirement

Every family returned by:

```ts
BUILTIN_THEME_FAMILIES
```

must have complete light and dark code styling.

Do not solve this by silently applying one universal syntax palette to every built-in.

Shared helpers are allowed, but the resulting palette must visually belong to the family.

At minimum, retain distinct identities for families such as:

```text
dracula
gruvbox-dark
rosepine
nord
tokyo-night
catppuccin
solarized
one-dark
monokai
github-light
venice
```

and deliberately style the Venice-specific families rather than falling through to a generic default.

---

## 4. Syntax Highlighting Engine

### 4.1 Preferred library: Refractor

Use `refractor` with its current v5-compatible API.

Current documented behavior:

- `refractor/core` includes no grammars and supports manual registration.
- `refractor.highlight(code, language)` returns HAST instead of HTML.
- token nodes contain classes such as:

```text
token string
token punctuation
token keyword
token function
```

- aliases can be registered explicitly.
- unknown unregistered languages throw unless handled by the caller.

Install through npm so both manifest and lockfile update normally:

```bash
npm install refractor
```

Do not hand-edit `package-lock.json`.

### 4.2 Bundle discipline

Prefer:

```ts
import { refractor } from "refractor/core";
```

plus explicit language registration.

Do **not** import `refractor/all` unless bundle-budget evidence proves it is acceptable and the user specifically wants every Prism grammar bundled.

Start with the languages most relevant to Venice Forge and its users:

```text
bash / shell
c
cpp
csharp
css
diff
go
html / markup / xml
java
javascript / js
json
kotlin
lua
markdown / md
php
python / py
regex
ruby
rust
scss
sql
swift
typescript / ts
yaml / yml
```

Also support JSX/TSX if available from the installed Refractor grammar exports. Verify the exact installed package API before coding.

### 4.3 Language aliases

Create a fixed alias map. Examples:

```text
sh -> bash
shell -> bash
js -> javascript
ts -> typescript
py -> python
rb -> ruby
cs -> csharp
yml -> yaml
html -> markup
xml -> markup
```

Do not dynamically import a module path assembled from Markdown input.

### 4.4 Safe rendering

Refractor returns an AST. Render that AST into React elements.

Allowed approaches:

1. a small local HAST renderer that only accepts expected Refractor `root`, `text`, and `span` nodes; or
2. a well-scoped HAST-to-JSX utility after verifying its current API and bundle cost.

Do **not** use:

```text
dangerouslySetInnerHTML
innerHTML
eval
new Function
```

The original code string remains the authoritative copy payload.

### 4.5 Unknown languages

Behavior must be:

```text
known language -> highlighted token spans
unknown language -> plain escaped code
missing language -> plain escaped code
```

Never throw the chat render because a model used a strange fence label.

### 4.6 Performance guard

Add a deterministic complexity guard so a huge code response cannot freeze the renderer.

Recommended initial guard:

```text
maximum highlighted source length: 50,000 UTF-16 code units
maximum highlighted lines: 4,000
```

Above the threshold, render plain code while preserving:

- code block frame,
- language label,
- copy button,
- scroll behavior,
- raw source.

Place thresholds in named constants and test them.

### 4.7 Avoid theme-triggered re-tokenization

Token spans must use CSS classes only.

Theme changes should update root CSS variables through `applyTheme`, which recolors existing spans automatically.

Use memoization keyed by:

```text
language + raw source
```

if needed, but do not include current theme ID in that key.

---

## 5. CSS Variable Contract

`applyTheme()` must expose dedicated variables similar to:

```text
--code-bg
--code-fg
--code-border
--code-header-bg
--code-header-fg
--code-inline-bg
--code-inline-fg
--code-selection-bg

--syntax-comment
--syntax-punctuation
--syntax-property
--syntax-tag
--syntax-boolean
--syntax-number
--syntax-constant
--syntax-symbol
--syntax-deleted
--syntax-selector
--syntax-attribute
--syntax-string
--syntax-character
--syntax-builtin
--syntax-inserted
--syntax-operator
--syntax-entity
--syntax-url
--syntax-atrule
--syntax-keyword
--syntax-function
--syntax-class-name
--syntax-regex
--syntax-important
--syntax-variable
```

Use one canonical spelling and test it.

`src/styles/theme.css` should then map Refractor/Prism classes to these variables.

Example mapping shape:

```css
.prose-venice .token.comment,
.prose-venice .token.prolog,
.prose-venice .token.doctype,
.prose-venice .token.cdata {
  color: var(--syntax-comment);
}

.prose-venice .token.keyword {
  color: var(--syntax-keyword);
}

.prose-venice .token.string,
.prose-venice .token.attr-value {
  color: var(--syntax-string);
}

.prose-venice .token.function {
  color: var(--syntax-function);
}
```

Continue the mapping for all emitted classes.

### Required CSS behavior

- Inline code uses `--code-inline-bg` / `--code-inline-fg`.
- Fenced code body uses `--code-bg` / `--code-fg`.
- Fenced code header uses `--code-header-bg` / `--code-header-fg`.
- Code border uses `--code-border`.
- Selected code text uses `--code-selection-bg`.
- Token spans inherit the existing local monospace font.
- No syntax `#hex`, `rgb()`, `hsl()`, or named colors are allowed in component/CSS mapping rules.
- Theme transitions must not flash a foreign code palette.

---

## 6. ChatMarkdown Refactor

Target:

```text
src/components/chat/ChatMarkdown.tsx
```

Prefer extracting highlighting into a focused module rather than turning `ChatMarkdown.tsx` into a large parser/highlighter file.

Suggested new module:

```text
src/components/chat/codeHighlighting.tsx
```

or:

```text
src/components/chat/codeHighlighting.ts
```

Responsibilities:

- normalize fence language;
- verify registration;
- tokenize supported code;
- safely convert Refractor HAST to React;
- fall back to raw text;
- enforce size/line threshold;
- expose pure functions that are easy to test.

### Preserve existing contracts

Do not regress:

- link protocol sanitization;
- KaTeX sanitation;
- GFM;
- raw text copying;
- language label display;
- fenced-code source without language;
- user-message fenced code;
- assistant-message fenced code;
- Traffic Inspector / red-team rendering;
- external-link security attributes.

### Inline code

Inline Markdown such as:

```markdown
Use `npm run lint`.
```

does not carry reliable language metadata.

Do not attempt arbitrary language detection for inline spans.

Instead:

- preserve literal text;
- apply dedicated inline code background/foreground/border styling;
- ensure it tracks the active theme.

---

## 7. Theme Maker Expansion

Target:

```text
src/components/ThemeMaker.tsx
```

Add a new editor area:

```text
Code & Syntax
```

### 7.1 Preset control

Add a preset selector for the active light/dark variant.

Behavior:

- selecting a preset updates the current variant's `code` config;
- it must not overwrite general UI `ThemeTokens`;
- the user may then modify individual code colors;
- custom edits must remain after save/reload/export/import.

Provide at least:

```text
Automatic / Derived
Venice
Dracula
Gruvbox
Rose Pine
Nord
Tokyo Night
Catppuccin
Solarized
One Dark
Monokai
GitHub Light
```

and family-specific presets for the rest of the built-in catalog.

A better implementation is to expose every registered preset from `CODE_SYNTAX_PRESETS` rather than maintain a second selector list in the component.

### 7.2 Code surface controls

Expose:

```text
Code background
Code foreground
Code border
Header background
Header foreground
Inline background
Inline foreground
Selection background
```

### 7.3 Syntax controls

Expose the canonical syntax token roles from `CodeThemeTokens`.

Do not duplicate label lists manually across unrelated modules. Export a typed metadata list from the code-theme module if practical.

### 7.4 Light/dark behavior

The existing Theme Maker light/dark tabs must switch both:

```text
ThemeTokens
CodeThemeConfig
```

for that variant.

Never let editing dark syntax mutate light syntax, or vice versa.

### 7.5 Dirty-state detection

`isDraftDirty` currently compares only UI tokens and metadata.

Expand dirty-state comparison so code preset/token changes enable Save and Reset correctly.

### 7.6 Create-from-active and duplicate behavior

When creating a custom theme from an existing theme, clone:

```text
light UI tokens
dark UI tokens
light code config
dark code config
```

Deep-clone the nested code token objects.

### 7.7 Save/delete/reset/restore

Ensure:

- Save persists code data.
- Reset restores code data.
- Restore Default restores Venice code data.
- Delete does not disturb unrelated themes.
- Import preview shows imported/derived code styling.

---

## 8. Theme Preview Expansion

Target:

```text
src/components/ThemePreview.tsx
```

Add a compact code preview using a representative sample.

Recommended TypeScript sample:

```ts
type ThemeMode = "light" | "dark";

export function resolveTheme(name: string, enabled = true) {
  const count = 42;
  // Theme-aware syntax preview
  return enabled ? `${name}:${count}` : null;
}
```

Preview must visibly cover at least:

```text
comment
keyword
type/class-like token
function
string
number
boolean/null-like constant
operator
punctuation
variable/property
```

Use the same token class mapping as real Markdown code when practical.

Do not implement a separate fake hardcoded palette in `ThemePreview`.

### Contrast warnings

Built-in code text should meet accessibility expectations.

At minimum:

- `code.foreground` vs `code.background` >= 4.5:1
- `inlineForeground` vs `inlineBackground` >= 4.5:1
- `headerForeground` vs `headerBackground` >= 4.5:1
- textual syntax colors vs `code.background` should target >= 4.5:1
- borders/focus-like distinctions should target >= 3:1 where applicable

For user-created themes, warn rather than silently rewriting authored colors.

For built-ins, tests should require compliance.

---

## 9. Built-In Theme Migration

Targets:

```text
src/theme/builtins/*.ts
src/theme/builtins/index.ts
src/theme/themes.test.ts
```

### Required rule

Every entry in `BUILTIN_THEME_FAMILIES` must resolve a complete code config for both:

```text
light
dark
```

Do not maintain a hand-written count in migration logic.

Tests must enumerate the live array.

### Palette strategy

Use each family's existing palette as the source of visual identity.

Recommended semantic relationships:

- comments -> subdued/muted family color;
- keywords -> primary accent or adjacent hue;
- strings -> success/secondary accent family;
- numbers/constants -> warning/info family;
- functions -> accent/high-emphasis family;
- types/classes -> secondary accent;
- operators/punctuation -> readable foreground-muted;
- inserted -> success family;
- deleted -> danger family;
- code background/header -> surfaces that remain visibly distinct from the surrounding chat bubble.

Avoid using status colors mechanically if they fail contrast or visually imply success/error where inappropriate.

### Do not collapse families

Do not map every theme to a single `dark-default` / `light-default` preset merely to satisfy type completeness.

A generic fallback is allowed only for:

```text
legacy imported themes
corrupt/missing user code configuration
future unknown preset IDs
```

not for the normal built-in registry.

---

## 10. YAML and Theme Schema Compatibility

Relevant files:

```text
src/theme/themeTypes.ts
src/theme/schema.ts
src/theme/yaml/validate.ts
src/theme/yaml/normalize.ts
src/theme/yaml/serialize.ts
src/theme/yaml/parse.ts
src/theme/yaml/*.test.ts
electron/services/themeService.ts
```

### 10.1 Preserve backward compatibility

Preferred approach: keep Theme Engine `schemaVersion: 2` and add `code` as an optional V2 variant extension that is normalized to a full config.

Do not bump the schema version solely because code styling was added if the extension can remain backward-compatible.

If a schema bump is truly necessary, document why and add explicit V2 -> new-version migration. Do not silently break current V2 files.

### 10.2 Validator

Extend variant allowlisting:

```ts
ALLOWED_VARIANT_KEYS = new Set(["tokens", "code"]);
```

Validate code configuration:

- object shape;
- allowed keys;
- preset ID syntax/length;
- code token allowlist;
- string color values;
- `isValidColorValue`;
- dangerous YAML keys;
- unknown-key rejection consistent with existing strict validation.

### 10.3 Normalizer

For each variant:

```text
existing UI tokens + missing code config
    -> derive deterministic code theme

existing UI tokens + partial code config
    -> resolve preset
    -> apply explicit code token overrides
    -> produce complete CodeThemeConfig
```

No downstream renderer should need to handle a partial code token object.

### 10.4 Serializer

Serialize the complete self-contained code configuration.

Recommended V2 YAML shape:

```yaml
schemaVersion: 2
id: user-theme-example
name: Example
variants:
  light:
    tokens:
      # existing UI tokens...
    code:
      preset: github-light
      tokens:
        background: "#..."
        foreground: "#..."
        keyword: "#..."
        string: "#..."
        # complete canonical code token set
  dark:
    tokens:
      # existing UI tokens...
    code:
      preset: venice
      tokens:
        background: "#..."
        foreground: "#..."
        keyword: "#..."
        string: "#..."
        # complete canonical code token set
```

Preserve deterministic serialization order.

### 10.5 Electron persistence

`electron/services/themeService.ts` currently defines a minimal local V2 family shape and serializes only variant UI tokens.

Extend it so save/load round trips code configuration.

Prefer importing a shared safe type/validator if the Electron build boundary permits it without circular dependencies. If a local main-process shape must remain, add parity tests so renderer and Electron contracts cannot drift.

### 10.6 Legacy YAML files under `config/themes/`

Current starter files include legacy terminal-color templates that the active loader intentionally ignores unless they are schema-versioned V2 documents or use the legacy `themes:` mapping.

Do **not** add dead `code:` keys to a legacy format that does not consume them.

For this task:

- treat `BUILTIN_THEME_FAMILIES` as the authoritative built-in UI theme catalog;
- keep legacy terminal templates compatible;
- if converting starter YAML to V2 becomes necessary, convert the **entire file contract** and add loader tests rather than partially mixing schemas;
- do not create a second hand-maintained source of truth for code palettes.

If portable V2 starter files are desired, generate them from the built-in family registry/serializer rather than manually duplicating palette data.

---

## 11. Settings Persistence and Bootstrap

Relevant paths:

```text
src/stores/settings-store.ts
src/theme/themeTypes.ts
src/theme/applyTheme.ts
src/App.tsx
```

This is a mandatory part of the task.

Current custom theme persistence uses the legacy single-mode `Theme` type. If code configuration is added only to `ThemeFamily`, custom syntax settings will be lost during:

```text
ThemeFamily
-> singleModeThemeFromFamily()
-> settings store
-> restart
-> legacyThemeToFamily()
```

Repair this explicitly.

### Recommended compatibility approach

Extend the persisted single-mode `Theme` shape with code configuration:

```ts
interface Theme {
  id: string;
  name: string;
  mode: ThemeMode;
  tokens: ThemeTokens;
  code: CodeThemeConfig;
}
```

Then:

- `singleModeThemeFromFamily` copies the selected variant's code config;
- `legacyThemeToFamily` carries code config into both variants for truly legacy single-mode records;
- `isValidPersistedTheme` accepts old persisted themes with no `code` and derives a fallback;
- settings migration upgrades missing code data in memory without destroying existing user values;
- `customThemes` preserves code configuration;
- `vf.theme.bootstrap` includes enough information for the selected custom theme to resolve correctly after startup.

If a cleaner family-native custom-theme persistence migration is already underway locally, the agent may complete that instead, but it must include explicit migration tests and preserve all existing user themes.

---

## 12. Tests — Required Before Completion

Use TDD. Add failing tests before implementation in each subsystem.

### 12.1 Code highlighter unit tests

Create focused tests for the highlighting module.

Cover:

1. JavaScript/TypeScript produces token spans.
2. Python produces token spans.
3. alias resolution (`js`, `ts`, `py`, `sh`, `yml`).
4. unknown language falls back without throwing.
5. missing language falls back without throwing.
6. raw source text is unchanged.
7. HTML-like source is rendered as text/tokens, never executable markup.
8. oversized source bypasses highlighting.
9. HAST renderer ignores/rejects unexpected node types rather than rendering arbitrary tags.
10. tokenized output contains semantic classes but no inline style colors.

### 12.2 Chat regression tests

Extend:

```text
src/components/chat/message-bubble.test.tsx
```

Existing tests already cover fenced and inline code.

Add assertions that:

- recognized fenced code emits `.token.keyword` / equivalent semantic token spans;
- code block retains language label;
- code copy payload remains exact;
- unknown language renders;
- inline code remains outside `<pre>`;
- user and assistant messages both work;
- Traffic Inspector/red-team mode still works.

### 12.3 Theme application tests

Extend:

```text
src/theme/applyTheme.test.ts
```

Assert every canonical code/syntax CSS variable is written.

Then apply a second theme and verify variables change without reconstructing the highlighted markup.

### 12.4 Built-in completeness tests

Extend:

```text
src/theme/themes.test.ts
```

For every family and both modes:

- code preset exists;
- every canonical code token resolves;
- every color value is valid;
- built-in foreground/background code contrast passes;
- syntax text colors satisfy the chosen built-in contrast contract;
- no family silently resolves through the emergency fallback.

Do not assert only a manually selected subset.

### 12.5 YAML tests

Extend:

```text
src/theme/yaml/validate.test.ts
src/theme/yaml/normalize.test.ts
src/theme/yaml/serialize.test.ts
src/theme/yaml/parse.test.ts
src/theme/yamlTheme.test.ts
```

Cover:

- V2 with full `code`;
- V2 with no `code` -> deterministic fallback;
- V2 with partial override if partial overrides are supported;
- invalid code color rejected;
- unknown code token rejected;
- dangerous key rejected;
- unknown preset behavior;
- serialize -> parse semantic round trip;
- light and dark code values remain distinct.

### 12.6 Persistence tests

Extend settings/theme lifecycle tests so a custom theme with different light/dark code palettes:

```text
save
-> serialize/persist
-> hydrate
-> resolve
```

returns the same effective code palette.

### 12.7 Theme Maker tests

Add/extend component tests covering:

- preset change;
- advanced code token edit;
- light/dark separation;
- dirty state;
- reset;
- save;
- create-from-active;
- export/import preservation.

### 12.8 Static verifier

Update:

```text
scripts/verify-theme-tokens.cjs
```

so it also guards against hardcoded syntax colors in:

```text
src/components/chat
src/styles
```

Do not forbid legitimate palette literals inside:

```text
src/theme/builtins
src/theme/codeSyntaxPresets.ts
test fixtures
```

Add verifier tests for the new rule.

---

## 13. i18n Requirements

Theme Maker and preview labels are user-visible.

Follow the current i18n workflow.

Add localized keys for concepts such as:

```text
Code & Syntax
Syntax preset
Code background
Code foreground
Header background
Header foreground
Inline background
Inline foreground
Selection background
Comment
Keyword
String
Number
Function
Type / Class
Variable
Operator
Punctuation
Apply preset
Syntax preview
Code contrast warning
```

Do not leave release-blocking missing locale keys.

Use the repository's actual scripts after confirming them in `package.json`, including:

```bash
npm run i18n:extract
npm run i18n:sync-catalogs
npm run verify:i18n
npm run verify:i18n:release
```

Do not weaken strict i18n verification.

---

## 14. Documentation Requirements

Update:

```text
docs/design/THEME_SYSTEM.md
docs/summary_of_work.md
```

Document:

- code-theme token model;
- preset registry;
- Refractor/token-class rendering architecture;
- YAML shape;
- legacy fallback behavior;
- Theme Maker Code & Syntax controls;
- supported language list;
- unknown-language fallback;
- performance guard;
- accessibility expectations.

If a new retained plan/handoff/report is added to the repository, register it in:

```text
docs/DOCS_INDEX.md
```

Do not create a second roadmap or duplicate TODO ledger.

Suggested retained implementation-plan path:

```text
docs/superpowers/plans/2026-09-01-theme-aware-code-blocks.md
```

---

## 15. File-Level Work Map

### Create

Recommended:

```text
src/theme/codeSyntaxTypes.ts
src/theme/codeSyntaxPresets.ts
src/theme/codeSyntax.ts
src/components/chat/codeHighlighting.tsx
src/components/chat/codeHighlighting.test.tsx
```

Adjust exact names to local conventions if necessary.

### Modify

Expected:

```text
package.json
package-lock.json

src/theme/themeTypes.ts
src/theme/index.ts
src/theme/applyTheme.ts
src/theme/applyTheme.test.ts
src/theme/themes.test.ts

src/theme/builtins/*.ts

src/theme/yaml/validate.ts
src/theme/yaml/normalize.ts
src/theme/yaml/serialize.ts
src/theme/yaml/parse.ts
src/theme/yaml/*.test.ts

electron/services/themeService.ts
relevant Electron theme-service tests

src/stores/settings-store.ts
src/stores/settings-store.test.ts

src/App.tsx
relevant theme lifecycle/bootstrap tests

src/components/chat/ChatMarkdown.tsx
src/components/chat/message-bubble.test.tsx

src/components/ThemeMaker.tsx
relevant ThemeMaker tests

src/components/ThemePreview.tsx

src/styles/theme.css

scripts/verify-theme-tokens.cjs
scripts/verify-theme-tokens.test.ts

src/i18n/resources/*

docs/design/THEME_SYSTEM.md
docs/summary_of_work.md
docs/DOCS_INDEX.md     # only if retained docs inventory changes
```

### Inspect but do not automatically modify

```text
config/themes/*.yaml
```

These currently include legacy terminal-color templates. Modify only if the entire active contract is deliberately migrated and tested.

---

## 16. Implementation Sequence

### Task 1 — Bootstrap and baseline

- [ ] Run the repository bootstrap from `AGENTS.md`.
- [ ] Verify root is `/Users/super_user/Projects/Venice_Forge`.
- [ ] Verify branch is `main`.
- [ ] Record local HEAD.
- [ ] Record `git status --short`.
- [ ] Inspect existing diffs in every target file before editing.
- [ ] Verify Node 22.x and npm contract.
- [ ] Read `AGENT_REINITIALIZATION.md`.
- [ ] Read `docs/summary_of_work.md`.
- [ ] Read `docs/DOCS_INDEX.md`.
- [ ] Read `docs/ROADMAP.md`.
- [ ] Re-open the current theme source/tests and confirm the 43-family observation has not changed.

Do not reset, stash, clean, or overwrite user-owned changes.

### Task 2 — Add failing code-theme model tests

- [ ] Define the intended `CodeThemeTokens` and `CodeThemeConfig` contracts in tests.
- [ ] Add built-in completeness tests.
- [ ] Add YAML backward-compatibility tests.
- [ ] Run focused tests and confirm they fail for the expected missing code-theme contract.

### Task 3 — Implement code-theme types, preset registry, and fallback

- [ ] Add canonical token keys.
- [ ] Add preset IDs/registry.
- [ ] Add deterministic fallback/derivation.
- [ ] Extend `ThemeVariant`, `Theme`, and `ResolvedTheme`.
- [ ] Update legacy conversion/validation.
- [ ] Re-run focused theme tests.

### Task 4 — Migrate all built-in families

- [ ] Assign complete light/dark code palettes to every live built-in family.
- [ ] Preserve family identity.
- [ ] Run completeness and contrast tests.
- [ ] Fix palette values, not tests, when built-in contrast fails.

### Task 5 — Extend YAML and Electron persistence

- [ ] Extend V2 variant validation.
- [ ] Extend normalization.
- [ ] Extend deterministic serialization.
- [ ] Extend Electron load/save shape.
- [ ] Add legacy missing-code fallback.
- [ ] Run YAML and Electron focused tests.

### Task 6 — Repair custom-theme persistence

- [ ] Preserve code config through Theme Maker -> settings store conversion.
- [ ] Migrate old persisted themes with missing code config.
- [ ] Verify bootstrap/restart resolution.
- [ ] Add hydration/round-trip tests.

### Task 7 — Add Refractor highlighter

- [ ] Install `refractor` through npm.
- [ ] Register explicit grammars.
- [ ] Add fixed aliases.
- [ ] Implement safe HAST-to-React rendering.
- [ ] Add unknown-language fallback.
- [ ] Add performance guard.
- [ ] Add unit tests.
- [ ] Verify no inline style colors or raw HTML injection.

### Task 8 — Integrate ChatMarkdown

- [ ] Highlight only fenced/multiline code with recognized languages.
- [ ] Preserve plain rendering for unknown/missing language.
- [ ] Preserve raw copy text.
- [ ] Apply dedicated code classes/variables.
- [ ] Keep link/math sanitization unchanged.
- [ ] Run message-bubble/chat regression tests.

### Task 9 — Add CSS syntax mapping

- [ ] Add code-surface variable usage.
- [ ] Add `.token.*` mappings.
- [ ] Add code selection styling.
- [ ] Remove general surface/text dependencies from code blocks where dedicated code variables now exist.
- [ ] Run static theme verifier.

### Task 10 — Expand Theme Maker and preview

- [ ] Add Code & Syntax section.
- [ ] Add preset selector.
- [ ] Add code-surface controls.
- [ ] Add syntax-token controls.
- [ ] Add light/dark-safe editing.
- [ ] Update dirty-state logic.
- [ ] Update create/save/reset/import/export flows.
- [ ] Add real syntax preview.
- [ ] Add contrast warnings.
- [ ] Add component tests.

### Task 11 — i18n and docs

- [ ] Add all new user-visible translation keys.
- [ ] Synchronize catalogs using repository workflow.
- [ ] Run strict i18n verification.
- [ ] Update theme-system documentation.
- [ ] Update `docs/summary_of_work.md`.
- [ ] Update `docs/DOCS_INDEX.md` only if retained docs inventory changed.

### Task 12 — Full validation

Run focused checks first, then broad gates.

---

## 17. Validation Commands

Confirm every command still exists before running it.

### Focused

```bash
npm run test:unit:theme
npx vitest run src/components/chat/message-bubble.test.tsx --no-file-parallelism
npx vitest run src/components/chat/codeHighlighting.test.tsx --no-file-parallelism
npm run verify:theme-tokens
npm run verify:i18n
npm run typecheck
npm run lint:eslint
```

Run the exact Theme Maker/settings/Electron test files added or modified as separate focused commands.

### Dependency/bundle validation

Because this task adds a client-side dependency:

```bash
npm run build:web
npm run verify:bundle-budget
```

If bundle budget fails, optimize language registration before considering any budget increase. Do not raise the budget merely to accommodate `refractor/all`.

### Full repository gates

```bash
npm run test:ci
npm run verify:contracts
npm run verify:i18n:release
npm run build
npm run ci
```

If an unrelated pre-existing failure occurs:

- reproduce it;
- prove it is unrelated;
- record it accurately in `docs/summary_of_work.md`;
- do not weaken a gate or modify unrelated code just to obtain green output.

---

## 18. Manual Acceptance Matrix

Perform desktop manual QA after automated tests.

Use at least the following theme sample:

### Dark

```text
Venice
Dracula
GruvBox Dark
Tokyo Night
Catppuccin
Monokai
Obsidian Ember
Toxic Limewire
```

### Light

```text
Light
GitHub Light
Harbor Fog
Amber Archive
Porcelain Daybreak
Cotton Candy Console
Polaroid Board
```

### Custom

Create one custom theme, alter both light and dark code palettes, save it, restart the app, and verify persistence.

### Code samples

Test fenced blocks for:

```text
javascript
typescript
tsx
python
bash
json
yaml
html
css
sql
diff
unknown-language
no language
```

Test inline code:

```markdown
Run `npm run typecheck` before publishing.
```

### Acceptance checks

For every representative theme:

- [ ] block background belongs to the active theme;
- [ ] syntax colors are visibly distinct;
- [ ] code remains readable;
- [ ] language label is readable;
- [ ] copy button is readable;
- [ ] copy produces exact source;
- [ ] horizontal scroll works;
- [ ] theme switch recolors code immediately;
- [ ] light/dark appearance switch selects the correct code variant;
- [ ] unknown language never breaks rendering;
- [ ] custom preset edits persist after restart;
- [ ] export/import preserves syntax palette;
- [ ] old theme import without code data succeeds and derives a palette;
- [ ] no HTML in code executes;
- [ ] very large code falls back to plain rendering without freezing.

---

## 19. Security and Reliability Constraints

Do not:

- use `dangerouslySetInnerHTML`;
- inject highlighted HTML strings;
- dynamically import a grammar from a user-provided fence label;
- use `eval`/`Function`;
- bypass `rehype-sanitize`;
- weaken current URL sanitization;
- move theme persistence into an insecure new location;
- expose filesystem/IPC capabilities to the Markdown renderer;
- add network-loaded fonts, styles, scripts, or grammars;
- introduce CDN dependencies;
- hardcode syntax colors in rendering components;
- weaken theme/token verifier rules;
- weaken CSP;
- weaken tests or skip failing tests;
- convert unknown languages into errors shown to the user;
- create a feature branch or worktree for normal execution;
- force-push;
- rewrite user-owned uncommitted changes.

The syntax highlighter must remain a local deterministic renderer.

---

## 20. Git and Publication Rules

This handoff authorizes implementation work only. It does **not** independently authorize a commit, push, tag, release, PR, or GitHub mutation.

Follow `AGENTS.md` and the user's explicit execution instruction at the time the agent runs.

If publication is later explicitly authorized:

1. work only on local `main`;
2. run required validation;
3. review the final diff;
4. verify no unrelated/user-owned changes are included;
5. commit directly to `main`;
6. never force-push;
7. push to remote `main`;
8. verify remote SHA matches the intended local commit;
9. inspect hosted CI/CodeQL when required by acceptance.

---

## 21. Definition of Done

The task is complete only when all of the following are true:

- [ ] recognized fenced code is syntax-highlighted;
- [ ] inline code is theme-aware;
- [ ] code styling changes instantly with the active theme;
- [ ] no syntax color is hardcoded in chat/CSS rendering logic;
- [ ] all live built-in theme families have complete light/dark code styling;
- [ ] Theme Maker exposes preset and detailed code/syntax controls;
- [ ] Theme Preview demonstrates real syntax colors;
- [ ] custom code palettes persist across restart;
- [ ] YAML export/import round trips code configuration;
- [ ] legacy themes without code configuration still load;
- [ ] unknown languages safely fall back;
- [ ] huge code blocks safely fall back;
- [ ] copy-code source is unchanged;
- [ ] Refractor integration does not use raw HTML injection;
- [ ] theme tests pass;
- [ ] code-rendering tests pass;
- [ ] YAML/persistence tests pass;
- [ ] i18n gates pass;
- [ ] bundle budget passes;
- [ ] typecheck passes;
- [ ] ESLint passes;
- [ ] full CI/contracts/build gates pass or any unrelated pre-existing failure is explicitly evidenced;
- [ ] manual light/dark/custom-theme acceptance is complete;
- [ ] `docs/design/THEME_SYSTEM.md` is current;
- [ ] `docs/summary_of_work.md` records the session accurately.

---

## 22. Final Agent Report Format

At completion, return:

```markdown
# Theme-Aware Code Rendering — Completion Report

## Baseline
- Local starting SHA:
- Final local SHA:
- Branch:
- Package version:
- Node:
- npm:

## Implemented
- Theme schema/code-token changes:
- Built-in preset coverage:
- Markdown highlighter:
- Supported languages:
- Theme Maker:
- Theme Preview:
- Persistence/YAML:
- Accessibility:
- i18n:
- Documentation:

## Files Changed
- ...

## Validation
| Command | Result |
|---|---|
| ... | PASS/FAIL |

## Manual QA
- Dark themes tested:
- Light themes tested:
- Custom theme persistence:
- Export/import:
- Unknown language:
- Large code fallback:

## Remaining Issues
- None
```

If anything remains, list only verified residual issues with exact reproduction evidence. Do not claim completion while a required item is deferred.
