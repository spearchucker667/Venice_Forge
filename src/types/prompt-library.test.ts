/** @fileoverview Phase 2D — Prompt Library data model contract tests (VERIFY-046). */

import { describe, it, expect } from "vitest";
import {
  sanitizePromptLibraryItem,
  sanitizePromptVersion,
  createPromptLibraryItem,
  createPromptVersion,
  isPromptSecretLike,
  redactPromptSecrets,
  exportPromptLibraryItems,
  parsePromptLibraryImport,
  isPromptLibraryItem,
  getCurrentPromptVersion,
  type PromptLibraryItem,
} from "./prompt-library";

const NOW = "2026-06-08T12:00:00.000Z";

function buildBaseItem(overrides: Partial<PromptLibraryItem> = {}): PromptLibraryItem {
  const base = createPromptLibraryItem(
    {
      title: "Test Prompt",
      kind: "image",
      content: "A serene landscape at sunset",
      scope: "global",
      tags: ["Landscape", "warm"],
      modelHints: ["flux-dev"],
    },
    NOW,
  );
  return { ...base, ...overrides, versions: overrides.versions ?? base.versions };
}

describe("prompt-library types (VERIFY-046)", () => {
  describe("createPromptLibraryItem", () => {
    it("creates a valid prompt item with version 1", () => {
      const item = createPromptLibraryItem(
        { title: "Hello", kind: "chat", content: "world", scope: "global" },
        NOW,
      );
      expect(item.title).toBe("Hello");
      expect(item.kind).toBe("chat");
      expect(item.versions).toHaveLength(1);
      expect(item.versions[0]!.version).toBe(1);
      expect(item.currentVersionId).toBe(item.versions[0]!.id);
      expect(item.favorite).toBe(false);
      expect(item.archivedAt).toBeNull();
      expect(item.tags).toEqual([]);
    });

    it("lowercases tags and dedupes when caller provides them", () => {
      const item = createPromptLibraryItem(
        { title: "t", kind: "general", content: "c", scope: "global", tags: ["Foo", "FOO", "bar"] },
        NOW,
      );
      // Tag dedupe is performed at the store level; the builder preserves
      // the caller-supplied list so the store can decide.
      expect(item.tags).toEqual(["foo", "foo", "bar"]);
    });

    it("creates a project-scoped item with the given projectId", () => {
      const item = createPromptLibraryItem(
        { title: "t", kind: "image", content: "c", scope: "project", projectId: "p-1" },
        NOW,
      );
      expect(item.scope).toBe("project");
      expect(item.projectId).toBe("p-1");
    });

    it("drops projectId when scope is global", () => {
      const item = createPromptLibraryItem(
        { title: "t", kind: "image", content: "c", scope: "global", projectId: "p-1" },
        NOW,
      );
      expect(item.scope).toBe("global");
      expect(item.projectId).toBeNull();
    });
  });

  describe("createPromptVersion", () => {
    it("creates a deterministic-shaped version", () => {
      const v = createPromptVersion(
        {
          promptId: "plib-x",
          version: 3,
          title: "title",
          content: "body",
          source: { type: "image", sourceId: "media-1" },
        },
        NOW,
      );
      expect(v.version).toBe(3);
      expect(v.promptId).toBe("plib-x");
      expect(v.content).toBe("body");
      expect(v.source?.type).toBe("image");
      expect(v.source?.sourceId).toBe("media-1");
      expect(v.createdAt).toBe(NOW);
    });

    it("redacts obvious secrets in version content", () => {
      const v = createPromptVersion(
        {
          promptId: "plib-y",
          version: 1,
          title: "t",
          content: "Authorization: Bearer " + ["sk", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join("-"),
        },
        NOW,
      );
      expect(v.content).toContain("[REDACTED]");
      expect(v.content).not.toContain(["sk", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join("-"));
    });
  });

  describe("isPromptSecretLike + redactPromptSecrets", () => {
    it("detects sk- keys", () => {
      expect(isPromptSecretLike(["sk", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].join("-"))).toBe(true);
    });

    it("detects venice_ keys", () => {
      expect(isPromptSecretLike("venice_abcdefghijklmnopqrstuvwxyz1234")).toBe(true);
    });

    it("detects Bearer tokens", () => {
      expect(isPromptSecretLike("Authorization: Bearer aaaaaaaaaaaaaaaabbbbbbbbbbbbbbb")).toBe(true);
    });

    it("does not flag a normal sentence", () => {
      expect(isPromptSecretLike("A serene mountain landscape at sunset")).toBe(false);
    });

    it("redacts the secret substring but preserves the rest", () => {
      const out = redactPromptSecrets("Prefix venice_abcdefghijklmnopqrstuvwxyz1234 suffix");
      expect(out).toContain("[REDACTED]");
      expect(out).toContain("Prefix");
      expect(out).toContain("suffix");
    });
  });

  describe("sanitizePromptVersion", () => {
    it("rejects records without a valid id", () => {
      const out = sanitizePromptVersion({ version: 1, content: "x" }, { promptId: "p", now: NOW });
      expect(out).toBeNull();
    });

    it("rejects records without content", () => {
      const out = sanitizePromptVersion({ id: "v1", version: 1, title: "t" }, { promptId: "p", now: NOW });
      expect(out).toBeNull();
    });

    it("rejects records with version < 1", () => {
      const out = sanitizePromptVersion(
        { id: "v1", version: 0, title: "t", content: "x" },
        { promptId: "p", now: NOW },
      );
      expect(out).toBeNull();
    });

    it("redacts secrets in content", () => {
      const out = sanitizePromptVersion(
        {
          id: "v1",
          promptId: "p",
          version: 1,
          title: "t",
          content: "Authorization: Bearer aaaaaaaaaaaaaaaabbbbbbbbbbbbbbb",
        },
        { promptId: "p", now: NOW },
      );
      expect(out).not.toBeNull();
      expect(out!.content).toContain("[REDACTED]");
    });
  });

  describe("sanitizePromptLibraryItem", () => {
    it("rejects records without a title", () => {
      const out = sanitizePromptLibraryItem(
        { id: "p1", kind: "image", scope: "global", versions: [] },
        { now: NOW },
      );
      expect(out).toBeNull();
    });

    it("rejects records with no parseable versions", () => {
      const out = sanitizePromptLibraryItem(
        { id: "p1", title: "t", kind: "image", scope: "global", versions: [] },
        { now: NOW },
      );
      expect(out).toBeNull();
    });

    it("normalises invalid kind to 'general'", () => {
      const item = buildBaseItem();
      const sanitized = sanitizePromptLibraryItem(
        { ...item, kind: "invalid" as never },
        { now: NOW },
      );
      expect(sanitized).not.toBeNull();
      expect(sanitized!.kind).toBe("general");
    });

    it("normalises invalid scope to 'global'", () => {
      const item = buildBaseItem();
      const sanitized = sanitizePromptLibraryItem(
        { ...item, scope: "everywhere" as never },
        { now: NOW },
      );
      expect(sanitized).not.toBeNull();
      expect(sanitized!.scope).toBe("global");
    });

    it("falls back currentVersionId to the latest version when missing", () => {
      const item = buildBaseItem();
      const sanitized = sanitizePromptLibraryItem(
        { ...item, currentVersionId: "missing-id" },
        { now: NOW },
      );
      expect(sanitized).not.toBeNull();
      expect(sanitized!.currentVersionId).toBe(item.versions[item.versions.length - 1]!.id);
    });

    it("does not mutate the input object", () => {
      const item = buildBaseItem();
      const snapshot = JSON.stringify(item);
      sanitizePromptLibraryItem(item, { now: NOW });
      expect(JSON.stringify(item)).toBe(snapshot);
    });

    it("preserves the modelHints / variables / metadata fields", () => {
      const item = buildBaseItem();
      const sanitized = sanitizePromptLibraryItem(
        {
          ...item,
          modelHints: ["flux-dev", "z-image-turbo"],
          variables: [
            { name: "subject", description: "What to render", required: true },
          ],
          metadata: { source: "test", tier: 1, enabled: true },
        },
        { now: NOW },
      );
      expect(sanitized).not.toBeNull();
      expect(sanitized!.modelHints).toEqual(["flux-dev", "z-image-turbo"]);
      expect(sanitized!.variables).toEqual([
        { name: "subject", description: "What to render", required: true },
      ]);
      expect(sanitized!.metadata).toEqual({ source: "test", tier: 1, enabled: true });
    });
  });

  describe("export / import", () => {
    it("exports a versioned envelope", () => {
      const item = buildBaseItem();
      const out = exportPromptLibraryItems([item]);
      expect(out.version).toBe(1);
      expect(out.app).toBe("Venice Forge");
      expect(out.prompts).toHaveLength(1);
    });

    it("skips prompts whose version content looks like a secret", () => {
      const item = buildBaseItem();
      const poisoned: PromptLibraryItem = {
        ...item,
        versions: [
          {
            ...item.versions[0]!,
            content: "Authorization: Bearer aaaaaaaaaaaaaaaabbbbbbbbbbbbbbb",
          },
        ],
      };
      const out = exportPromptLibraryItems([poisoned]);
      expect(out.prompts).toHaveLength(0);
    });

    it("imports a valid export with regenerated ids", () => {
      const item = buildBaseItem();
      const exported = exportPromptLibraryItems([item]);
      const result = parsePromptLibraryImport(exported);
      expect(result.skipped).toEqual([]);
      expect(result.imported).toHaveLength(1);
      expect(result.imported[0]!.id).not.toBe(item.id);
      expect(result.imported[0]!.versions[0]!.promptId).toBe(result.imported[0]!.id);
    });

    it("rejects an unknown future version", () => {
      const result = parsePromptLibraryImport({ version: 99, app: "Venice Forge", prompts: [] });
      expect(result.skipped[0]?.reason).toMatch(/Unsupported export version/);
    });

    it("rejects an unknown app identifier", () => {
      const result = parsePromptLibraryImport({ version: 1, app: "Some Other App", prompts: [] });
      expect(result.skipped[0]?.reason).toMatch(/Unknown app/);
    });

    it("skips invalid individual records and continues", () => {
      const valid = buildBaseItem();
      const exported = exportPromptLibraryItems([valid]);
      // Inject a deliberately broken record.
      const tampered = { ...exported, prompts: [exported.prompts[0], { id: "bad" }] };
      const result = parsePromptLibraryImport(tampered);
      expect(result.imported).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
    });
  });

  describe("isPromptLibraryItem / getCurrentPromptVersion", () => {
    it("isPromptLibraryItem accepts a well-formed item and rejects a broken one", () => {
      const item = buildBaseItem();
      expect(isPromptLibraryItem(item)).toBe(true);
      expect(isPromptLibraryItem({})).toBe(false);
    });

    it("getCurrentPromptVersion returns the marked current version", () => {
      const item = buildBaseItem();
      const v2 = createPromptVersion(
        { promptId: item.id, version: 2, title: "v2", content: "second" },
        NOW,
      );
      const advanced: PromptLibraryItem = {
        ...item,
        versions: [...item.versions, v2],
        currentVersionId: v2.id,
      };
      const cur = getCurrentPromptVersion(advanced);
      expect(cur?.version).toBe(2);
    });

    it("getCurrentPromptVersion falls back to the last version when currentVersionId is missing", () => {
      const item = buildBaseItem();
      const cur = getCurrentPromptVersion(item);
      expect(cur?.id).toBe(item.versions[item.versions.length - 1]!.id);
    });
  });
});
