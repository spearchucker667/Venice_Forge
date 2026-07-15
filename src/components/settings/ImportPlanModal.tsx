import React, { useState } from "react";
import type { ImportPlanModel } from "../../services/backupImportService";
import { FolderPlus, Merge, Trash2, ShieldAlert, ShieldCheck } from "lucide-react";

export interface ImportPlanModalProps {
  open: boolean;
  plan: ImportPlanModel | null;
  replaceAvailable: boolean;
  onConfirm: (mode: "merge" | "replace" | "newProfile", newProfileName?: string) => void;
  onCancel: () => void;
}

export function ImportPlanModal({
  open,
  plan,
  replaceAvailable,
  onConfirm,
  onCancel,
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
          {plan.manifest && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {plan.manifest.metadataVerified
                  ? <ShieldCheck className="text-success" size={16} />
                  : <ShieldAlert className="text-warning" size={16} />}
                <h3 className="text-sm font-medium text-text-primary">
                  {plan.manifest.metadataVerified ? "Authenticated Backup Metadata" : "Legacy Backup Metadata"}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-text-secondary bg-surface border border-border/50 rounded-lg p-3">
                <span>Format: v{plan.manifest.version}{plan.manifest.appVersion ? ` / app ${plan.manifest.appVersion}` : ""}</span>
                <span>Exported: {new Date(plan.manifest.exportedAt).toLocaleString()}</span>
                {plan.manifest.sourceRuntime && <span>Source: {plan.manifest.sourceRuntime} / {plan.manifest.sourceDeviceRef}</span>}
                {plan.manifest.sourceProfileRef && <span>Profile ref: {plan.manifest.sourceProfileRef}</span>}
                {plan.manifest.algorithm && <span>Crypto: {plan.manifest.algorithm} / {plan.manifest.kdf} / key v{plan.manifest.keyVersion}</span>}
                <span>{plan.manifest.tombstoneCount} tombstones / {plan.manifest.embeddedBlobCount} embedded blobs</span>
                {plan.manifest.payloadSha256 && <span className="sm:col-span-2 break-all">Payload SHA-256: {plan.manifest.payloadSha256}</span>}
              </div>
              {plan.warnings?.length > 0 && (
                <div className="space-y-2" aria-label="Import warnings">
                  {plan.warnings.map((warning) => (
                    <div
                      key={warning.code}
                      className={`rounded-lg border p-2 text-[12px] ${warning.severity === "warning"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-border/50 bg-surface text-text-secondary"}`}
                    >
                      {warning.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {selectedMode === "replace" && (
            replaceAvailable ? (
              <div className="p-3 bg-success/10 border border-success/20 rounded-lg flex items-start gap-3">
                <ShieldCheck className="text-success shrink-0 mt-0.5" size={16} />
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-success font-medium">Automatic Recovery Enabled</span>
                  <span className="text-[12px] text-text-secondary">The desktop app will stage this backup, create and verify an encrypted recovery artifact, then roll back automatically if replacement fails.</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-start gap-3">
                <ShieldAlert className="text-danger shrink-0 mt-0.5" size={16} />
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-danger font-medium">Replace Unavailable in Web Mode</span>
                  <span className="text-[12px] text-danger/80">Use Merge or New Profile. Durable replace recovery requires the Venice Forge desktop app.</span>
                </div>
              </div>
            )
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
              (selectedMode === "replace" && !replaceAvailable) ||
              (selectedMode === "newProfile" && !newProfileName.trim())
            }
            // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              selectedMode === "replace"
                ? "bg-danger text-white hover:bg-danger/90 disabled:opacity-50" // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
                : selectedMode === "newProfile"
                ? "bg-success text-white hover:bg-success/90 disabled:opacity-50" // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
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
