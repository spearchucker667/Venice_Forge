<p align="center">
  <img src="./assets/branding/venice-logo-lockup-red.svg" alt="Venice Forge — unofficial Venice API desktop client" width="320" />
</p>

<p align="center">
  <strong>Unofficial desktop client for the Venice API.</strong><br>
  <em>Chat, image generation, media workflows, research, characters, prompts, and local creative project management.</em>
</p>

<p align="center">
  <a href="https://github.com/spearchucker667/Venice-API-connector/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/spearchucker667/Venice-API-connector/actions/workflows/ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/spearchucker667/Venice-API-connector/releases">
    <img alt="Release" src="https://img.shields.io/github/v/release/spearchucker667/Venice-API-connector?include_prereleases&label=release" />
  </a>
  <a href="https://github.com/spearchucker667/Venice-API-connector/releases">
    <img alt="Windows" src="https://img.shields.io/badge/platform-Windows-0078d4?logo=windows11" />
  </a>
  <a href="https://github.com/spearchucker667/Venice-API-connector/releases">
    <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-000000?logo=apple" />
  </a>
  <a href="LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-green.svg" />
  </a>
  <a href="package.json">
    <img alt="Node 22" src="https://img.shields.io/badge/node-22.13%2B-339933.svg" />
  </a>
  <a href="tsconfig.json">
    <img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-3178c6.svg" />
  </a>
  <a href="package.json">
    <img alt="Electron 42" src="https://img.shields.io/badge/electron-42-47848f.svg" />
  </a>
</p>

<p align="center">
  <img width="1774" height="887" alt="Venice Forge application preview" src="https://github.com/user-attachments/assets/4981bc4d-a743-4a0f-a6e7-48ddffb6edcb" />
</p>

---

## Important Notice

> [!IMPORTANT]
> **Venice Forge is unofficial.**  
> Venice Forge is an independent, third-party desktop client for the Venice API. It is not affiliated with, endorsed by, sponsored by, or maintained by Venice.ai, Inc.
>
> Venice names, marks, and API references are used only for nominative identification of API compatibility. Official Venice brand assets remain the property of Venice.ai, Inc. This project's MIT License covers only the original code and documentation in this repository.
>
> A Venice API key is required for live model discovery and generation.

---

## Current Status

> [!WARNING]
> **Major workspace refactor in progress.**  
> The `main` branch is being transformed from a tabbed API client into a cohesive local creative workspace with Projects, shared assets, recipes, prompt libraries, research sessions, media lineage, command palette actions, and cross-studio handoffs.
>
> During this refactor, `main` may be unstable. APIs, storage migrations, UI layout, and internal contracts may change.
>
> For the most stable build, use the latest versioned artifact from [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases).

---

| Area | Status |
|---|---|
| Current release | `v1.0.6` |
| Maintenance | Active |
| Windows | Supported |
| macOS | Supported, Intel + Apple Silicon |
| Linux | CI-built artifacts supported; local cross-build is not maintained |
| Node.js | `22.13+` |
| TypeScript | Strict mode |
| License | MIT, excluding third-party marks/assets |
| Safety mode | Local Family Safe Mode available; provider safe-mode remains separate |
| Test posture | Vitest suite plus named regression guards |

---

## Quick Start

1. Download a build from [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases).

   Windows:
   - `Venice-Forge-<version>-x64-Setup.exe`
   - `Venice-Forge-<version>-x64-Portable.exe`

   macOS:
   - `Venice-Forge-<version>-arm64.dmg`
   - `Venice-Forge-<version>-x64.dmg`

   Linux:
   - AppImage, `.deb`, or `.rpm` release artifacts when available

2. Install and launch Venice Forge.

3. Open **Config**.

4. Add your Venice API key.

5. Test the connection.

6. Start using Chat, Image Studio, Media Studio, Research, Characters, RP Studio, Workflows, and the local workspace tools.

---

## What Venice Forge Does

Venice Forge is a local-first creative desktop workspace for the Venice API.

Core capabilities:

- Streaming AI chat
- Image generation, editing, combining, upscaling, and recipe reuse
- Media gallery with metadata, lineage, export, compare, tagging, and project scoping
- Prompt Library with versioning, import/export, project/global scope, and secret filtering
- Research workspace using Venice and optional Jina-backed search/scrape flows
- Character browsing and character chat using Venice-hosted characters
- Local RP Studio for character cards, personas, scenarios, lorebooks, and prompt-stack inspection
- Scene Composer for structured image prompt assembly
- Workflow templates and visual workflow execution planning
- Audio transcription and text-to-speech
- Music generation
- Video generation and video upscaling job queues
- Embeddings generation
- Theme editor and token-based custom themes
- Secure desktop API-key handling through OS secure storage
- Local storage, import/export, diagnostics, and privacy tooling

