import { useState, useCallback } from "react";
import { fetchStoreRecords, saveStoreRecord, deleteStoreRecord } from "../services/backupImportService";
import type { SyncStoreName } from "../types/sync";

export interface ConflictItem {
  storeName: SyncStoreName;
  originalId: string;
  conflictId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalRecord: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conflictRecord: any;
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
                foundConflicts.push({
                  storeName,
                  originalId,
                  conflictId: record.id,
                  originalRecord,
                  conflictRecord: record,
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

  const resolveConflict = async (conflict: ConflictItem, action: "keep_original" | "keep_conflict" | "keep_both") => {
    const { storeName, originalId, conflictId, originalRecord, conflictRecord } = conflict;

    try {
      if (action === "keep_original") {
        // Original wins, just delete the conflict record
        await deleteStoreRecord(storeName, conflictId, "local-user");
      } else if (action === "keep_conflict") {
        // Overwrite original with conflict data, but keep original's ID and bump timestamp
        const newRecord = {
          ...conflictRecord,
          id: originalId,
          name: originalRecord.name, // optionally restore the original name? No, let the conflict name win if it has one, but strip the "(Conflict from...)" if possible
          updatedAt: Date.now(),
        };
        // Clean up name if it has the conflict suffix
        if (newRecord.name && typeof newRecord.name === "string") {
          newRecord.name = newRecord.name.replace(/ \(Conflict from .*\)$/, "");
        }
        if (newRecord.title && typeof newRecord.title === "string") {
          newRecord.title = newRecord.title.replace(/ \(Conflict from .*\)$/, "");
        }
        await saveStoreRecord(storeName, newRecord, "local-user");
        await deleteStoreRecord(storeName, conflictId, "local-user");
      } else if (action === "keep_both") {
        // Promote the conflict record to a normal record
        const newId = `${originalId}_copy_${Date.now()}`;
        const newRecord = {
          ...conflictRecord,
          id: newId,
          updatedAt: Date.now(),
        };
        // Keep the "(Conflict...)" name to distinguish it, or change to "(Copy)"
        if (newRecord.name && typeof newRecord.name === "string") {
          newRecord.name = newRecord.name.replace(/ \(Conflict from .*\)$/, " (Resolved Copy)");
        }
        if (newRecord.title && typeof newRecord.title === "string") {
          newRecord.title = newRecord.title.replace(/ \(Conflict from .*\)$/, " (Resolved Copy)");
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
