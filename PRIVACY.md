# Privacy Policy Summary

This is the user-facing privacy summary for Venice Forge. For the full technical details, encryption algorithms, and security boundaries, refer to the [Detailed Privacy & Security Model](docs/legal/PRIVACY.md).

---

## 1. Local-First Architecture
Venice Forge is designed around a **local-first** philosophy. The default behavior is to keep your data under your custody on your own machine.
- **Your Chats & Media:** All your conversation logs, generated images, research sessions, character cards, and workflows are stored locally on your device.
- **No Cloud Synchronization:** Venice Forge does not operate any centralized cloud database. We do not sync your local data or creations to any external servers.
- **No Telemetry or Tracking:** Venice Forge does not collect analytics, crash reports, usage telemetry, or identifier tokens.

---

## 2. API Key Custody & OS Secure Storage
Your API credentials are never written in plaintext to normal databases or logs:
- **Desktop Mode:** Venice and Jina API keys are stored in encrypted OS secure storage (macOS Keychain or **Windows Credential Manager**). The React UI/renderer never receives the raw key values.
- **Web Mode:** When running in web/development mode, API keys are loaded via the server-side environment (`.env`) and are proxy-validated at the server boundary.

---

## 3. Data Transmissions (Upstream Providers)
Because Venice Forge is a client app, your data does leave your device when you explicitly invoke AI models or search features:
- **Venice.ai:** Outgoing chat prompts, image recipes, audio requests, and video queues are forwarded to the [Venice API](https://api.venice.ai).
- **Jina AI:** Scraper and search queries are sent to Jina AI endpoints if the Jina provider is active for research.
- **Abuse Screening:** Local Family Safe Mode screens your prompts on your device *before* they are sent upstream. If a prompt is blocked, no network request is dispatched to the provider.

---

## 4. Local Encryption
Your local data is protected from casual disk inspection:
- **IndexedDB:** Stores for settings, media metadata, scenes, and workflows are encrypted using AES-GCM.
- **Conversation Vault:** Current desktop conversation records are stored under `conversations/` as AES-256-GCM encrypted files.
- **Master & Profile Passwords:** Setting a password gates entry to profiles or safety config. Verification is handled entirely in the main process with salted PBKDF2-SHA256.

---

## 5. Further Reading
For complete specifications on data storage, network allowlists, and safety guards, see:
- [Detailed Privacy & Security Model](file:///Users/super_user/Projects/Windows-Venice-API-connector/docs/legal/PRIVACY.md)
- [Vulnerability Reporting Policy (SECURITY.md)](file:///Users/super_user/Projects/Windows-Venice-API-connector/SECURITY.md)
- [Legal Notice & Disclaimers (LEGAL.md)](file:///Users/super_user/Projects/Windows-Venice-API-connector/LEGAL.md)
