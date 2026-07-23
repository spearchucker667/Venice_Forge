<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/branding/venice-logo-lockup-white.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/branding/venice-logo-lockup-black.svg" />
    <img src="assets/branding/venice-logo-lockup-black.svg" alt="Venice Forge" width="420" />
  </picture>
</div>

# Venice Forge

**Unofficial local-first desktop workspace for the Venice API.**

*An advanced frontend client for streaming chat, image studio pipelines, video & music generation, research synthesis, SillyTavern-compatible character authoring, roleplay scripting, visual workflows, and local creative asset management.*

<p align="center">
  <a href="https://github.com/spearchucker667/Venice_Forge/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/spearchucker667/Venice_Forge/actions/workflows/ci.yml/badge.svg" />
  </a>
  <a href="https://github.com/spearchucker667/Venice_Forge/releases">
    <img alt="Release" src="https://img.shields.io/badge/release-v3.0.0--beta.1-blue.svg" />
  </a>
  <a href="https://github.com/spearchucker667/Venice_Forge/releases">
    <img alt="Windows" src="https://img.shields.io/badge/platform-Windows-0078d4?logo=windows11" />
  </a>
  <a href="https://github.com/spearchucker667/Venice_Forge/releases">
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
    <img alt="Electron 43" src="https://img.shields.io/badge/electron-43-47848f.svg" />
  </a>
</p>

---

<p align="center">
  <img src="assets/ChatGPT Image Jul 22, 2026, 07_51_49 PM.png" alt="Venice Forge - Your Local AI Workspace" width="100%" />
</p>

---

> [!IMPORTANT]
> **Venice Forge is an unofficial third-party project.** It is not affiliated with, endorsed by, sponsored by, or maintained by Venice.ai (Venice.ai, Inc.). Venice brand assets, names, and trademark marks are the property of Venice.ai, Inc.