---

## Main Application Areas

| Area | Purpose |
|---|---|
| **Chat** | Streaming conversations, system prompts, attachments, persistent history, memory injection, chat forking, and Agent/Classical mode controls |
| **Image Studio** | Image generation, editing, multi-image combine/reference flows, upscaling, model-aware controls, seed handling, negative prompts, styles, steps, and capabilities display |
| **Media Studio** | Search, filter, inspect, tag, favorite, export, compare, bulk-select, assign to project, trace lineage, reuse recipes, regenerate, remix, upscale, and route media into other studios |
| **Prompts** | Prompt Library with version chains, tags, favorites, archives, safe import/export, and apply/save handoffs across Chat, Image Studio, Media Studio, Research, and workflows |
| **Audio Studio** | Text-to-speech and Whisper transcription |
| **Music Studio** | Text-to-music generation, lyrics, duration control, and instrumental mode |
| **Video Studio** | Async text-to-video, image-to-video, video-to-video, reference-to-video, and video-upscale queues |
| **Embeddings** | Text embedding generation with model and dimension visibility |
| **Research** | Venice/Jina search, scraping, public-profile discovery, persistent research sessions, findings, sources, citations, and summaries |
| **Characters** | Browse Venice-hosted characters and start character chats with `venice_parameters.character_slug` |
| **RP Studio** | Local character authoring/runtime with personas, lorebooks, scenarios, multi-character chats, scene image generation, and prompt assembly tracing |
| **Scene Composer** | Reusable scene components compiled into generation-ready recipes |
| **Workflows** | Visual and template-based model chains for multi-step creative tasks |
| **Playground** | Conversational workflow builder/editor with a live canvas |
| **Config** | API keys, model defaults, local config, themes, data import/export, secure-store controls, and diagnostics |
| **Status** | Runtime info, transport mode, rate-limit headers, logs, and sanitized diagnostics |

The canonical tab registry lives in:

```text
src/config/tabs.ts
````

Some legacy items, such as model catalog and batch prompting, are exposed as Config sub-views rather than separate top-level tabs.

---

## Architecture

Venice Forge supports both desktop and web-mode development.

### Desktop Mode

```text
Electron main process
  ├─ OS secure storage for API keys
  ├─ IPC request validation
  ├─ HTTPS Venice/Jina client boundaries
  ├─ local chat-history filesystem access
  └─ packaging/runtime integration

React renderer
  ├─ studios and workspace UI
  ├─ encrypted IndexedDB stores
  ├─ local project/media/prompt/research state
  └─ no raw API-key access
```

### Web Mode

```text
React renderer
  └─ Express proxy server
       ├─ .env API key access
       ├─ Venice/Jina request validation
       └─ provider response screening
```

### Security Model

Core invariants:

* Renderer does not receive raw desktop API keys.
* Desktop keys are stored through OS secure storage.
* Web-mode Venice keys live in server-side `.env`.
* Venice and Jina requests pass through allowlisted, validated request paths.
* Local Family Safe Mode is separate from provider-side Venice safe-mode parameters.
* Secret-like values are stripped from safe exports and diagnostics.
* Prompt text is not logged.
* No telemetry or analytics are collected by Venice Forge.
* External URL opening is constrained by trusted URL validation.

Read:

* [docs/ABOUT.md](docs/ABOUT.md)
* [SECURITY.md](SECURITY.md)
* [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md)

---

## Requirements

| Requirement    | Version / Notes                                        |
| -------------- | ------------------------------------------------------ |
| Node.js        | `22.13+`                                               |
| npm            | `10+`                                                  |
| Windows        | Windows 10/11                                          |
| macOS          | macOS 13+                                              |
| Linux          | Development supported; release packaging handled by CI |
| Venice API key | Required for live API usage                            |
| Jina API key   | Optional, used for Jina-backed research/search flows   |

---

## Development Setup

```bash
git clone https://github.com/spearchucker667/Venice-API-connector.git
cd Venice-API-connector

