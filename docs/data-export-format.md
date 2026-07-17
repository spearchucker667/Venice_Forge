# Data Export Format (`.vfbackup`)

This document describes the current manual-backup and encrypted sync-folder envelopes implemented by Venice Forge 3.0.0-beta.1.

## Trust Boundary

In Electron, passphrase-based encryption and decryption run in the main process through typed preload/IPC methods. The renderer collects the passphrase for the operation but does not receive derived keys. Browser-mode manual backup is a compatibility path and uses Web Crypto in the renderer because there is no Electron main process.

Provider credentials, authorization tokens, passphrases, sync-folder settings, and machine-local absolute paths are removed from portable payloads before encryption.

## Current Encryption Formats

New Electron manual backups and sync packets use:

- Argon2id with libsodium's moderate operations and memory limits;
- a unique 16-byte salt;
- XChaCha20-Poly1305 authenticated encryption with a unique 24-byte nonce;
- a 16-byte authentication tag stored with the ciphertext.

Browser-mode manual backups use PBKDF2-SHA-256 with 210,000 iterations and AES-256-GCM with a 12-byte IV. The Electron decryptor also retains this PBKDF2/AES-GCM path for legacy 12-byte-IV envelopes. Version-3 manual backups declare the algorithm and KDF in authenticated metadata; version-2 compatibility still uses IV/nonce length to select the decryptor.

## Encrypted Manifest

New manual backups use a version-3 outer envelope. Individual sync packets and legacy manual backups retain the version-2 envelope.

```typescript
export interface EncryptedBackupManifest {
  version: number;      // 3 for new manual backups; 2 for legacy/sync
  exportedAt: string;   // ISO-8601 timestamp
  metadata?: {
    format: "venice-forge-manual-backup";
    formatVersion: 3;
    appVersion: string;
    source: { runtime: "electron" | "web"; deviceRef: string; profileRef: string };
    crypto: { algorithm: string; kdf: string; keyVersion: number };
    contents: {
      totalRecords: number;
      storeCounts: Record<string, number>;
      tombstoneCount: number;
      embeddedBlobCount: number;
      includesMedia: boolean;
      exclusions: string[];
      payloadSha256: string;
    };
  };
  salt: string;         // Base64
  iv: string;           // Base64 24-byte nonce or legacy/browser 12-byte IV
  ciphertext: string;   // authenticated ciphertext encoding
}
```

Electron-created ciphertext may be encoded as `ciphertext:authenticationTag`; combined ciphertext-and-tag Base64 remains accepted for the browser/compatibility path.

The outer metadata contains no record titles, prompts, messages, credentials, profile names, or machine-local paths. The profile reference is a truncated SHA-256 reference rather than the raw profile ID. The exact metadata object is also embedded inside the authenticated ciphertext. Import requires the outer and encrypted copies to match, recomputes the canonical portable-payload SHA-256, and independently verifies store, tombstone, embedded-data-URL, and media counts before presenting metadata as authenticated.

## Manual Backup Payload

After decryption, a `.vfbackup` payload is a JSON object containing encrypted profile provenance plus allowlisted store arrays:

```json
{
  "_veniceForgeBackup": {
    "profileId": "default",
    "manifestMetadata": {
      "format": "venice-forge-manual-backup",
      "formatVersion": 3,
      "appVersion": "3.0.0-beta.1"
    }
  },
  "conversations": [
    {
      "id": "conversation-1",
      "updatedAt": 1784100000000
    }
  ],
  "character_cards": []
}
```

Character cards use the app's normalized local schema, including supported Character Card V2 compatibility fields and version history. Restart-recoverable `characterCardDrafts` records are excluded unless the export request explicitly enables draft inclusion. This opt-in affects only the encrypted `.vfbackup` payload; a standard Character Card V2 JSON/PNG export is a separate, portable operation and never includes draft-manager state, credentials, machine paths, sync metadata, or provider-only URLs.

The Electron export path obtains a one-time, expiring, profile-bound lease before encryption. The main process rejects a reused or mismatched lease and verifies that exported records belong to the active profile.

Import preview reports authenticated format/app/source/crypto/key metadata, export time, tombstone/blob/media counts, exclusions, the payload SHA-256, structured compatibility warnings, and per-store new, modified, conflict, and identical counts. Every import fully decrypts and validates the payload, store names, record shapes, IDs, duplicate IDs, tombstones, metadata binding, content hash, and declared counts before mutation. Version-2 backups remain importable and are explicitly labeled as legacy because those authenticated metadata fields are unavailable. Merge and new-profile imports avoid a global pre-clear.

Desktop Replace All creates and verifies a profile-bound encrypted recovery manifest under Electron `userData` before clearing any importable store. The coordinated clear covers both renderer IndexedDB and main-process-managed stores; diagnostics are intentionally non-portable and are neither imported nor cleared. A failed clear or apply automatically rolls back from the already prepared recovery payload. The newest retained recovery can also be restored from the Data & Storage panel, and restore itself first preserves the current state as another recovery artifact. Recovery directories and files use owner-only permissions, corrupt artifacts are ignored, and recovery load revalidates active-profile provenance. Browser-mode Replace All is disabled because the browser cannot provide this durable main-authoritative boundary.

## Sync Folder Packets

Sync writes one encrypted object packet per record mutation under `.vfbackup/blobs/`. The decrypted payload contains:

```typescript
{
  _storeName: string;
  _id: string;
  _operationId: string;
  _sourceDeviceId: string;
  _syncSetId: string;
  _keyId: string;
  _profileId: string;
  data: Record<string, unknown>;
}
```

The operation ID is a SHA-256 digest over the store, record ID, and serialized record. The watcher validates the store and record IDs, active sync-set/key identity, profile identity, source device, packet size, and decrypted record identity before renderer delivery. Writes use a durable encrypted outbox followed by atomic publication, and acknowledgments/checkpoints make repeated delivery idempotent.

Tombstones use the same packet boundary and represent deletions. Conflict copies or message-level merges preserve supported divergent records; settings-like records use deterministic last-write-wins ordering.

## Compatibility and Migration

- New manual exports use manifest version 3; imports accept versions 3 and 2.
- Sync packets continue to use version 2 and are not manual-backup manifests.
- Version-3 outer metadata must match the copy inside authenticated ciphertext and the recomputed content hash/counts.
- A 24-byte nonce selects Argon2id/XChaCha20-Poly1305 decryption.
- A 12-byte IV selects the legacy/browser PBKDF2/AES-256-GCM path.
- Authentication failure, malformed Base64, invalid lengths, unknown stores, invalid IDs, cross-profile packets, and cross-sync-set packets fail closed.

See [`backup-and-sync.md`](backup-and-sync.md), [`security-model.md`](security-model.md), and [`sync-threat-model.md`](sync-threat-model.md) for user workflow and threat-boundary details.
