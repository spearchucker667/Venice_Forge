// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { selectHasVeniceKey } from "./auth-store";

describe("configured Venice key gating", () => {
  // VERIFY-037: persisted OS-secure configuration must unlock the UI without
  // copying the raw key back into renderer memory after restart.
  it("treats OS-secure configured state as usable without a renderer key", () => {
    expect(selectHasVeniceKey({ apiKey: null, isConfigured: true })).toBe(true);
    expect(selectHasVeniceKey({ apiKey: null, isConfigured: false })).toBe(false);
  });

  it("routes primary UI key gates through the configured-state selector", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      "src/components/chat/chat-view.tsx",
      "src/components/image/image-view.tsx",
      "src/components/video/video-view.tsx",
      "src/components/audio/audio-view.tsx",
      "src/components/image/image-tools.tsx",
      "src/components/embeddings/embeddings-view.tsx",
      "src/components/music/music-view.tsx",
      "src/components/playground/playground-chat.tsx",
      "src/components/layout/header.tsx",
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).toContain("selectHasVeniceKey");
      expect(source, file).not.toMatch(/useAuthStore\(\(s\) => s\.apiKey/);
    }
  });
});
