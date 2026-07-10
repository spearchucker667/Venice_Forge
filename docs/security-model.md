# Security Model

Venice Forge keeps provider credentials in Electron `safeStorage`; the renderer receives configured-state information, not persisted keys. Venice requests cross the context-isolated preload boundary and are checked by the main-process guard pipeline. Web development uses the Express proxy and must not persist credentials in browser storage.

Local Family Safe Mode and Venice provider `safe_mode` are separate controls. The main process owns the desktop safety snapshot. Backup and sync encryption uses AES-256-GCM with PBKDF2-SHA-256 passphrase derivation. Passphrases are transient and are cleared when sync pauses or stops.

Portable data excludes API keys, authorization tokens, passwords, passphrases, secrets, sync-folder settings, and machine-local paths. Import and sync accept only allowlisted stores, validate record IDs, reject malformed/oversized envelopes, and preserve divergent user content instead of silently overwriting it.

See [SECURITY.md](../SECURITY.md), [backup-and-sync.md](backup-and-sync.md), and [sync-threat-model.md](sync-threat-model.md).
