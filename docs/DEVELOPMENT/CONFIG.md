# Venice Forge — Local Master Config

> Last updated: 2.1.0

Venice Forge reads a small, optional set of YAML files at startup to let
developers and power users configure behavior without using the UI. API keys
remain **secure by default**: plaintext keys in the YAML are imported into
OS-level secure storage (`safeStorage`) on startup and then redacted from
the file.

## TL;DR

```bash
# Copy the example templates and start editing
npm run config:init

# Validate the file from the CLI (no Electron required)
npm run config:validate

# Print the sanitized effective config
npm run config:print

# Or open the live config folder from the app:
#   Settings → Local Config → Open Config Folder
```

## File Locations

| Mode | Path |
|------|------|
| Env override | `VENICE_FORGE_CONFIG_FILE=/abs/path/config.yaml` |
| Env override | `VENICE_FORGE_THEMES_FILE=/abs/path/themes.yaml` |
| Development (repo-local) | `<repo>/.config/config.local.yaml` |
| Development (repo-local) | `<repo>/.config/themes.local.yaml` |
| Packaged desktop | `<app.getPath("userData")>/.config/config.yaml` |
| Packaged desktop | `<app.getPath("userData")>/.config/themes.yaml` |
| Built-in default | `src/config/defaultConfig.ts` (code) |

Precedence is **env override > repo-local > userData > built-in default**.

In dev, the repo-local `.config/` folder is preferred. In packaged builds,
the userData path is the canonical writable location; signed macOS bundles
and Windows install directories may be read-only and are not used.

## Schema (v1)

```yaml
version: 1

app:
  config_name: "default"          # string, 1..128 chars
  profile: "default"              # string, 1..32 chars
  auto_open_devtools: false       # boolean
  check_for_updates: true         # boolean

secrets:
  # Leave blank by default.
  # If provided, plaintext keys are imported into OS secure storage on
  # startup and redacted from this file (unless keep_plaintext_keys=true).
  venice_api_key: ""
  jina_api_key: ""
  keep_plaintext_keys: false      # default: false (redact after import)

theme:
  active: "builtin-dark"          # built-in id or local theme name
  themes_file: ""                 # optional: path to a local themes overlay

models:
  chat: ""                        # empty = use UI default
  image: ""
  video: ""
  audio: ""
  music: ""
  embedding: ""
  upscale: ""

chat:
  system_prompt: ""               # max 32 KiB
  temperature: 0.7                # clamped to [0, 2]
  top_p: 1                        # clamped to [0, 1]
  max_tokens: 4096                # clamped to [1, 200000]
  include_venice_system_prompt: true
  enable_web_search: "off"        # "off" | "on" | "auto"
  enable_web_scraping: false
  enable_web_citations: false
  strip_thinking_response: false
  disable_thinking: false
  # Character chat scene generation is currently controlled from the UI
  # (Settings → Defaults & Behavior). It defaults to disabled with a manual
  # mode; an automatic mode generates a scene when the assistant emits the
  # <venice_forge_scene_request> marker. These settings are not exposed in
  # YAML because the feature is scoped per-user and is toggled at runtime.

memory:
  enable_memory_retrieval: true
  show_pulled_context_before_sending: false

research:
  default_provider: "venice"      # "venice" | "jina" | "auto"
  enable_jina: false
  enable_social_discovery: false

characters:
  enabled: true
  include_adult_characters: false
  default_character_slug: ""

safety:
  local_family_safe_mode_enabled: true  # false = Adult Mode; skips local rule evaluation
  venice_api_safe_mode: true            # provider-side safe_mode, independent

developer:
  verbose_config_logging: false
  allow_config_key_import: true   # if false, plaintext keys in YAML are ignored
  force_import_keys: false        # overwrite secure-store keys on every startup
  force_apply_config: false       # if true, config overrides UI-saved settings
```

## Themes Overlay (`themes.yaml`)

```yaml
version: 1

themes:
  my-team-dark:
    display_name: "My Team Dark"
    mode: "dark"                   # "dark" | "light"
    tokens:
      background: "#0d1117"
      surface: "#161b22"
      surface_elevated: "#1c2330"
      surface_muted: "#11161d"
      border: "#2a3140"
      border_strong: "#6b7686"
      foreground: "#e6edf3"
      foreground_muted: "#9aa7b8"
      foreground_subtle: "#7d8999"
      accent: "#1a6fd6"
      accent_foreground: "#ffffff"
      success: "#3fb950"
      success_foreground: "#0d1117"
      warning: "#d29922"
      warning_foreground: "#0d1117"
      danger: "#f85149"
      danger_foreground: "#0d1117"
      input_background: "#1c2330"
      input_foreground: "#e6edf3"
      placeholder: "#7d8999"
      disabled_foreground: "#6b7686"
      button_primary_background: "#1a6fd6"
      button_primary_foreground: "#ffffff"
      button_secondary_background: "#1c2330"
      button_secondary_foreground: "#e6edf3"
      link: "#58a6ff"
      focus_ring: "#4c93f8"
      selection_background: "#1a6fd6"
      selection_foreground: "#ffffff"
```

Built-in themes load first. Local themes override built-ins by exact name.
Invalid entries are skipped with a redacted warning in the Settings UI.
Token names may be written in snake_case (recommended for YAML) or camelCase. Missing semantic roles inherit compatibility-safe values from the selected base theme.

