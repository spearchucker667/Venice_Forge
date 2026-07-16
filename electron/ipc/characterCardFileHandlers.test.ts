// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import type { CharacterCardV1 } from "../../src/types/rp";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), list: vi.fn(), read: vi.fn(), save: vi.fn(), loreSave: vi.fn(), sync: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler)) },
  dialog: { showOpenDialog: mocks.showOpenDialog, showSaveDialog: mocks.showSaveDialog },
  nativeImage: { createFromBuffer: vi.fn(() => ({ isEmpty: () => false, toPNG: () => Buffer.alloc(0) })) },
}));
vi.mock("../services/characterCardStorage", () => ({ listCharacterCards: mocks.list, readCharacterCard: mocks.read, saveCharacterCard: mocks.save }));
vi.mock("../services/rpStores", () => ({ lorebookStore: { save: mocks.loreSave } }));
vi.mock("../services/syncBridge", () => ({ emitSyncPacket: mocks.sync }));
vi.mock("../../src/shared/safety/characterImportSafety", () => ({ assessCharacterImport: vi.fn(() => ({ allow: true })) }));
vi.mock("../services/runtimeSafetySettings", () => ({ getRuntimeLocalFamilySafeModeEnabled: vi.fn(() => true) }));

import { registerCharacterCardFileHandlers } from "./characterCardFileHandlers";

const existing: CharacterCardV1 = { schema: "CharacterCardV1", id: "existing-1", name: "Aster Vale", description: "Old", systemPrompt: "Old system", tags: [], adult: false, exampleDialogues: [], author: "Venice Forge Tests", createdAt: 1, updatedAt: 2 };
const event = { sender: { id: 7, once: vi.fn() } };

describe("character card file IPC", () => {
  beforeEach(() => {
    vi.useRealTimers(); mocks.handlers.clear(); vi.clearAllMocks();
    mocks.list.mockResolvedValue({ cards: [], truncated: false, totalScanned: 0 });
    mocks.save.mockImplementation(async () => ({ ok: true })); mocks.loreSave.mockResolvedValue({ ok: true }); mocks.sync.mockResolvedValue(undefined);
    registerCharacterCardFileHandlers();
  });

  async function choose(): Promise<Record<string, unknown>> {
    const fixture = path.join(process.cwd(), "tests/fixtures/character-cards/v2/full.json");
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [fixture] });
    return await mocks.handlers.get("characterCards:chooseImportFile")!(event) as Record<string, unknown>;
  }

  it("returns only an opaque preview handle and consumes it after create", async () => {
    const selected = await choose();
    expect(selected).toMatchObject({ ok: true, handle: expect.any(String), preview: { format: "card-v2-json" } });
    expect(JSON.stringify(selected)).not.toContain(process.cwd());
    const applied = await mocks.handlers.get("characterCards:applyImport")!(event, { handle: selected.handle, mode: "create", characterBook: "embedded" }) as Record<string, unknown>;
    expect(applied.ok).toBe(true);
    const replay = await mocks.handlers.get("characterCards:applyImport")!(event, { handle: selected.handle, mode: "create" }) as Record<string, unknown>;
    expect(replay.error).toMatch(/expired|valid/i);
  });

  it("retains a colliding handle for explicit replacement, snapshots, and single-use undo", async () => {
    mocks.list.mockResolvedValue({ cards: [existing], truncated: false, totalScanned: 1 });
    const selected = await choose();
    const collision = await mocks.handlers.get("characterCards:applyImport")!(event, { handle: selected.handle, mode: "create" }) as { collision: { existingCardId: string } };
    expect(collision.collision.existingCardId).toBe(existing.id);
    const replaced = await mocks.handlers.get("characterCards:applyImport")!(event, { handle: selected.handle, mode: "replace", existingCardId: existing.id, characterBook: "embedded" }) as { undoHandle: string };
    expect(replaced.undoHandle).toEqual(expect.any(String));
    const replacement = mocks.save.mock.calls[0][0] as CharacterCardV1;
    expect(replacement.id).toBe(existing.id);
    expect(replacement.versions?.at(-1)?.reason).toMatch(/Before replace import/);
    const undone = await mocks.handlers.get("characterCards:undoImport")!(event, { handle: replaced.undoHandle }) as Record<string, unknown>;
    const replayedUndo = await mocks.handlers.get("characterCards:undoImport")!(event, { handle: replaced.undoHandle }) as Record<string, unknown>;
    expect(undone.ok).toBe(true);
    expect(replayedUndo.ok).toBe(false);
  });

  it("expires sender-scoped handles and rejects invalid export options", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const selected = await choose();
    vi.advanceTimersByTime(6 * 60_000);
    const expired = await mocks.handlers.get("characterCards:applyImport")!(event, { handle: selected.handle, mode: "create" }) as Record<string, unknown>;
    expect(expired.error).toMatch(/expired|valid/i);
    const invalidExport = await mocks.handlers.get("characterCards:exportJson")!(event, { cardId: 42 }) as Record<string, unknown>;
    expect(invalidExport).toMatchObject({ ok: false });
  });
});
