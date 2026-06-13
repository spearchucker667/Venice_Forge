# Venice Forge — Frequently Asked Questions

## General

### What is Venice Forge?
Venice Forge is an independent, open-source desktop client for the [Venice API](https://venice.ai). It provides a unified interface for text generation, image generation, web research, batch automation, and local data management — all without routing user content through any intermediary server beyond Venice itself.

### Is Venice Forge an official Venice.ai product?
No. Venice Forge is an independent MIT-licensed project. It is not endorsed by, sponsored by, or affiliated with Venice.ai, Inc. "Venice", "Venice.ai", and related marks belong to their respective owners.

### What platforms are supported?
- **Windows 10/11** (x64) — NSIS installer and portable `.exe`
- **macOS 13+** (Apple Silicon `arm64` and Intel `x64`) — DMG and ZIP
- **Linux** — Not officially packaged; development use only with plaintext key fallback
- **Web browser** — Supported in development mode only

See [PLATFORM_SUPPORT.md](DEVELOPMENT/platform-support.md) for the full matrix.

---

## Development & Building

### What Node.js version do I need?
Node.js **22.13 or newer within Node 22.x** with npm 10+. CI tests the supported Node 22 runtime.

### How do I start development?
```bash
npm install
npm run dev:electron   # Desktop mode (recommended)
# or
npm run dev:web        # Web proxy mode
```

### What is the full validation gate?
```bash
npm run lint:eslint    # ESLint for src/, electron/, server.ts, and scripts/ with --max-warnings=0
npm run typecheck      # TypeScript for renderer + Electron
npm test               # Vitest unit and integration tests
npm run verify:safety-guard # Security guard enforcement check
npm run build          # Build dist/ and dist-electron/
```

### Why does `npm run lint:eslint` fail?
The project enforces **zero warnings** (`--max-warnings=0`). Common causes:
- Using `any` instead of narrow types — replace with `unknown` + runtime guards.
- Unused variables — prefix intentionally unused parameters with `_`.

### Why are `dev` and `dev:web` the same command?
Both run `tsx server.ts` (the Express web proxy). `dev:web` is the explicit alias used throughout documentation. `dev` is the shorthand default.

## API Keys & Security

### Where is my API key stored?
- **Desktop mode:** Encrypted with OS-level secure storage — DPAPI on Windows, Keychain on macOS. Both the Venice API key and the optional Jina API key are stored here. Neither is ever exposed to the renderer.
- **Web mode:** Persistent keys belong in the server's `.env`. Browser-entered Jina keys are memory-only for the current page session and clear on reload; they are not written to browser storage.

### What if secure storage is unavailable?
On macOS and Windows, the app **refuses** to store the key if secure storage fails. On Linux, you can set the `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true` environment variable (e.g., in `.env` for web mode development) to allow a documented plaintext fallback. **This reduces security.**

### How do I enable DevTools in a production build?
Set `VENICE_FORGE_DEBUG_DEVTOOLS=true` in your environment before launching. Only use this for debugging.

### Is there telemetry?
No. Venice Forge does not track users, log prompts, or monitor API key usage.

### Does Venice Forge have content moderation?
Yes. Every outgoing Venice API request is screened by an on-device content safety guard before the payload is forwarded. The guard enforces cross-sentence context boundaries and `negative_prompt` extraction. Requests that fail the assessment are blocked at the renderer transport, IPC, proxy, or module boundary and never reach Venice. The proxy uses a "fail-close" design (500 status) if any guard extraction fails. Raw prompt text is **never** logged by the safety system — only a coarse non-identifying hash is kept for local audit counters.

### Is there an age restriction for using Venice Forge?
Yes, **users must be 18 years or older**. Generative AI models can produce explicit or sensitive material, and there is an inherent legal and ethical risk of generating AI imagery that may inappropriately represent minors (CSAM). By using this software, users acknowledge this risk and assume all liability.

### How do I report a safety bypass or unsafe content (CSAM)?
If you generate or encounter AI material that constitutes child exploitation (CSAM):
1. Report it to the **National Center for Missing & Exploited Children (NCMEC)** at [report.cybertip.org](https://report.cybertip.org/).
2. Report the incident to the official **Venice Trust & Safety** team at [venice.ai/support](https://venice.ai/support).
3. Do **not** share explicit material on GitHub. If you find a way to bypass the application's safety guard, use GitHub's private vulnerability reporting feature to securely alert the repository maintainers.

---

## Packaging & Releases

### How do I build for Windows?
```bash
npm run dist:win
npm run checksum:release
npm run verify:dist:win
npm run verify:dist:portable
```

### How do I build for macOS?
```bash
npm run dist:mac
npm run checksum:release
npm run verify:dist:mac
```

### What artifacts are generated?
- Windows: `Venice-Forge-<version>-x64-Setup.exe`, `Venice-Forge-<version>-x64-Portable.exe`
- macOS: `Venice-Forge-<version>-<arch>.dmg`, `Venice-Forge-<version>-<arch>.zip`
- All artifacts include `.sha256` checksum sidecars.

### Why does macOS Gatekeeper block my build?
Local builds are unsigned by default without an Apple Developer ID certificate. For your own locally trusted builds:
```bash
xattr -dr com.apple.quarantine "/Applications/Venice Forge.app"
```
**Never use this for untrusted or internet-downloaded binaries.**

---

## Themes & Appearance

### How do I change the theme?
Open **Config → Appearance → Theme Maker**. Choose from the built-in themes (Venice Parity Dark, Forge Graphite, Forge Daylight, Forge Copper, Forge Dracula, GruvBox Dark, Rosepine) or create a custom theme by editing individual color tokens.

### Do custom themes persist across restarts?
Yes. Custom themes are saved to encrypted IndexedDB alongside your other settings. A lightweight `localStorage` cache also prevents any flash of unstyled content on startup.

### Are the built-in themes accessible?
Built-in themes expose the complete semantic token contract. Forge Dracula has explicit WCAG AA regression coverage for primary, muted, input, button, status, selection, disabled, and focus roles. ThemeMaker warns when a custom foreground/background pair falls below the recommended threshold.

## Data & Storage

### Where is my data stored?
- **Conversations (desktop):** Individual `.json` files in the OS app-data folder — one file per conversation with atomic writes and automatic corruption recovery.
  - Windows: `%APPDATA%\Venice Forge\chat-history\*.json`
  - macOS: `~/Library/Application Support/Venice Forge/chat-history/*.json`
- **Images, files, legacy chats, settings, conversations, diagnostics:** Renderer IndexedDB (local only; images, files, chats, settings, and conversations are encrypted at rest, diagnostics is not).
- **Memories:** Renderer IndexedDB `ai_memory` store (encrypted at rest).
- **API keys:** OS secure storage (Windows DPAPI / macOS Keychain).
- **Logs:**
  - Windows: `%APPDATA%\Venice Forge\logs\venice-forge.log`
  - macOS: `~/Library/Application Support/Venice Forge/logs/venice-forge.log`

### How do memories work?
Memories are persistent snippets you save during chat ("Save to Memory"). They are stored encrypted in IndexedDB and automatically injected into future messages in the same conversation (up to 5 memories, capped at 2,000 characters total). You can view, search, and delete memories from the Memory panel in the Chat tab.

### Can I collapse the sidebar?
Yes. Click the collapse/expand arrow at the top of the desktop sidebar. The state persists across restarts via `localStorage`.

### What attachment types are supported in chat?
- **Text files:** `.txt`, `.md`, `.ts`, `.tsx`, `.json`, `.py`, `.js`, and many more (up to 256 KiB per file).
- **Images:** PNG, JPEG, WEBP (downscaled if over 2 MiB; passed as base64 only when the model supports vision).
- **URLs:** Scraped via the research provider and injected as `<doc url="…">…</doc>`.

### Which models support image attachments?
Venice Forge uses a fallback allowlist and pattern matching to detect vision-capable models (IDs matching `/vision/i`, `/-vl/i`, or `/gemini-2\.[05]/i`). If a model's vision capability is unknown, attachments are disabled by default. There is no live vision flag from the Venice API yet.

### Where do uploaded files go?
File and URL attachments are assembled into the current prompt context when you send a message. They are not shown in a dedicated Files tab in the UI. Generated images that the app saves from image workflows do appear in the **Media Studio** tab (renamed from the old "Library"), where you can preview, batch favorite/unstar/delete, inspect lineage, and export.


### Is my data encrypted?
- **Conversations (desktop):** Stored as JSON on the local filesystem. These are **not encrypted** by Venice Forge — they rely on OS-level filesystem permissions. The Venice API itself is privacy-preserving by design.
- **Images, legacy chats, settings, and conversations (web / IndexedDB):** Encrypted with AES-GCM using a browser-managed key stored in same-origin IndexedDB. This reduces casual local inspection risk but is **not equivalent to OS credential storage**. The `diagnostics` store is not encrypted — it contains only sanitized timing and status metadata.

### Can I export my data?
Yes. Use the **Config** tab → **Export**. Exports are versioned JSON with `version`, `exportedAt`, `appVersion`, and `data`. API keys are automatically redacted.

### Can I import data?
Yes. Use the **Config** tab → **Import**. Import validates JSON size and schema, rejects unexpected stores, strips secret-like fields, and merges by ID rather than clearing existing data. A pre-import backup is saved to disk.

---

## Troubleshooting

### I get a 400 error on chat/image generation
Usually a request schema mismatch. Ensure:
- The model ID is valid.
- `webSearch` is `"off"`, `"on"`, or `"auto"` (not a boolean).
- All API parameters are correct strings.

### I get a 401/403 error
Your API key is invalid, expired, or has insufficient scope. Check the **Status** tab for diagnostics.

### I get a 429 error
Venice rate limit exceeded. Wait for the reset period shown in the **Status** tab.

### The app crashes on startup
Check the logs folder (see Data & Storage above). Common causes:
- Missing icons: run `npm run generate:icon`.
- Secure storage unavailable: ensure your OS key manager is functioning.
- Corrupted IndexedDB: clear site data for the app.
- Corrupted conversation files: invalid `.json` files in the chat-history folder are automatically renamed to `.backup-{timestamp}`. You can safely delete old `.backup-*` files.

---

## Contributing

### How do I report a bug?
Open a GitHub issue using the bug report template. Include:
- App version from `package.json` or the Status tab.
- Runtime mode (Electron desktop or web mode).
- OS, Node.js version, and CPU architecture.
- Steps to reproduce.
- Sanitized diagnostics from the Status tab.

### How do I report a security vulnerability?
**Do not open a public issue.** Follow [SECURITY.md](../SECURITY.md) and request a private maintainer discussion.

### What is the code style?
- TypeScript **strict mode**.
- Avoid `any`; use proper types or `unknown` + guards.
- Use `function` declarations for modules.
- Tailwind v4 utility classes inline with JSX.

---

## Further Reading

- [README.md](../README.md) — Setup and usage
- [ABOUT.md](ABOUT.md) — Architecture and goals
- [BUILDING.md](DEVELOPMENT/building.md) — Development and packaging commands
- [RELEASE.md](RELEASE/release.md) — Release checklist
- [SECURITY.md](../SECURITY.md) — Full security model
- [LEGAL.md](LEGAL.md) — Legal and TOS coverage
- [PLATFORM_SUPPORT.md](DEVELOPMENT/platform-support.md) — Supported platforms
- [TROUBLESHOOTING.md](DEVELOPMENT/troubleshooting.md) — Common issues and fixes
- [CHANGELOG.md](audits/CHANGELOG.md) — Version history
- [CONTRIBUTING.md](../CONTRIBUTING.md) — How to contribute
