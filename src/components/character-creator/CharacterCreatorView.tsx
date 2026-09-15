/**
 * @fileoverview Main top-level Character Creator view orchestrator.
 * Handles transient launch intents, event-driven AI generation, debounced autosave,
 * local character picking, card import, and atomic approval into the character library.
 */

import { useState, useEffect, useRef } from "react";
import type {
  CharacterCreatorDraft,
  CharacterCreatorDraftSummary,
  CharacterCreatorEditableField,
  CharacterCreatorProcessEvent,
  CharacterCreatorViewState,
  OptionalDraftContext,
} from "../../types/character-creator";
import type { CharacterCardV2Dto } from "../../types/character-card-spec";
import type { CharacterCardV1 } from "../../types/rp";
import { CharacterDraftService } from "../../services/characterCreatorDraftService";
import {
  generateCharacterCreatorDraft,
  regenerateCharacterFieldAI,
  reviseCharacterDraftAI,
} from "../../services/characterCreatorAiService";
import {
  CharacterCreatorImportService,
  validateCardForApproval,
} from "../../services/characterCreatorImportService";
import {
  analyzeCharacterImage,
  getVisionCapableCharacterModels,
} from "../../services/characterCards/characterCardGenerationService";
import { useModels } from "../../hooks/use-models";
import { startNormalChatForCharacter } from "../../services/rpHelpers";
import { useMediaStore } from "../../stores/media-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useCharacterCreatorLaunchStore } from "../../stores/character-creator-launch-store";
import {
  isElectron,
  desktopCharacterCreator,
  desktopCharacterCards,
} from "../../services/desktopBridge";
import { toast } from "../../stores/toast-store";
import { redactErrorMessage } from "../../shared/redaction";
import { AlertTriangle } from "lucide-react";
import {
  SafetyGuardBlockedError,
  formatSafetyDecision,
  guardCategoryToSafetyCategory,
  isSafetyBlockResult,
  safetyLayerFromGuardCategory,
} from "../../shared/safety";

import { CharacterCreatorWelcome } from "./CharacterCreatorWelcome";
import { CharacterCreatorGenerating } from "./CharacterCreatorGenerating";
import { CharacterCreatorDraftEditor } from "./CharacterCreatorDraftEditor";
import { CharacterCreatorReady } from "./CharacterCreatorReady";
import { CharacterCreatorCompleted } from "./CharacterCreatorCompleted";
import { CharacterCreatorError } from "./CharacterCreatorError";
import { CharacterCreatorLocalPickerModal } from "./CharacterCreatorLocalPickerModal";
import { Trans, useTranslation } from "react-i18next";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function formatSafetyError(
  t: TranslateFn,
  err: SafetyGuardBlockedError,
): string {
  return formatSafetyDecision(t, {
    layer: safetyLayerFromGuardCategory(err.decision.category),
    category: guardCategoryToSafetyCategory(err.decision.category),
    reasonCode: err.decision.reasonCode,
    userMessage: err.decision.userMessage,
  });
}

function normalizeCreatorError(t: TranslateFn, err: unknown): string {
  if (isSafetyBlockResult(err)) {
    return formatSafetyDecision(t, err);
  }
  if (err instanceof SafetyGuardBlockedError) {
    return formatSafetyError(t, err);
  }
  return err instanceof Error ? err.message : String(err);
}

