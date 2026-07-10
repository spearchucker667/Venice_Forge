#!/usr/bin/env node
/**
 * verify-backup-sync.cjs
 *
 * Phase 9 Backup and Sync completion contract guard (VERIFY-087..VERIFY-091).
 * Fails if any of the following invariants are violated:
 *
 *  1. `electron/services/backupCrypto.ts` exports `encryptPayload` and
 *     `decryptPayload` and `BACKUP_SCHEMA_VERSION`.
 *  2. `electron/services/syncFolderWatcher.ts` exports `writePacket`,
 *     `getSyncStatus`, `setSyncEmissionSuppressed`, and `SYNC_STORE_ALLOWLIST`.
 *  3. `electron/services/syncBridge.ts` exists and exports `emitSyncPacket`
 *     and `emitSyncTombstone`.
 *  4. `electron/ipc/handlers/syncHandlers.ts` registers the canonical sync
 *     IPC channels (sync:chooseSyncFolder, sync:getSyncFolder,
 *     sync:startSync, sync:stopSync, sync:pauseSync, sync:getStatus,
 *     sync:setEmissionSuppressed, sync:writePacket, sync:encryptBackup,
 *     sync:decryptBackup).
 *  5. `src/services/backupExportService.ts` exports `createEncryptedBackup`
 *     and `downloadEncryptedBackup`.
 *  6. `src/services/backupImportService.ts` exports `parseAndImportBackup`,
 *     `previewBackup`, and `importDecryptedPacket`.
 *  7. `src/services/syncEngine.ts` exports `initSyncEngine`, `stopSyncEngine`,
 *     `emitLocalChange`, and `emitLocalTombstone`.
 *  8. `src/components/settings/BackupSyncPanel.tsx` reads/writes the sync
 *     folder path through `useSettingsStore` and checks status via
 *     `res.status === "running"`.
 *  9. `electron/preload.ts` exposes `sync.setEmissionSuppressed` and
 *     `sync.encryptBackup` / `sync.decryptBackup`.
 * 10. Desktop save/delete handlers (`electron/ipc/handlers/systemHandlers.ts`
 *     and `electron/ipc/rpHandlers.ts`) import `emitSyncPacket` /
 *     `emitSyncTombstone` from `electron/services/syncBridge`.
 *
 * Usage:
 *   node scripts/verify-backup-sync.cjs
 *
 * Exit 0 on success; non-zero on any violation.
 */
"use strict";

const fs = require("fs");
const path = require("path");

// Enable on-the-fly TypeScript loading so we can exercise the actual crypto
// and sanitization modules instead of only grepping their source.
require("tsx/cjs");

const REPO = path.resolve(__dirname, "..");
const BACKUP_CRYPTO_FILE = path.join(REPO, "electron/services/backupCrypto.ts");
const SYNC_WATCHER_FILE = path.join(REPO, "electron/services/syncFolderWatcher.ts");
const SYNC_BRIDGE_FILE = path.join(REPO, "electron/services/syncBridge.ts");
const SYNC_HANDLERS_FILE = path.join(REPO, "electron/ipc/handlers/syncHandlers.ts");
const SYSTEM_HANDLERS_FILE = path.join(REPO, "electron/ipc/handlers/systemHandlers.ts");
const RP_HANDLERS_FILE = path.join(REPO, "electron/ipc/rpHandlers.ts");
const BACKUP_EXPORT_FILE = path.join(REPO, "src/services/backupExportService.ts");
const BACKUP_IMPORT_FILE = path.join(REPO, "src/services/backupImportService.ts");
const SYNC_ENGINE_FILE = path.join(REPO, "src/services/syncEngine.ts");
const BACKUP_PANEL_FILE = path.join(REPO, "src/components/settings/BackupSyncPanel.tsx");
const PRELOAD_FILE = path.join(REPO, "electron/preload.ts");

