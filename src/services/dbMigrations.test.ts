// @vitest-environment jsdom
/**
 * Unit tests for src/services/dbMigrations.ts
 *
 * Tests verify:
 * - applyMigrations() runs only the steps whose toVersion > oldVersion
 * - Each step is idempotent (safe on already-migrated DB)
 * - All stores declared in STORE_NAMES are created by v1→current
 * - getMigrationHistory() returns a stable, ordered summary
 * - A corrupt step throws with context
 */

import { describe, it, expect, vi } from "vitest";
import { MIGRATIONS, applyMigrations, getMigrationHistory } from "./dbMigrations";
import { STORE_NAMES, DB_VERSION } from "../constants/venice";

// ---------------------------------------------------------------------------
// Minimal IDBDatabase / IDBTransaction stubs
// ---------------------------------------------------------------------------

function makeFakeDb(existingStores: string[] = []): IDBDatabase {
  const stores = new Set(existingStores);
  return {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: vi.fn((name: string) => {
      stores.add(name);
      return { createIndex: vi.fn() } as unknown as IDBObjectStore;
    }),
  } as unknown as IDBDatabase;
}

function makeFakeTx(_db: IDBDatabase): IDBTransaction {
  return {
    objectStore: (_name: string) => ({
      createIndex: vi.fn(),
      indexNames: { contains: vi.fn(() => false) },
    }),
  } as unknown as IDBTransaction;
}

// ---------------------------------------------------------------------------

describe("MIGRATIONS array", () => {
  it("is sorted by toVersion ascending", () => {
    const versions = MIGRATIONS.map((m) => m.toVersion);
    const sorted = [...versions].sort((a, b) => a - b);
    expect(versions).toEqual(sorted);
  });

  it("has no duplicate toVersion values", () => {
    const versions = MIGRATIONS.map((m) => m.toVersion);
    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
  });

  it("starts at toVersion 1 and ends at DB_VERSION", () => {
    expect(MIGRATIONS[0].toVersion).toBe(1);
    expect(MIGRATIONS[MIGRATIONS.length - 1].toVersion).toBe(DB_VERSION);
  });

  it("every step has a non-empty description", () => {
    for (const step of MIGRATIONS) {
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------

describe("applyMigrations()", () => {
  it("fresh install (oldVersion=0): runs all steps and creates all stores", () => {
    const db = makeFakeDb();
    const tx = makeFakeTx(db);
    applyMigrations(db, tx, 0, DB_VERSION);

    const createSpy = db.createObjectStore as ReturnType<typeof vi.fn>;
    const createdNames: string[] = createSpy.mock.calls.map((c) => c[0] as string);

    // Every store must have been created at least once
    for (const store of STORE_NAMES) {
      expect(createdNames, `Expected ${store} to be created`).toContain(store);
    }
  });

  it("upgrade from oldVersion=4 to 5: only runs v5 step", () => {
    const db = makeFakeDb(["images", "chats", "settings", "diagnostics", "conversations", "ai_memory", "files"]);
    const tx = makeFakeTx(db);
    applyMigrations(db, tx, 4, 5);

    const createSpy = db.createObjectStore as ReturnType<typeof vi.fn>;
    const createdNames: string[] = createSpy.mock.calls.map((c) => c[0] as string);

    // Only the v5 stores should be created
    expect(createdNames).toContain("character_cards");
    expect(createdNames).toContain("personas");
    expect(createdNames).toContain("lorebooks");
    expect(createdNames).toContain("rp_chats");
    expect(createdNames).toContain("rp_assets");

    // Stores already present must NOT be re-created (idempotent)
    expect(createdNames).not.toContain("conversations");
    expect(createdNames).not.toContain("ai_memory");
  });

  it("is idempotent: re-running on an already-upgraded DB creates nothing new", () => {
    // DB already has every store
    const db = makeFakeDb([...STORE_NAMES]);
    const tx = makeFakeTx(db);
    applyMigrations(db, tx, 0, DB_VERSION);

    const createSpy = db.createObjectStore as ReturnType<typeof vi.fn>;
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("oldVersion === newVersion: applies nothing", () => {
    const db = makeFakeDb();
    const tx = makeFakeTx(db);
    applyMigrations(db, tx, DB_VERSION, DB_VERSION);

    const createSpy = db.createObjectStore as ReturnType<typeof vi.fn>;
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("a failing step re-throws with version context", () => {
    const db = makeFakeDb();
    const tx = makeFakeTx(db);

    // Temporarily inject a bad step
    MIGRATIONS.push({
      toVersion: DB_VERSION + 99,
      description: "intentionally broken step",
      up() {
        throw new Error("boom");
      },
    });

    expect(() => applyMigrations(db, tx, DB_VERSION + 98, DB_VERSION + 99)).toThrow(
      /Migration to v\d+.*failed.*boom/
    );

    // Clean up the injected step
    MIGRATIONS.pop();
  });
});

// ---------------------------------------------------------------------------

describe("getMigrationHistory()", () => {
  it("returns an array of { toVersion, description } for every step", () => {
    const history = getMigrationHistory();
    expect(history).toHaveLength(MIGRATIONS.length);
    for (const entry of history) {
      expect(typeof entry.toVersion).toBe("number");
      expect(typeof entry.description).toBe("string");
    }
  });

  it("does not expose the `up` function", () => {
    const history = getMigrationHistory();
    for (const entry of history) {
      expect(entry).not.toHaveProperty("up");
    }
  });
});
