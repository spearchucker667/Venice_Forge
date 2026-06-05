// @vitest-environment node

/** @fileoverview Unit tests for the generic single-file-per-record store. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

import { createSingleFileStore, isValidId } from "./rpSingleFileStore";

interface DemoRecord {
  id: string;
  name: string;
  tags: string[];
}

const validate = (v: unknown): v is DemoRecord => {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && isValidId(r.id) && typeof r.name === "string" && Array.isArray(r.tags);
};

const make = (overrides: Partial<DemoRecord> = {}): DemoRecord => ({
  id: "demo-1",
  name: "Test",
  tags: ["a"],
  ...overrides,
});

describe("rpSingleFileStore", () => {
  const store = createSingleFileStore<DemoRecord>("rp-test-store", validate);

  beforeEach(async () => {
    try {
      const entries = await fs.readdir(store.getDir());
      for (const entry of entries) await fs.unlink(path.join(store.getDir(), entry));
    } catch {
      // ignore
    }
  });
  afterEach(async () => {
    try {
      const entries = await fs.readdir(store.getDir());
      for (const entry of entries) await fs.unlink(path.join(store.getDir(), entry));
    } catch {
      // ignore
    }
  });

  it("saves, reads, lists and removes a record", async () => {
    const r = make({ id: "demo-x" });
    const save = await store.save(r);
    expect(save).toEqual({ ok: true });
    const loaded = await store.read("demo-x");
    expect(loaded).toEqual(r);
    const listed = await store.list();
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].id).toBe("demo-x");
    const removed = await store.remove("demo-x");
    expect(removed).toEqual({ ok: true });
    const gone = await store.read("demo-x");
    expect(gone).toBeNull();
  });

  it("rejects save when validation fails", async () => {
    const r = { id: "demo-y", name: 42, tags: [] }; // name is not string
    const save = await store.save(r);
    expect(save.ok).toBe(false);
  });

  it("rejects save when id is invalid", async () => {
    const r = { id: "..", name: "x", tags: [] };
    const save = await store.save(r);
    expect(save.ok).toBe(false);
  });

  it("backs up corrupt files on read and returns null", async () => {
    const dir = store.getDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "demo-corrupt.json"), "not-json", "utf-8");
    const loaded = await store.read("demo-corrupt");
    expect(loaded).toBeNull();
    // File is renamed to .backup.<ts>.<uuid>; original gone.
    const entries = await fs.readdir(dir);
    expect(entries.some((e) => e === "demo-corrupt.json")).toBe(false);
    expect(entries.some((e) => e.startsWith("demo-corrupt.json.backup."))).toBe(true);
  });

  it("read returns null for missing file", async () => {
    const loaded = await store.read("never-exists");
    expect(loaded).toBeNull();
  });

  it("read rejects invalid id", async () => {
    const loaded = await store.read("..");
    expect(loaded).toBeNull();
  });

  it("remove returns ok for missing id", async () => {
    const r = await store.remove("nope");
    expect(r).toEqual({ ok: true });
  });
});
