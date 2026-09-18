import { translateRuntime } from "../../i18n/runtimeTranslator";
/**
 * @fileoverview Character Library — local card grid view.
 *
 * Lists all locally-stored `CharacterCardV1` records and lets the user open
 * one in the editor, create a new one, or delete an existing one.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { openCharacterCreator } from "../../stores/character-creator-launch-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import {
  GhostButton,
  PillGroup,
  PrimaryButton,
  ErrorText,
  EmptyState,
} from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { avatarDataUri, formatRelativeTime, truncate } from "./_shared";
import type { CharacterCardV1 } from "../../types/rp";
import { generateId } from "../../services/rp/characterCardService";
import { isImeCompositionEvent } from "../../lib/keyboard";
import {
  startChatForCharacter,
  startNormalChatForCharacter,
} from "../../services/rpHelpers";
import { toast } from "../../stores/toast-store";
import { desktopCharacterCards } from "../../services/desktopBridge";
import type { CharacterCardImportPreview } from "../../types/character-card-files";
import type { CharacterCardImportMode } from "../../types/character-card-files";
import type { CharacterCardImportApplyOptions } from "../../types/character-card-files";
import { askDecision } from "../ui/modal-requests";
import {
  deleteCharacterCardDraft,
  listCharacterCardDrafts,
  saveCharacterCardDraft,
  type CharacterCardDraftRecord,
} from "../../services/characterCards/characterCardDraftService";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Trans, useTranslation } from "react-i18next";

const STANDARD_FILTER = [
  {
    value: "standard",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.rpStudio.characterlibrary.metadata.standard",
        "Standard",
      );
    },
  },
  {
    value: "adult",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.rpStudio.characterlibrary.metadata.adult",
        "Adult",
      );
    },
  },
] as const;

interface Props {
  onEdit: (id: string) => void;
}

export function CharacterLibrary({ onEdit }: Props) {
  const { t: tRuntime } = useTranslation("common");
  const load = useCharacterCardStore((s) => s.load);
  const hasLoaded = useCharacterCardStore((s) => s.hasLoaded);
  const isLoading = useCharacterCardStore((s) => s.isLoading);
  const error = useCharacterCardStore((s) => s.error);
  const remove = useCharacterCardStore((s) => s.remove);
  const setSearchQuery = useCharacterCardStore((s) => s.setSearchQuery);
  const searchQuery = useCharacterCardStore((s) => s.searchQuery);
  const allCards = useCharacterCardStore((s) => s.cards);
  const refresh = useCharacterCardStore((s) => s.refresh);

  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [createMePrompt, setCreateMePrompt] = useState("");
  const [importCandidate, setImportCandidate] = useState<{
    handle: string;
    preview: CharacterCardImportPreview;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importCollision, setImportCollision] = useState(false);
  const [collisionCardId, setCollisionCardId] = useState<string | undefined>();
  const [importBookMode, setImportBookMode] = useState<
    "none" | "embedded" | "linked" | "both"
  >("both");
  const [favoriteImport, setFavoriteImport] = useState(false);
  const [startAfterImport, setStartAfterImport] = useState(false);
  const [lastUndo, setLastUndo] = useState<{
    handle: string;
    cardId: string;
  } | null>(null);
  const [draftRecords, setDraftRecords] = useState<CharacterCardDraftRecord[]>(
    [],
  );
  const [showDraftManager, setShowDraftManager] = useState(false);
  const [mergeFields, setMergeFields] = useState<
    NonNullable<CharacterCardImportApplyOptions["mergeFields"]>
  >([
    "description",
    "personality",
    "scenario",
    "firstMessage",
    "systemPrompt",
    "postHistoryInstructions",
    "alternateGreetings",
    "exampleDialogues",
    "rawExampleDialogue",
    "tags",
    "characterVersion",
    "tavernExtensions",
    "embeddedCharacterBook",
  ]);
  const importDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(importDialogRef, importCandidate !== null, () =>
    setImportCandidate(null),
  );

  const handleCreateMe = () => {
    if (!createMePrompt.trim()) return;
    const promptText = createMePrompt.trim();
    openCharacterCreator({
      mode: "new-from-idea",
      sourceIdea: promptText,
    });
    setCreateMePrompt("");
  };

  // Adult filtering is a normal user preference and is no longer gated by
  // the Traffic Inspector switch.
  const [adultFilter, setAdultFilter] = useState<"standard" | "adult">(
    "standard",
  );
  const adultFilterOptions = useMemo(() => {
    void tRuntime;
    return STANDARD_FILTER;
  }, [tRuntime]);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  useEffect(() => {
    let active = true;
    void listCharacterCardDrafts()
      .then((records) => {
        if (active) setDraftRecords(records);
      })
      .catch(() => {
        if (active) setDraftRecords([]);
      });
    return () => {
      active = false;
    };
  }, [showDraftManager]);

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return allCards.filter((card) => {
      if (adultFilter === "adult" && !card.adult) return false;
      if (adultFilter === "standard" && card.adult) return false;
      if (!needle) return true;
      const haystack =
        `${card.name}\n${card.description}\n${card.tags.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [allCards, searchQuery, adultFilter]);

  const handleCreate = async () => {
    const now = Date.now();
    const blank: CharacterCardV1 = {
      schema: "CharacterCardV1",
      id: generateId(),
      name: "Untitled",
      description: "",
      systemPrompt: "",
      tags: [],
      adult: false,
      exampleDialogues: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveCharacterCardDraft(blank);
    setDraftRecords((records) => [
      ...records.filter((record) => record.cardId !== blank.id),
      {
        id: `draft-${blank.id}`,
        cardId: blank.id,
        card: blank,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    onEdit(blank.id);
  };

  const chooseImport = async () => {
    const result = await desktopCharacterCards.chooseImportFile();
    if (!result.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.characterlibrary.notification.importFailed",
        ),
        result.error ??
          tRuntime(
            "runtimeGenerated.components.rpStudio.characterlibrary.notification.couldNotInspectTheSelectedCard",
          ),
      );
      return;
    }
    if (!result.canceled && result.handle && result.preview) {
      setImportCollision(false);
      setImportCandidate({ handle: result.handle, preview: result.preview });
    }
  };

  const applyImport = async (mode: CharacterCardImportMode = "create") => {
    if (!importCandidate) return;
    if (
      (mode === "replace" || mode === "merge") &&
      !(await askDecision({
        title: tRuntime(
          "runtimeGenerated.components.rpStudio.characterlibrary.metadata.value1ExistingCharacter",
          { value1: mode === "replace" ? "Replace" : "Merge into" },
        ),
        detail: "A safety snapshot and undo record will be created first.",
        actionLabel: mode === "replace" ? "Replace" : "Merge",
        danger: mode === "replace",
      }))
    )
      return;
    setImporting(true);
    const result = await desktopCharacterCards.applyImport({
      handle: importCandidate.handle,
      mode,
      existingCardId: collisionCardId,
      characterBook: importBookMode,
      favorite: favoriteImport,
      startChat: startAfterImport,
      ...(mode === "merge" ? { mergeFields } : {}),
    });
    setImporting(false);
    if (result.collision) {
      setImportCollision(true);
      setCollisionCardId(result.collision.existingCardId);
      return;
    }
    if (!result.ok) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.characterlibrary.notification.importFailed",
        ),
        result.error ??
          tRuntime(
            "runtimeGenerated.components.rpStudio.characterlibrary.notification.theCardWasNotImported",
          ),
      );
      setImportCandidate(null);
      return;
    }
    await refresh();
    setImportCandidate(null);
    setImportCollision(false);
    toast.success(
      tRuntime(
        "runtimeGenerated.components.rpStudio.characterlibrary.notification.characterImported",
      ),
      tRuntime(
        "runtimeGenerated.components.rpStudio.characterlibrary.notification.theCompatibilityPayloadAndAvatarWerePreserved",
      ),
    );
    if (result.undoHandle && result.cardId)
      setLastUndo({ handle: result.undoHandle, cardId: result.cardId });
    if (result.startedChatRequested && result.cardId)
      await startChatForCharacter(result.cardId);
    else if (result.cardId) onEdit(result.cardId);
  };

  const exportCard = async (cardId: string, format: "json" | "png") => {
    const result =
      format === "json"
        ? await desktopCharacterCards.exportJson({
            cardId,
            profile: "standard",
          })
        : await desktopCharacterCards.exportPng({
            cardId,
            profile: "standard",
          });
    if (!result.ok)
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.characterlibrary.notification.exportFailed",
        ),
        result.error ??
          tRuntime(
            "runtimeGenerated.components.rpStudio.characterlibrary.notification.theCardWasNotExported",
          ),
      );
    else if (!result.canceled)
      toast.success(
        tRuntime(
          "runtimeGenerated.components.rpStudio.characterlibrary.notification.characterExported",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.characterlibrary.notification.savedAVerifiedV2Value1Card",
          { value1: format.toUpperCase() },
        ),
      );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-y border-vf-panel-border bg-vf-shell-bg bg-vf-panel-bg">
        <div className="flex-1 min-w-[12rem]">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tRuntime(
              "runtimeGenerated.components.rpStudio.characterlibrary.attribute.searchCharacters",
            )}
            aria-label={tRuntime(
              "runtimeGenerated.components.rpStudio.characterlibrary.attribute.searchCharacters2",
            )}
            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
          />
          <p className="mt-1 text-[12px] text-text-muted">
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.description.localCharactersAreStoredInVeniceForge" />
          </p>
        </div>
        <PillGroup
          options={adultFilterOptions.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          value={adultFilter}
          onChange={(v) => {
            const next = v as "standard" | "adult";
            setAdultFilter(next);
          }}
          ariaLabel="Adult filter"
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={tRuntime(
              "runtimeGenerated.components.rpStudio.characterlibrary.attribute.autoCreatePrompt",
            )}
            value={createMePrompt}
            onChange={(e) => setCreateMePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (isImeCompositionEvent(e)) return;
              if (e.key === "Enter") handleCreateMe();
            }}
            className="text-[13px] bg-vf-panel-bg-raised border border-vf-panel-border rounded px-3 py-1.5 focus:outline-none focus:border-accent"
          />
          <PrimaryButton
            onClick={handleCreateMe}
            size="sm"
            disabled={!createMePrompt.trim()}
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.buildCharacter" />
          </PrimaryButton>
          <PrimaryButton
            onClick={() => openCharacterCreator({ mode: "new-from-idea" })}
            size="sm"
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.characterCreator" />
          </PrimaryButton>
          <PrimaryButton onClick={handleCreate} size="sm">
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.createStCard" />
          </PrimaryButton>
          <GhostButton
            onClick={() => setShowDraftManager((visible) => !visible)}
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.drafts" />
            {draftRecords.length})
          </GhostButton>
          <GhostButton onClick={chooseImport}>
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.importCard" />
          </GhostButton>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {lastUndo && (
        <div
          className="mx-4 mt-3 flex items-center justify-between rounded-md border border-warning/40 bg-vf-panel-bg-raised px-3 py-2 text-[13px]"
          role="status"
        >
          <span>
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.characterImportChangedAnExistingCard" />
          </span>
          <GhostButton
            onClick={async () => {
              const result = await desktopCharacterCards.undoImport({
                handle: lastUndo.handle,
              });
              if (result.ok) {
                await refresh();
                setLastUndo(null);
                toast.success(
                  tRuntime(
                    "runtimeGenerated.components.rpStudio.characterlibrary.notification.importUndone",
                  ),
                );
              } else
                toast.error(
                  tRuntime(
                    "runtimeGenerated.components.rpStudio.characterlibrary.notification.undoFailed",
                  ),
                  result.error,
                );
            }}
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.undoImport" />
          </GhostButton>
        </div>
      )}
      {showDraftManager && (
        <section
          className="mx-4 mt-3 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-3"
          aria-labelledby="card-drafts-title"
        >
          <div className="flex items-center justify-between">
            <h2
              id="card-drafts-title"
              className="text-[14px] font-semibold text-text-primary"
            >
              <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.heading.localStCardDrafts" />
            </h2>
            <GhostButton onClick={() => setShowDraftManager(false)}>
              <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.close" />
            </GhostButton>
          </div>
          <p className="mt-1 text-[12px] text-text-muted">
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.description.draftsAreEncryptedLocallyExcludedFromSync" />
          </p>
          {draftRecords.length === 0 ? (
            <p className="mt-3 text-[12px] text-text-muted">
              <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.description.noRecoverableDrafts" />
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {draftRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between gap-3 rounded border border-vf-panel-border bg-vf-panel-bg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-text-primary">
                      {record.card.name ||
                        tRuntime(
                          "runtimeGenerated.components.rpStudio.characterlibrary.text.untitled",
                        )}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.updated" />{" "}
                      {new Date(record.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <GhostButton onClick={() => onEdit(record.cardId)}>
                      <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.resume" />
                    </GhostButton>
                    <GhostButton
                      onClick={async () => {
                        await deleteCharacterCardDraft(record.cardId);
                        setDraftRecords((records) =>
                          records.filter((item) => item.id !== record.id),
                        );
                      }}
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.delete" />
                    </GhostButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && !hasLoaded ? (
          <div className="flex items-center justify-center h-full text-text-muted gap-2 text-[13px]">
            <Spinner className="text-text-muted" />{" "}
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.loadingCharacters" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <EmptyState>
              {hasLoaded
                ? tRuntime(
                    "runtimeGenerated.components.rpStudio.characterlibrary.text.noCharactersYet",
                  )
                : ""}
            </EmptyState>
            {hasLoaded && (
              <GhostButton onClick={handleCreate}>
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.createYourFirstCharacter" />
              </GhostButton>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                onEdit={() => onEdit(card.id)}
                onDelete={() => remove(card.id)}
                confirming={confirmingDelete === card.id}
                setConfirming={setConfirmingDelete}
                onExport={(format) => void exportCard(card.id, format)}
              />
            ))}
          </div>
        )}
      </div>
      {importCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          role="presentation"
        >
          <div
            ref={importDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-import-title"
            className="w-full max-w-lg rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-xl focus:outline-none"
          >
            <h2
              id="card-import-title"
              className="text-lg font-semibold text-text-primary"
            >
              <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.heading.reviewCharacterImport" />
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.description.nothingIsSavedUntilYouConfirmThis" />
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.name" />
              </dt>
              <dd className="text-text-primary">
                {importCandidate.preview.name ||
                  tRuntime(
                    "runtimeGenerated.components.rpStudio.characterlibrary.text.untitled",
                  )}
              </dd>
              <dt className="text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.format" />
              </dt>
              <dd className="text-text-primary">
                {importCandidate.preview.format}
              </dd>
              <dt className="text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.creator" />
              </dt>
              <dd className="text-text-primary">
                {importCandidate.preview.creator ||
                  tRuntime(
                    "runtimeGenerated.components.rpStudio.characterlibrary.text.notSpecified",
                  )}
              </dd>
              <dt className="text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.greetings" />
              </dt>
              <dd className="text-text-primary">
                {importCandidate.preview.greetingCount}
              </dd>
              <dt className="text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.loreEntries" />
              </dt>
              <dd className="text-text-primary">
                {importCandidate.preview.characterBookEntryCount}
              </dd>
              <dt className="text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.extensions" />
              </dt>
              <dd className="text-text-primary">
                {importCandidate.preview.extensionNamespaceCount}
              </dd>
            </dl>
            {importCandidate.preview.warnings.length > 0 && (
              <div
                className="mt-4 rounded-md border border-warning/40 p-3 text-sm text-text-secondary"
                role="status"
              >
                {importCandidate.preview.warnings.map((warning) => (
                  <p key={`${warning.code}-${warning.path}`}>
                    {warning.path}: {warning.message}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-4 space-y-2">
              <label className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                <span>
                  <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.characterBook" />
                </span>
                <select
                  value={importBookMode}
                  onChange={(event) =>
                    setImportBookMode(
                      event.target.value as typeof importBookMode,
                    )
                  }
                  className="rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1 text-text-primary"
                >
                  <option value="both">
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.option.embeddedLinkedRecommended" />
                  </option>
                  <option value="linked">
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.option.linkedOnly" />
                  </option>
                  <option value="embedded">
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.option.embeddedOnly" />
                  </option>
                  <option value="none">
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.option.doNotImportBook" />
                  </option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={favoriteImport}
                  onChange={(event) => setFavoriteImport(event.target.checked)}
                />{" "}
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.label.setAsFavorite" />
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={startAfterImport}
                  onChange={(event) =>
                    setStartAfterImport(event.target.checked)
                  }
                />{" "}
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.label.startRpChatAfterImport" />
              </label>
            </div>
            {importCollision && (
              <>
                <ErrorText>
                  <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.aMatchingCardAlreadyExistsChooseAn" />
                </ErrorText>
                <fieldset className="mt-3 rounded border border-vf-panel-border p-2">
                  <legend className="px-1 text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.fieldsToMerge" />
                  </legend>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-text-secondary">
                    {(
                      [
                        "name",
                        "description",
                        "personality",
                        "scenario",
                        "firstMessage",
                        "systemPrompt",
                        "postHistoryInstructions",
                        "alternateGreetings",
                        "exampleDialogues",
                        "rawExampleDialogue",
                        "tags",
                        "author",
                        "characterVersion",
                        "tavernExtensions",
                        "embeddedCharacterBook",
                      ] as const
                    ).map((field) => (
                      <label key={field} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={mergeFields.includes(field)}
                          onChange={(event) =>
                            setMergeFields((fields) =>
                              event.target.checked
                                ? [...fields, field]
                                : fields.filter((item) => item !== field),
                            )
                          }
                        />{" "}
                        {field}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <GhostButton
                onClick={() => setImportCandidate(null)}
                disabled={importing}
              >
                <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.cancel" />
              </GhostButton>
              {importCollision ? (
                <>
                  <GhostButton
                    onClick={() => void applyImport("keep-existing")}
                    disabled={importing}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.keepExisting" />
                  </GhostButton>
                  <GhostButton
                    onClick={() => void applyImport("merge")}
                    disabled={importing}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.mergeFields" />
                  </GhostButton>
                  <GhostButton
                    onClick={() => void applyImport("replace")}
                    disabled={importing}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.replace" />
                  </GhostButton>
                  <PrimaryButton
                    onClick={() => void applyImport("create-copy")}
                    disabled={importing}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.text.createCopy" />
                  </PrimaryButton>
                </>
              ) : (
                <PrimaryButton
                  onClick={() => void applyImport("create")}
                  disabled={importing}
                >
                  {importing
                    ? tRuntime(
                        "runtimeGenerated.components.rpStudio.characterlibrary.text.importing",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.rpStudio.characterlibrary.text.import",
                      )}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardTile({
  card,
  onEdit,
  onDelete,
  confirming,
  setConfirming,
  onExport,
}: {
  card: CharacterCardV1;
  onEdit: () => void;
  onDelete: () => void;
  confirming: boolean;
  setConfirming: (id: string | null) => void;
  onExport: (format: "json" | "png") => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null)
        clearTimeout(confirmTimerRef.current);
    };
  }, []);
  const armConfirm = () => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    setConfirming(card.id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirming(null);
      confirmTimerRef.current = null;
    }, 2500);
  };
  const cancelConfirm = () => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setConfirming(null);
  };
  const avatarSrc = avatarDataUri(card.avatar);
  return (
    <div
      className="group relative flex flex-col gap-2 bg-vf-panel-bg border border-vf-panel-border hover:border-accent/40 rounded-lg p-3 transition-colors focus-within:border-accent"
      role="article"
      aria-label={tRuntime(
        "runtimeGenerated.components.rpStudio.characterlibrary.attribute.characterValue1",
        { value1: card.name },
      )}
    >
      <div className="relative aspect-square w-full rounded-md overflow-hidden bg-vf-panel-bg-raised border border-vf-panel-border">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-3xl font-semibold">
            {card.name.slice(0, 1).toUpperCase() || "?"}
          </div>
        )}
        {card.adult && (
          <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/30">
            18+
          </span>
        )}
      </div>

      <div className="min-h-0">
        <div className="text-[13.5px] font-semibold text-text-primary truncate">
          {card.name}
        </div>
        <div className="text-[12px] text-text-muted mt-0.5">
          {formatRelativeTime(card.updatedAt)}
        </div>
        {card.description && (
          <div className="text-[12px] text-text-secondary mt-1.5 line-clamp-2">
            {truncate(card.description, 120)}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 mt-auto pt-1">
        <button
          type="button"
          onClick={async () => {
            const convId = await startNormalChatForCharacter(card.id);
            if (convId) {
              toast.success(
                tRuntime(
                  "runtimeGenerated.components.rpStudio.characterlibrary.notification.chatStarted",
                ),
                tRuntime(
                  "runtimeGenerated.components.rpStudio.characterlibrary.notification.openingValue1InChat",
                  { value1: card.name },
                ),
              );
            } else {
              toast.error(
                tRuntime(
                  "runtimeGenerated.components.rpStudio.characterlibrary.notification.couldNotStartChat",
                ),
                tRuntime(
                  "runtimeGenerated.components.rpStudio.characterlibrary.notification.pleaseTryAgain",
                ),
              );
            }
          }}
          title={tRuntime("surface.componentsRpStudioCharacterlibrary.action.chat")}
          className="min-w-0 flex-1 truncate text-[12px] py-1.5 rounded-md border border-success/30 text-success-fg hover:bg-success/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
        >
          <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.action.chat" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          title={tRuntime("surface.componentsRpStudioCharacterlibrary.action.edit")}
          className="min-w-0 flex-1 truncate text-[12px] py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:border-accent/40 hover:bg-vf-control-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
        >
          <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.action.edit" />
        </button>
        {confirming ? (
          <button
            type="button"
            onClick={() => {
              onDelete();
              cancelConfirm();
            }}
            className="text-[12px] py-1.5 px-2 rounded-md text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:bg-rose-500/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2"
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.action.delete" />
          </button>
        ) : (
          <button
            type="button"
            onClick={armConfirm}
            aria-label={tRuntime(
              "runtimeGenerated.components.rpStudio.characterlibrary.attribute.deleteValue1",
              { value1: card.name },
            )}
            className="text-[12px] py-1.5 px-2 rounded-md text-text-muted hover:text-rose-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onExport("json")}
          title={tRuntime("surface.componentsRpStudioCharacterlibrary.action.exportJson")}
          className="min-w-0 flex-1 truncate text-[11px] py-1 rounded border border-vf-panel-border text-text-muted hover:text-text-primary"
        >
          <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.action.exportJson" />
        </button>
        <button
          type="button"
          onClick={() => onExport("png")}
          disabled={!card.avatar}
          title={tRuntime("surface.componentsRpStudioCharacterlibrary.action.exportPng")}
          className="min-w-0 flex-1 truncate text-[11px] py-1 rounded border border-vf-panel-border text-text-muted hover:text-text-primary disabled:opacity-40"
        >
          <Trans i18nKey="common:surface.componentsRpStudioCharacterlibrary.action.exportPng" />
        </button>
      </div>
    </div>
  );
}
