# Privacy Policy Summary

This is the user-facing privacy summary for Venice Forge. For the full technical details, encryption algorithms, and security boundaries, refer to the [Detailed Privacy & Security Model](docs/legal/PRIVACY.md).

---

## 1. Local-First Architecture
Venice Forge is designed around a **local-first** philosophy. The default behavior is to keep your data under your custody on your own machine.
- **Your Chats & Media:** All your conversation logs, generated images, research sessions, character cards, encrypted character-card drafts, and workflows are stored locally on your device.
- **No First-Party Hosted Sync:** Venice Forge does not operate a centralized sync service or require a cloud account. If you opt into sync-folder mode, the app writes encrypted packets to a folder you select; iCloud, Dropbox, OneDrive, Syncthing, or another folder provider may then copy that ciphertext off-device.
- **No Telemetry or Tracking:** Venice Forge does not collect analytics, crash reports, usage telemetry, or identifier tokens.

---

## 2. API Key Custody & OS Secure Storage
Your API credentials are never written in plaintext to normal databases or logs:
- **Desktop Mode:** Venice and Jina API keys are stored in encrypted OS secure storage (macOS Keychain or **Windows Credential Manager**). The React UI/renderer never receives the raw key values.
- **Web Mode:** When running in web/development mode, API keys are loaded via the server-side environment (`.env`) and are proxy-validated at the server boundary.

---

## 3. Data Transmissions (Upstream Providers)
Because Venice Forge is a client app, your data does leave your device when you explicitly invoke AI models or search features:
- **Venice.ai:** Outgoing chat prompts, image recipes, explicitly selected Image Inspector inputs and instructions, audio requests, and video queues are forwarded to the [Venice API](https://api.venice.ai).
- **Jina AI:** Scraper and search queries are sent to Jina AI endpoints if the Jina provider is active for research.
- **Abuse Screening:** Local Family Safe Mode screens your prompts on your device *before* they are sent upstream. If a prompt is blocked, no network request is dispatched to the provider.
- **Card generation and refinement:** ST Card Studio sends content upstream only when you explicitly request image analysis, text-to-card generation, field refinement, or a test turn. Proposals are shown before application; they do not silently mutate a card.
- **Image Inspector:** Analysis sends the selected image only after you start the request. Direct image-based web matching is not currently exposed, and the former query-derived Google/Brave action is disabled. Safe diagnostics exclude raw image bytes, base64 media, full prompts, credentials, and local absolute paths.

---

## 4. Local Encryption
Your local data is protected from casual disk inspection:
- **IndexedDB:** Stores for settings, media metadata, scenes, and workflows are encrypted using AES-GCM.
- **Renderer threat boundary:** The non-extractable Web Crypto key is stored in same-origin IndexedDB. This reduces casual offline inspection, but code executing in the renderer origin can ask Web Crypto to use the key. It is not equivalent to the main-process Conversation Vault key protected by OS secure storage.
- **Character-card drafts:** Restart-recoverable drafts are encrypted local records. They are excluded from sync and default backups; manual encrypted backup includes them only when you explicitly opt in.
- **Conversation Vault:** Current desktop conversation records are stored under `conversations/` as AES-256-GCM encrypted files.
- **Master & Profile Passwords:** Setting a password gates entry to profiles or safety config. Verification is handled entirely in the main process with salted PBKDF2-SHA256.

## 5. Backup, Export, and Sync

- **Portable JSON export:** Redacted, versioned application data intended for portability; credentials and machine-local paths are excluded.
- **Encrypted `.vfbackup`:** Password-encrypted snapshot with previewed merge/new-profile import and desktop recovery-guarded Replace All.
- **Encrypted sync folder:** Opt-in replicated encrypted packets in a user-selected folder. Venice Forge provides no first-party hosted transport.
- **Safe diagnostics/privacy summaries:** Sanitized metadata for support; raw prompts, tokens, base64 media, and full local paths are excluded.

Secrets are excluded by default. Character-card drafts and media are included only through their explicit backup options.

---

## 6. Further Reading
For complete specifications on data storage, network allowlists, and safety guards, see:
- [Detailed Privacy & Security Model](docs/legal/PRIVACY.md)
- [Vulnerability Reporting Policy](SECURITY.md)
- [Legal Notice & Disclaimers](LEGAL.md)
