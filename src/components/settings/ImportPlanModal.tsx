import React, { useState } from "react";
import type { ImportPlanModel } from "../../services/backupImportService";
import { FolderPlus, Merge, Trash2, ShieldAlert } from "lucide-react";

export interface ImportPlanModalProps {
  open: boolean;
  plan: ImportPlanModel | null;
  hasExported: boolean;
  onConfirm: (mode: "merge" | "replace" | "newProfile", newProfileName?: string) => void;
  onCancel: () => void;
  onExportRequest: () => void;
}

export function ImportPlanModal({
  open,
  plan,
  hasExported,
  onConfirm,
  onCancel,
  onExportRequest,
}: ImportPlanModalProps) {
  const [selectedMode, setSelectedMode] = useState<"merge" | "replace" | "newProfile">("merge");
  const [newProfileName, setNewProfileName] = useState("");

  if (!open || !plan) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface-elevated border border-border/50 rounded-xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-border/50">
          <h2 className="text-[17px] font-semibold text-text-primary">Review Import Plan</h2>
          <p className="text-[13px] text-text-secondary mt-1">
            This backup contains {plan.totalRecords.toLocaleString()} records across {plan.stores.length} data stores.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">Data Changes Preview</h3>
            <div className="space-y-2">
              {plan.stores.map((store) => (
                <div key={store.storeName} className="flex flex-col bg-surface border border-border/50 rounded-lg p-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-[13px] font-medium text-text-primary">{store.storeName}</span>
                    <span className="text-[12px] font-semibold text-text-secondary">{store.records} records</span>
                  </div>
                  <div className="flex gap-4 text-[12px] text-text-secondary mt-1">
                    {store.newRecords > 0 && <span className="text-success">{store.newRecords} new</span>}
                    {store.modifiedRecords > 0 && <span className="text-warning">{store.modifiedRecords} modified</span>}
                    {store.conflicts > 0 && <span className="text-danger">{store.conflicts} conflicts</span>}
                    {store.identical > 0 && <span className="text-text-muted">{store.identical} identical</span>}
                    {store.newRecords === 0 && store.modifiedRecords === 0 && store.conflicts === 0 && store.identical === 0 && <span>No changes</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">Choose Import Mode</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setSelectedMode("merge")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2 ${
                  selectedMode === "merge"
                    ? "bg-accent/10 border-accent text-accent"
                    : "bg-surface border-border/50 text-text-secondary hover:border-accent/50"
                }`}
              >
                <Merge size={20} />
                <span className="text-[13px] font-medium">Merge Data</span>
                <span className="text-[11px] leading-tight opacity-80">Keep existing data and add new records. Conflicts will be saved alongside local versions.</span>
              </button>

              <button
                onClick={() => setSelectedMode("replace")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2 ${
                  selectedMode === "replace"
                    ? "bg-danger/10 border-danger text-danger"
                    : "bg-surface border-border/50 text-text-secondary hover:border-danger/50"
                }`}
              >
                <Trash2 size={20} />
                <span className="text-[13px] font-medium">Replace All</span>
                <span className="text-[11px] leading-tight opacity-80">Wipe all current local data and replace it entirely with this backup.</span>
              </button>

              <button
                onClick={() => setSelectedMode("newProfile")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center gap-2 ${
                  selectedMode === "newProfile"
                    ? "bg-success/10 border-success text-success"
                    : "bg-surface border-border/50 text-text-secondary hover:border-success/50"
                }`}
              >
                <FolderPlus size={20} />
                <span className="text-[13px] font-medium">New Profile</span>
                <span className="text-[11px] leading-tight opacity-80">Create a fresh profile workspace and import this backup into it.</span>
              </button>
            </div>
          </div>

          {selectedMode === "replace" && !hasExported && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-3">
              <ShieldAlert className="text-danger shrink-0 mt-0.5" size={16} />
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-danger font-medium">Safety Backup Required</span>
                <span className="text-[12px] text-danger/80">You must export your current local data before replacing it.</span>
                <button
                  onClick={onExportRequest}
                  className="px-3 py-1.5 self-start bg-danger/10 hover:bg-danger/20 text-danger rounded text-[12px] font-medium border border-danger/20 transition-colors"
                >
                  Export Current Data Now
                </button>
              </div>
            </div>
          )}

          {selectedMode === "newProfile" && (
            <div className="p-4 bg-surface border border-border/50 rounded-lg space-y-2">
              <label className="text-[13px] font-medium text-text-primary">Profile Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g. Work Backup"
                className="w-full px-3 py-2 bg-background border border-border/50 rounded text-[13px] text-text-primary outline-none focus:border-success"
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/50 flex justify-end gap-3 bg-surface-elevated/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors border border-border/50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedMode, newProfileName)}
            disabled={
              (selectedMode === "replace" && !hasExported) ||
              (selectedMode === "newProfile" && !newProfileName.trim())
            }
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              selectedMode === "replace"
                ? "bg-danger text-white hover:bg-danger/90 disabled:opacity-50"
                : selectedMode === "newProfile"
                ? "bg-success text-white hover:bg-success/90 disabled:opacity-50"
                : "bg-accent text-accent-foreground hover:bg-accent-light disabled:opacity-50"
            }`}
          >
            Confirm Import
          </button>
        </div>
      </div>
    </div>
  );
}