> [!WARNING]
> The `main` branch is active development. Normal users should install a tagged release from [GitHub Releases](https://github.com/spearchucker667/Venice_Forge/releases).
> Document Agent provides limited function calling for app-managed documents and explicit, single-directory workspace grants. It cannot access shell, Git, network, keychain, databases, sibling directories, or OS controls. See the [Document Agent guide](docs/features/DOCUMENT_AGENT.md).

---

## Overview

Venice Forge is an unofficial, local-first creative desktop client for the [Venice API](https://docs.venice.ai). Designed as a premium, secure workspace, it empowers authors, artists, developers, and researchers with advanced local tooling that goes far beyond generic web interfaces.

By prioritizing local data ownership, Venice Forge runs all storage operations locally on your machine—utilizing IndexedDB with AES-GCM encryption in the browser/renderer and secure OS-level keychain boundaries for credentials.

---

## Feature Highlights

- **Local-First Backup & Sync:** Manually export/import encrypted `.vfbackup` archives, or use a background sync folder (e.g. iCloud, Dropbox) with automated end-to-end encrypted packet syncing and robust conflict resolution.
- **Streaming AI Conversations:** Experience highly responsive model outputs with full Markdown, LaTeX math rendering, prompt limits enforcement, and attachment context.
- **Projects & Workspaces:** Organize your chat histories, generation parameters, and media assets into logical local projects.
- **Document Tools & Workspace Grants:** Create non-overwriting managed documents, review exact edit diffs, retain immutable revisions, search text files across granted workspace directories, and export through native save boundaries.
- **Model-Aware Image Generation:** Image Studio UI dynamically adapts inputs to selected image models, preventing payload errors across edit, inpaint, background removal, and API-compliant 2×/4× upscaling.
- **Image Inspector & Prompt Reconstruction:** Analyze PNG, JPEG, or WebP images with a selected vision model, generate structured visual breakdowns and target-specific replication prompts, and derive text queries for potential-source discovery.
- **Media Studio Command Center:** Gallery view equipped with multi-select bulk operations, lineage graph tracing, visual diff comparison, and metadata-preserving exports.
- **Video & Music Studios:** Queue text/image-to-video and lyrics-driven music requests with explicit stage tracking (`queued` → `generating` → `retrieving` → `saving` → `completed`), durable stream persistence, and MP4/audio exports.
- **Research Workspace:** Synthesize facts using Venice/Jina-backed search, web scraping, and social discovery within an isolated sandbox.
- **Prompt Library & Scene Composer:** Version, tag, and reuse prompts; arrange prompts, media references, and models into structured visual scene compositions.
- **ST Card Studio & RP Studio:** Create, preview-import, edit, version, test, and verified-export Tavern V1 / Character Card V2 JSON and V2 PNG cards; manage personas, scenarios, lorebooks, multi-character chats, and scene generation.
- **Playground & Workflow Editor:** Interactive visual node graph builder for constructing and running multi-modal AI task chains.
- **Token-Based Styling:** Dynamic premium glassmorphism theme system supporting 35 built-in themes and fully custom YAML palette imports.

---

## Current Workspace Map

The navigation below uses the canonical tab labels from `src/config/tabs.ts`:

```mermaid
flowchart LR
  VF["Venice Forge"]
  VF --> Conversation["Conversation<br/>Chat · Character Chats · History"]
  VF --> Generate["Generate<br/>Image Studio · Media Studio · Image Inspector · Prompts · Scene Composer<br/>Audio Studio · Music Studio · Video Studio · Embeddings<br/>Research · Characters"]
  VF --> Build["Build<br/>RP Studio · Workflows · Documents · Playground"]
  VF --> System["System<br/>Privacy · Config · Status"]
```

---

## Current Workspace Map

| Area | Status | Purpose |
| :--- | :---: | :--- |
| **Chat** | Beta | Streaming conversations, projects, prompt injects, attachments, classical/agent modes |
| **Image Studio** | Beta | Model-aware generation, prompt enhancement, image editing, background removal, and 2×/4× upscaling |
| **Media Studio** | Beta | Visual gallery, multi-image comparison, lineage tracking, metadata bundle exports |
| **Image Inspector** | Beta | Bounded local-image ingestion, schema-validated visual analysis, target-specific replication prompts, and text-based potential-source discovery |
| **Prompts** | Beta | Prompt Library with global/project scopes, version chains, and tag management |
| **Scene Composer** | Beta | Visual composition tool for arranging prompts, media references, and models into scenes |
| **Audio Studio** | Beta | TTS speech generation with voice selection and configurable audio response formats |
| **Music Studio** | Beta | Lyrics-driven music generation, duration control, and instrumental toggle |
| **Video Studio** | Beta | Asynchronous text/image-to-video queues, stage tracking, durable stream persistence, and MP4 exports |
| **Embeddings** | Beta | Text vector array inspection and model evaluation |
| **Research** | Beta | Integrated search/scrape runner with Jina and Venice search synthesis |
| **Characters & RP** | Beta | SillyTavern-compatible ST Card Studio, local cards, personas, lorebooks, and multi-character chats |
| **RP Studio** | Beta | Standalone scenarios, openers, setting text, and character card seeding |
| **Workflows** | Beta | Versioned template-based automation chains |
| **Playground** | Beta | Interactive visual node graph builder and multi-model workflow execution engine |
| **Documents** | Beta | Managed-document tools, immutable revisions, workspace search/inspection, and directory grants |

---

## Research and Jina

The supported Research workspace provides Venice/Jina search, page scraping, AI synthesis, citations, saved sessions, document upload, findings, summaries, and prompt/workflow handoffs. The former embedded Research Browser is inactive; its implementation is retained only under `inactive-features/research-browser/` and is not imported, tested, bundled, or packaged.

---

## Characters, RP Studio, Memory, and Lorebooks

Roleplay and creative writing features are consolidated into a comprehensive **RP Studio**:
- **ST Card Studio:** Create, preview-import, edit, version, test, and verified-export Tavern V1 / Character Card V2 JSON and V2 PNG cards. Main-owned file dialogs, bounded PNG validation, secret filtering, lossless compatibility fields, encrypted local drafts, typed AI refinement proposals, alternate greetings, and embedded lorebook compilation preserve the app’s existing storage and safety boundaries. See [the user guide](docs/user/ST_CARD_STUDIO.md).
- **Authoring workflow:** A ten-step editor covers identity, prompts, greetings, example dialogue, embedded or linked character books, compatibility metadata, generation/refinement proposals, version comparison, and a disposable prompt-traced test turn that can be promoted explicitly into a real conversation.
- **Interoperability limits:** Character Card V3, compressed PNG metadata, embedded V3 assets, bulk ZIP libraries, and extension-specific editors are not supported. See the [compatibility reference](docs/reference/CHARACTER_CARD_V2_COMPATIBILITY.md).
- **Personas & Scenarios:** Manage user identity stacks and contextual background circumstances separately.
- **Lorebooks:** Define key-value triggers that inject world context or character history into the prompt window dynamically.
- **Memory Injection:** Active chats automatically query IndexedDB-backed semantic memories. Injected context is disclosed to users via a collapsible audit pill in the conversation UI.

---

## Image, Media, Audio, Music, Video, and Embeddings

Venice Forge provides a rich multimedia pipeline:
- **Image Generation:** The Image Studio handles prompts, negatives, seeds, aspect ratios, and model-specific parameters.
- **Image Inspection:** Image Inspector accepts bounded PNG, JPEG, and WebP inputs, uses live model capability metadata to select vision models, validates structured analysis before persistence, and produces prompts for Generic Natural Language, Venice Image Studio, FLUX, or Midjourney. Optional Google/Brave discovery uses editable text queries; it is not pixel-based reverse-image matching. See the [Image Inspector guide](docs/user/IMAGE_INSPECTOR.md).
- **Media Studio:** The gallery indexes all outputs. You can select up to 4 images for a side-by-side field diff comparison, walk the parent-child lineage tree of remixed images, and export a redacted JSON manifest with deterministic sidecar filenames.
- **Audio & Music:** Supports Text-to-Speech speech queues and lyrics-driven Music generation.
- **Video:** Queues asynchronous text/image-to-video requests, shows explicit queued/generating/retrieving/saving stages, streams completed MP4 bytes into main-owned durable storage, and exports through a native Save As boundary.
- **Embeddings:** Evaluates text strings against available embedding models to inspect raw vector arrays.

---

## Profiles, Privacy, Local Storage, and Secure Credentials

Privacy is the core design pillar of Venice Forge:
- **No Telemetry:** The application does not collect analytics, telemetry, or crash reports.
- **Secure Key Storage:** In Electron, profile-scoped API keys are encrypted with Electron `safeStorage` and the ciphertext is stored in the owner-only `secure-prefs.json` app-data file (`safeStorage` uses Keychain-backed encryption on macOS and DPAPI on Windows; password-verifier records protect profile passwords, and it does not store API keys in plaintext).
- **Profiles & Isolation:** Profiles separate settings, conversations, and API keys. Locked profiles can be password-protected; password-verifier records and PBKDF2-SHA256 verifiers are managed entirely in the main process with a 5-attempt brute-force lockout.
- **Data Redaction:** The Traffic Inspector, application log files, and diagnostics exports automatically strip bearer tokens, API keys (`sk-...`, `vn-...`), local system paths, and raw prompt/response bodies.
- **Local Family Safe Mode:** Run-time guardrails screen outgoing prompts and inbound scrape responses locally. This is independent of the provider-side Venice API `safe_mode`.

---

## Theme System

The user interface uses a token-based styling model matching dynamic glassmorphism aesthetics.
- **YAML Themes:** Built-in and user-supplied themes live under `config/themes/` using standard CSS variable key-value maps.
- **Built-in Catalog (39 Themes):**
  - *Pastel Aqua/Pink Theme Pack:* cotton-candy-console, sweet-nightmare, dual-persona, polaroid-board.
  - *Dracula & Dark Palettes:* Basalt Noir, catppuccin, dracula, gruvbox_dark, midnight-velvet, monokai, nord, obsidian-bloom, one_dark, rosepine, solarized_dark, synthwave-harbor, tokyo_night, venice.
  - *Light & High Contrast:* amber-archive, arctic-glass, aurora-boreal, circuit-mint, copper, cyber-orchid, dark, desert-copperfield, ember-monastery, github_light, glacial-ink, harbor-fog, light, moss-circuit, neon-dusk, porcelain-daybreak, sakura-terminal, solar-ash, solarized_light, toxic-limewire, ultraviolet-rain.

---

## Quick Start for Users

1. Download the installer or portable binary for your OS from [GitHub Releases](https://github.com/spearchucker667/Venice_Forge/releases).
2. Install and launch **Venice Forge**.
3. Navigate to the **Config** tab.
4. Input your Venice API Key (and optionally your Jina API Key for advanced web scraping).
5. Click **Test Connection**.
6. Switch back to **Chat** or **Image Studio** to begin.

---

## Developer Setup

Ensure you have Node.js (`>=22.13.0 <23.0.0`) and npm (`>=10.0.0`) installed.

```bash
# Clone the repository
git clone https://github.com/spearchucker667/Venice_Forge.git
cd Venice_Forge

# Install dependencies exactly
npm ci

# Launch desktop development mode (Electron with Vite HMR)
npm run dev:electron
```

To run in **Web-only proxy mode** (useful for server setups or browser testing):
```bash
# Start concurrently (Express proxy server + Vite dev server)
npm run dev
```

---

## Validation / CI Gates

Before submitting a pull request, verify that all linting, typing, tests, and contract verifications pass:

```bash
# 1. Run ESLint (zero warnings enforced)
npm run lint:eslint

# 2. Run TypeScript compiler typechecks
npm run typecheck

# 3. Run full Vitest suite serially
npm test

# 4. Run safety, markdown links, and other local contract checks
npm run verify:contracts

# 5. Build production bundles
npm run build

# 6. Verify release packaging hardening and dist output
npm run verify:release-packaging-hardening
npm run verify:dist
```

---

## Repository Map

For a complete breakdown of every file, see [FILE_TREE.md](docs/FILE_TREE.md). Below is the high-level outline:

```text
.
├── electron/              # Main process, preload, IPC, native OS services
│   ├── ipc/               # IPC handlers partitioned by domain
│   └── services/          # Secure storage, logger, updater, guard pipelines
├── src/                   # React renderer, stores, services, visual views
│   ├── components/        # UI views (chat, image, media, settings, etc.)
│   ├── services/          # Venice API client, export, IndexedDB adapters
│   ├── stores/            # Zustand 5 slice stores (auth, settings, media)
│   └── theme/             # Token mappings, built-in YAML palettes, apply helpers
├── config/themes/         # Built-in YAML theme definitions
├── public/                # Static assets and browser default home page
├── docs/                  # Design, release, development, and legal docs
├── scripts/               # Build, verify, release, and hygiene scripts
├── tests/                 # Playwright smoke tests and accessibility suites
└── package.json           # Scripts, engines, and dependencies
```

---

## Legal, Privacy, Safety, and Abuse Policy

- **Unofficial Status:** Venice Forge is an independent frontend wrapper. Venice.ai does not offer direct support for this client.
- **Abuse Prohibitions:** Venice Forge must not be used to facilitate illegal content generation or harassment.
- **Vulnerability Disclosures:** Report security flaws or potential data leaks privately via GitHub Vulnerability Reporting.
- **Full Terms:** Read [LEGAL.md](LEGAL.md) and [PRIVACY.md](PRIVACY.md).

---

## License

Venice Forge is open-source software licensed under the [MIT License](LICENSE).