npm install
npm run dev:electron
```

Web-mode development:

```bash
npm run dev:server
npm run dev:web
```

Or run both server and web renderer:

```bash
npm run dev
```

---

## Local Configuration

Venice Forge can be configured from the app UI or from local YAML files.

Initialize local config templates:

```bash
npm run config:init
```

Validate local config:

```bash
npm run config:validate
```

Print the sanitized effective config:

```bash
npm run config:print
```

Plaintext API keys placed in local YAML are imported into OS-level secure storage on startup and then redacted from the file.

Read:

* [docs/CONFIG.md](docs/CONFIG.md)
* `.env.example`

---

## Key Development Commands

| Command                                      | Purpose                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev:electron`                       | Start Electron app with live reload                                  |
| `npm run dev:web`                            | Start Vite renderer only                                             |
| `npm run dev:server`                         | Start Express proxy only                                             |
| `npm run dev`                                | Start server + web renderer                                          |
| `npm run lint:eslint`                        | Run ESLint                                                           |
| `npm run typecheck`                          | TypeScript check for renderer and Electron code                      |
| `npm test`                                   | Run Vitest suite                                                     |
| `npm run test:watch`                         | Run tests in watch mode                                              |
| `npm run build`                              | Build production renderer/main output                                |
| `npm run clean`                              | Remove generated output                                              |
| `npm run verify:safety-guard`                | Verify local safety guard enforcement                                |
| `npm run verify:markdown-links`              | Validate local Markdown links and heading fragments                  |
| `npm run verify:workspace-contracts`         | Verify workspace/project/recipe contracts                            |
| `npm run verify:model-aware-recipes`         | Verify model-aware image controls and recipe compatibility           |
| `npm run verify:media-studio-power-tools`    | Verify Media Studio bulk/compare/lineage/export/handoff contracts    |
| `npm run verify:prompt-library`              | Verify Prompt Library data/UI/import/export contracts                |
| `npm run verify:storage-privacy`             | Verify storage/privacy dashboard contracts                           |
| `npm run verify:release-packaging-hardening` | Verify release, CI, packaging, artifact, and dist hygiene invariants |
| `npm run verify:archive-clean`               | Fail on tracked archive/build/secret contaminants                    |
| `npm run profile:media-studio`               | Profile encrypted Media Studio storage behavior                      |

For the complete command list, inspect:

```bash
cat package.json
```

---

## Environment Variables

Web mode uses `.env`.

Copy the template:

```bash
cp .env.example .env
```

Common values:

```bash
VENICE_API_KEY="your-venice-inference-key"
PORT=3000
HOST=127.0.0.1
NODE_ENV=development
VENICE_FORGE_DEBUG_DEVTOOLS=false
VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=false
```

Notes:

* Desktop Venice keys are stored through OS secure storage.
* Web-mode Venice keys belong in the Express server `.env`.
* Desktop Jina keys are stored through OS secure storage.
* Web-mode Jina browser overrides are session-memory only and should not be persisted in browser storage.

---

## Build and Package

### Windows

```bash
npm run clean
npm install
npm run build
npm run dist:win
npm run checksum:release
npm run verify:dist:win
```

Expected outputs in `release/`:

```text
Venice-Forge-<version>-x64-Setup.exe
Venice-Forge-<version>-x64-Portable.exe
```

### macOS

