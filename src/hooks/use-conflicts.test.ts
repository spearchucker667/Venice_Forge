// @vitest-environment jsdom
/** @fileoverview Regression tests for the `useConflicts` hook's
 *  resolution semantics — specifically that the loser's identity-bearing
 *  fields (name/title) survive `keep_conflict` (replaces winner with the
 *  losing revision) and that "keep copy from <...>" annotations in
 *  `keep_both` reference the losing device, not the winner. VERIFY-128 +
 *  P1 #4.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const fetchStoreRecords = vi.fn();
const saveStoreRecord = vi.fn();
const deleteStoreRecord = vi.fn();

vi.mock("../services/backupImportService", () => ({
  fetchStoreRecords: (...args: unknown[]) => fetchStoreRecords(...args),
  saveStoreRecord: (...args: unknown[]) => saveStoreRecord(...args),
  deleteStoreRecord: (...args: unknown[]) => deleteStoreRecord(...args),
}));

import { useConflicts } from "./use-conflicts";
import { SYNC_CONFLICT_META_KEY } from "../services/syncPacketImporter";

function buildProvenanceRecord(
  originalId: string,
  conflictId: string,
  winningSource: "local" | "imported",
  conflictingDeviceId: string,
  originalDeviceId: string,
  originalName: string,
  conflictName: string,
) {
  // `compareSyncRecords` picks the imported as winner when `importedWins`
  // is true. To get the original-record-as-winner case we set
  // `winningSource: "local"` in provenance. Conflict record always carries
  // the losing revision.
  //
  // Each side is built from its own independent name argument so tests
  // can prove which side's identity survives resolution.
  const conflictRecord = {
    id: conflictId,
    name: `${conflictName} (Conflict from ${conflictingDeviceId})`,
    title: `${conflictName} (Conflict from ${conflictingDeviceId})`,
    updatedAt: 2,
    deviceId: conflictingDeviceId,
    revisionId: "rev-conflict",
    [SYNC_CONFLICT_META_KEY]: {
      kind: "sync-conflict",
      conflictIdentity: "x".repeat(40),
      originalRecordId: originalId,
      winningSource,
      winningRevisionId: "rev-original",
      winningDeviceId: originalDeviceId,
      losingSource: winningSource === "local" ? "imported" : "local",
      losingRevisionId: "rev-conflict",
      losingDeviceId: conflictingDeviceId,
      recordedAt: "2026-07-16T00:00:00.000Z",
    },
  };
  const originalRecord = {
    id: originalId,
    name: originalName,
    title: originalName,
    updatedAt: 1,
    deviceId: originalDeviceId,
    revisionId: "rev-original",
  };
  return { originalRecord, conflictRecord };
}

describe("useConflicts — resolution semantics (VERIFY-128 / P1 #4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("`keep_conflict` preserves the losing revision's name (does not overwrite with winner name)", async () => {
    const originalId = "char-1";
    const conflictId = `char-1_conflict_${"a".repeat(16)}`;
    // Distinct names so we can prove which side's data won.
    // `winningSource: "imported"` makes the IMPORTED side the winner.
    // The conflict record carries the losing LOCAL side whose name was
    // "LocalLoser" (and the fork appended "(Conflict from this-device)").
    const { originalRecord, conflictRecord } = buildProvenanceRecord(
      originalId,
      conflictId,
      "imported",
      "this-device",
      "remote",
      "RemoteWinnerName",
      "LocalLoserName",
    );
    fetchStoreRecords.mockImplementation(async (store: string) => {
      if (store === "character_cards") return [originalRecord, conflictRecord];
      return [];
    });
    saveStoreRecord.mockResolvedValue(undefined);
    deleteStoreRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() => useConflicts());
    await act(async () => {
      await result.current.loadConflicts();
    });
    expect(result.current.conflicts).toHaveLength(1);

    await act(async () => {
      const r = await result.current.resolveConflict(
        result.current.conflicts[0],
        "keep_conflict",
      );
      expect(r.ok).toBe(true);
    });

    expect(saveStoreRecord).toHaveBeenCalledTimes(1);
    const saved = saveStoreRecord.mock.calls[0][1];
    // The saved record sits at `originalId` (the surprising part of
    // keep_conflict: the ID stays the same, but the *content* now comes
    // from the losing side). Pre-fix, this overwrite used
    // `originalRecord.name` and silently stamped the WINNER's name
    // ("RemoteWinnerName") onto the survivor — defeating the user's
    // "Use <loser> copy" decision.
    expect(saved.id).toBe(originalId);
    expect(saved.name).toBe("LocalLoserName");
    expect(saved.title).toBe("LocalLoserName");
    // It MUST NOT carry the (now-replaced) winner's name.
    expect(saved.name).not.toBe("RemoteWinnerName");
  });

  it("`keep_both` annotates the sibling copy with the loser's device, not the winner's", async () => {
    const originalId = "char-2";
    const conflictId = `char-2_conflict_${"b".repeat(16)}`;
    const { originalRecord, conflictRecord } = buildProvenanceRecord(
      originalId,
      conflictId,
      "imported", // imported wins
      "phone-A",
      "phone-B",
      "Alpha",
      "Alpha",
    );
    fetchStoreRecords.mockImplementation(async (store: string) => {
      if (store === "character_cards") return [originalRecord, conflictRecord];
      return [];
    });
    saveStoreRecord.mockResolvedValue(undefined);
    deleteStoreRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() => useConflicts());
    await act(async () => {
      await result.current.loadConflicts();
    });

    await act(async () => {
      const r = await result.current.resolveConflict(
        result.current.conflicts[0],
        "keep_both",
      );
      expect(r.ok).toBe(true);
    });

    const saved = saveStoreRecord.mock.calls[0][1];
    // Bug fix: the annotation must read "Copy from phone-A" because the
    // losing device is "phone-A" — the user is *also* keeping the
    // winning phone-B copy, so labeling the sibling as "Copy from
    // phone-B" would be misleading.
    expect(saved.name.startsWith("Alpha (Copy from phone-A)")).toBe(true);
    expect(saved.name.includes("phone-B")).toBe(false);
    // The split must also strip the trailing "(Conflict from …)" suffix
    // before re-appending the "(Copy from …)" annotation, so we never
    // see "... (Conflict from phone-A) (Copy from phone-A)".
    expect(saved.name.includes("Conflict from")).toBe(false);
  });

  it("`keep_original` simply deletes the conflict record without overwriting the winner", async () => {
    const originalId = "char-3";
    const conflictId = `char-3_conflict_${"c".repeat(16)}`;
    const { originalRecord, conflictRecord } = buildProvenanceRecord(
      originalId,
      conflictId,
      "imported",
      "phone-A",
      "phone-B",
      "Beta",
      "Beta",
    );
    fetchStoreRecords.mockImplementation(async (store: string) => {
      if (store === "character_cards") return [originalRecord, conflictRecord];
      return [];
    });
    deleteStoreRecord.mockResolvedValue(undefined);

    const { result } = renderHook(() => useConflicts());
    await act(async () => {
      await result.current.loadConflicts();
    });

    await act(async () => {
      const r = await result.current.resolveConflict(
        result.current.conflicts[0],
        "keep_original",
      );
      expect(r.ok).toBe(true);
    });

    expect(saveStoreRecord).not.toHaveBeenCalled();
    expect(deleteStoreRecord).toHaveBeenCalledWith("character_cards", conflictId, "local-user");
    expect(result.current.conflicts).toHaveLength(0);
  });
});
