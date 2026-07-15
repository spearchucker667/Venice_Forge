// VERIFY-123 regression guard: incoming backups are fully decrypted and schema
// validated before destructive replace can begin.

import { beforeEach, describe, expect, it, vi } from "vitest";

const decryptBackup = vi.hoisted(() => vi.fn());
const fetchStoreRecords = vi.hoisted(() => vi.fn());
const importDecryptedPacket = vi.hoisted(() => vi.fn());

vi.mock("./desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./desktopBridge")>();
  return {
    ...actual,
    isElectron: vi.fn(() => true),
    desktopSync: {
      decryptBackup,
      setEmissionSuppressed: vi.fn(async () => ({ ok: true })),
    },
  };
});

vi.mock("./syncPacketImporter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syncPacketImporter")>();
  return {
    ...actual,
    fetchStoreRecords,
    importDecryptedPacket,
  };
});

import { applyPreparedBackup, prepareBackupImport } from "./backupImportService";
import { buildBackupManifestMetadata } from "./backupManifest";

const manifest = {
  version: 2,
  exportedAt: "2026-07-15T00:00:00.000Z",
  salt: "salt",
  iv: "iv",
  ciphertext: "ciphertext",
};

describe("prepared backup imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchStoreRecords.mockResolvedValue([]);
    importDecryptedPacket.mockResolvedValue({ ok: true });
  });

  it("rejects malformed records during preparation before any apply call", async () => {
    decryptBackup.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ conversations: [{ title: "missing id" }] }),
    });

    await expect(prepareBackupImport(manifest, "password")).rejects.toThrow(/record id/i);
    expect(importDecryptedPacket).not.toHaveBeenCalled();
  });

  it("rejects diagnostics as non-portable input", async () => {
    decryptBackup.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ diagnostics: [{ id: "diagnostic-1" }] }),
    });

    const prepared = await prepareBackupImport(manifest, "password");
    expect(prepared.data).not.toHaveProperty("diagnostics");
    expect(prepared.skippedRecords).toBe(1);
  });

  it("applies the prepared payload without decrypting it a second time", async () => {
    decryptBackup.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ conversations: [{ id: "conversation-1", updatedAt: 1 }] }),
    });

    const prepared = await prepareBackupImport(manifest, "password");
    const summary = await applyPreparedBackup(prepared);

    expect(summary.recordsImported).toBe(1);
    expect(importDecryptedPacket).toHaveBeenCalledWith(
      "conversations",
      "conversation-1",
      JSON.stringify({ id: "conversation-1", updatedAt: 1 }),
    );
    expect(decryptBackup).toHaveBeenCalledTimes(1);
  });

  it("verifies version-3 metadata and exposes structured preview warnings", async () => {
    const data = { images: [{ id: "image-1", image: "data:image/png;base64,AAAA" }] };
    const metadata = await buildBackupManifestMetadata({
      data,
      appVersion: "2.1.2",
      exportedAt: manifest.exportedAt,
      runtime: "electron",
      deviceRef: "device-1",
      profileId: "default",
      crypto: { algorithm: "XChaCha20-Poly1305", kdf: "Argon2id", keyVersion: 1 },
      exclusions: ["credentials", "diagnostics"],
    });
    decryptBackup.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        _veniceForgeBackup: { profileId: "default", manifestMetadata: metadata },
        ...data,
      }),
    });

    const prepared = await prepareBackupImport({ ...manifest, version: 3, metadata }, "password");

    expect(prepared.plan.manifest).toMatchObject({
      version: 3,
      metadataVerified: true,
      appVersion: "2.1.2",
      tombstoneCount: 0,
      embeddedBlobCount: 1,
      includesMedia: true,
    });
    expect(prepared.plan.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "media-included" }),
      expect.objectContaining({ code: "data-exclusions" }),
    ]));
  });

  it("rejects tampered version-3 outer metadata", async () => {
    const data = { conversations: [{ id: "conversation-1" }] };
    const metadata = await buildBackupManifestMetadata({
      data,
      appVersion: "2.1.2",
      exportedAt: manifest.exportedAt,
      runtime: "web",
      deviceRef: "web-export-1",
      profileId: "default",
      crypto: { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", keyVersion: 1 },
      exclusions: ["credentials"],
    });
    decryptBackup.mockResolvedValue({
      ok: true,
      data: JSON.stringify({
        _veniceForgeBackup: { profileId: "default", manifestMetadata: metadata },
        ...data,
      }),
    });

    await expect(prepareBackupImport({
      ...manifest,
      version: 3,
      metadata: { ...metadata, appVersion: "tampered" },
    }, "password")).rejects.toThrow(/metadata authentication failed/i);
  });

  it("continues to accept version-2 backups with an explicit legacy warning", async () => {
    decryptBackup.mockResolvedValue({ ok: true, data: JSON.stringify({ conversations: [] }) });

    const prepared = await prepareBackupImport(manifest, "password");

    expect(prepared.plan.manifest).toMatchObject({ version: 2, metadataVerified: false });
    expect(prepared.plan.warnings).toContainEqual(expect.objectContaining({ code: "legacy-manifest" }));
  });
});
