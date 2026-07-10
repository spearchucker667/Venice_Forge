# Data Export Format (.vfbackup)

This document describes the technical structure and cryptography of Venice Forge's `.vfbackup` manual export files and the Encrypted Sync Folder packets.

## Overall Architecture
Venice Forge uses a privacy-first local sync model. The application persists data locally in IndexedDB and JSON files. When data leaves the local `appData` folder for a backup or a sync folder, it is wrapped in an encryption boundary. 

The primary goals of this format are:
1. Ensure all user-created data (chats, prompts, characters, lorebooks, media) is strongly encrypted.
2. Ensure metadata cannot be tampered with to cause application corruption on import.
3. Exclude strictly local secrets (API keys, machine paths).
4. Provide a forward/backward-compatible envelope for future migrations.

## Cryptography

All encryption is handled by the **Main Process**. The renderer process (UI) never has direct access to the raw passphrase or the generated encryption keys, ensuring memory isolation.

- **Algorithm**: `AES-256-GCM` (Galois/Counter Mode).
- **Key Derivation**: `PBKDF2` with `SHA-256`, using 210,000 iterations.
- **Salts & IVs**: 
  - A unique 16-byte random salt is generated for key derivation.
  - A unique 12-byte initialization vector (IV) is generated for every encryption operation.
- **Authentication**: GCM automatically produces a 16-byte authentication tag, which is appended to the ciphertext. This ensures data integrity and prevents chosen-ciphertext attacks.

## Manual Backup (.vfbackup)

A `.vfbackup` file is a plain JSON text file containing an `EncryptedBackupManifest`. 

### `EncryptedBackupManifest` Schema

```typescript
export interface EncryptedBackupManifest {
  format: "venice-forge-backup";
  formatVersion: 1;
  createdAt: number;        // Unix ms timestamp
  appVersion: string;       // e.g., "2.1.2"
  deviceId: string;         // A unique identifier for the exporting machine
  profileId: string;        // The Venice Forge profile ID used during export
  
  // Encryption Metadata
  encryption: {
    algorithm: "aes-256-gcm";
    kdf: "pbkdf2";
    iterations: 210000;
  };
  
  // Base64 Encoded Crypto Parameters
  salt: string;
  iv: string;
  
  // Base64 Encoded Ciphertext (includes the 16-byte auth tag at the end)
  ciphertext: string;       
}
```

### The Plaintext Payload

When the `ciphertext` is successfully decrypted, it yields a UTF-8 JSON string representing a dictionary of stores to an array of `SyncableRecord` items.

```json
{
  "character_cards": [
    {
      "id": "char_abc123",
      "name": "Example Character",
      "updatedAt": 1718000000000,
      "deviceId": "machine_A",
      "revisionId": "uuid-v4-abc",
      "baseRevisionId": "uuid-v4-xyz"
    }
  ],
  "chats": [
    // ...
  ]
}
```

## Sync Folder Packets (.enc)

When "Sync Folder" mode is enabled, Venice Forge continuously monitors local storage for changes. When a record is updated, it is exported as a standalone packet file inside the Sync Folder.

### File Naming Convention
Packets follow the pattern: `{storeName}_{id}.enc`
Example: `character_cards_char_abc123.enc`

### File Structure
The `.enc` file uses the exact same `EncryptedBackupManifest` structure as the `.vfbackup` format, except the `ciphertext` contains only a single JSON-serialized record.

This atomic object-level encryption prevents merge conflicts on the filesystem level (e.g. Dropbox creating conflicted copies of a monolithic database file), and delegates conflict resolution to Venice Forge's application layer logic.