export function CharacterCreatorView() {
  const { t: tRuntime } = useTranslation("common");
  const activeTab = useSettingsStore((s) => s.activeTab);
  const { data: liveTextModels } = useModels("text");
  const [viewState, setViewState] =
    useState<CharacterCreatorViewState>("welcome");
  const [activeDraft, setActiveDraft] = useState<CharacterCreatorDraft | null>(
    null,
  );
  const [recentDrafts, setRecentDrafts] = useState<
    CharacterCreatorDraftSummary[]
  >([]);
  const [createdCharacter, setCreatedCharacter] =
    useState<CharacterCardV1 | null>(null);
  const [activeIdea, setActiveIdea] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [processEvents, setProcessEvents] = useState<
    CharacterCreatorProcessEvent[]
  >([]);
  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
  }>({
    valid: true,
    errors: [],
    warnings: [],
    recommendations: [],
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingDraftRef = useRef<CharacterCreatorDraft | null>(null);

  const loadRecentDrafts = async () => {
    try {
      const list = await CharacterDraftService.list();
      setRecentDrafts(list.slice(0, 10));
    } catch {
      // Non-critical
    }
  };

  const [autosaveError, setAutosaveError] = useState<string | null>(null);

  const flushPendingSave = async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }
    if (pendingDraftRef.current) {
      const draftToSave = pendingDraftRef.current;
      try {
        await CharacterDraftService.update(draftToSave.id, {
          card: draftToSave.card,
        });
        pendingDraftRef.current = null;
        setAutosaveError(null);
        return { ok: true };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to save draft changes.";
        setAutosaveError(msg);
        return { ok: false, error: msg };
      }
    }
    return { ok: true };
  };

  // Intentional state-sync: Acts as a mount/activation handler for the Character Creator tab,
  // consuming launch intents (e.g. "Edit this character") from the external store.
  useEffect(() => {
    void loadRecentDrafts();
    if (activeTab === "character-creator") {
      const intent = useCharacterCreatorLaunchStore.getState().consume();
      if (intent) {
        (async () => {
          try {
            switch (intent.mode) {
              case "new-from-idea":
                if (intent.sourceIdea) {
                  await handleCreateDraft(
                    intent.sourceIdea,
                    intent.optionalContext,
                  );
                } else {
                  setViewState("welcome");
                }
                break;
              case "new-from-image":
                if (intent.sourceMediaId) {
                  await handleCreateDraftFromImage(
                    intent.sourceMediaId,
                    intent.optionalContext,
                  );
                } else {
                  setViewState("welcome");
                }
                break;
              case "open-draft":
                if (intent.draftId) {
                  await handleOpenDraft(intent.draftId);
                } else {
                  setViewState("welcome");
                }
                break;
              case "edit-local-character":
                if (intent.localCharacterId) {
                  const draft =
                    await CharacterCreatorImportService.loadExistingCharacterAsDraft(
                      intent.localCharacterId,
                    );
                  setActiveDraft(draft);
                  setViewState("draft");
                  await loadRecentDrafts();
                } else {
                  setViewState("welcome");
                }
                break;
              case "import-card":
                if (intent.importHandle) {
                  const draft =
                    await CharacterCreatorImportService.loadImportHandleAsDraft(
                      intent.importHandle,
                    );
                  setActiveDraft(draft);
                  setViewState("draft");
                  await loadRecentDrafts();
                } else {
                  setViewState("welcome");
                }
                break;
              case "duplicate-hosted-character":
                if (intent.hostedCharacterId) {
                  const draft =
                    await CharacterCreatorImportService.loadHostedCharacterAsLocalDraft(
                      intent.hostedCharacterId,
                    );
                  setActiveDraft(draft);
                  setViewState("draft");
                  await loadRecentDrafts();
                } else {
                  setViewState("welcome");
                }
                break;
              default:
                setViewState("welcome");
                break;
            }
          } catch (err) {
            const msg = normalizeCreatorError(tRuntime, err);
            setErrorDetails(msg);
            setViewState("error");
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    return () => {
      void flushPendingSave();
    };
  }, []);

  const handleCreateDraft = async (
    idea: string,
    optionalContext?: OptionalDraftContext,
  ) => {
    setActiveIdea(idea);
    setViewState("generating");
    setErrorDetails(null);
    setProcessEvents([]);

    abortControllerRef.current = new AbortController();

    try {
      const res = await generateCharacterCreatorDraft(
        {
          operation: "create_draft",
          sourceIdea: idea,
          optionalContext,
        },
        {
          onEvent(ev) {
            setProcessEvents((prev) => [...prev, ev]);
          },
        },
        abortControllerRef.current.signal,
      );

      const draft = await CharacterDraftService.create({
        sourceIdea: idea,
        card: res.response.draft,
        creatorMetadata: {
          inspiration: idea.includes("mimics")
            ? "User requested archetype inspiration"
            : undefined,
          designSummary: res.response.design_summary,
          assumptions: res.response.assumptions,
          warnings: res.response.warnings,
          suggestedTags: res.response.draft.data.tags || [],
          avatarPrompt: (
            res.response.draft.data.extensions?.["venice-forge"] as Record<
              string,
              unknown
            >
          )?.avatarPrompt as string | undefined,
          processSummary: res.response.process_summary,
        },
      });

      const updatedDraft = await CharacterDraftService.update(draft.id, {
        conceptAnalysis: res.analysis,
        processTrace: res.processEvents,
      });

      setActiveDraft(updatedDraft);
      setViewState("draft");
      await loadRecentDrafts();
    } catch (err: unknown) {
      if (abortControllerRef.current?.signal.aborted) {
        setViewState("welcome");
        return;
      }
      const msg = normalizeCreatorError(tRuntime, err);
      setErrorDetails(msg);
      setViewState("error");
    }
  };

  const handleCreateDraftFromImage = async (
    mediaId: string,
    optionalContext?: OptionalDraftContext,
  ) => {
    setActiveIdea("Analyzing image...");
    setViewState("generating");
    setErrorDetails(null);
    setProcessEvents([]);

    abortControllerRef.current = new AbortController();

    try {
      setProcessEvents([
        {
          id: crypto.randomUUID(),
          phase: "concept-analysis",
          status: "active",
          source: "application",
          title: tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.metadata.analyzingImage",
          ),
          summary:
            "Extracting visual appearance, genre, and setting from the image.",
          createdAt: new Date().toISOString(),
        },
      ]);
      const visionModels = await getVisionCapableCharacterModels(
        liveTextModels ?? [],
      );
      const model = visionModels.length > 0 ? visionModels[0] : undefined;

      if (!model) {
        throw new Error(
          "No vision-capable AI model is available to analyze this image.",
        );
      }

      const analysis = await analyzeCharacterImage({
        assetId: mediaId,
        modelId: model.id,
        model,
        requestedFields: ["appearance", "setting", "genre"],
        signal: abortControllerRef.current.signal,
      });

      const idea = `A character based on this visual analysis:\nAppearance: ${analysis.visualDescription}\nGenre: ${analysis.scenarioSuggestions?.[0] ?? ""}\nSetting: ${analysis.scenarioSuggestions?.[1] ?? ""}`;
      setActiveIdea(idea);

      const res = await generateCharacterCreatorDraft(
        {
          operation: "create_draft",
          sourceIdea: idea,
          optionalContext,
        },
        {
          onEvent(ev) {
            setProcessEvents((prev) => [...prev, ev]);
          },
        },
        abortControllerRef.current.signal,
      );

      const draft = await CharacterDraftService.create({
        sourceIdea: idea,
        card: res.response.draft,
        creatorMetadata: {
          inspiration: idea.includes("mimics")
            ? "User requested archetype inspiration"
            : undefined,
          designSummary: res.response.design_summary,
          assumptions: res.response.assumptions,
          warnings: res.response.warnings,
          suggestedTags: res.response.draft.data.tags || [],
          avatarPrompt: (
            res.response.draft.data.extensions?.["venice-forge"] as Record<
              string,
              unknown
            >
          )?.avatarPrompt as string | undefined,
          processSummary: res.response.process_summary,
        },
      });

      const updatedDraft = await CharacterDraftService.update(draft.id, {
        conceptAnalysis: res.analysis,
        processTrace: res.processEvents,
      });

      const media = useMediaStore
        .getState()
        .items.find((m) => m.id === mediaId);
      if (media && media.image) {
        setAvatarDataUrl(media.image);
      }

      setActiveDraft(updatedDraft);
      setViewState("draft");
      await loadRecentDrafts();
    } catch (err: unknown) {
      if (abortControllerRef.current?.signal.aborted) {
        setViewState("welcome");
        return;
      }
      const msg = normalizeCreatorError(tRuntime, err);
      setErrorDetails(msg);
      setViewState("error");
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setViewState("welcome");
  };

  const handleOpenDraft = async (draftId: string) => {
    await flushPendingSave();
    try {
      const d = await CharacterDraftService.get(draftId);
      if (!d) throw new Error("Draft not found.");
      setActiveDraft(d);
      setViewState("draft");
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.couldNotLoadDraft",
        ),
        String(err),
      );
    }
  };

  const handleDuplicateDraft = async (draftId: string) => {
    try {
      const dup = await CharacterDraftService.duplicate(draftId);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.draftDuplicated",
        ),
        dup.card.data.name,
      );
      await loadRecentDrafts();
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.couldNotDuplicateDraft",
        ),
        String(err),
      );
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await CharacterDraftService.delete(draftId);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.draftDeleted",
        ),
      );
      await loadRecentDrafts();
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.couldNotDeleteDraft",
        ),
        String(err),
      );
    }
  };

  const handleUpdateDraftCard = (updatedCard: CharacterCardV2Dto) => {
    if (!activeDraft) return;
    const nextDraft: CharacterCreatorDraft = {
      ...activeDraft,
      card: updatedCard,
      updatedAt: new Date().toISOString(),
    };
    setActiveDraft(nextDraft);
    pendingDraftRef.current = nextDraft;

    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
    }

    pendingSaveTimerRef.current = setTimeout(async () => {
      pendingSaveTimerRef.current = null;
      await flushPendingSave();
    }, 600);
  };

  const handleSaveDraft = async () => {
    const flushRes = await flushPendingSave();
    if (!flushRes.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.autosaveFailed",
        ),
        flushRes.error ||
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cannotSaveDraftWhilePendingChangesFailedToPersist",
          ),
      );
      return;
    }
    if (!activeDraft) return;
    try {
      await CharacterDraftService.update(activeDraft.id, {
        card: activeDraft.card,
      });
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.draftSavedLocally",
        ),
      );
      await loadRecentDrafts();
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.couldNotSaveDraft",
        ),
        String(err),
      );
    }
  };

  const handleReviseDraft = async (instruction: string) => {
    const flushRes = await flushPendingSave();
    if (!flushRes.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.autosaveFailed",
        ),
        flushRes.error ||
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cannotReviseDraftWhilePendingChangesFailedToPersist",
          ),
      );
      return;
    }
    if (!activeDraft) return;
    setViewState("revising");
    setErrorDetails(null);
    abortControllerRef.current = new AbortController();

    try {
      const res = await reviseCharacterDraftAI(
        {
          operation: "revise_draft",
          instruction,
          currentDraft: activeDraft.card,
          revision: activeDraft.revision + 1,
        },
        abortControllerRef.current.signal,
      );

      const updated = await CharacterDraftService.update(activeDraft.id, {
        card: res.draft,
        revision: activeDraft.revision + 1,
        creatorMetadata: {
          designSummary: res.design_summary,
          assumptions: res.assumptions,
          warnings: res.warnings,
          suggestedTags: res.draft.data.tags || [],
          processSummary: res.process_summary,
        },
      });

      setActiveDraft(updated);
      setViewState("draft");
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.draftRevised",
        ),
      );
    } catch (err) {
      const msg = normalizeCreatorError(tRuntime, err);
      setErrorDetails(msg);
      setViewState("error");
    }
  };

  const handleRegenerateField = async (
    field: CharacterCreatorEditableField,
    instruction?: string,
  ) => {
    const flushRes = await flushPendingSave();
    if (!flushRes.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.autosaveFailed",
        ),
        flushRes.error ||
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cannotRegenerateFieldWhilePendingChangesFailedToPersist",
          ),
      );
      return;
    }
    if (!activeDraft) return;
    setViewState("revising");
    setErrorDetails(null);
    abortControllerRef.current = new AbortController();

    try {
      const res = await regenerateCharacterFieldAI(
        {
          operation: "regenerate_field",
          field,
          instruction,
          currentDraft: activeDraft.card,
          revision: activeDraft.revision + 1,
        },
        abortControllerRef.current.signal,
      );

      const updated = await CharacterDraftService.update(activeDraft.id, {
        card: res.draft,
        revision: activeDraft.revision + 1,
      });

      setActiveDraft(updated);
      setViewState("draft");
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.fieldFieldRegenerated",
          { field: field },
        ),
      );
    } catch (err) {
      const msg = normalizeCreatorError(tRuntime, err);
      setErrorDetails(msg);
      setViewState("error");
    }
  };

  const handleValidateDraft = async () => {
    const flushRes = await flushPendingSave();
    if (!flushRes.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.autosaveFailed",
        ),
        flushRes.error ||
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cannotValidateDraftWhilePendingChangesFailedToPersist",
          ),
      );
      return;
    }
    if (!activeDraft) return;
    const localVal = validateCardForApproval(activeDraft.card);
    const errors = [...localVal.errors];
    const warnings = [...localVal.warnings];
    if (isElectron()) {
      try {
        const remote = await desktopCharacterCreator.validateCard({
          card: activeDraft.card,
        });
        if (!remote.ok && remote.error) {
          errors.push(remote.error);
        } else if (remote.ok && remote.valid === false) {
          errors.push(...(remote.errors ?? []));
          warnings.push(...(remote.warnings ?? []));
        }
      } catch (err) {
        errors.push(redactErrorMessage(err));
      }
    }
    setValidationResults({
      valid: errors.length === 0 && localVal.valid,
      errors,
      warnings,
      recommendations: [],
    });
    setViewState("ready");
  };

  const handleApproveAndCreate = async (
    startChatImmediately = false,
    saveAsCopy = false,
  ) => {
    const flushRes = await flushPendingSave();
    if (!flushRes.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.autosaveFailed",
        ),
        flushRes.error ||
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cannotApproveCharacterWhilePendingChangesFailedToPersist",
          ),
      );
      return;
    }
    if (!activeDraft) return;
    setViewState("saving");
    try {
      const result =
        await CharacterCreatorImportService.approveAndCreateCharacter(
          activeDraft.id,
          {
            saveAsCopy,
            avatarDataUrl,
          },
        );

      setCreatedCharacter(result.character);
      setActiveDraft(result.draft);
      setViewState("completed");
      toast.success(
        result.isUpdate
          ? tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorview.notification.characterUpdated",
            )
          : tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorview.notification.characterCreated",
            ),
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.value1SavedToLocalLibrary",
          { value1: result.character.name },
        ),
      );

      if (startChatImmediately) {
        startNormalChatForCharacter(result.character.id);
      }
    } catch (err) {
      const msg = normalizeCreatorError(tRuntime, err);
      setErrorDetails(msg);
      setViewState("error");
    }
  };

  const handleExportCard = async () => {
    const flushRes = await flushPendingSave();
    if (!flushRes.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.autosaveFailed",
        ),
        flushRes.error ||
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cannotExportCardWhilePendingChangesFailedToPersist",
          ),
      );
      return;
    }
    if (!activeDraft) return;
    if (isElectron()) {
      try {
        const res = await desktopCharacterCreator.exportCard({
          card: activeDraft.card,
          format: avatarDataUrl ? "png" : "json",
          avatarDataUrl,
        });
        if (res.ok && !res.canceled) {
          toast.success(
            tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorview.notification.characterCardExported",
            ),
            res.filename,
          );
        }
      } catch (err) {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.exportFailed",
          ),
          String(err),
        );
      }
    } else {
      const dataStr =
        "data:text/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(activeDraft.card, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute(
        "download",
        `${activeDraft.card.data.name || "character"}-v2.json`,
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.exportedCharacterCardJson",
        ),
      );
    }
  };

  const handleImportCardFile = async () => {
    if (isElectron()) {
      try {
        const res = await desktopCharacterCards.chooseImportFile();
        if (res.ok && res.handle) {
          const draft =
            await CharacterCreatorImportService.loadImportHandleAsDraft(
              res.handle,
            );
          setActiveDraft(draft);
          setViewState("draft");
          await loadRecentDrafts();
          toast.success(
            tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cardImportedIntoCharacterCreator",
            ),
            draft.card.data.name ||
              tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatorview.notification.importedCard",
              ),
          );
        }
      } catch (err) {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.characterCreator.charactercreatorview.notification.importFailed",
          ),
          String(err),
        );
      }
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,image/png";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const draft =
            await CharacterCreatorImportService.loadImportHandleAsDraft(text);
          setActiveDraft(draft);
          setViewState("draft");
          await loadRecentDrafts();
          toast.success(
            tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorview.notification.cardImportedIntoCharacterCreator",
            ),
            draft.card.data.name,
          );
        } catch (err) {
          toast.error(
            tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorview.notification.couldNotParseCardFile",
            ),
            String(err),
          );
        }
      };
      input.click();
    }
  };

  const handleSelectLocalCharacterToEdit = async (characterId: string) => {
    setShowLocalPicker(false);
    try {
      const draft =
        await CharacterCreatorImportService.loadExistingCharacterAsDraft(
          characterId,
        );
      setActiveDraft(draft);
      setViewState("draft");
      await loadRecentDrafts();
    } catch (err) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.characterCreator.charactercreatorview.notification.couldNotLoadCharacter",
        ),
        String(err),
      );
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-vf-shell-bg text-text-primary overflow-hidden">
      {autosaveError && (
        <div className="mx-6 mt-4 p-3 bg-red-950/60 border border-red-500/40 rounded-md flex items-center justify-between text-red-200 text-sm shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              <strong>
                <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorview.text.autosaveFailed" />
              </strong>{" "}
              {autosaveError}
            </span>
          </div>
          <button
            onClick={() => void flushPendingSave()}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs transition-colors" // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR
          >
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorview.action.retrySave" />
          </button>
        </div>
      )}
      {viewState === "welcome" && (
        <CharacterCreatorWelcome
          onCreateDraft={handleCreateDraft}
          onOpenDraft={handleOpenDraft}
          onDuplicateDraft={handleDuplicateDraft}
          onDeleteDraft={handleDeleteDraft}
          onImportCard={handleImportCardFile}
          onEditLocalCharacter={() => setShowLocalPicker(true)}
          recentDrafts={recentDrafts}
        />
      )}

      {viewState === "generating" && (
        <CharacterCreatorGenerating
          onCancel={handleCancelGeneration}
          idea={activeIdea}
          events={processEvents}
          processSummary={activeDraft?.creatorMetadata?.processSummary}
          designSummary={activeDraft?.creatorMetadata?.designSummary}
        />
      )}

      {(viewState === "draft" || viewState === "revising") && activeDraft && (
        <CharacterCreatorDraftEditor
          draft={activeDraft}
          onUpdateDraft={handleUpdateDraftCard}
          onSaveDraft={handleSaveDraft}
          onValidateDraft={handleValidateDraft}
          onApproveAndCreate={() => void handleValidateDraft()}
          onReviseDraft={handleReviseDraft}
          onRegenerateField={handleRegenerateField}
          onSelectAvatarImage={(dataUrl) => setAvatarDataUrl(dataUrl)}
          avatarDataUrl={avatarDataUrl}
          isRevising={viewState === "revising"}
        />
      )}

      {viewState === "ready" && activeDraft && (
        <CharacterCreatorReady
          draft={activeDraft}
          validationResults={validationResults}
          onApproveAndCreate={handleApproveAndCreate}
          onReturnToDraft={() => setViewState("draft")}
        />
      )}

      {viewState === "saving" && (
        <div className="flex flex-col items-center justify-center h-full p-6">
          <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
          <p className="text-sm font-semibold text-text-primary">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorview.description.savingCharacterToLocalLibrary" />
          </p>
        </div>
      )}

      {viewState === "completed" && createdCharacter && (
        <CharacterCreatorCompleted
          character={createdCharacter}
          onStartChat={() => startNormalChatForCharacter(createdCharacter.id)}
          onViewCharacter={() => {
            useCharacterCardStore.getState().setEditing(createdCharacter.id);
            useSettingsStore.getState().setActiveTab("rp-studio");
          }}
          onContinueEditing={() => setViewState("draft")}
          onExportCard={handleExportCard}
          onCreateAnother={() => {
            setActiveDraft(null);
            setCreatedCharacter(null);
            setViewState("welcome");
          }}
        />
      )}

      {viewState === "error" && (
        <CharacterCreatorError
          error={errorDetails || "An unexpected error occurred."}
          onRetry={() => {
            if (activeDraft) {
              setViewState("draft");
            } else {
              setViewState("welcome");
            }
          }}
          onReturnToDraft={() => setViewState("draft")}
          hasDraftWork={Boolean(activeDraft)}
        />
      )}

      {showLocalPicker && (
        <CharacterCreatorLocalPickerModal
          onSelectCharacter={handleSelectLocalCharacterToEdit}
          onClose={() => setShowLocalPicker(false)}
        />
      )}
    </div>
  );
}
