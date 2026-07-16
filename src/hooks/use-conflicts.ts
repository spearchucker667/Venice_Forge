import { useState, useCallback } from "react";
import { fetchStoreRecords, saveStoreRecord, deleteStoreRecord } from "../services/backupImportService";
import type { SyncStoreName } from "../types/sync";
import {
  readSyncConflictProvenance,
  type SyncConflictProvenance,
  SYNC_CONFLICT_META_KEY,
} from "../services/syncPacketImporter";

export interface ConflictItem {
  storeName: SyncStoreName;
  originalId: string;
  conflictId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalRecord: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conflictRecord: any;
  /**
   * Authoritative provenance for this conflict. When present, it overrides
   * any id-suffix inference. Legacy records (created before P1 #5 fix)
   * have no `_meta` block and fall back to suffix inference.
   */
  provenance?: SyncConflictProvenance | null;
}

export interface ResolveConflictResult {
  ok: boolean;
  error?: string;
}

function cleanConflictSuffix(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/ \(Conflict from .*\)$/, "");
}

function deriveLegacyProvenance(
  originalRecord: { deviceId?: unknown },
  conflictRecord: { deviceId?: unknown },
): SyncConflictProvenance {
  // Legacy reconciliation: the conflict record carries the losing revision,
  // and the originalId record carries the winning revision. We do not know
  // which "device" wrote the winner vs. loser from the legacy format, so the
  // device names are best-effort.
  return {
    kind: "sync-conflict",
    conflictIdentity: "legacy",
    originalRecordId: "",
    winningSource: "local",
    winningRevisionId: null,
    winningDeviceId: typeof originalRecord?.deviceId === "string" ? originalRecord.deviceId : "this-device",
    losingSource: "imported",
    losingRevisionId: null,
    losingDeviceId: typeof conflictRecord?.deviceId === "string" ? conflictRecord.deviceId : "remote-device",
    recordedAt: new Date(0).toISOString(),
  };
}

export function useConflicts() {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const preserveStores: SyncStoreName[] = ["character_cards", "promptLibrary", "personas", "lorebooks", "rpScenarios", "projects", "scenes"] as unknown as SyncStoreName[];
      const foundConflicts: ConflictItem[] = [];

      for (const storeName of preserveStores) {
        try {
          const records = await fetchStoreRecords(storeName);
          const recordMap = new Map(records.map(r => [r.id, r]));

          for (const record of records) {
            if (record.id.includes("_conflict_")) {
              const originalId = record.id.split("_conflict_")[0];
              const originalRecord = recordMap.get(originalId);
              if (originalRecord) {
                const provenance =
                  readSyncConflictProvenance(record) ?? deriveLegacyProvenance(originalRecord, record);
                foundConflicts.push({
                  storeName,
                  originalId,
                  conflictId: record.id,
                  originalRecord,
                  conflictRecord: record,
                  provenance,
                });
              }
            }
          }
        } catch (err) {
          console.error(`Failed to fetch conflicts for ${storeName}`, err);
        }
      }
      setConflicts(foundConflicts);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Resolve a sync conflict. The action enum preserves the legacy mapping so
   * existing callers (`BackupSyncPanel.tsx`) keep working, but the resolved
   * semantics are now labelled per provenance ("Keep at <winnerDeviceId> copy"
   * vs. "Keep at <loserDeviceId> copy") in the UI.
   *
   * Truth table:
   *   keep_original → keep the WINNING revision (the one currently sitting
   *                   at `originalId`); drop the losing copy.
   *   keep_conflict → replace the WINNING revision with the LOSING one
   *                   (i.e. swap the merge winner); drop the loser copy.
   *   keep_both     → keep the WINNING revision in place AND promote the
   *                   loser copy to a sibling record (id suffix `_copy_<ts>`).
   */
  const resolveConflict = async (
    conflict: ConflictItem,
    action: "keep_original" | "keep_conflict" | "keep_both",
  ): Promise<ResolveConflictResult> => {
    const { storeName, originalId, conflictId, originalRecord, conflictRecord } = conflict;

    try {
      if (action === "keep_original") {
        // Original (winner) wins, just delete the conflict record
        await deleteStoreRecord(storeName, conflictId, "local-user");
      } else if (action === "keep_conflict") {
        // Overwrite original with conflict data, but keep original's ID and bump timestamp
        const newRecord = {
          ...conflictRecord,
          id: originalId,
          name: cleanConflictSuffix(originalRecord.name),
          updatedAt: Date.now(),
          [SYNC_CONFLICT_META_KEY]: undefined,
        };
        newRecord.name = cleanConflictSuffix(newRecord.name);
        newRecord.title = cleanConflictSuffix(newRecord.title);
        await saveStoreRecord(storeName, newRecord, "local-user");
        await deleteStoreRecord(storeName, conflictId, "local-user");
      } else if (action === "keep_both") {
        // Promote the conflict record to a normal record
        const newId = `${originalId}_copy_${Date.now()}`;
        const newRecord = {
          ...conflictRecord,
          id: newId,
          updatedAt: Date.now(),
          [SYNC_CONFLICT_META_KEY]: undefined,
        };
        newRecord.name = cleanConflictSuffix(newRecord.name);
        newRecord.title = cleanConflictSuffix(newRecord.title);
        // Annotate the copy so the user can tell which revision it came from
        const winnerDevice =
          conflict.provenance?.winningDeviceId ||
          (typeof originalRecord.deviceId === "string" ? originalRecord.deviceId : "winner");
        if (typeof newRecord.name === "string") {
          newRecord.name = `${newRecord.name} (Copy from ${winnerDevice})`;
        } else if (typeof newRecord.title === "string") {
          newRecord.title = `${newRecord.title} (Copy from ${winnerDevice})`;
        }
        await saveStoreRecord(storeName, newRecord, "local-user");
        await deleteStoreRecord(storeName, conflictId, "local-user");
      }

      // Remove from local state
      setConflicts(prev => prev.filter(c => c.conflictId !== conflictId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to resolve conflict" };
    }
  };

  return {
    conflicts,
    loading,
    loadConflicts,
    resolveConflict,
  };
}
