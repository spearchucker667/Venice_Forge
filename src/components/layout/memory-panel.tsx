import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { toast } from "../../stores/toast-store";
import { desktopConversations } from "../../services/desktopBridge";
import { askDecision } from "../ui/modal-requests";
import { redactErrorMessage } from "../../shared/redaction";
import type {
  ConversationRecordV1,
  MemoryFact,
  SearchResult,
} from "../../types/conversationVault";
import { Trans, useTranslation } from "react-i18next";

export function MemoryPanel() {
  const { t: tRuntime } = useTranslation("common");
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
  const [allFacts, setAllFacts] = useState<
    { fact: MemoryFact; record: ConversationRecordV1 }[]
  >([]);
  const [lastIndexed, setLastIndexed] = useState<string>("");
  const [vaultQuery, setVaultQuery] = useState("");
  const [vaultResults, setVaultResults] = useState<SearchResult[]>([]);
  const [vaultSearching, setVaultSearching] = useState(false);

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
        toast.success(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.indexRebuiltSuccessfullyIndexedValue1Conversations",
            { value1: res.itemsIndexed },
          ),
        );
        setLastIndexed(new Date().toLocaleTimeString());
      } else {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.rebuildFailedValue1",
            { value1: res.error },
          ),
        );
      }
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.layout.memoryPanel.notification.indexRebuildFailed",
        ),
        redactErrorMessage(err),
      );
    } finally {
      setIndexing(false);
    }
  }

  async function handleVaultSearch(query: string) {
    setVaultQuery(query);
    const trimmed = query.trim();
    if (!trimmed) {
      setVaultResults([]);
      return;
    }
    setVaultSearching(true);
    try {
      const res = await desktopConversations.search(trimmed, { limit: 25 });
      if (res.ok) {
        setVaultResults(Array.isArray(res.results) ? res.results : []);
      } else {
        setVaultResults([]);
        toast.error(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.searchFailedValue1",
            "Search failed: {{value1}}",
            { value1: res.error ?? "" },
          ),
        );
      }
    } catch (err) {
      setVaultResults([]);
      toast.error(
        tRuntime(
          "runtimeGenerated.components.layout.memoryPanel.notification.searchFailed",
          "Conversation search failed",
        ),
        redactErrorMessage(err),
      );
    } finally {
      setVaultSearching(false);
    }
  }

  async function handleOpenFolder() {
    try {
      await desktopConversations.openConversationsFolder();
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.layout.memoryPanel.notification.failedToOpenVaultFolder",
        ),
      );
    }
  }

  async function handleMigrate() {
    setMigrating(true);
    try {
      const res = await desktopConversations.migrateLegacyHistory();
      if (res.ok) {
        toast.success(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.migrationCompletedMigratedValue1FailedValue2SkippedValue3",
            { value1: res.migrated, value2: res.failed, value3: res.skipped },
          ),
        );
      } else {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.migrationFailedValue1",
            { value1: res.error },
          ),
        );
      }
      await checkLegacy();
      if (res.migrated > 0) await loadAllFacts();
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.layout.memoryPanel.notification.migrationFailed",
        ),
        redactErrorMessage(err),
      );
    } finally {
      setMigrating(false);
    }
  }

  async function handleForgetFact(
    factId: string,
    record: ConversationRecordV1,
  ) {
    const shouldForget = await askDecision({
      title: tRuntime(
        "runtimeGenerated.components.layout.memoryPanel.metadata.forgetThisFact",
      ),
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
        toast.success(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.factForgottenSuccessfully",
          ),
        );
        await loadAllFacts();
      } else {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.notification.failedToForgetFact",
          ),
        );
      }
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.layout.memoryPanel.notification.failedToForgetFact",
        ),
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Vault Migration Alert */}
      {hasLegacy && (
        <div className="rounded-xl border border-warning bg-warning/10 p-5 shadow-lg space-y-3">
          <h4 className="text-[14.5px] font-medium text-text-primary">
            <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.heading.legacyConversationsDetected" />
          </h4>
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.weFoundUnencryptedConversationRecordsFromA" />
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
            >
              {migrating
                ? tRuntime(
                    "runtimeGenerated.components.layout.memoryPanel.text.migrating",
                  )
                : tRuntime(
                    "runtimeGenerated.components.layout.memoryPanel.text.migrateNow",
                  )}
            </button>
            <button
              onClick={handleOpenFolder}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.action.openFolder" />
            </button>
          </div>
        </div>
      )}

      {/* Settings Options */}
      <div className="rounded-xl soft-panel p-5 space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">
          <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.heading.encryptedConversationVault" />
        </h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.configureMemoryParametersAndLocalIndexingStructures" />
        </p>

        <div className="space-y-3 pt-2">
          {/* Enable Recording */}
          <div className="flex items-center justify-between">
            <div>
              <label htmlFor="memory-panel-1" className="text-[13.5px] font-medium text-text-primary">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.label.enableConversationRecording" />
              </label>
              <p className="text-[12px] text-text-muted mt-0.5">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.allowsTheVaultToAnalyzeAndExtract" />
              </p>
            </div>
            <input
              type="checkbox" id="memory-panel-1" 
              checked={enableRecording}
              onChange={(e) => setEnableRecording(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>

          {/* Enable Retrieval */}
          <div className="flex items-center justify-between border-b border-vf-panel-border pt-3">
            <div>
              <label htmlFor="memory-panel-2" className="text-[13.5px] font-medium text-text-primary">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.label.enableMemoryRetrieval" />
              </label>
              <p className="text-[12px] text-text-muted mt-0.5">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.pullsRelevantHistoryFactsDynamicallyToHelp" />
              </p>
            </div>
            <input
              type="checkbox" id="memory-panel-2" 
              checked={enableMemoryRetrieval}
              onChange={(e) => setEnableMemoryRetrieval(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>

          {/* Show Context Preview */}
          <div className="flex items-center justify-between border-b border-vf-panel-border pt-3">
            <div>
              <label htmlFor="memory-panel-3" className="text-[13.5px] font-medium text-text-primary">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.label.showPulledContextBeforeSending" />
              </label>
              <p className="text-[12px] text-text-muted mt-0.5">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.displaysAPreviewBoxAboveTheChat" />
              </p>
            </div>
            <input
              type="checkbox" id="memory-panel-3" 
              checked={showPulledContextBeforeSending}
              onChange={(e) =>
                setShowPulledContextBeforeSending(e.target.checked)
              }
              className="w-4 h-4 rounded accent-accent"
            />
          </div>

          {/* AI summaries toggle */}
          <div className="flex items-center justify-between border-b border-vf-panel-border pt-3">
            <div>
              <label htmlFor="memory-panel-4" className="text-[13.5px] font-medium text-text-primary">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.label.useAiSummaries" />
              </label>
              <p className="text-[12px] text-text-muted mt-0.5">
                <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.transmitsSummaryMaterialToVeniceModelFor" />
              </p>
            </div>
            <input
              type="checkbox" id="memory-panel-4" 
              checked={useAISummaries}
              onChange={(e) => setUseAISummaries(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
          </div>
        </div>
      </div>

      {/* Index & Folder Management Actions */}
      <div className="rounded-xl soft-panel p-5 space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">
          <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.heading.maintenanceOperations" />
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRebuildIndex}
            disabled={indexing}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
          >
            {indexing
              ? tRuntime(
                  "runtimeGenerated.components.layout.memoryPanel.text.indexing",
                )
              : tRuntime(
                  "runtimeGenerated.components.layout.memoryPanel.text.rebuildIndex",
                )}
          </button>
          <button
            onClick={handleOpenFolder}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
          >
            <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.action.openVaultFolder" />
          </button>
        </div>
        {lastIndexed && (
          <p className="text-[12px] text-text-muted">
            <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.lastIndexedAt" />{" "}
            {lastIndexed}
          </p>
        )}
      </div>

      <div className="rounded-xl soft-panel p-5 space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">
          <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.heading.searchVault" />
        </h3>
        <input
          type="search"
          value={vaultQuery}
          onChange={(e) => void handleVaultSearch(e.target.value)}
          placeholder={tRuntime(
            "runtimeGenerated.components.layout.memoryPanel.attribute.searchConversations",
            "Search conversations",
          )}
          className="w-full px-3 py-2 bg-vf-panel-bg border border-vf-panel-border rounded-lg text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
        {vaultSearching && (
          <p className="text-[12px] text-text-muted">
            {tRuntime(
              "runtimeGenerated.components.layout.memoryPanel.text.searching",
              "Searching…",
            )}
          </p>
        )}
        {vaultResults.length > 0 && (
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {vaultResults.map((result) => (
              <div
                key={result.id}
                className="p-3 rounded-lg border border-vf-panel-border bg-vf-panel-bg"
              >
                <div className="text-[13px] font-medium text-text-primary">
                  {result.title}
                </div>
                <div className="text-[12px] text-text-muted mt-1 line-clamp-2">
                  {result.summary}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remembered Facts List */}
      <div className="rounded-xl soft-panel p-5 space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">
          <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.heading.curatedFacts" />
          {allFacts.length})
        </h3>
        <p className="text-[12.5px] text-text-secondary">
          <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.description.theseAreTheKeyFactsExtractedLocally" />
        </p>

        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
          {allFacts.length === 0 ? (
            <div className="text-center text-[12.5px] text-text-muted py-6">
              <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.text.noFactsStoredYet" />
            </div>
          ) : (
            allFacts.map(({ fact, record }) => (
              <div
                key={fact.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-vf-panel-border bg-vf-panel-bg hover:border-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-primary leading-normal break-words">
                    {fact.text}
                  </div>
                  <div className="text-[12px] text-text-muted mt-1">
                    <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.text.source" />{" "}
                    <span className="font-medium">{record.title}</span>{" "}
                    <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.text.confidence" />{" "}
                    {Math.round(fact.confidence * 100)}%
                  </div>
                </div>
                <button
                  onClick={() => handleForgetFact(fact.id, record)}
                  className="shrink-0 px-2 py-1 text-[12px] font-medium text-danger bg-danger/10 hover:bg-danger/20 border border-transparent rounded transition-colors cursor-pointer"
                >
                  <Trans i18nKey="common:surface.componentsLayoutMemoryPanel.action.forget" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