let failures = 0;
function check(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  const tail = detail ? ` — ${detail}` : "";
  console.log(`  [${tag}] ${label}${tail}`);
}

function read(rel) {
  return fs.readFileSync(rel, "utf8");
}

function mustContain(file, label, fragments) {
  let text = "";
  try {
    text = read(file);
  } catch {
    check(label, false, `file not found: ${file}`);
    return;
  }
  for (const f of fragments) {
    check(`${label} → ${JSON.stringify(f)}`, text.includes(f));
  }
}

function runStaticChecks() {
  mustContain(BACKUP_CRYPTO_FILE, "electron/services/backupCrypto.ts exports", [
    "export const BACKUP_SCHEMA_VERSION",
    "export async function encryptPayload",
    "export async function decryptPayload",
  ]);

  mustContain(SYNC_WATCHER_FILE, "electron/services/syncFolderWatcher.ts exports", [
    "export async function writePacket",
    "export function getSyncStatus",
    "export function setSyncEmissionSuppressed",
    "SYNC_STORE_ALLOWLIST",
  ]);

  mustContain(SYNC_BRIDGE_FILE, "electron/services/syncBridge.ts exports", [
    "export async function emitSyncPacket",
    "export async function emitSyncTombstone",
  ]);

  mustContain(SYNC_HANDLERS_FILE, "electron/ipc/handlers/syncHandlers.ts channels", [
    'ipcMain.handle("sync:chooseSyncFolder"',
    'ipcMain.handle("sync:getSyncFolder"',
    'ipcMain.handle("sync:startSync"',
    'ipcMain.handle("sync:stopSync"',
    'ipcMain.handle("sync:pauseSync"',
    'ipcMain.handle("sync:getStatus"',
    'ipcMain.handle("sync:setEmissionSuppressed"',
    'ipcMain.handle("sync:writePacket"',
    'ipcMain.handle("sync:encryptBackup"',
    'ipcMain.handle("sync:decryptBackup"',
  ]);

  mustContain(BACKUP_EXPORT_FILE, "src/services/backupExportService.ts exports", [
    "export async function createEncryptedBackup",
    "export async function downloadEncryptedBackup",
  ]);

  mustContain(BACKUP_IMPORT_FILE, "src/services/backupImportService.ts exports", [
    "export async function parseAndImportBackup",
    "export async function previewBackup",
    "export async function importDecryptedPacket",
  ]);

  mustContain(SYNC_ENGINE_FILE, "src/services/syncEngine.ts exports", [
    "export async function initSyncEngine",
    "export function stopSyncEngine",
    "export async function emitLocalChange",
    "export async function emitLocalTombstone",
  ]);

  mustContain(BACKUP_PANEL_FILE, "BackupSyncPanel settings/status wiring", [
    "useSettingsStore",
    "setSyncFolderPath",
    'res.status === "running"',
  ]);

  mustContain(PRELOAD_FILE, "electron/preload.ts sync bridge", [
    "setEmissionSuppressed",
    "encryptBackup",
    "decryptBackup",
  ]);

  mustContain(SYSTEM_HANDLERS_FILE, "systemHandlers sync bridge usage", [
    'import { emitSyncPacket, emitSyncTombstone } from "../../services/syncBridge"',
    "await emitSyncPacket",
    "await emitSyncTombstone",
  ]);

  mustContain(RP_HANDLERS_FILE, "rpHandlers sync bridge usage", [
    'import { emitSyncPacket, emitSyncTombstone } from "../services/syncBridge"',
    "await emitSyncPacket",
    "await emitSyncTombstone",
  ]);

  // Phase 9 source-level contract checks
  mustContain(BACKUP_IMPORT_FILE, "backupImportService manifest validation", [
    'throw new Error("Malformed encrypted backup manifest.")',
    "manifest.version !== BACKUP_SCHEMA_VERSION",
  ]);

  mustContain(BACKUP_IMPORT_FILE, "backupImportService tombstone handling", [
    'storeName === "tombstones"',
    "TombstoneService.recordTombstone",
  ]);

  mustContain(BACKUP_IMPORT_FILE, "backupImportService conflict-copy logic", [
    "_conflict_",
    "preserveStores",
  ]);

  mustContain(SYNC_WATCHER_FILE, "syncFolderWatcher packet allowlist", [
    "SYNC_STORE_ALLOWLIST.has(storeName)",
  ]);

  mustContain(SYNC_WATCHER_FILE, "syncFolderWatcher atomic write semantics", [
    "fs.writeFile(tmpPath",
    "fs.rename(tmpPath",
  ]);

  mustContain(BACKUP_EXPORT_FILE, "backupExportService secret exclusion", [
    "sanitizePortableData",
  ]);
}

