import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { toast } from "../../stores/toast-store";
import { desktopConversations } from "../../services/desktopBridge";
import { askDecision } from "../ui/modal-requests";
import type { ConversationRecordV1, MemoryFact } from "../../types/conversationVault";

export function MemoryPanel() {
  const {
    enableRecording,
    setEnableRecording,
    enableMemoryRetrieval,
    setEnableMemoryRetrieval,
    showPulledContextBeforeSending,
    setShowPulledContextBeforeSending,
    useAISummaries,
    setUseAISummaries,
  } = useSettingsStore();

  const [indexing, setIndexing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(false);
  const [allFacts, setAllFacts] = useState<{ fact: MemoryFact; record: ConversationRecordV1 }[]>([]);
  const [lastIndexed, setLastIndexed] = useState<string>("");

  useEffect(() => {
    checkLegacy();
    loadAllFacts();
  }, []);

  async function checkLegacy() {
    try {
      const detect = await desktopConversations.detectLegacyHistory();
      setHasLegacy(detect);
    } catch {
      // ignore — desktopConversations no-ops in web mode
    }
  }

  async function loadAllFacts() {
    
    try {
      const res = await desktopConversations.list();
      if (res.ok) {
        const facts: { fact: MemoryFact; record: ConversationRecordV1 }[] = [];
        res.records.forEach((r) => {
          if (r.memory && r.memory.userFacts) {
            r.memory.userFacts.forEach((f) => {
              if (!f.forgotten) {
                facts.push({ fact: f, record: r });
              }
            });
          }
        });
        setAllFacts(facts);
      }
    } catch (err) {
      console.error("Failed to load facts", err);
    }
  }

  async function handleRebuildIndex() {
    
    setIndexing(true);
    try {
      const res = await desktopConversations.rebuildIndex();
      if (res.ok) {
        toast.success(`Index rebuilt successfully! Indexed ${res.itemsIndexed} conversations.`);
        setLastIndexed(new Date().toLocaleTimeString());
      } else {
        toast.error(`Rebuild failed: ${res.error}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Index rebuild failed");
    } finally {
      setIndexing(false);
    }
  }

  async function handleOpenFolder() {
    
    try {
      await desktopConversations.openConversationsFolder();
    } catch {
      toast.error("Failed to open vault folder.");
    }
  }

  async function handleMigrate() {
    
    setMigrating(true);
    try {
      const res = await desktopConversations.migrateLegacyHistory();
      if (res.ok) {
        toast.success(
          `Migration completed! Migrated: ${res.migrated}, Failed: ${res.failed}, Skipped: ${res.skipped}`
        );
        setHasLegacy(false);
        await loadAllFacts();
      } else {
        toast.error(`Migration failed: ${res.error}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  }

  async function handleForgetFact(factId: string, record: ConversationRecordV1) {
    
    const shouldForget = await askDecision({
      title: "Forget this fact?",
      detail: "This hides the fact from future memory retrieval.",
      actionLabel: "Forget",
      danger: true,
    });
    if (!shouldForget) return;

    try {
      const updatedFacts = record.memory.userFacts.map((f) => {
        if (f.id === factId) {
          return { ...f, forgotten: true, updatedAt: Date.now() };
        }
        return f;
      });

      const updatedRecord: ConversationRecordV1 = {
        ...record,
        updatedAt: Date.now(),
        memory: {
          ...record.memory,
          userFacts: updatedFacts,
        },
      };

      const res = await desktopConversations.save(updatedRecord);
      if (res.ok) {
        toast.success("Fact forgotten successfully.");
        await loadAllFacts();
      } else {
        toast.error("Failed to forget fact.");
      }
    } catch {
      toast.error("Failed to forget fact.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Vault Migration Alert */}
      {hasLegacy && (
        <div className="rounded-xl border border-warning bg-warning/10 p-5 shadow-lg space-y-3">
          <h4 className="text-[14.5px] font-medium text-text-primary">Legacy Conversations Detected</h4>
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            We found unencrypted conversation records from a previous installation. Migrate them to the new secure vault now.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
            >
              {migrating ? "Migrating..." : "Migrate Now"}
            </button>
            <button
              onClick={handleOpenFolder}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              Open Folder
            </button>
          </div>
        </div>
      )}

      {/* Settings Options */}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Encrypted Conversation Vault</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Configure memory parameters and local indexing structures. Vault records and the index are fully encrypted at rest.
        </p>

        <div className="space-y-3 pt-2">
          {/* Enable Recording */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-[13.5px] font-medium text-text-primary">Enable conversation recording</label>
              <p className="text-[11.5px] text-text-muted mt-0.5">Allows the vault to analyze and extract facts from new threads.</p>
            </div>
            <input
              type="checkbox"
              checked={enableRecording}
              onChange={(e) => setEnableRecording(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>

          {/* Enable Retrieval */}
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <div>
              <label className="text-[13.5px] font-medium text-text-primary">Enable memory retrieval</label>
              <p className="text-[11.5px] text-text-muted mt-0.5">Pulls relevant history facts dynamically to help future prompts.</p>
            </div>
            <input
              type="checkbox"
              checked={enableMemoryRetrieval}
              onChange={(e) => setEnableMemoryRetrieval(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>

          {/* Show Context Preview */}
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <div>
              <label className="text-[13.5px] font-medium text-text-primary">Show pulled context before sending</label>
              <p className="text-[11.5px] text-text-muted mt-0.5">Displays a preview box above the chat input allowing fact pruning.</p>
            </div>
            <input
              type="checkbox"
              checked={showPulledContextBeforeSending}
              onChange={(e) => setShowPulledContextBeforeSending(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>

          {/* AI summaries toggle */}
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <div>
              <label className="text-[13.5px] font-medium text-text-primary">Use AI summaries</label>
              <p className="text-[11.5px] text-text-muted mt-0.5">Transmits summary material to Venice model for better fact discovery.</p>
            </div>
            <input
              type="checkbox"
              checked={useAISummaries}
              onChange={(e) => setUseAISummaries(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>
        </div>
      </div>

      {/* Index & Folder Management Actions */}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Maintenance Operations</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRebuildIndex}
            disabled={indexing}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
          >
            {indexing ? "Indexing..." : "Rebuild Index"}
          </button>
          <button
            onClick={handleOpenFolder}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            Open Vault Folder
          </button>
        </div>
        {lastIndexed && (
          <p className="text-[11.5px] text-text-muted">Last indexed at: {lastIndexed}</p>
        )}
      </div>

      {/* Remembered Facts List */}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Curated Facts ({allFacts.length})</h3>
        <p className="text-[12.5px] text-text-secondary">
          These are the key facts extracted locally from your conversation history.
        </p>

        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
          {allFacts.length === 0 ? (
            <div className="text-center text-[12.5px] text-text-muted py-6">No facts stored yet.</div>
          ) : (
            allFacts.map(({ fact, record }) => (
              <div
                key={fact.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-surface/50 hover:border-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-primary leading-normal break-words">{fact.text}</div>
                  <div className="text-[10.5px] text-text-muted mt-1">
                    Source: <span className="font-medium">{record.title}</span> • Confidence: {Math.round(fact.confidence * 100)}%
                  </div>
                </div>
                <button
                  onClick={() => handleForgetFact(fact.id, record)}
                  className="shrink-0 px-2 py-1 text-[11px] font-medium text-danger bg-danger/10 hover:bg-danger/20 border border-transparent rounded transition-colors cursor-pointer"
                >
                  Forget
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
