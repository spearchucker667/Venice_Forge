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

<img width="2816" height="1536" alt="Venice Forge desktop app interface" src="https://github.com/user-attachments/assets/6b9f703d-69d6-44d8-a2b5-fe0499791f8a" />

---

## 🚀 Quick Start

1. **Download** a release from [GitHub Releases](https://github.com/spearchucker667/Venice-API-connector/releases)
   - Windows: `Venice-Forge-<version>-x64-Setup.exe` or portable `.exe`
   - macOS: `.dmg` (Intel or Apple Silicon)

2. **Install** and launch Venice Forge

3. **Add your Venice API key** in **Config** → save it → test the connection

4. **Start chatting, creating images, or running research!**

For development, see [Development](#-development) or [docs/ABOUT.md](docs/ABOUT.md) for architecture details.

---

## ✨ Features

Thirteen integrated tabs covering chat, media generation, batch automation, research, and settings:

| Tab | Name | What You Can Do |
|-----|------|-----------------|
| 💬 | **Chat** | Multi-turn streaming conversations with system prompts, file/image attachments, drag & drop context reordering, memory injection, persistent history, chat forking, and Agent vs Classic toggle |
| 🖼️ | **Image Studio** | Generate images, **Edit** (single image inpainting), **Combine** (multi-image referencing), and **Upscale** (separate from video upscaling) |
| 🎬 | **Video Studio** | Asynchronously queue text-to-video, image-to-video, video-to-video, reference-to-video, and video upscale jobs. Settings are model-dependent. Video upscale uses `topaz-video-upscale` when available |
| ♫ | **Audio Studio** | Text-to-speech with 50+ voices and formats, plus audio transcription via Whisper |
| 🎵 | **Music Studio** | AI music generation with text-to-music, optional lyrics, duration control, and instrumental mode |
| 🧩 | **Workflows** | Visual node editor for chaining models (Input → LLM → Image Gen → Output) with parallel branching |
| 🤖 | **Playground** | Conversational agent that builds and edits workflows on a live canvas using plain language |
| 🔢 | **Embeddings** | Vector embeddings generation for text with selectable models and dimension display |
| 📋 | **Batch** | Automate: run one prompt across many inputs, or chain multiple prompts in sequence |
| 🔍 | **Research** | Web search via Venice or Jina AI, page scraping, research synthesis, and public-profile discovery |
| 📚 | **Catalog** | Browse live Venice model catalog with capability details; auto-refresh on API key save. App requires a Venice API key for live model discovery |
| 🏞️ | **Library** | Local image gallery, saved chat files, and conversation history — with bulk multi-select download, deletion, and upscale |
| ⚙️ | **Config** | API key management, theme editor (Forge Graphite, Daylight, Copper, Dracula) with custom JSON export/import, model defaults, data import/export |
| 📊 | **Diagnostics** | Transport mode, runtime info, rate-limit headers, sanitized diagnostics export, and a desktop-only “Open logs folder” action |

---

## 🏗️ Architecture

**Desktop & Web Dual-Mode:**
- **Electron desktop app** (Windows/macOS) — React renderer + Electron IPC + main-process HTTPS client
- **Web mode** (development/self-hosted) — React renderer + Express proxy server
- **Unified Venice API layer** — all traffic goes through validated, safety-checked paths

**Security-first design:**
- Renderer cannot access raw API keys (stored in OS Keychain/DPAPI)
- Content safety guard on every outgoing request (Venice-approved endpoints only)
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
| **Chats** (Desktop) | `chat-history/*.json` | Plain text (encryption planned) |
| **Settings, Images, Conversations, Memories, Files** | Renderer IndexedDB | AES-GCM (browser-managed key) |
| **Exports** | User-specified location | Versioned JSON (same as storage) |

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
3. **Content safety guard** — Every outgoing request is scanned for unsafe content before leaving the app
4. **No telemetry** — Venice Forge collects zero analytics or tracking data
5. **Trusted URL validation** — External links must be HTTPS with non-private hostnames

**Content Safety:**
- Advanced context detection and `negative_prompt` extraction
- Scanned at: renderer layer, Electron IPC layer, and Express proxy
- Fail-close design: errors result in 500 status (safe default)
- Raw prompt text is never logged anywhere

**For full details**, see [SECURITY.md](SECURITY.md) and [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md).

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
| **`429` rate limit** | Wait for reset period (shown in **Diagnostics** tab) |
| **Transport/connection failure** | Open **Diagnostics**, copy debug info, check logs folder |

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
| Current Version | v1.0.3 ([Releases](https://github.com/spearchucker667/Venice-API-connector/releases)) |
| Maintenance | Actively maintained |
| Windows Support | ✅ Fully supported |
| macOS Support | ✅ Fully supported (Intel + Apple Silicon) |
| Linux Support | 🔧 Development-only (packaging not maintained) |
| Node.js | v20, v22 |
| TypeScript | Strict mode enforced |
| Safety Guard | ✅ Active on every request |
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

## 🙏 Acknowledgments

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