async function runRuntimeChecks() {
  const { encryptPayload, decryptPayload, BACKUP_SCHEMA_VERSION } = require("../electron/services/backupCrypto");
  const { sanitizePortableData } = require("../src/services/syncDataSanitizer");

  const plaintext = JSON.stringify({ conversations: [{ id: "c1", title: "Hello" }] });
  const password = "phase-nine-test-password";

  try {
    const encrypted = await encryptPayload(plaintext, password);
    const decrypted = await decryptPayload(encrypted.ciphertext, encrypted.salt, encrypted.iv, password);
    check("backupCrypto round-trip", decrypted === plaintext);
  } catch (err) {
    check("backupCrypto round-trip", false, err && err.message ? err.message : String(err));
  }

  try {
    const encrypted = await encryptPayload(plaintext, password);
    let threw = false;
    try {
      await decryptPayload(encrypted.ciphertext, encrypted.salt, encrypted.iv, "wrong-password");
    } catch {
      threw = true;
    }
    check("backupCrypto rejects wrong passphrase", threw);
  } catch (err) {
    check("backupCrypto rejects wrong passphrase", false, err && err.message ? err.message : String(err));
  }

  try {
    const encrypted = await encryptPayload(plaintext, password);
    // Corrupt the authentication tag portion of the ciphertext.
    const parts = encrypted.ciphertext.split(":");
    const tamperedCiphertext = parts[0] + ":" + "AAAAAAAAAAAAAAAAAAAAAA==";
    let threw = false;
    try {
      await decryptPayload(tamperedCiphertext, encrypted.salt, encrypted.iv, password);
    } catch {
      threw = true;
    }
    check("backupCrypto rejects tampered auth tag", threw);
  } catch (err) {
    check("backupCrypto rejects tampered auth tag", false, err && err.message ? err.message : String(err));
  }

  check("BACKUP_SCHEMA_VERSION is 2", BACKUP_SCHEMA_VERSION === 2);

  try {
    const sanitized = sanitizePortableData({
      id: "keep-me",
      title: "keep",
      apiKey: "sk-live-should-be-redacted",
      veniceApiKey: "venice_should_be_redacted",
      nested: { token: "bearer-redacted", value: "keep-nested" },
      absolutePath: "/Users/secret",
    });
    const payload = JSON.stringify(sanitized);
    check(
      "syncDataSanitizer excludes secrets",
      payload.includes("keep-me") &&
        payload.includes("keep-nested") &&
        !payload.includes("sk-live") &&
        !payload.includes("venice_should_be") &&
        !payload.includes("bearer-redacted") &&
        !payload.includes("/Users/secret"),
    );
  } catch (err) {
    check("syncDataSanitizer excludes secrets", false, err && err.message ? err.message : String(err));
  }
}

(async () => {
  console.log("Phase 9 Backup and Sync contract guard (VERIFY-087..VERIFY-091)");
  console.log("");

  runStaticChecks();
  await runRuntimeChecks();

  console.log("");
  if (failures > 0) {
    console.log(`${failures} backup/sync contract violation(s).`);
    process.exit(1);
  }
  console.log("All backup/sync contract invariants passed.");
  process.exit(0);
})();
