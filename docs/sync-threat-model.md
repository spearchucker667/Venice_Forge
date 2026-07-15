# Sync Threat Model

The sync folder is treated as attacker-controlled storage. A cloud provider or another process may read, replace, truncate, replay, or delete files. Confidentiality and integrity therefore come from authenticated encryption, not provider trust.

Controls:

- Argon2id-derived XChaCha20-Poly1305 authentication rejects wrong passphrases and modified ciphertext/tags for current desktop packets; the decryptor retains PBKDF2-derived AES-256-GCM support for legacy packets.
- The main process owns keys and folder approval; renderer-supplied arbitrary paths are rejected.
- Store names and IDs are allowlisted and payload IDs must match envelope IDs.
- Content-addressed operation IDs make duplicate delivery idempotent.
- Writes use unique temporary files and atomic rename; orphaned temporary files are cleaned on restart.
- Initial watcher reconciliation processes packets already present at startup.
- Conflict copies or message-ID merges preserve divergent user data.
- Tombstones represent deletions; secrets and absolute paths are excluded.

Remaining availability risks include provider deletion, quota exhaustion, and delayed/conflicting delivery. Users should retain periodic manual `.vfbackup` files outside the live sync folder.
