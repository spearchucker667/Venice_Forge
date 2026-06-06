# Venice Forge

<p align="center">
  <img src="./assets/branding/venice-logo-lockup-red.svg" alt="Venice Forge — unofficial Venice.ai API client" width="320" />
</p>

<p align="center">
  <strong>An unofficial, third-party desktop client for the Venice API.</strong><br>
  <em>Chat, create images, batch prompts, and research the web — all powered by Venice.</em>
</p>

> [!IMPORTANT]
> **18+ Age Requirement**: You must be 18 years or older to use this application. This app connects to unrestricted AI endpoints that pose inherent risks, including the potential to generate explicit content or AI-generated images that inappropriately represent minors (CSAM). By proceeding, you confirm you are 18+ and assume all responsibility.
>
> **Venice Forge is an unofficial, third-party desktop client for the Venice API.** This project is not affiliated with, endorsed by, sponsored by, or maintained by Venice.ai, Inc. Venice names and marks are used solely for nominative identification of API compatibility. This app requires a Venice API key for live model discovery and generation. See [docs/LEGAL.md](docs/LEGAL.md) for full legal terms.

[![CI](https://github.com/spearchucker667/Venice-API-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/spearchucker667/Venice-API-connector/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/spearchucker667/Venice-API-connector?include_prereleases&label=release)](https://github.com/spearchucker667/Venice-API-connector/releases)
[![Windows Release](https://img.shields.io/badge/platform-Windows-0078d4?logo=windows11)](https://github.com/spearchucker667/Venice-API-connector/releases)
[![macOS Release](https://img.shields.io/badge/platform-macOS-000000?logo=apple)](https://github.com/spearchucker667/Venice-API-connector/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node 20/22](https://img.shields.io/badge/node-20%20%7C%2022-339933.svg)](package.json)
[![TypeScript strict](https://img.shields.io/badge/typescript-strict-3178c6.svg)](tsconfig.json)
[![Electron 42](https://img.shields.io/badge/electron-42-47848f.svg)](package.json)
<img width="1774" height="887" alt=" " src="https://github.com/user-attachments/assets/4981bc4d-a743-4a0f-a6e7-48ddffb6edcb" />
## 🚀 Quick Start

1. **Download** a release from [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases)
   - Windows: `Venice-Forge-<version>-x64-Setup.exe` or portable `.exe`
   - macOS: `.dmg` (Intel or Apple Silicon)

2. **Install** and launch Venice Forge

3. **Add your Venice API key** in **Config** → save it → test the connection

4. **Start chatting, creating images, or running research!**

### Local YAML config (advanced / dev)

You can also configure Venice Forge by editing a `config.yaml` file on disk. Plaintext API keys placed in it are imported into OS-level secure storage on startup and then redacted from the file. See [`docs/CONFIG.md`](docs/CONFIG.md).

```bash
npm run config:init       # Copy example templates to .config/*.local.yaml
npm run config:validate   # Validate the file without launching Electron
npm run config:print      # Print the sanitized effective config
```

For development, see [Development](#-development--setup) or [docs/ABOUT.md](docs/ABOUT.md) for architecture details.

---

## ✨ Features

Fourteen integrated tabs covering chat, media generation, research, and settings — wired into a single canonical tab registry at `src/config/tabs.ts`:

| Tab | Name | What You Can Do |
|-----|------|-----------------|
| 💬 | **Chat** | Multi-turn streaming conversations with system prompts, file/image attachments, drag & drop context reordering, memory injection, persistent history, chat forking, and Agent vs Classic toggle |
| 🖼️ | **Image Studio** | Generate images, **Edit** (single image inpainting), **Combine** (multi-image referencing), and **Upscale** (separate from video upscaling) |
| 🎬 | **Media Studio** | Browse, search, tag, and export every image and video Venice Forge has generated. Filter by Image / Video / Favorites / Upscaled / Edited, batch-select to favorite or delete, inspect lineage (parent + children) and per-model capabilities. See [`docs/MEDIA_STUDIO.md`](docs/MEDIA_STUDIO.md) |
| ♫ | **Audio Studio** | Text-to-speech with 50+ voices and formats, plus audio transcription via Whisper |
| 🎵 | **Music Studio** | AI music generation with text-to-music, optional lyrics, duration control, and instrumental mode |
| 🎬 | **Video Studio** | Asynchronously queue text-to-video, image-to-video, video-to-video, reference-to-video, and video upscale jobs. Settings are model-dependent. Video upscale uses `topaz-video-upscale` when available |
| 🔢 | **Embeddings** | Vector embeddings generation for text with selectable models and dimension display |
| 🔍 | **Research** | Web search via Venice or Jina AI, page scraping, research synthesis, and public-profile discovery |
| 🎭 | **Characters** | Browse Venice hosted characters, sort/filter, and start character chats using `venice_parameters.character_slug` |
| 🎭 | **RP Studio** | Local-first character roleplay authoring + runtime: build character cards with avatars, write personas and lorebooks (keyword-triggered world info), run multi-character chats with speaker-aware turns, generate scene images linked to chat history, and inspect the prompt assembly trace. All content stays on disk; Family Safe Mode optionally runs the local filter at dispatch boundaries. See [`docs/CHARACTER_RP.md`](docs/CHARACTER_RP.md) |
| 🧩 | **Workflows** | Visual node editor for chaining models (Input → LLM → Image Gen → Output) with parallel branching |
| 🤖 | **Playground** | Conversational agent that builds and edits workflows on a live canvas using plain language |
| ⚙️ | **Config** | API key management (OS-level secure storage), theme editor (Venice Parity Dark, Graphite, Daylight, Copper, Dracula, GruvBox Dark, Rosepine) with custom YAML export/import, model defaults, data import/export, and a **Local Config** panel that surfaces the optional `config.yaml` / `themes.yaml` files (path, parse/validation warnings, key import status, Reload / Open Folder / Export Template / Clear Secure Store actions) |
| 📊 | **Status** | Transport mode, runtime info, rate-limit headers, sanitized diagnostics export, and a desktop-only “Open logs folder” action |

The catalog of available Venice models and the multi-prompt batch runner are exposed inside **Config → Models** and **Config → Batch** as sub-views (the canonical tab order is the 14 rows above; both Catalog and Batch are not separate top-level tabs).

---

## 🏗️ Architecture

**Desktop & Web Dual-Mode:**
- **Electron desktop app** (Windows/macOS) — React renderer + Electron IPC + main-process HTTPS client
- **Web mode** (development/self-hosted) — React renderer + Express proxy server
- **Unified Venice API layer** — all traffic goes through validated, safety-checked paths

**Security-first design:**
- Renderer cannot access raw API keys (stored in OS Keychain/DPAPI)
- Toggleable Family Safe Mode local filter, separate from Venice API Safe Mode
- Encrypted IndexedDB storage, secure chat history snapshots, trusted URL validation
- Zero telemetry, no external analytics

See [docs/ABOUT.md](docs/ABOUT.md) for detailed architecture and [SECURITY.md](SECURITY.md) for the full security model.

---

## 📋 Requirements

| Requirement | Version |
|-------------|---------|
| **Node.js** | 20 or 22 |
| **npm** | 10+ |
| **Desktop OS** | Windows 10/11 or macOS 13+ |
| **Venice API Key** | From [venice.ai](https://venice.ai) |

For development, the same Node/npm versions are required. Linux development is supported but release packaging for Linux is not officially maintained.

---

## 🚀 Development & Setup

### First-Time Setup

```bash
# 1. Clone and install
git clone https://github.com/spearchucker667/Venice-API-connector.git
cd Venice-API-connector
npm install

# 2. Start the Electron app (recommended for development)
npm run dev:electron

# OR start web-mode development
npm run dev:web

# 3. Add your Venice API key in the Config tab
```

### Key Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:electron` | Start Electron app with live reload |
| `npm run dev:web` | Start Vite + Express web dev server |
| `npm run lint:eslint` | Lint all source code (0 warnings) |
| `npm run typecheck` | TypeScript check for renderer + Electron |
| `npm test` | Run all unit and integration tests |
| `npm run test:watch` | Watch mode for tests |
| `npm run verify:safety-guard` | **Security gate:** verify safety guard is enforced |
| `npm run verify:markdown-links` | Validate local Markdown targets and heading fragments |
| `npm run profile:media-studio` | Profile 1,000 encrypted Media Studio records in isolated Electron |
| `npm run build` | Build production app (`dist/`, `dist-electron/`) |
| `npm run clean` | Remove all generated output |

### Environment Variables (Web Mode Only)

Copy `.env.example` to `.env`:

```bash
# Required
VENICE_API_KEY="your-venice-inference-key"

# Optional
PORT=3000                              # Server port (default: 3000)
HOST=127.0.0.1                         # Bind address (default: 127.0.0.1)
NODE_ENV=development                   # development | production | test
VENICE_FORGE_DEBUG_DEVTOOLS=false      # Allow DevTools in production
VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=false  # Linux plaintext fallback (⚠️ security warning)
```

For the full list of env vars and their purposes, see `.env.example`.

---

## 📦 Building & Packaging

### Windows Packaging

```bash
npm run dist:win
npm run checksum:release
npm run verify:dist:win
```

Outputs to `release/`:
- `Venice-Forge-<version>-x64-Setup.exe` — NSIS installer
- `Venice-Forge-<version>-x64-Portable.exe` — standalone portable executable

### macOS Packaging

```bash
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

Outputs to `release/`:
- `Venice-Forge-<version>-arm64.dmg` / `.zip` — Apple Silicon bundle
- `Venice-Forge-<version>-x64.dmg` / `.zip` — Intel bundle

### Signing & Notarization

- **Local builds:** Unsigned by default; may trigger SmartScreen (Windows) or Gatekeeper (macOS) warnings.
- **Official releases:** Signed only when the release workflow is supplied valid Windows and/or Apple signing credentials. Release notes must state whether each artifact is signed or unsigned.
- **macOS Gatekeeper workaround (local builds):** `xattr -dr com.apple.quarantine "/path/to/Venice Forge.app"`

For detailed signing and notarization steps, see [docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md).

**Icon Resources:** Build icons (`build/icon.ico`, `build/icon.icns`, `build/icon.png`) are required for packaging. This repo includes placeholder icons; run `npm run generate:icon` if missing, then replace with final artwork before release.

---

## 💾 Data Storage & Privacy

| Data Type | Location | Encryption |
|-----------|----------|------------|
| **API Keys** (Desktop) | OS Keychain (macOS) / DPAPI (Windows) | OS-level (encrypted at rest) |
| **Logs** | Application support dir | Plain text (disk only) |
| **Chats** (Desktop) | `chat-history/*.json` (per-conversation file, atomic write) | Plain text on disk — the file is written in the user's profile directory; see the Encryption note below. |
| **Settings, Images, Conversations, Memories, Files, Character Cards, Personas, Lorebooks, RP Chats, RP Assets** | Renderer IndexedDB | AES-GCM (browser-managed key) |
| **Exports** | User-specified location | Versioned JSON (same as storage) |

**Encryption note:** the IDB-backed stores listed above are transparently encrypted at rest by `src/services/storageService.ts` (`ENCRYPTED_STORES` allowlist) using a browser-managed AES-GCM key. The desktop `chat-history/*.json` files are written as plaintext JSON because the main process does not have a stable, cross-platform key store that is accessible at every load. If you require encrypted chat history on disk, use the **Config → Data → Export** flow to keep an AES-GCM-encrypted backup out-of-band. (See the [Known Limitations](#-known-limitations) section for the threat-model scope of browser-managed AES-GCM keys.)

**Import/Export Notes:**
- Validation: JSON schema and size checks (max 25 MB)
- Merging: By ID (never clears existing data)
- Privacy: Secret-like fields are automatically stripped before export
- Safety: A backup is always saved before import

**Web Mode (Venice key):** The Venice API key lives in the Express server `.env` and is not exposed to the browser.  
**Desktop Mode (Venice and Jina keys):** Both keys are stored via OS secure storage and are not exposed to the renderer.  
**Web Mode (optional Jina override):** Development-only browser `localStorage` overrides may be used for low-volume Jina testing, but this is not secure storage and should not be documented as equivalent to desktop key isolation.

---

## 🔒 Security & Privacy

**Core Security Principles:**
1. **API key isolation** — Renderer cannot access raw keys (stored in OS secure storage)
2. **Venice endpoint allowlist** — Only the approved endpoints defined in `src/shared/validation.ts` are callable. The current allowlist includes chat, model discovery, search/scrape/text-parser, image generate/edit/upscale/multi-edit, and video queue/retrieve/quote/complete endpoints.
3. **Independent safety controls** — Family Safe Mode runs Venice Forge's local family filter; Adult Mode skips that local filter entirely. Venice API Safe Mode controls only the provider-side `safe_mode` parameter.
4. **No telemetry** — Venice Forge collects zero analytics or tracking data
5. **Trusted URL validation** — External links must be HTTPS with non-private hostnames

**Content Safety:**
- Advanced context detection and `negative_prompt` extraction
- Scanned at: renderer layer, Electron IPC layer, and Express proxy
- Fail-close design: errors result in 500 status (safe default)
- Raw prompt text is never logged anywhere

**For full details**, see [SECURITY.md](SECURITY.md) and [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md).

### Security audit & regression guards

The codebase is protected by **29 named regression guards** (`VERIFY-001`..`VERIFY-029`) that lock down security-, persistence-, accessibility-, performance-, and documentation-relevant surfaces. Each guard fails CI if a future change weakens the protection:

| ID | Locks | Test file |
|----|-------|-----------|
| `VERIFY-001` | Bridge bearer token never logged to console | `electron/services/bridgeServer.test.ts` |
| `VERIFY-002` | Constant-time token compare (timing-attack safe) | `electron/services/bridgeServer.test.ts` |
| `VERIFY-003` | Bridge aborts upstream on client disconnect | `electron/services/bridgeServer.test.ts` |
| `VERIFY-004` | Bridge JSON body cap (10 MiB) | `electron/services/bridgeServer.test.ts` |
| `VERIFY-005` | Chat-store flush-on-unload (`pagehide` + `beforeunload`) | `src/stores/chat-store.flush.test.ts` |
| `VERIFY-006` | `venice()` forwards `AbortSignal` to IPC | `src/lib/venice-client.test.ts` |
| `VERIFY-007` | Zero JSX inline `style={...}` (production CSP invariant) | `tests/csp/inlineStyleInvariant.test.ts` |
| `VERIFY-008` | `listConversations({ offset, limit })` server-side pagination | `electron/services/chatStorage.test.ts` |
| `VERIFY-009` | Dual Venice client surface contract | `src/lib/venice-client.dual.test.ts` |
| `VERIFY-010` | Zero out-of-allowlist inline colors (theme token invariant) | `tests/theme/inlineColorInvariant.test.ts` |
| `VERIFY-011` | Character-card storage invariants | `tests/storage/characterCardStorage.regression.test.ts` |
| `VERIFY-012` | RP chat storage invariants | `tests/storage/rpChatStorage.regression.test.ts` |
| `VERIFY-013` | Scene-generation safety + asset persistence | `tests/safety/sceneGeneration.regression.test.ts` |
| `VERIFY-014` | Character RP safety wrapper routing | `tests/safety/characterImportSafety.routing.test.ts` |
| `VERIFY-015` | Guarded IPC pipeline | `tests/safety/guardPipeline.test.ts` |
| `VERIFY-016` | Inspector non-mutating preview | `tests/safety/inspectorPreview.test.ts` |
| `VERIFY-017` | Renderer hydration gate | `tests/safety/hydrationGate.test.ts` |
| `VERIFY-018` | Provider `safe_mode` endpoint matrix | `tests/safety/veniceSafeMode.test.ts` |
| `VERIFY-019` | Electron Jina/scrape response-body screening | `electron/ipc/handlers.test.ts` |
| `VERIFY-020` | Media Studio persistence | `src/components/image/image-tools.test.tsx` |
| `VERIFY-021` | Chat-store dirty-map persistence (active + non-active saves) | `src/stores/chat-store.dirty.test.ts` |
| `VERIFY-022` | Canonical tab registry + legacy aliases | `src/config/tabs.test.ts` |
| `VERIFY-023` | `window.__veniceMediaDev` is dev-only | `src/components/gallery/gallery-view.test.tsx` |
| `VERIFY-024` | Config-key import does not report redaction before the atomic YAML rewrite completes | `electron/services/configService.test.ts` |
| `VERIFY-025` | RP chat creation appears in UI state only after persistence succeeds | `src/stores/rp-chat-store.test.ts` |
| `VERIFY-026` | Modal focus trap, initial focus, Escape close, and trigger restoration | `src/hooks/useFocusTrap.test.tsx` |
| `VERIFY-027` | Deferred, pre-indexed full-content conversation search | `src/components/layout/sidebar.test.tsx` |
| `VERIFY-028` | Timestamp-indexed, paginated encrypted Media Studio reads | `src/services/storageService.test.ts`, `src/stores/media-store.test.ts` |
| `VERIFY-029` | Local Markdown targets and heading fragments resolve | `scripts/verify-markdown-links.test.ts` |

The 2026-06-05 full-repo audit produced these fixes; see [docs/AUDIT_FOLLOWUP_2026_06_05.md](docs/AUDIT_FOLLOWUP_2026_06_05.md) for the full audit report (P0/P1/P2 status, commits, and follow-up items).

---

## 🎨 Theming

Venice Forge includes a full token-based theme system:

- **4 built-in palettes:** Forge Graphite, Forge Daylight, Forge Copper, Forge Dracula
- **Live theme editor:** Open **Config** → **Appearance** → **Theme Maker** to customize in real time
- **Persistent storage:** Custom themes are saved to encrypted IndexedDB and persist across sessions

See [docs/THEME_SYSTEM.md](docs/THEME_SYSTEM.md) for complete theming guide and token reference.

---

## ❓ Troubleshooting

| Symptom | Solution |
|---------|----------|
| **Missing icon** | `npm run generate:icon && npm run verify:icon` |
| **Packaging fails** | `npm run clean && npm install && npm run build && npm run dist:win` |
| **SmartScreen/Gatekeeper warning** | Expected for unsigned local builds; sign before release |
| **No API key prompt** | Manually open **Config**, save a key, test connection |
| **Chat history not loading** | Check chat-history folder (see Storage section); corrupted files are backed up as `.backup-{timestamp}` |
| **`400` on chat/image requests** | Verify model ID is valid and all parameters are correct strings |
| **`401` / `403` errors** | Check that your API key is valid and has proper scope |
| **`429` rate limit** | Wait for reset period (shown in **Status**) |
| **Transport/connection failure** | Open **Status**, copy debug info, check logs folder |

For more help, see [docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md) or open an issue.

---

## 📚 Documentation

All documentation is in the [docs](docs/) directory. Quick index:

### Getting Started
- **[docs/ABOUT.md](docs/ABOUT.md)** — Architecture overview, dual-mode design, security model
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — How to contribute and code standards
- **[docs/FAQ.md](docs/FAQ.md)** — Frequently asked questions

### Development
- **[docs/DEVELOPMENT/building.md](docs/DEVELOPMENT/building.md)** — Build system, Vite, Electron, esbuild
- **[docs/DEVELOPMENT/platform-support.md](docs/DEVELOPMENT/platform-support.md)** — Platform requirements and support matrix
- **[docs/DEVELOPMENT/troubleshooting.md](docs/DEVELOPMENT/troubleshooting.md)** — Common dev issues
- **[docs/DEVELOPMENT/macos.md](docs/DEVELOPMENT/macos.md)** — macOS-specific notes

### Release & Deployment
- **[docs/RELEASE/release.md](docs/RELEASE/release.md)** — Release process and checklist
- **[docs/RELEASE/signing-and-notarization.md](docs/RELEASE/signing-and-notarization.md)** — Code signing for Windows/macOS
- **[CHANGELOG.md](CHANGELOG.md)** — Version history and breaking changes

### Reference
- **[docs/THEME_SYSTEM.md](docs/THEME_SYSTEM.md)** — Token-based theming architecture
- **[docs/REPOSITORY_TREE.md](docs/REPOSITORY_TREE.md)** — Full repository structure and ownership
- **[docs/RESEARCH_PROVIDERS.md](docs/RESEARCH_PROVIDERS.md)** — Web research provider guide
- **[docs/JINA_PROVIDER.md](docs/JINA_PROVIDER.md)** — Jina AI configuration and limits
- **[docs/PUBLIC_PROFILE_DISCOVERY.md](docs/PUBLIC_PROFILE_DISCOVERY.md)** — Public profile discovery feature
- **[docs/summary_of_work.md](docs/summary_of_work.md)** — Canonical AI/dev-agent session handoff ledger (read + updated by every session)

### Legal & Governance
- **[SECURITY.md](SECURITY.md)** — Security policy and vulnerability disclosure
- **[docs/LEGAL.md](docs/LEGAL.md)** — Legal terms, disclaimers, and TOS
- **[docs/legal/PRIVACY.md](docs/legal/PRIVACY.md)** — Privacy policy and data handling
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — Community standards
- **[docs/SUPPORT.md](docs/SUPPORT.md)** — Support channels and issue routing

---

## ⚖️ Legal & Trademark

**Venice Forge** is an unofficial, independent, third-party client for the Venice API and is **not affiliated with, endorsed by, or maintained by Venice.ai, Inc.**

- Venice names and marks are used solely for nominative identification of API compatibility
- Official Venice brand assets remain the property of Venice.ai, Inc.
- This project's MIT License covers only the original code and documentation herein
- It does **not** grant rights to Venice.ai trademarks, brand assets, API terms, or third-party materials

**Before using Venice Forge:**
- Review [Venice Terms of Service](https://venice.ai/legal/tos)
- Review [Venice Privacy Information](https://venice.ai/privacy)
- Review [Venice API Documentation](https://docs.venice.ai)

**Full legal terms** are in [docs/LEGAL.md](docs/LEGAL.md).

---

## ⚠️ Reporting Safety Issues & CSAM

If you encounter unsafe content, safety guard bypasses, or AI-generated material that inappropriately represents minors (CSAM):

1. **NCMEC CyberTipline** (for child exploitation): [report.cybertip.org](https://report.cybertip.org/)
2. **Venice.ai Trust & Safety**: [venice.ai/support](https://venice.ai/support)
3. **Venice Forge Maintainers** (for app vulnerabilities): Use GitHub private vulnerability reporting in this repo

---

## 📈 Known Limitations

- **Auto-updates** are fetched securely via GitHub Releases
- **Release signing** is optional for local builds
- **IndexedDB encryption** uses a browser-managed AES-GCM key (reduces casual inspection risk but does not protect against malware, XSS, browser compromise, or same-user OS malware)
- **Malware within the OS user scope** is out of scope (may access process memory)
- **Linux packaging** is not officially maintained (contributions welcome!)

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

This project is actively maintained. For issues, feature requests, or security reports:
- **Issues:** [GitHub Issues](https://github.com/spearchucker667/Venice-API-connector/issues)
- **Security:** Use [GitHub private vulnerability reporting](https://github.com/spearchucker667/Venice-API-connector/security/advisories)
- **Support:** [docs/SUPPORT.md](docs/SUPPORT.md)

---

## 📋 Project Status

| Aspect | Status |
|--------|--------|
| Current Version | v1.0.5 ([Releases](https://github.com/spearchucker667/Venice-API-connector/releases)) |
| Maintenance | Actively maintained |
| Windows Support | ✅ Fully supported |
| macOS Support | ✅ Fully supported (Intel + Apple Silicon) |
| Linux Support | 🔧 Development-only (packaging not maintained) |
| Node.js | v20, v22 |
| TypeScript | Strict mode enforced |
| Family Safe Mode | ✅ On by default; toggleable to Adult Mode |
| Test Suite | Full Vitest suite plus 29 named regression guards |
| License | [MIT](LICENSE) |

Latest changes: See [CHANGELOG.md](CHANGELOG.md)

---

## 🎯 Roadmap & TODO

Active development tracked in [docs/TODO.md](docs/TODO.md). Current focus:

- Fixing remaining security and robustness issues
- Expanding test coverage
- Improving documentation and UX polish
- Community contributions

See [docs/TODO.md](docs/TODO.md) for the full list of open and completed items.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

**Exception:** Venice Forge does not grant rights to Venice.ai trademarks, logos, or brand assets. For Venice brand guidelines, see [venice.ai/brand](https://venice.ai/brand).

---

## 🙏 Acknowledgments & Credits

We would like to formally credit the [openvenice](https://github.com/spearchucker667/openvenice) repository and its creator, **[nikshepsvn](https://github.com/nikshepsvn)**, for the inspiring UI enhancements, workflows, and conceptual ideas that helped guide the extension of this application. While Venice Forge continues to run on our custom codebase and integration engine rather than a direct port, their layout enhancements, studios configuration, and workflows logic provided invaluable direction and inspiration.

Built with:
- [React 19](https://react.dev/)
- [Electron 42](https://www.electronjs.org/)
- [Vite 6](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)

Powered by [Venice API](https://docs.venice.ai/).

---

## 📞 Quick Links

- **Official releases:** [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases)
- **Issues & discussions:** [GitHub Issues](https://github.com/spearchucker667/Venice-API-connector/issues)
- **CI/CD status:** [GitHub Actions](https://github.com/spearchucker667/Venice-API-connector/actions)
- **Venice.ai:** [venice.ai](https://venice.ai) | [Docs](https://docs.venice.ai) | [API](https://api.venice.ai)

---

**Not affiliated with Venice.ai, Inc.**
