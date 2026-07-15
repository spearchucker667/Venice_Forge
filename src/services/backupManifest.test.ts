// VERIFY-124 regression guard: version-3 manual backup metadata is non-sensitive,
// content-bound, and deterministic across runtimes.

import { describe, expect, it } from "vitest";
import {
  MANUAL_BACKUP_FORMAT,
  MANUAL_BACKUP_MANIFEST_VERSION,
  buildBackupManifestMetadata,
  hashPortableBackupData,
  verifyBackupManifestMetadata,
} from "./backupManifest";

describe("backupManifest", () => {
  const data = {
    conversations: [{ id: "conversation-1", title: "private title" }],
    images: [{ id: "image-1", image: "data:image/png;base64,AAAA" }],
    tombstones: [{ id: "conversations:deleted", storeName: "conversations", recordId: "deleted" }],
  };

  it("builds a self-describing metadata envelope without record content", async () => {
    const metadata = await buildBackupManifestMetadata({
      data,
      appVersion: "2.1.2",
      exportedAt: "2026-07-15T01:00:00.000Z",
      runtime: "electron",
      deviceRef: "device-1",
      profileId: "private-work-profile",
      crypto: { algorithm: "XChaCha20-Poly1305", kdf: "Argon2id", keyVersion: 1 },
      exclusions: ["credentials", "diagnostics", "machine-local paths", "sync configuration"],
    });

    expect(metadata).toMatchObject({
      format: MANUAL_BACKUP_FORMAT,
      formatVersion: MANUAL_BACKUP_MANIFEST_VERSION,
      appVersion: "2.1.2",
      source: { runtime: "electron", deviceRef: "device-1" },
      contents: {
        totalRecords: 3,
        storeCounts: { conversations: 1, images: 1, tombstones: 1 },
        tombstoneCount: 1,
        embeddedBlobCount: 1,
        includesMedia: true,
      },
    });
    expect(metadata.source.profileRef).not.toContain("private-work-profile");
    expect(JSON.stringify(metadata)).not.toContain("private title");
    expect(metadata.contents.payloadSha256).toBe(await hashPortableBackupData(data));
  });

  it("rejects outer metadata that does not match the authenticated payload copy", async () => {
    const metadata = await buildBackupManifestMetadata({
      data,
      appVersion: "2.1.2",
      exportedAt: "2026-07-15T01:00:00.000Z",
      runtime: "web",
      deviceRef: "web-export-1",
      profileId: "default",
      crypto: { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", keyVersion: 1 },
      exclusions: ["credentials"],
    });

    await expect(verifyBackupManifestMetadata(
      { ...metadata, appVersion: "tampered" },
      metadata,
      data,
    )).rejects.toThrow(/metadata authentication failed/i);
  });
});