```bash
npm run clean
npm install
npm run build
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Expected outputs in `release/`:

```text
Venice-Forge-<version>-arm64.dmg
Venice-Forge-<version>-arm64.zip
Venice-Forge-<version>-x64.dmg
Venice-Forge-<version>-x64.zip
```

### Linux

Linux release artifacts are produced by CI when configured:

```text
AppImage
.deb
.rpm
```

Local cross-building from Windows/macOS is not maintained. Build on a Linux runner for reliable Linux packages.

---

## Signing and Notarization

Local builds are unsigned by default.

Expected behavior:

* Windows may show SmartScreen warnings.
* macOS may show Gatekeeper warnings.
* Official release signing depends on configured release workflow credentials.

macOS local-build quarantine workaround:

```bash
xattr -dr com.apple.quarantine "/path/to/Venice Forge.app"
```

Read:

* [docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md)
* [docs/RELEASE/release.md](docs/RELEASE/release.md)

---

## Data Storage and Privacy

| Data                                         | Location                       | Protection                                  |
| -------------------------------------------- | ------------------------------ | ------------------------------------------- |
| Desktop API keys                             | macOS Keychain / Windows DPAPI | OS secure storage                           |
| Web-mode Venice key                          | Express server `.env`          | Server-side only                            |
| Logs                                         | Application support directory  | Plain text, local disk                      |
| Desktop chat history                         | `chat-history/*.json`          | Plain text JSON in user profile             |
| Settings                                     | IndexedDB                      | AES-GCM through app storage service         |
| Conversations                                | IndexedDB                      | AES-GCM through app storage service         |
| Memories                                     | IndexedDB                      | AES-GCM through app storage service         |
| Files and attachments                        | IndexedDB                      | AES-GCM through app storage service         |
| Images/videos/media metadata                 | IndexedDB                      | AES-GCM through app storage service         |
| Character cards/personas/lorebooks/RP assets | IndexedDB                      | AES-GCM through app storage service         |
| Prompts/research/scenes/workflows            | IndexedDB                      | AES-GCM through app storage service         |
| Exports                                      | User-selected path             | Versioned JSON; secret-like fields stripped |

Encryption scope:

* IndexedDB-backed encrypted stores are protected by `src/services/storageService.ts`.
* Desktop `chat-history/*.json` files are plaintext because the Electron main process does not always have a stable cross-platform key path at load time.
* Browser-managed AES-GCM reduces casual disk inspection risk but does not protect against malware, active XSS, browser compromise, same-user OS compromise, or process-memory access.

Import/export behavior:

* JSON schema validation
* Size limits
* Backup-before-import
* Merge by ID
* Secret stripping before export
* Future-version rejection where applicable

---

## Safety and Reporting

Venice Forge includes local safety controls, but users remain responsible for their use of the application and provider endpoints.

Report:

1. **Child exploitation / CSAM:** [NCMEC CyberTipline](https://report.cybertip.org/)
2. **Venice.ai Trust & Safety:** [venice.ai/support](https://venice.ai/support)
3. **Venice Forge vulnerabilities:** GitHub private vulnerability reporting for this repository

Security policy:

* [SECURITY.md](SECURITY.md)

---

## Regression Guards and Audit Trail

Venice Forge uses named regression guards to prevent accidental weakening of security, persistence, packaging, accessibility, privacy, and workspace contracts.

Rather than embedding the full guard matrix in this README, the canonical details live in the docs:

* [docs/summary_of_work.md](docs/summary_of_work.md)
* [docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md](docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md)
* [docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md](docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md)
* [docs/AUDIT_FOLLOWUP_2026_06_05.md](docs/AUDIT_FOLLOWUP_2026_06_05.md)
* [docs/POST_VENICE_JINA_AUDIT_2026_06_06.md](docs/POST_VENICE_JINA_AUDIT_2026_06_06.md)

Run the high-level verification suite:

```bash
npm run typecheck
npm test
npm run verify:safety-guard
npm run verify:markdown-links
npm run verify:workspace-contracts
npm run verify:model-aware-recipes
npm run verify:media-studio-power-tools
npm run verify:prompt-library
npm run verify:storage-privacy
npm run verify:release-packaging-hardening
```

---

## Theming

Venice Forge includes a token-based theme system.

Built-in themes include:

* Forge Graphite
* Forge Daylight
* Forge Copper
* Forge Dracula
* Venice Parity Dark
* GruvBox Dark
* Rosepine

Theme features:

* Runtime CSS token application
* WCAG-aware semantic pairs
* Live Theme Maker
* YAML import/export
* Encrypted custom-theme persistence
* Legacy theme compatibility paths

Read:

* [docs/THEME_SYSTEM.md](docs/THEME_SYSTEM.md)

---

## Troubleshooting

| Symptom                           | Fix                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Missing app icon                  | `npm run generate:icon && npm run verify:icon`                                 |
| Packaging fails                   | `npm run clean && npm install && npm run build` before packaging               |
| SmartScreen or Gatekeeper warning | Expected for unsigned local builds                                             |
| No API key prompt                 | Open **Config**, save key, test connection                                     |
| Chat history not loading          | Inspect `chat-history`; corrupted files are backed up as `.backup-{timestamp}` |
| `400` from chat/image requests    | Verify selected model and payload parameters                                   |
| `401` / `403`                     | Verify API key validity and scope                                              |
| `429`                             | Check reset information in **Status**                                          |
| Research provider failure         | Check Venice/Jina config, provider limits, and logs                            |
| Transport failure                 | Open **Status**, export sanitized diagnostics, inspect logs folder             |

Read:

* [docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md)
* [docs/SUPPORT.md](docs/SUPPORT.md)

---

## Documentation Index

### Start Here

* [docs/ABOUT.md](docs/ABOUT.md) — architecture, modes, security posture
* [docs/FAQ.md](docs/FAQ.md) — common questions
* [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow

### Development

* [docs/DEVELOPMENT/building.md](docs/DEVELOPMENT/building.md)
* [docs/DEVELOPMENT/platform-support.md](docs/DEVELOPMENT/platform-support.md)
* [docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md)
* [docs/DEVELOPMENT/macos.md](docs/DEVELOPMENT/macos.md)
* [docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md)

### Release

* [docs/RELEASE/release.md](docs/RELEASE/release.md)
* [docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md)
* [CHANGELOG.md](CHANGELOG.md)

### Feature References

* [docs/THEME_SYSTEM.md](docs/THEME_SYSTEM.md)
* [docs/MEDIA_STUDIO.md](docs/MEDIA_STUDIO.md)
* [docs/CHARACTER_RP.md](docs/CHARACTER_RP.md)
* [docs/RESEARCH_PROVIDERS.md](docs/RESEARCH_PROVIDERS.md)
* [docs/JINA_PROVIDER.md](docs/JINA_PROVIDER.md)
* [docs/PUBLIC_PROFILE_DISCOVERY.md](docs/PUBLIC_PROFILE_DISCOVERY.md)
* [docs/CONFIG.md](docs/CONFIG.md)

### Governance

* [SECURITY.md](SECURITY.md)
* [docs/LEGAL.md](docs/LEGAL.md)
* [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md)
* [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
* [docs/SUPPORT.md](docs/SUPPORT.md)

### Project Ledger

* [docs/summary_of_work.md](docs/summary_of_work.md)
* [docs/TODO.md](docs/TODO.md)

---

## Known Limitations

* Local builds are unsigned unless signing credentials are configured.
* Auto-update behavior depends on release workflow configuration and GitHub Releases.
* Desktop chat-history files are plaintext JSON.
* IndexedDB encryption is not a malware/XSS/browser-compromise boundary.
* Same-user OS compromise and process-memory access are outside the local threat model.
* Linux packaging is CI-oriented; local cross-builds are not supported.
* Provider behavior, available models, model capabilities, and API limits may change upstream.
* Family Safe Mode is a local guardrail, not a legal/compliance guarantee.

---

## Contributing

Contributions are welcome.

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run verify:markdown-links
npm run verify:archive-clean
```

Read:

* [CONTRIBUTING.md](CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
* [SECURITY.md](SECURITY.md)

Use:

* [GitHub Issues](https://github.com/spearchucker667/Venice-API-connector/issues) for bugs and feature requests
* GitHub private vulnerability reporting for security issues
* [docs/SUPPORT.md](docs/SUPPORT.md) for support routing

---

## Roadmap

Active work is tracked in:

* [docs/TODO.md](docs/TODO.md)
* [docs/summary_of_work.md](docs/summary_of_work.md)

Current priorities:

* Workspace/project cohesion
* Media recipe and lineage improvements
* Research session polish
* Prompt/scene/workflow reuse
* Storage/privacy dashboard hardening
* Release packaging hardening
* Documentation canonicalization
* Test coverage expansion
* Accessibility and keyboard-navigation polish
* Security and safety regression coverage

---

## Legal and Trademark

Venice Forge is an unofficial, independent, third-party client for the Venice API.

It is not:

* affiliated with Venice.ai, Inc.
* endorsed by Venice.ai, Inc.
* sponsored by Venice.ai, Inc.
* maintained by Venice.ai, Inc.
* an official Venice product

Venice names, marks, API references, and brand assets belong to Venice.ai, Inc. They are referenced only for nominative compatibility identification.

Review:

* [Venice Terms of Service](https://venice.ai/legal/tos)
* [Venice Privacy Information](https://venice.ai/privacy)
* [Venice API Documentation](https://docs.venice.ai)
* [docs/LEGAL.md](docs/LEGAL.md)

---

## Credits

Venice Forge credits the [openvenice](https://github.com/spearchucker667/openvenice) repository and its creator, [nikshepsvn](https://github.com/nikshepsvn), for UI, workflow, studio-layout, and conceptual inspiration.

Venice Forge remains a separate custom codebase and integration engine, not a direct port.

Built with:

* [React](https://react.dev/)
* [Electron](https://www.electronjs.org/)
* [Vite](https://vitejs.dev/)
* [TypeScript](https://www.typescriptlang.org/)
* [Tailwind CSS](https://tailwindcss.com/)

Powered by the [Venice API](https://docs.venice.ai/).

---

## License

This project is licensed under the [MIT License](LICENSE).

The MIT License does not grant rights to Venice.ai trademarks, logos, brand assets, API terms, or third-party materials.

---

## Quick Links

* [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases)
* [GitHub Issues](https://github.com/spearchucker667/Venice-API-connector/issues)
* [GitHub Actions](https://github.com/spearchucker667/Venice-API-connector/actions)
* [Venice.ai](https://venice.ai)
* [Venice API Docs](https://docs.venice.ai)
* [Venice API](https://api.venice.ai)

---

<p align="center">
  <strong>Venice Forge is not affiliated with Venice.ai, Inc.</strong>
</p>