## Security Model (Non-Negotiable)

| Rule | Enforcement |
|------|-------------|
| Renderer never sees raw API keys | IPC returns `secrets.has_venice_api_key: boolean` only |
| Default config files contain no real keys | Templates ship with empty strings |
| Plaintext keys imported to `safeStorage` on startup | `electron/services/configService.ts` → `setApiKey/setJinaApiKey` |
| Plaintext keys redacted after import | `redactKeysInYaml` mutates the parsed YAML document, then an awaited temp-file + rename atomically rewrites the file unless `keep_plaintext_keys: true` |
| Existing secure-store key is not overwritten | Default: import skipped if key already present |
| Force overwrite requires explicit flag | `developer.force_import_keys: true` |
| Remote URLs are rejected | `looksLikeUrl()` returns a `ConfigWarning` and falls back to default |
| Local secret files are gitignored | `.config/*.yaml` ignored, `!.config/*.example.yaml` re-included |
| Generic patches cannot set plaintext keys | `writeSanitizedConfig()` strips `secrets.*` regardless of input |
| Raw keys never logged | `electron/services/logger.ts` redacts `api_key`, `vn-`, etc. |
| Export template contains no raw keys | `exportConfigTemplate()` builds a sanitized `YamlConfig` |
| Safety controls remain independent | `safety.local_family_safe_mode_enabled` controls only the local filter; `safety.venice_api_safe_mode` controls only Venice's provider parameter |

## Family Safe Mode and Adult Mode

Family Safe Mode is Venice Forge's local child/family-safe filter and defaults to `true`. Adult Mode sets `local_family_safe_mode_enabled: false`; the local rule engine is not invoked at all. Venice API Safe Mode remains provider-side and is controlled separately by `venice_api_safe_mode`.

## Precedence

For runtime settings:

1. Explicit UI/user setting saved after first run.
2. YAML config value (only when `developer.force_apply_config: true`).
3. Built-in default.

For API keys:

1. Existing secure-store key.
2. YAML secret imported into secure store if secure store key missing
   (or `developer.force_import_keys: true`).
 3. No key configured.

## Internal Prompt Enhancer

```yaml
internal_prompt_enhancer:
  enabled: true
  model: "venice-uncensored-1-2"
  temperature: 0.4
  maxTokens: 350
  systemPrompt: ""
  remixSystemPrompt: ""
```

The internal prompt-enhancer is a hidden under-app LLM helper used
exclusively for image prompt **Enhance** and **Remix** in Image Studio
and the gallery inspector. It is **not** a user-chat-accessible model
and the model id is **not** exposed in the normal chat / model
selector. The default system prompts are task-focused and affirm that
the app's existing safety guard and the upstream provider controls
remain authoritative — they do not reframe the enhancer as
overriding the local Family / CSAM rules.

- `enabled: false` disables the **Enhance** and **Remix** buttons in
  Image Studio and the gallery inspector (with a tooltip explaining
  why).
- `model` is a verified Venice model id (e.g. `venice-uncensored-1-2`).
  The default is verified against the live `/models` endpoint.
- `temperature` is clamped to `[0, 2]`.
- `maxTokens` is clamped to `[1, 4000]`.
- `systemPrompt` and `remixSystemPrompt` accept custom task-focused
  rewrites. Empty string falls back to the safe defaults in
  `src/config/configSchema.ts` (`DEFAULT_ENHANCE_SYSTEM_PROMPT` /
  `DEFAULT_REMIX_SYSTEM_PROMPT`).

## Examples

### Bootstrap a key for a fresh dev environment

```yaml
# .config/config.local.yaml
version: 1
secrets:
  venice_api_key: "vn-abc...your-key"
  jina_api_key: ""
  keep_plaintext_keys: false  # redacted after first run
```

### Lock in some defaults for the team

```yaml
version: 1
chat:
  temperature: 0.3
  enable_web_search: "auto"
memory:
  enable_memory_retrieval: true
```

### Add a custom theme overlay

`themes.local.yaml`:

```yaml
version: 1
themes:
  forge-graphite-extra:
    display_name: "Graphite (extra contrast)"
    mode: "dark"
    tokens:
      # ...all REQUIRED_THEME_TOKEN_KEYS required
```

### Recover from a malformed YAML

If `config.yaml` is broken, the app still boots with built-in defaults and
shows a parse error in **Settings → Local Config**. Fix the file on disk
and click **Reload Config** (or restart the app).

### Fully reset config

- **In-app**: Settings → Local Config → *Clear Secure Store* removes API
  keys. To reset the YAML to defaults, delete the file and restart.
- **CLI**: delete `.config/config.local.yaml` and `.config/themes.local.yaml`,
  then `npm run config:init` to recreate from examples.

## CLI

| Command | Purpose |
|---------|---------|
| `npm run config:init` | Copy `.config/*.example.yaml` → `.config/*.local.yaml` |
| `npm run config:validate` | Parse and validate without launching Electron; non-zero exit on errors |
| `npm run config:print` | Print the sanitized effective config to stdout (never raw keys) |

## Security Disclosure

If you discover a path-traversal, SSRF, or key-leakage issue related to the
config system, please open a private security report. Do not commit real
API keys to Git history under any circumstances — even the example
templates are not exempt.
