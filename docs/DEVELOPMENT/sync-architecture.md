# Sync Architecture

The renderer owns application-store serialization and conflict presentation. Electron main owns folder approval, passphrase-derived keys, packet encryption/decryption, atomic filesystem writes, watcher lifecycle, and remote-apply authorization. The preload exposes narrow typed operations; it never returns a sync key or arbitrary filesystem capability.

Current desktop packets use Argon2id-derived XChaCha20-Poly1305 envelopes under `.vfbackup/blobs/`. The decryptor retains PBKDF2/AES-256-GCM compatibility for legacy 12-byte-IV packets. Store names and record IDs are allowlisted, the inner record ID must match the envelope ID, and size/schema checks run before mutation.

Writes use a unique temporary file, flush/close, and atomic rename. Startup reconciliation processes existing packets and removes abandoned temporary files. Tombstones encode deletion. Content-addressed operation IDs make replay idempotent. The renderer must acknowledge remote operations through a short-lived main-issued authority token so an arbitrary renderer request cannot masquerade as a watcher event.

Conflicts are store-specific: safe fields may merge, divergent records may fork, and settings may use last-write-wins. Durable user content must not be silently discarded. See [sync-testing.md](sync-testing.md) for fixtures and [sync-provider-interface.md](sync-provider-interface.md) for deferred transports.
