import React from "react";
import { ImportPlanModal } from "./ImportPlanModal";
import { toast } from "../../stores/toast-store";
import { desktopFiles, isElectron } from "../../services/desktopBridge";
import { previewBackup, parseAndImportBackup, ImportPlanModel, type ImportSummary } from "../../services/backupImportService";
import type { EncryptedBackupManifest } from "../../services/backupCryptoWeb";
import {
  getLatestReplaceImportRecovery,
  ReplaceImportError,
  replaceBackupWithRecovery,
  restoreReplaceImportRecovery,
  type ReplaceImportRecoveryMetadata,
} from "../../services/replaceImportService";
import { listConversations } from "../../services/chatStorage";
import { useChatStore } from "../../stores/chat-store";
import { useProfileStore } from "../../stores/profile-store";

export interface DataStoragePanelProps {
  exportData: (password: string) => Promise<void> | void;
  clearLocalSettings: () => Promise<void> | void;
  clearAllHistory: () => Promise<void> | void;
}

export function DataStoragePanel({
  exportData,
  clearLocalSettings,
  clearAllHistory,
}: DataStoragePanelProps): React.ReactElement {
  const [password, setPassword] = React.useState("");
  const [importPlanOpen, setImportPlanOpen] = React.useState(false);
  const [importPlan, setImportPlan] = React.useState<ImportPlanModel | null>(null);
  const [manifestToImport, setManifestToImport] = React.useState<EncryptedBackupManifest | null>(null);
  const [recovery, setRecovery] = React.useState<ReplaceImportRecoveryMetadata | null>(null);
  const [restoringRecovery, setRestoringRecovery] = React.useState(false);

  const refreshRecovery = React.useCallback(async () => {
    if (!isElectron()) return;
    try {
      setRecovery(await getLatestReplaceImportRecovery());
    } catch {
      // A corrupt/unavailable recovery is not offered as a valid restore target.
      setRecovery(null);
    }
  }, []);

  React.useEffect(() => {
    void refreshRecovery();
  }, [refreshRecovery]);

  const handleExport = async () => {
    try {
      await exportData(password);
    } catch {
      // toast already handled by exportData
    }
  };

  const handleImportStart = async () => {
    try {
      const json = await desktopFiles.importJsonString();
      if (!json) return;
      const manifest = JSON.parse(json) as EncryptedBackupManifest;
      const preview = await previewBackup(manifest, password);
      setManifestToImport(manifest);
      setImportPlan(preview);
      setImportPlanOpen(true);
    } catch {
      toast.error("Failed to read backup. Incorrect password or corrupt file.");
    }
  };

  const handleImportConfirm = async (mode: "merge" | "replace" | "newProfile", newProfileName?: string) => {
    setImportPlanOpen(false);
    if (!manifestToImport) return;

    try {
      if (mode === "newProfile" && newProfileName) {
        const newProfile = useProfileStore.getState().addProfile(newProfileName);
        
        // Update profile store state manually so we don't trigger the built-in reload of requestSwitchProfile
        useProfileStore.setState({ activeProfileId: newProfile.id });
        
        // Temporarily switch active profile id at the storage layer without reloading yet
        const { setActiveProfileId } = await import("../../services/activeProfile");
        setActiveProfileId(newProfile.id);
        if (isElectron()) {
          const { desktopProfilePassword } = await import("../../services/desktopBridge");
          await desktopProfilePassword.activate(newProfile.id);
        }
        
        // Now perform the import! StorageService and backupImportService will read the new active profile id
        const summary = await parseAndImportBackup(manifestToImport, password);
        
        toast.success(`Import complete into new profile: ${summary.recordsImported} imported. Reloading...`);
        
        // Give the toast a moment to render before reloading
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      let summary: ImportSummary;
      if (mode === "replace") {
        const replaceResult = await replaceBackupWithRecovery(manifestToImport, password);
        setRecovery(replaceResult.recovery);
        summary = replaceResult;
      } else {
        summary = await parseAndImportBackup(manifestToImport, password);
      }
      toast.success(`Import complete: ${summary.recordsImported} imported, ${summary.recordsSkipped} skipped, ${summary.tombstonesApplied} tombstones applied.`);
      window.dispatchEvent(new Event("venice:backup-imported"));
      const convs = await listConversations();
      useChatStore.getState().setConversations(convs);
    } catch (error: unknown) {
      if (error instanceof ReplaceImportError) {
        toast.error(
          error.rolledBack ? "Replace failed; data restored" : "Replace failed; recovery required",
          error.message,
        );
        await refreshRecovery();
      } else {
        toast.error("Import failed.");
      }
    } finally {
      setManifestToImport(null);
      setImportPlan(null);
    }
  };

  const handleRestoreRecovery = async () => {
    if (!recovery || !password || restoringRecovery) return;
    setRestoringRecovery(true);
    try {
      const result = await restoreReplaceImportRecovery(recovery.id, password);
      setRecovery(result.recovery);
      window.dispatchEvent(new Event("venice:backup-imported"));
      useChatStore.getState().setConversations(await listConversations());
      toast.success("Recovery restored", "The prior profile state was restored and the replaced state was retained as a new recovery backup.");
    } catch (error: unknown) {
      toast.error("Recovery restore failed", error instanceof Error ? error.message : "The recovery backup could not be restored.");
      await refreshRecovery();
    } finally {
      setRestoringRecovery(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/50 bg-surface p-5 shadow-sm space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Manual Backup</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Create an encrypted, portable backup of your local history, character cards, and workflows. You can import this backup on any device.
        </p>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Backup Password"
            className="w-64 px-3 py-1.5 rounded-lg border border-border bg-surface text-[13px] text-text-primary focus:outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={handleExport}
              disabled={!password}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-foreground hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export Backup
            </button>
            <button
              onClick={handleImportStart}
              disabled={!password}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import Backup
            </button>
          </div>
        </div>
      </div>

      {recovery && (
        <div className="rounded-xl border border-warning/20 bg-warning/[0.04] p-5 shadow-sm space-y-3">
          <h3 className="text-[14.5px] font-medium text-text-primary">Pre-Replace Recovery</h3>
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            A verified encrypted recovery backup from {new Date(recovery.createdAt).toLocaleString()} is available. Enter its backup password above to restore it transactionally.
          </p>
          <button
            onClick={handleRestoreRecovery}
            disabled={!password || restoringRecovery}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-warning/15 border border-warning/25 text-warning hover:bg-warning/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {restoringRecovery ? "Restoring…" : "Restore Recovery Backup"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-danger/10 bg-danger/[0.02] p-5 shadow-lg space-y-4">
        <h3 className="text-[14.5px] font-medium text-danger">Danger Zone</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          These operations are destructive and cannot be undone. Always export a backup first if you have important history.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={clearLocalSettings}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-danger/10 hover:text-danger hover:border-danger/25 transition-colors cursor-pointer"
          >
            Clear App Defaults
          </button>
          <button
            onClick={clearAllHistory}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-colors cursor-pointer"
          >
            Clear IndexedDB Data
          </button>
        </div>
      </div>

      <ImportPlanModal
        open={importPlanOpen}
        plan={importPlan}
        replaceAvailable={isElectron()}
        onConfirm={handleImportConfirm}
        onCancel={() => {
          setImportPlanOpen(false);
          setManifestToImport(null);
          setImportPlan(null);
        }}
      />
    </div>
  );
}
