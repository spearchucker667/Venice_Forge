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

Renderer compromise is a separate threat from hostile sync storage. A script running in the renderer origin can ask Web Crypto to use the non-extractable IndexedDB key, so renderer encryption is not an isolation boundary against XSS, a same-user debugger, or malicious renderer code. Main-process sync/vault keys are not exposed to the renderer. Moving more renderer stores behind typed main-process cryptography is future hardening, not a claim about the current format.
