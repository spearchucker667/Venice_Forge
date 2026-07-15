# Backup and Sync

Venice Forge is designed with a strictly local-first architecture. To ensure you never lose your data, and to enable you to use Venice Forge across multiple machines without forcing you into a centralized cloud ecosystem, we offer **Local-First Encrypted Backup & Sync**.

## Key Concepts

- **Local-First**: By default, all your data (chats, character cards, images, personas) never leaves your machine. 
- **Privacy by Default**: Desktop backups and sync packets are encrypted locally with Argon2id-derived XChaCha20-Poly1305 before they are written anywhere else. Browser-mode manual backups use the Web Crypto PBKDF2/AES-256-GCM compatibility format.
- **Opt-In**: Syncing is completely optional. If you never enable it, nothing changes.
- **Provider Agnostic**: You provide the cloud! By designating a specific folder on your hard drive (e.g., inside an iCloud Drive, Dropbox, Syncthing, or Google Drive folder) as your "Sync Folder", the app will write encrypted packets there. Your cloud provider syncs those encrypted packets, and your other Venice Forge installations read them.

### Current scope

Venice Forge implements manual `.vfbackup` export/import and one local sync-folder transport. It does not contain built-in WebDAV, S3-compatible, or proprietary cloud-provider clients. Those transports are deferred; using a folder managed by Dropbox, iCloud, Syncthing, OneDrive, or a similar tool does not give that provider plaintext access because Venice Forge writes encrypted packets. Sync-set key rotation is also deferred: changing a passphrase currently means establishing a new sync set and re-enrolling devices, not rotating a live set in place.

## Manual Encrypted Backup

Instead of relying on a real-time sync folder, you can generate a single `.vfbackup` file representing the current state of your app.

### How to export:
1. Navigate to **Config** > **Data & Storage** > **Backup & Sync**.
2. Under "Manual Backup", click **Export Encrypted Backup**.
3. You will be prompted to enter a **Passphrase**. 
   - **Important**: Venice Forge does not store this passphrase, and there is no "Forgot Password" feature. Keep this passphrase safe!
4. Choose where to save your `.vfbackup` file.

### How to import:
1. On your destination machine, go to **Config** > **Data & Storage** > **Backup & Sync**.
2. Click **Import Backup** and select your `.vfbackup` file.
3. Enter the exact passphrase used to encrypt the backup.
4. Review the decrypted preview, then confirm the import. Version-3 backups show authenticated app/source/crypto/key metadata, per-store and tombstone/blob/media counts, exclusions, a payload SHA-256, and structured compatibility warnings. Version-2 backups remain importable and are labeled legacy because that metadata is unavailable. Existing divergent records are preserved as conflict copies where supported. Merge and import-to-new-profile are available in desktop and browser modes.

Desktop **Replace All** is a recovery-guarded operation. Venice Forge fully decrypts and validates the incoming payload before mutation, creates and verifies an encrypted profile-bound snapshot of the current data under the Electron `userData` directory, and then clears and applies the replacement across IndexedDB and main-process-managed stores. If clearing or apply fails, the app automatically restores the snapshot. The newest retained pre-replace snapshot also appears as **Pre-Replace Recovery** with a one-click restore action; restoring requires the same passphrase used for that replace operation. Recovery files use owner-only directory/file permissions and are isolated by active profile. Browser mode does not offer Replace All because it cannot provide the same main-authoritative durable recovery boundary.

## Sync Folder Setup (Automated Sync)

If you use multiple machines frequently and want automated, continuous syncing, use the Sync Folder mode.

### Requirements
- You must have a third-party folder synchronization tool installed (e.g., Dropbox, iCloud, Syncthing, OneDrive).

### Setup Instructions
1. Create an empty folder in your shared drive (e.g., `~/Dropbox/VeniceSync`).
2. Open Venice Forge and navigate to **Config** > **Backup & Sync**.
3. Under the "Sync Folder" section, click **Choose Folder**.
4. Select the folder you created in step 1.
5. You will be prompted to enter a Sync Passphrase. **Both machines must use the same passphrase.**
6. The app reconciles existing encrypted packets and then watches for changes. Pause clears the in-memory passphrase; resume requires entering it again.

### Adding a Second Machine
1. Wait for your cloud provider (e.g., Dropbox) to finish syncing the `.enc` files to your second machine.
2. Open Venice Forge on the second machine.
3. Navigate to **Config** > **Backup & Sync** and click **Choose Folder**.
4. Select the exact same synced folder.
5. Enter the same Sync Passphrase.
6. Venice Forge will automatically detect the packets, decrypt them, and merge them with your local data.

## Security Boundaries and Exclusions
To keep you safe, the following data is **never** synced or backed up, even if you enable sync:
- Your Venice API Key.
- Your Jina API Key.
- Operating system level secrets.
- Absolute file paths specific to your machine.

Persona images and other user-authored media are included in manual encrypted backups. Sync packets remain encrypted and are subject to the active store/data classification; credentials and sync-folder configuration are always removed.

New desktop sync packets are Argon2id/XChaCha20-Poly1305 envelopes written atomically under `.vfbackup/blobs/`. The desktop decryptor retains PBKDF2/AES-256-GCM compatibility for legacy 12-byte-IV envelopes. Store names and record IDs are allowlisted, records must agree with their envelope ID, oversized or malformed packets are rejected, and abandoned temporary files are removed when the watcher starts.

You must manually configure your API keys on each device you use.

## Conflict Resolution
If you edit the exact same Character Card or Chat on two different machines at the same time while offline, a conflict occurs.
- **Characters & Prompts**: Venice Forge will duplicate the record to prevent data loss (e.g., `My Character (Conflict from Desktop)`).
- **Chats**: Venice Forge will perform a "message-level merge", appending new messages from both machines into the same chat chronologically.
- **Settings**: Venice Forge uses a "Last Write Wins" strategy; whichever device saved the setting most recently will overwrite the other.
