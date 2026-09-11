/** @fileoverview Phase 1 + Phase 2B + Phase 2D Command Palette.
 * Trigger: Cmd+K / Ctrl+K via this component's mounted listener.
 * Supports:
 *  - Quick tab switching (uses the canonical TAB_REGISTRY)
 *  - "New project" action (creates via project-store + activates)
 *  - Close on Escape or clicking outside.
 *  - Phase 2B: selection-aware Media Studio commands (Select all,
 *    Clear, Compare, Export, Favorite, Add tag, Send to Image, Copy
 *    recipe). These are hidden when the Media Studio has not
 *    registered command handlers.
 *  - Phase 2D: Prompt Library commands (Open, New, Use, Save from
 *    current prompt, Favorite, Export, Import). All routed through
 *    the canonical tab registry and the prompt-library store.
 *  - Accessibility (P1-014): roving activeIndex, ArrowUp/ArrowDown/
 *    Home/End/Enter keyboard navigation, aria-activedescendant on
 *    the search input, and scroll-into-view for the active item.
 */

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useSettingsStore } from "../../stores/settings-store";
import { isImeCompositionEvent } from "../../lib/keyboard";
import { useProjectStore } from "../../stores/project-store";
import { TAB_REGISTRY, type TabId } from "../../config/tabs";
import { toast } from "../../stores/toast-store";
import { redactErrorMessage } from "../../shared/redaction";
import {
  useMediaSelectionStore,
  MEDIA_COMPARE_MAX,
} from "../../stores/media-selection-store";
import {
  getMediaCommandHandlers,
  hasMediaCommandHandlers,
  subscribeMediaCommandHandlers,
} from "../../stores/media-command-handlers";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useSceneComposerStore } from "../../stores/scene-composer-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { useScenarioStore } from "../../stores/scenario-store";
import { useStoragePrivacyStore } from "../../stores/storage-privacy-store";
import { useResearchStore } from "../../stores/research-store";
import { startChatForCharacter } from "../../services/rpHelpers";
import { createBlankCharacterCardDraft } from "../../services/characterCards/characterCardStudioHandoff";
import { readBoundedJsonFile } from "../../utils/file-reader";
import { askText } from "../ui/modal-requests";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onToggle,
}: CommandPaletteProps) {
  const { t } = useTranslation("navigation");
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, onClose);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeDescendantId, setActiveDescendantId] = useState<string>();
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const selectionCount = useMediaSelectionStore(
    (s) => s.selectedMediaIds.length,
  );
  const promptCount = usePromptLibraryStore(
    (s) => s.prompts.filter((p) => p.archivedAt === null).length,
  );
  const isCompareReady = useMediaSelectionStore(
    (s) =>
      s.selectedMediaIds.length >= 2 &&
      s.selectedMediaIds.length <= MEDIA_COMPARE_MAX,
  );
  // Subscribe to the handlers registry so the media section appears
  // / disappears as the user moves between tabs.
  const [hasMediaHandlers, setHasMediaHandlers] = useState(
    hasMediaCommandHandlers,
  );
  useEffect(() => {
    setHasMediaHandlers(hasMediaCommandHandlers());
    return subscribeMediaCommandHandlers(() =>
      setHasMediaHandlers(hasMediaCommandHandlers()),
    );
  }, []);

  // Close on Escape and toggle on Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggle();
        return;
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onToggle, open]);

  // Intentional state-sync: Resets the active keyboard-selection index when 
  // the palette opens or the search query changes.
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
    }
  }, [open, query]);

  // Sync active-item DOM attributes and aria-activedescendant
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>(
        "[data-command-item]",
      ),
    );
    items.forEach((item, idx) => {
      if (!item.id) item.id = `cmd-item-${idx}`;
      item.dataset.active = String(idx === activeIndex);
    });
    setActiveDescendantId(items[activeIndex]?.id);
  }, [open, activeIndex, query, hasMediaHandlers, promptCount]);

  // Scroll active item into view whenever activeIndex changes
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>(
        "[data-command-item]",
      ),
    );
    items[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) return null;

  const filteredTabs = TAB_REGISTRY.filter((tab) =>
    t(`tabs.${tab.id}.label`).toLowerCase().includes(query.toLowerCase()),
  );

  const handleTab = (id: TabId) => {
    setActiveTab(id);
    onClose();
    setQuery("");
  };

  const handleNewProject = async () => {
    const name =
      (
        await askText({
          title: t("project.newProjectName", "New project name"),
          initialValue: t("project.untitledProject", "Untitled Project"),
          actionLabel: t("project.create", "Create"),
          validate: (value) =>
            value.trim()
              ? null
              : t("project.enterProjectName", "Enter a project name."),
        })
      )?.trim() || t("project.untitledProject", "Untitled Project");
    const p = await useProjectStore.getState().createProject(name);
    useProjectStore.getState().setActiveProject(p.id);
    toast.success(
      t("project.created", {
        defaultValue: 'Created "{{name}}"',
        name: p.name,
      }),
    );
    onClose();
    setQuery("");
  };

  // Media Studio command helpers. The palette reads handlers live
  // (not via a subscription) so the registry change is picked up
  // on the next render via the polling effect above.
  const runMediaCommand =
    (
      kind:
        | "select-all"
        | "clear"
        | "compare"
        | "export"
        | "favorite"
        | "add-tag"
        | "send-image"
        | "copy-recipe",
    ) =>
    () => {
      const handlers = getMediaCommandHandlers();
      if (!handlers) {
        toast.error(
          t(
            "commandPalette.onlyAvailableMediaStudio",
            "This command is only available in the Media Studio.",
          ),
        );
        return;
      }
      const store = useMediaSelectionStore.getState();
      if (kind === "select-all") {
        handlers.onSelectAllVisible?.();
        toast.success(
          t("commandPalette.selectedAllVisible", "Selected all visible media"),
        );
      } else if (kind === "clear") {
        handlers.onClearSelection?.();
        toast.success(
          t("commandPalette.clearedSelection", "Cleared media selection"),
        );
      } else if (kind === "compare") {
        if (
          store.selectedMediaIds.length < 2 ||
          store.selectedMediaIds.length > MEDIA_COMPARE_MAX
        ) {
          toast.error(
            t("commandPalette.selectCountToCompare", {
              defaultValue: "Select 2 to {{max}} items to compare.",
              max: MEDIA_COMPARE_MAX,
            }),
          );
          return;
        }
        handlers.onCompare?.(store.selectedMediaIds);
      } else if (kind === "export") {
        if (store.selectedMediaIds.length === 0) {
          toast.error(
            t(
              "commandPalette.selectOneToExport",
              "Select at least one media item to export.",
            ),
          );
          return;
        }
        handlers.onExport?.(store.selectedMediaIds);
      } else if (kind === "favorite") {
        if (store.selectedMediaIds.length === 0) {
          toast.error(
            t("commandPalette.selectOne", "Select at least one media item."),
          );
          return;
        }
        handlers.onFavorite?.(store.selectedMediaIds);
      } else if (kind === "add-tag") {
        if (store.selectedMediaIds.length === 0) {
          toast.error(
            t("commandPalette.selectOne", "Select at least one media item."),
          );
          return;
        }
        handlers.onAddTag?.(store.selectedMediaIds);
      } else if (kind === "send-image") {
        if (store.selectedMediaIds.length === 0) {
          toast.error(
            t("commandPalette.selectOne", "Select at least one media item."),
          );
          return;
        }
        handlers.onSendToImage?.(store.selectedMediaIds);
      } else if (kind === "copy-recipe") {
        if (store.selectedMediaIds.length === 0) {
          toast.error(
            t("commandPalette.selectOne", "Select at least one media item."),
          );
          return;
        }
        handlers.onCopyRecipe?.(store.selectedMediaIds);
      }
      onClose();
      setQuery("");
    };

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isImeCompositionEvent(e)) return;
    if (!open || !listRef.current) return;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>(
        "[data-command-item]",
      ),
    );
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[activeIndex]?.click();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      onKeyDown={handleListKeyDown}
    >
      <div
        className="w-full max-w-[520px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <span className="text-[12px] uppercase tracking-[0.08em] text-text-muted pl-1">
            {t("commandPalette.command", "Command")}
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "commandPalette.searchPlaceholder",
              "Search tabs or actions… (e.g. image, new project)",
            )}
            className="flex-1 bg-transparent text-[14px] placeholder:text-text-muted/60 focus:outline-none"
            aria-activedescendant={activeDescendantId}
          />
          <span className="text-[12px] text-text-muted pr-1">
            {t("commandPalette.esc", "ESC")}
          </span>
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-auto py-1 text-sm">
          <div className="px-2 py-1 text-[12px] uppercase tracking-[0.06em] text-text-muted">
            {t("commandPalette.tabsCanonical", "Tabs (canonical)")}
          </div>
          {filteredTabs.length === 0 && (
            <div className="px-3 py-2 text-text-muted/70 text-[12px]">
              {t("commandPalette.noMatchingTabs", "No matching tabs")}
            </div>
          )}
          {filteredTabs.map((tab) => (
            <button
              key={tab.id}
              data-command-item
              onClick={() => handleTab(tab.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-background flex items-center gap-2 data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            >
              <span>{t(`tabs.${tab.id}.label`)}</span>
              <span className="ml-auto text-[12px] text-text-muted/60">
                {t(`groups.${tab.group}`, { defaultValue: tab.group })}
              </span>
            </button>
          ))}

          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.projectsAndActions", "Projects & Actions")}
          </div>
          <button
            data-command-item
            onClick={handleNewProject}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
          >
            {t("commandPalette.newProject", "New Project")}
          </button>
          <button
            data-command-item
            onClick={() => {
              const projs = useProjectStore.getState().activeProjects();
              if (projs.length) {
                useProjectStore.getState().setActiveProject(projs[0].id);
              } else {
                useProjectStore
                  .getState()
                  .createProject("Quick Project")
                  .then((p) => {
                    useProjectStore.getState().setActiveProject(p.id);
                  })
                  .catch(() => {
                    toast.error(
                      t("project.createFailed", "Failed to create project"),
                    );
                  });
              }
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
          >
            {t(
              "commandPalette.switchOpenCurrent",
              "Switch / Open Current Project",
            )}
          </button>

          {/* Phase 2B: selection-aware Media Studio commands. Rendered
              only when the gallery-view has registered its handlers. */}
          {hasMediaHandlers && (
            <div data-testid="command-palette-media-section">
              <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
                {t("groups.mediaStudio", {
                  defaultValue: "Media Studio ({{count}} selected)",
                  count: selectionCount,
                })}
              </div>
              <button
                data-command-item
                onClick={runMediaCommand("select-all")}
                className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-select-all"
              >
                {t(
                  "commandPalette.selectAllVisible",
                  "Select All Visible Media",
                )}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("clear")}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-clear-selection"
              >
                {t("commandPalette.clearSelection", "Clear Media Selection")}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("compare")}
                disabled={!isCompareReady}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-compare"
              >
                {t("commandPalette.compareSelected", "Compare Selected Media")}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("export")}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-export"
              >
                {t("commandPalette.exportSelected", "Export Selected Media")}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("favorite")}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-favorite"
              >
                {t(
                  "commandPalette.favoriteSelected",
                  "Favorite Selected Media",
                )}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("add-tag")}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-add-tag"
              >
                {t(
                  "commandPalette.addTagSelected",
                  "Add Tag to Selected Media",
                )}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("send-image")}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-send-image"
              >
                {t(
                  "commandPalette.sendToImage",
                  "Send Selected to Image Studio",
                )}
              </button>
              <button
                data-command-item
                onClick={runMediaCommand("copy-recipe")}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
                data-testid="command-palette-copy-recipe"
              >
                {t("commandPalette.copyRecipe", "Copy Selected Recipe JSON")}
              </button>
            </div>
          )}

          {/* Phase 2D — Prompt Library commands. Always visible so the
              palette can route the user into the library; per-prompt
              actions appear when the user has an active prompt. */}
          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.promptLibrary", "Prompt Library")}
          </div>
          <button
            data-command-item
            onClick={() => {
              setActiveTab("prompts");
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-open-prompts"
          >
            {t("commandPalette.openPromptLibrary", "Open Prompt Library")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const created = await usePromptLibraryStore
                .getState()
                .createPrompt({
                  title: t("commandPalette.untitledPrompt", "Untitled prompt"),
                  kind: "general",
                  content: t(
                    "commandPalette.emptyDraftPrompt",
                    "(empty draft — replace with your prompt)",
                  ),
                  scope: "global",
                });
              setActiveTab("prompts");
              usePromptLibraryStore.getState().setActivePrompt(created.id);
              toast.success(
                t("commandPalette.createdNewPrompt", "Created new prompt"),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-new-prompt"
          >
            {t("commandPalette.newPrompt", "New Prompt")}
          </button>
          <button
            data-command-item
            onClick={() => {
              const active = usePromptLibraryStore.getState().activePromptId;
              if (!active) {
                toast.error(
                  t(
                    "commandPalette.selectPromptFirst",
                    "Select a prompt in the Prompt Library first.",
                  ),
                );
                return;
              }
              const item = usePromptLibraryStore.getState().getPrompt(active);
              if (!item) {
                toast.error(
                  t("commandPalette.noPromptSelected", "No prompt selected."),
                );
                return;
              }
              // Phase 2D: applying a prompt records source metadata so
              // the next save can trace lineage without us copying
              // secret-like content.
              navigator.clipboard
                .writeText(
                  item.versions.find((v) => v.id === item.currentVersionId)
                    ?.content ?? "",
                )
                .then(() =>
                  toast.success(
                    t(
                      "commandPalette.promptCopied",
                      "Prompt copied to clipboard",
                    ),
                  ),
                )
                .catch(() =>
                  toast.error(
                    t(
                      "commandPalette.couldNotCopyPrompt",
                      "Could not copy prompt",
                    ),
                  ),
                );
              onClose();
              setQuery("");
            }}
            disabled={promptCount === 0}
            className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-use-selected-prompt"
          >
            {t(
              "commandPalette.useSelectedPrompt",
              "Use Selected Prompt (copy)",
            )}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const ids = usePromptLibraryStore
                .getState()
                .prompts.filter((p) => p.archivedAt === null)
                .map((p) => p.id);
              if (ids.length === 0) {
                toast.error(
                  t(
                    "commandPalette.noPromptsToExport",
                    "No prompts to export.",
                  ),
                );
                return;
              }
              const payload = usePromptLibraryStore
                .getState()
                .exportPrompts(ids);
              const json = JSON.stringify(payload, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `venice-forge-prompts-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(
                t("commandPalette.exportedPrompts", {
                  defaultValue: "Exported {{count}} prompt{{plural}}",
                  count: ids.length,
                  plural: ids.length === 1 ? "" : "s",
                }),
              );
              onClose();
              setQuery("");
            }}
            disabled={promptCount === 0}
            className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-export-prompts"
          >
            {t("commandPalette.exportPrompts", "Export Prompts")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "application/json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const payload = await readBoundedJsonFile<unknown>(file, {
                    maxBytes: 5 * 1024 * 1024,
                    maxItems: 500,
                    itemKey: "prompts",
                  });
                  const result = await usePromptLibraryStore
                    .getState()
                    .importPrompts(payload, { reconcile: true });
                  const parts: string[] = [];
                  if (result.imported.length > 0) {
                    parts.push(
                      t("commandPalette.importedCount", {
                        defaultValue: "imported {{count}} prompt{{plural}}",
                        count: result.imported.length,
                        plural: result.imported.length === 1 ? "" : "s",
                      }),
                    );
                  }
                  if (result.reconciled.length > 0) {
                    parts.push(
                      t("commandPalette.syncedCount", {
                        defaultValue: "synced {{count}} prompt{{plural}}",
                        count: result.reconciled.length,
                        plural: result.reconciled.length === 1 ? "" : "s",
                      }),
                    );
                  }
                  if (result.skipped.length > 0) {
                    parts.push(
                      t("commandPalette.skippedCount", {
                        defaultValue: "skipped {{count}}",
                        count: result.skipped.length,
                      }),
                    );
                  }
                  toast.success(
                    parts.length > 0
                      ? t("commandPalette.importSuccess", {
                          defaultValue: "Prompt library: {{parts}}",
                          parts: parts.join(", "),
                        })
                      : t(
                          "commandPalette.importUpToDate",
                          "Prompt library up to date",
                        ),
                  );
                } catch (err) {
                  toast.error(
                    t("commandPalette.couldNotImport", "Could not import"),
                    redactErrorMessage(err),
                  );
                }
              };
              input.click();
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-import-prompts"
          >
            {t("commandPalette.importPrompts", "Import Prompts…")}
          </button>
          <button
            data-command-item
            onClick={() => {
              // Dispatch a custom event that the image view can listen for
              window.dispatchEvent(
                new CustomEvent("saveCurrentPromptToLibrary"),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-save-current-prompt"
          >
            {t(
              "commandPalette.saveCurrentPrompt",
              "Save Current Prompt to Library",
            )}
          </button>

          {/* Phase 2E — Scene Composer commands. Always visible so the
              palette can route the user into the composer; per-scene
              actions appear when the user has scenes saved. */}
          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.sceneComposer", "Scene Composer")}
          </div>
          <button
            data-command-item
            onClick={() => {
              setActiveTab("scenes");
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-open-scenes"
          >
            {t("commandPalette.openSceneComposer", "Open Scene Composer")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const sceneCount = useSceneComposerStore
                .getState()
                .scenes.filter((s) => !s.archivedAt).length;
              if (sceneCount === 0) {
                toast.error(
                  t("commandPalette.noScenesToExport", "No scenes to export."),
                );
                return;
              }
              const ids = useSceneComposerStore
                .getState()
                .scenes.filter((s) => !s.archivedAt)
                .map((s) => s.id);
              const payload = useSceneComposerStore
                .getState()
                .exportScenes(ids);
              const json = JSON.stringify(payload, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `venice-forge-scenes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(
                t("commandPalette.exportedScenes", {
                  defaultValue: "Exported {{count}} scene{{plural}}",
                  count: ids.length,
                  plural: ids.length === 1 ? "" : "s",
                }),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-export-scenes"
          >
            {t("commandPalette.exportScenes", "Export Scenes")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "application/json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const payload = await readBoundedJsonFile<unknown>(file, {
                    maxBytes: 10 * 1024 * 1024,
                    maxItems: 250,
                    itemKey: "scenes",
                  });
                  const result = await useSceneComposerStore
                    .getState()
                    .importScenes(payload);
                  toast.success(
                    t("commandPalette.importedScenesSuccess", {
                      defaultValue:
                        "Imported {{count}} scene{{plural}}{{skipped}}",
                      count: result.imported.length,
                      plural: result.imported.length === 1 ? "" : "s",
                      skipped:
                        result.skipped.length > 0
                          ? t("commandPalette.skippedScenes", {
                              defaultValue: " (skipped {{count}})",
                              count: result.skipped.length,
                            })
                          : "",
                    }),
                  );
                } catch (err) {
                  toast.error(
                    t("commandPalette.couldNotImport", "Could not import"),
                    redactErrorMessage(err),
                  );
                }
              };
              input.click();
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-import-scenes"
          >
            {t("commandPalette.importScenes", "Import Scenes…")}
          </button>

          {/* Phase 2F — RP Studio commands. Always visible so the
              palette can route the user into the RP Studio. */}
          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.rpStudio", "RP Studio")}
          </div>
          <button
            data-command-item
            onClick={() => {
              setActiveTab("rp-studio");
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-open-rp-studio"
          >
            {t("commandPalette.openRpStudio", "Open RP Studio")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              setActiveTab("rp-studio");
              await createBlankCharacterCardDraft();
              toast.success(
                t(
                  "commandPalette.createdLocalDraft",
                  "Created local ST Card draft",
                ),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-new-character"
          >
            {t("commandPalette.createStCard", "Create ST Card")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const activeId = useCharacterCardStore.getState().editingId;
              if (!activeId) {
                toast.error(
                  t(
                    "commandPalette.selectCharacterFirst",
                    "Select a character in the RP Studio first.",
                  ),
                );
                return;
              }
              const chatId = await startChatForCharacter(activeId);
              if (chatId) {
                toast.success(t("commandPalette.chatStarted", "Chat started"));
                onClose();
                setQuery("");
              } else {
                toast.error(
                  t("commandPalette.couldNotStartChat", "Could not start chat"),
                );
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-start-character-chat"
          >
            {t(
              "commandPalette.startChatWithSelected",
              "Start Chat with Selected Character",
            )}
          </button>
          <button
            data-command-item
            onClick={() => {
              setActiveTab("scenes");
              const activeId = useCharacterCardStore.getState().editingId;
              const card = activeId
                ? useCharacterCardStore.getState().getById(activeId)
                : null;
              useScenarioStore.getState().createBlank({
                scope: "character",
                characterId: activeId ?? undefined,
                name: card
                  ? t("commandPalette.scenarioFor", {
                      defaultValue: "Scenario for {{name}}",
                      name: card.name,
                    })
                  : t("commandPalette.newScenario", "New Scenario"),
              });
              toast.success(
                t("commandPalette.createdNewScenario", "Created new scenario"),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-new-scenario"
          >
            {t("commandPalette.newScenario", "New Scenario")}
          </button>

          <button
            data-command-item
            onClick={() => {
              setActiveTab("workflows");
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-open-workflows"
          >
            {t("commandPalette.openWorkflows", "Open Workflows")}
          </button>

          {/* Phase 2I — Research Workspace commands. Always visible so the
              palette can route the user into the Research Workspace. */}
          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.researchWorkspace", "Research Workspace")}
          </div>
          <button
            data-command-item
            onClick={() => {
              setActiveTab("search");
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-open-research"
          >
            {t(
              "commandPalette.openResearchWorkspace",
              "Open Research Workspace",
            )}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const created = await useResearchStore.getState().createSession({
                title: t(
                  "commandPalette.newResearchSession",
                  "New Research Session",
                ),
              });
              setActiveTab("search");
              useResearchStore.getState().setActiveSession(created.id);
              toast.success(
                t(
                  "commandPalette.createdNewResearchSession",
                  "Created new research session",
                ),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-new-research-session"
          >
            {t("commandPalette.newResearchSession", "New Research Session")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const sessionCount = useResearchStore
                .getState()
                .sessions.filter((s) => !s.archivedAt).length;
              if (sessionCount === 0) {
                toast.error(
                  t(
                    "commandPalette.noResearchToExport",
                    "No research sessions to export.",
                  ),
                );
                return;
              }
              const ids = useResearchStore
                .getState()
                .sessions.filter((s) => !s.archivedAt)
                .map((s) => s.id);
              const payload = useResearchStore.getState().exportResearch(ids);
              const json = JSON.stringify(payload, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `venice-forge-research-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(
                t("commandPalette.exportedResearch", {
                  defaultValue: "Exported {{count}} research session{{plural}}",
                  count: ids.length,
                  plural: ids.length === 1 ? "" : "s",
                }),
              );
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-export-research"
          >
            {t(
              "commandPalette.exportResearchSessions",
              "Export Research Sessions",
            )}
          </button>
          <button
            data-command-item
            onClick={async () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "application/json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const payload = await readBoundedJsonFile<unknown>(file, {
                    maxBytes: 10 * 1024 * 1024,
                    maxItems: 250,
                    itemKey: "sessions",
                  });
                  const result = await useResearchStore
                    .getState()
                    .importResearch(payload);
                  toast.success(
                    t("commandPalette.importedResearchSuccess", {
                      defaultValue:
                        "Imported {{count}} session{{plural}}{{skipped}}",
                      count: result.imported.length,
                      plural: result.imported.length === 1 ? "" : "s",
                      skipped:
                        result.skipped.length > 0
                          ? t("commandPalette.skippedScenes", {
                              defaultValue: " (skipped {{count}})",
                              count: result.skipped.length,
                            })
                          : "",
                    }),
                  );
                } catch (err) {
                  toast.error(
                    t("commandPalette.couldNotImport", "Could not import"),
                    redactErrorMessage(err),
                  );
                }
              };
              input.click();
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-import-research"
          >
            {t(
              "commandPalette.importResearchSessions",
              "Import Research Sessions…",
            )}
          </button>

          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.privacyAndStorage", "Privacy & Storage")}
          </div>
          <button
            data-command-item
            onClick={() => {
              setActiveTab("privacy");
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-open-privacy"
          >
            {t("commandPalette.openPrivacyDashboard", "Open Privacy Dashboard")}
          </button>
          <button
            data-command-item
            onClick={async () => {
              await useStoragePrivacyStore.getState().refreshInventory();
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-refresh-inventory"
          >
            {t(
              "commandPalette.refreshStorageInventory",
              "Refresh Storage Inventory",
            )}
          </button>
          <button
            data-command-item
            onClick={async () => {
              await useStoragePrivacyStore.getState().copySafeSummary();
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-copy-safe-privacy-summary"
          >
            {t(
              "commandPalette.copySafePrivacySummary",
              "Copy Safe Privacy Summary",
            )}
          </button>
          <button
            data-command-item
            onClick={async () => {
              await useStoragePrivacyStore.getState().exportSafeSummary();
              onClose();
              setQuery("");
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
            data-testid="command-palette-export-safe-privacy-summary"
          >
            {t(
              "commandPalette.exportSafePrivacySummary",
              "Export Safe Privacy Summary",
            )}
          </button>

          <div className="px-2 pt-2 pb-1 text-[12px] uppercase tracking-[0.06em] text-text-muted border-t border-border/50 mt-1">
            {t("groups.system", "System")}
          </div>
          <button
            data-command-item
            onClick={() => {
              useSettingsStore
                .getState()
                .setShowInspector(!useSettingsStore.getState().showInspector);
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background data-[active=true]:bg-accent/15 data-[active=true]:text-accent"
          >
            {t("commandPalette.toggleInspector", "Toggle Inspector")}
          </button>
        </div>

        <div className="border-t border-border/50 px-3 py-1.5 text-[12px] text-text-muted/70 flex justify-between">
          <span>{t("commandPalette.toggleHint", "⌘K to toggle")}</span>
          <span>
            {t(
              "commandPalette.navigateHint",
              "↑↓ to navigate · Enter to choose",
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
