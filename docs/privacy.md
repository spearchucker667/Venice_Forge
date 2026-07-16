# Sync and Backup Privacy

This page explains the privacy consequences of the optional backup and sync features. The root [privacy summary](../PRIVACY.md) covers the whole product; this page is intentionally limited to replicated data.

Venice Forge has no first-party hosted sync service and requires no Venice Forge cloud account. Manual `.vfbackup` files and sync-folder packets are encrypted locally before they are written. If the selected folder is managed by iCloud, Dropbox, OneDrive, Syncthing, or another service, that provider can receive the ciphertext and its filesystem metadata, but not the application plaintext or passphrase.

Credentials, authorization tokens, passwords, sync passphrases, sync-folder configuration, and machine-local absolute paths are excluded. Character-card drafts and media remain opt-in for manual backup; current sync classification is documented in [backup-and-sync.md](backup-and-sync.md).

Losing the passphrase makes the encrypted data unrecoverable. Venice Forge does not escrow keys. Changing the passphrase requires a new sync set and device re-enrollment because live in-place key rotation is deferred.

Trust boundaries and attacker capabilities are documented in [sync-threat-model.md](sync-threat-model.md). Troubleshooting that does not expose secrets is in [sync-troubleshooting.md](sync-troubleshooting.md).
