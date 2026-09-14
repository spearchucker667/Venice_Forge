import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import {
  clampSidebarWidth,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSettingsStore,
} from "../../stores/settings-store";
import {
  selectConversationSummaries,
  useChatStore,
  type ConversationSummary,
} from "../../stores/chat-store";
import { useShallow } from "zustand/shallow";
import { useProjectStore } from "../../stores/project-store";
import { toast } from "../../stores/toast-store";
import { VeniceLogo, VeniceWordmark } from "../ui/logo";
import { askDecision, askText } from "../ui/modal-requests";
import type { Conversation } from "../../types/conversation";
import { desktopSafety, isElectron } from "../../services/desktopBridge";
import { reloadConfig } from "../../stores/config-store";
import { MasterPasswordDialog } from "../settings/MasterPasswordDialog";
import { useProfileStore } from "../../stores/profile-store";
import {
  TAB_REGISTRY,
  TAB_GROUP_LABELS,
  type TabGroup,
  type TabId,
} from "../../config/tabs";
import {
  contentToSearchText,
  contentToMarkdownText,
} from "../../utils/messageContent";
import { DEFAULT_CHAT_MODEL } from "../../constants/venice";
import { getConversationDisplayTitle } from "../../utils/conversationDisplayTitle";
import { CharacterAvatar } from "../characters/CharacterAvatar";
import { Meteocon } from "../ui/Meteocon";
import { CharacterCreatorMascot } from "../character-creator/CharacterCreatorMascot";

function ChatIcon() {
  return <Meteocon name="clear-day" size={20} />;
}
function CharacterChatsIcon() {
  return <Meteocon name="clear-night" size={20} />;
}
function CharacterCreatorIcon() {
  return <CharacterCreatorMascot size="nav" />;
}
function StatusIcon() {
  return <Meteocon name="humidity" size={20} />;
}
function ImageIcon() {
  return <Meteocon name="rainbow-clear" size={20} />;
}
function ImageInspectorIcon() {
  return <Meteocon name="compass" size={20} />;
}
function GalleryIcon() {
  return <Meteocon name="horizon" size={20} />;
}
function AudioIcon() {
  return <Meteocon name="wind" size={20} />;
}
function VideoIcon() {
  return <Meteocon name="partly-cloudy-day" size={20} />;
}
function MusicIcon() {
  return <Meteocon name="star" size={20} />;
}
function EmbedIcon() {
  return <Meteocon name="raindrop" size={20} />;
}
function WorkflowIcon() {
  return <Meteocon name="code-purple" size={20} />;
}
function HistoryIcon() {
  return <Meteocon name="time-morning" size={20} />;
}
function PlaygroundIcon() {
  return <Meteocon name="snowflake" size={20} />;
}
function SearchIcon() {
  return <Meteocon name="compass" size={20} />;
}
function CharactersIcon() {
  return <Meteocon name="thunderstorms" size={20} />;
}
function RpStudioIcon() {
  return <Meteocon name="tornado" size={20} />;
}
function SettingsIcon() {
  return <Meteocon name="barometer" size={20} />;
}
function PromptsIcon() {
  return <Meteocon name="code-green" size={20} />;
}
function SceneIcon() {
  return <Meteocon name="cloudy" size={20} />;
}
function PrivacyIcon() {
  return <Meteocon name="umbrella" size={20} />;
}
function DocumentsIcon() {
  return <Meteocon name="thermometer" size={20} />;
}

/**
 * Sidebar icon registry. Centralising this here keeps `App.tsx` and tests
 * out of the JSX-icon business and makes it trivial to swap an icon for a
 * future tab — just add an entry keyed by tab id.
 */
const TAB_ICONS: Record<TabId, () => React.JSX.Element> = {
  chat: ChatIcon,
  "character-chats": CharacterChatsIcon,
  history: HistoryIcon,
  image: ImageIcon,
  "image-inspector": ImageInspectorIcon,
  media: GalleryIcon,
  prompts: PromptsIcon,
  scenes: SceneIcon,
  gallery: GalleryIcon,
  audio: AudioIcon,
  music: MusicIcon,
  video: VideoIcon,
  embeddings: EmbedIcon,
  search: SearchIcon,
  characters: CharactersIcon,
  "character-creator": CharacterCreatorIcon,
  "rp-studio": RpStudioIcon,
  workflows: WorkflowIcon,
  documents: DocumentsIcon,
  privacy: PrivacyIcon,
  playground: PlaygroundIcon,
  settings: SettingsIcon,
  status: StatusIcon,
  // Unused legacy ids — fall back to a generic icon if ever rendered.
  models: EmbedIcon,
  batch: WorkflowIcon,
  diagnostics: StatusIcon,
};

const GROUP_ORDER: readonly TabGroup[] = [
  "conversation",
  "generate",
  "build",
  "system",
];
const MAX_CONVERSATION_SEARCH_RESULTS = 200;

export function buildConversationSearchText(
  conversation: Conversation,
): string {
  return [
    conversation.title,
    ...conversation.messages.flatMap((message) => [
      contentToSearchText(message.content),
      typeof message.reasoning_content === "string"
        ? message.reasoning_content
        : "",
    ]),
  ]
    .join("\n")
    .toLowerCase();
}

// navGroups calculation removed in favour of inline translation map

interface Props {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const { t: tRuntime } = useTranslation("common");
  const { t } = useTranslation("navigation");
  const activeTab = useSettingsStore((s) => s.activeTab);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const sidebarRef = useRef<HTMLElement>(null);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const redTeamMode = useSettingsStore((s) => s.redTeamMode);
  const setRedTeamMode = useSettingsStore((s) => s.setRedTeamMode);
  const localFamilySafeModeEnabled = useSettingsStore(
    (s) => s.localFamilySafeModeEnabled,
  );
  const setLocalFamilySafeModeEnabled = useSettingsStore(
    (s) => s.setLocalFamilySafeModeEnabled,
  );
  const showInspector = useSettingsStore((s) => s.showInspector);
  const setShowInspector = useSettingsStore((s) => s.setShowInspector);
  const conversationSummaries = useChatStore(
    useShallow(selectConversationSummaries),
  );
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const activeProjectId = useSettingsStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  // Derive active (non-archived) list via useMemo over the stable projects array ref
  // from the store. Using (s) => s.activeProjects() inside useProjectStore selector
  // allocates a fresh array on every snapshot/equality check and triggers
  // "Maximum update depth" + "getSnapshot should be cached" during passive mount
  // effects in React 19 + jsdom (observed in full serial and isolated sidebar mounts).
  const activeProjectList = useMemo(
    () => projects.filter((p) => !p.archivedAt),
    [projects],
  );

  // Note: ensureProjectsLoaded (with default) is called from App root effect to avoid multiple effects in sidebar mounts/tests that could contribute to update depth.
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const createConversation = useChatStore((s) => s.createConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat);
  const [search, setSearch] = useState("");
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [pendingFamilySafeMode, setPendingFamilySafeMode] = useState<boolean | null>(null);
  const { masterPasswordSet } = useProfileStore();
  const chatOptionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleRedTeamMode = () => {
    const enabled = !redTeamMode;
    setRedTeamMode(enabled);
    if (enabled) setShowInspector(true);
    toast.success(
      enabled
        ? t("inspector.enabled", "Traffic Inspector enabled")
        : t("inspector.disabled", "Traffic Inspector disabled"),
      enabled
        ? t(
            "inspector.enabledDetail",
            "Request/response diagnostics and safety decisions are visible.",
          )
        : t("inspector.disabledDetail", "Diagnostic traffic inspection is hidden."),
    );
  };

  const applyFamilySafeModeToggle = async (enabled: boolean, masterPassword?: string) => {
    setLocalFamilySafeModeEnabled(enabled);
    if (isElectron()) {
      const result = await desktopSafety.setFamilySafeMode(enabled, masterPassword);
      if (!result.ok) {
        setLocalFamilySafeModeEnabled(!enabled);
        toast.error(
          t("familySafeMode.notSaved", "Family Safe Mode was not saved"),
          result.error ||
            t("familySafeMode.writeFailed", "Config write failed."),
        );
        return;
      }
      await reloadConfig();
    }
    // Note: the local family filter and Venice API's `safe_mode` parameter
    // are independent. Toggling this switch does NOT change Venice API
    // Safe Mode; see Settings → Safety for that control.
    toast.success(
      enabled
        ? t(
            "familySafeMode.enabledSuccess",
            "Family Safe Mode enabled — local family filter runs on every prompt",
          )
        : t(
            "familySafeMode.disabledSuccess",
            "Adult Mode enabled — local family filter is skipped",
          ),
    );
  };

  const toggleFamilySafeMode = () => {
    const enabled = !localFamilySafeModeEnabled;
    if (isElectron()) {
      // Family Safe Mode changes require master-password verification. The
      // dedicated safety IPC enforces this; we collect the password before
      // applying the optimistic UI update so a failed verification leaves
      // renderer and main-process state in sync.
      setPendingFamilySafeMode(enabled);
      setShowPasswordDialog(true);
      return;
    }
    void applyFamilySafeModeToggle(enabled);
  };

  const deferredSearch = useDeferredValue(search);
  const standardConversations = useMemo(
    () =>
      conversationSummaries.filter(
        (conversation) => conversation.kind === "standard",
      ),
    [conversationSummaries],
  );
  const searchIndex = useMemo(() => {
    if (!historyExpanded || !deferredSearch.trim()) return [];
    return standardConversations.map((conversation) => ({
      conversation,
      text: conversation.searchablePreview,
    }));
  }, [standardConversations, deferredSearch, historyExpanded]);
  const searchResult = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query)
      return {
        conversations: standardConversations.slice(
          0,
          MAX_CONVERSATION_SEARCH_RESULTS,
        ),
        totalMatches: standardConversations.length,
      };

    const matches: ConversationSummary[] = [];
    let totalMatches = 0;
    for (const entry of searchIndex) {
      if (!entry.text.includes(query)) continue;
      totalMatches += 1;
      if (matches.length < MAX_CONVERSATION_SEARCH_RESULTS)
        matches.push(entry.conversation);
    }
    return { conversations: matches, totalMatches };
  }, [deferredSearch, searchIndex, standardConversations]);
  const filtered = searchResult.conversations;

  const handleDelete = async (conv: ConversationSummary) => {
    const durableConversation = useChatStore
      .getState()
      .conversations.find((candidate) => candidate.id === conv.id);
    await deleteConversation(conv.id);
    toast.error(
      t("chat.deleted", "Conversation deleted"),
      conv.title || t("chat.untitled", "Untitled"),
      {
        label: t("chat.undo", "Undo"),
        onClick: async () => {
          // Persist the undo: re-insert the conversation at the top of the
          // list AND write it back through the same IPC save path so the
          // main-process file on disk matches the renderer state. A
          // previous version only mutated the in-memory Zustand state,
          // which would be lost on the next reload because the canonical
          // source of truth is the JSON file under `chat-history/`.
          try {
            if (!durableConversation)
              throw new Error(
                t(
                  "chat.restoreUnavailable",
                  "Conversation is no longer available to restore.",
                ),
              );
            await useChatStore
              .getState()
              .restoreConversation(durableConversation);
            toast.success(t("chat.restored", "Conversation restored"));
          } catch (err) {
            toast.fromError(err, t("chat.restoreFailed", "Failed to restore"));
          }
        },
      },
    );
  };

  const exportConversation = (summary: ConversationSummary) => {
    const conv = useChatStore
      .getState()
      .conversations.find((candidate) => candidate.id === summary.id);
    if (!conv) return;
    const md = conversationToMarkdown(conv);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(conv.title || "conversation").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const startNewChat = () => {
    createConversation(selectedModel || DEFAULT_CHAT_MODEL);
    setActiveTab("chat");
    setChatOptionsOpen(false);
    onMobileClose?.();
  };

  const activeConversation = conversationSummaries.find(
    (conversation) => conversation.id === activeConversationId,
  );

  useEffect(() => {
    if (!chatOptionsOpen) return;
    const closeOnPointerDown = (event: MouseEvent) => {
      if (!chatOptionsRef.current?.contains(event.target as Node))
        setChatOptionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOptionsOpen(false);
    };
    document.addEventListener("mousedown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [chatOptionsOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onMobileClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, onMobileClose]);

  const expanded = sidebarOpen || mobileOpen;

  useEffect(() => {
    sidebarRef.current?.style.setProperty(
      "--sidebar-width",
      `${sidebarOpen ? clampSidebarWidth(sidebarWidth) : SIDEBAR_COLLAPSED_WIDTH}px`,
    );
  }, [sidebarOpen, sidebarWidth]);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sidebarOpen) return;
    dragStartRef.current = { x: event.clientX, width: sidebarWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("select-none");
    setDragging(true);
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const next = clampSidebarWidth(start.width + event.clientX - start.x);
    sidebarRef.current?.style.setProperty("--sidebar-width", `${next}px`);
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (start) setSidebarWidth(clampSidebarWidth(start.width + event.clientX - start.x));
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove("select-none");
    setDragging(false);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = sidebarWidth - step;
    if (event.key === "ArrowRight") next = sidebarWidth + step;
    if (event.key === "Home") next = SIDEBAR_MIN_WIDTH;
    if (event.key === "End") next = SIDEBAR_MAX_WIDTH;
    if (next === null) return;
    event.preventDefault();
    setSidebarWidth(next);
  };

  return (
    <>
      <aside
        ref={sidebarRef}
        aria-label={tRuntime(
          "runtimeGenerated.components.layout.sidebar.attribute.primaryNavigation",
        )}
        className={cn(
          "flex flex-col h-full min-h-0 mesh-surface mesh-sidebar soft-separator-x shell-region",
          "fixed top-0 left-0 z-40 w-72 h-[100dvh] md:static md:h-full md:w-[var(--sidebar-width,256px)] md:shrink-0",
          mobileOpen
            ? "translate-x-0 visible pointer-events-auto"
            : "-translate-x-full invisible pointer-events-none md:translate-x-0 md:visible md:pointer-events-auto",
        )}
      >
      <div
        className={cn(
          "flex items-center gap-2.5 h-14 shrink-0 soft-separator-y",
          expanded ? "px-4" : "md:px-3 md:justify-center px-4",
        )}
      >
        <VeniceLogo size={20} />
        {expanded && <VeniceWordmark className="vf-body tracking-tight" />}
        <button
          onClick={onMobileClose}
          aria-label={tRuntime(
            "runtimeGenerated.components.layout.sidebar.attribute.closeMenu",
          )}
          className="md:hidden ml-auto p-2 text-text-secondary hover:text-text-primary rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            width="14"
            height="14"
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
      </div>

      {/* Project Workspace (polished Phase 1 slice).
          Real switcher (select), create, rename, archive, reference-safe delete.
          New assets (e.g. chats) default to active project via projectRefs.
          Default project is ensured on load (safe for fresh/corrupt/migration). */}
      {expanded && (
        <div className="px-3 pt-1 pb-2 soft-separator-y shrink-0">
          <div className="vf-tag tracking-[0.08em] text-text-muted mb-1.5 px-1 flex items-center justify-between">
            <span>{t("project.label", "Project")}</span>
            <button
              onClick={async () => {
                const name = (
                  await askText({
                    title: t("project.newProjectName", "New project name"),
                    actionLabel: t("project.create", "Create"),
                    validate: (value) =>
                      value.trim()
                        ? null
                        : t(
                            "project.enterProjectName",
                            "Enter a project name.",
                          ),
                  })
                )?.trim();
                if (!name) return;
                try {
                  const p = await useProjectStore
                    .getState()
                    .createProject(name);
                  useProjectStore.getState().setActiveProject(p.id);
                  toast.success(
                    t("project.created", {
                      defaultValue: 'Created "{{name}}"',
                      name: p.name,
                    }),
                  );
                } catch (e: unknown) {
                  const msg =
                    e && typeof e === "object" && "message" in e
                      ? String((e as { message?: unknown }).message)
                      : t("project.createFailed", "Failed to create project");
                  toast.error(msg);
                }
              }}
              className="vf-meta normal-case tracking-normal border border-transparent bg-surface-elevated rounded px-1.5 py-0.5 hover:border-text-muted"
              title={t("project.new", "+ New")}
            >
              {t("project.new", "+ New")}
            </button>
          </div>

          <select
            value={activeProjectId || ""}
            onChange={(e) => {
              const id = e.currentTarget.value || null;
              useProjectStore.getState().setActiveProject(id);
            }}
            className="w-full vf-meta rounded-md mesh-input px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={t("project.activeProject", "Active project")}
            title={t("project.label", "Switch active project")}
          >
            <option value="">{t("project.allProjects", "All Projects")}</option>
            {activeProjectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={startNewChat}
            className="mesh-input mt-2 flex w-full items-center justify-center rounded-lg px-3 py-2 vf-meta font-semibold text-text-primary hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title={t("chat.newChatShortcut", "New chat (⌘N)")}
          >
            {t("chat.newChatAction", "+ New chat")}
          </button>

          {activeProjectId && (
            <div className="mt-1.5 flex gap-1.5 vf-meta">
              <button
                onClick={async () => {
                  const current = projects.find(
                    (p) => p.id === activeProjectId,
                  );
                  if (!current) return;
                  const name = (
                    await askText({
                      title: t("project.rename", "Rename project"),
                      initialValue: current.name,
                      actionLabel: t("project.renameAction", "Rename"),
                      validate: (value) =>
                        value.trim()
                          ? null
                          : t(
                              "project.enterProjectName",
                              "Enter a project name.",
                            ),
                    })
                  )?.trim();
                  if (!name || name === current.name) return;
                  await useProjectStore
                    .getState()
                    .renameProject(activeProjectId, name);
                  toast.success(t("project.renamed", "Project renamed"));
                }}
                className="rounded border border-transparent bg-surface-elevated px-1.5 py-0.5 hover:border-text-muted"
              >
                {t("project.renameAction", "Rename")}
              </button>
              <button
                onClick={async () => {
                  if (!activeProjectId) return;
                  const shouldArchive = await askDecision({
                    title: t("project.archivePrompt", "Archive project?"),
                    detail: t(
                      "project.archiveDetail",
                      "Media and conversation references will be preserved.",
                    ),
                    actionLabel: t("project.archiveAction", "Archive"),
                  });
                  if (!shouldArchive) return;
                  await useProjectStore
                    .getState()
                    .archiveProject(activeProjectId);
                  toast.success(t("project.archived", "Project archived"));
                }}
                className="rounded border border-transparent bg-surface-elevated px-1.5 py-0.5 hover:border-text-muted"
              >
                {t("project.archiveAction", "Archive")}
              </button>
              <button
                onClick={async () => {
                  if (!activeProjectId) return;
                  const shouldDelete = await askDecision({
                    title: t("project.deletePrompt", "Delete project?"),
                    detail: t(
                      "project.deleteDetail",
                      "Projects referenced by media or conversations must be archived instead.",
                    ),
                    actionLabel: t("project.deleteAction", "Delete"),
                    danger: true,
                  });
                  if (!shouldDelete) return;
                  const ok = await useProjectStore
                    .getState()
                    .deleteProject(activeProjectId);
                  if (ok)
                    toast.success(t("project.deleted", "Project deleted"));
                  else
                    toast.error(
                      t(
                        "project.deleteError",
                        "Project cannot be deleted while media or conversations reference it. Archive it instead.",
                      ),
                    );
                }}
                className="rounded border border-transparent bg-surface-elevated px-1.5 py-0.5 hover:border-text-muted text-danger"
              >
                {t("project.deleteAction", "Delete")}
              </button>
            </div>
          )}
          <div className="mt-1 px-1 vf-tag text-text-muted/60">
            {t(
              "project.encryptionNote",
              "Projects are IDB-encrypted • generated items use the active project",
            )}
          </div>
        </div>
      )}

      {/* Scrollable middle section: nav + history share the remaining height. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <nav
          aria-label={tRuntime(
            "runtimeGenerated.components.layout.sidebar.attribute.sections",
          )}
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 py-3"
        >
          {GROUP_ORDER.map((group) => {
            const groupLabel = t(`groups.${group}`, {
              defaultValue: TAB_GROUP_LABELS[group],
            });
            const items = TAB_REGISTRY.filter((t) => t.group === group);
            return (
              <div
                key={group}
                className={cn(expanded ? "px-2" : "md:px-1.5 px-2")}
              >
                {expanded && (
                  <div className="px-2 pb-1.5 vf-tag tracking-[0.1em] text-text-muted">
                    {groupLabel}
                  </div>
                )}
                <div className="flex flex-col gap-px">
                  {items.map((tab) => {
                    const id = tab.id;
                    const isActive = activeTab === id;
                    const tabLabel = t(`tabs.${id}.label`);
                    const Icon = TAB_ICONS[id] ?? ChatIcon;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setActiveTab(id);
                          onMobileClose?.();
                        }}
                        aria-current={isActive ? "page" : undefined}
                        title={!expanded ? tabLabel : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-lg vf-meta transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 cursor-pointer",
                          expanded
                            ? "px-2.5 py-2"
                            : "md:px-0 md:py-2 md:justify-center px-2.5 py-2",
                          isActive
                            ? "bg-accent/10 text-accent font-semibold"
                            : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40",
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-accent" />
                        )}
                        <Icon />
                        {expanded && (
                          <span className="font-medium">{tabLabel}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {expanded && activeTab === "chat" && (
          <div className="flex flex-col flex-1 min-h-0 soft-separator-y">
            <div
              className="relative flex items-center justify-between px-3 pt-3 pb-1.5 shrink-0"
              ref={chatOptionsRef}
            >
              <button
                type="button"
                onClick={() => setHistoryExpanded((open) => !open)}
                aria-expanded={historyExpanded}
                aria-controls="chat-history-list"
                aria-label={
                  historyExpanded
                    ? t("chat.collapseHistory", "Collapse History")
                    : t("chat.expandHistory", "Expand History")
                }
                title={
                  historyExpanded
                    ? t("chat.collapseHistory", "Collapse History")
                    : t("chat.expandHistory", "Expand History")
                }
                className="flex items-center gap-1.5 vf-tag tracking-[0.1em] text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded px-1 -ml-1 cursor-pointer"
              >
                {t("chat.history", "History")}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${historyExpanded ? "" : "-rotate-90"}`}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setChatOptionsOpen((open) => !open)}
                aria-label={t("chat.options", "Chat options")}
                aria-haspopup="menu"
                aria-expanded={chatOptionsOpen}
                className="mesh-input text-text-secondary hover:text-text-primary p-1.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
                title={t("chat.options", "Chat options")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
              {chatOptionsOpen && (
                <div
                  role="menu"
                  aria-label={t("chat.options", "Chat options")}
                  className="mesh-panel absolute right-3 top-10 z-50 min-w-48 rounded-xl p-1.5 vf-meta shadow-xl"
                >
                  <button
                    role="menuitem"
                    className="menu-action"
                    onClick={startNewChat}
                  >
                    {t("chat.newChat", "New chat")}
                  </button>
                  <button
                    role="menuitem"
                    className="menu-action"
                    onClick={() => {
                      setChatOptionsOpen(false);
                      searchInputRef.current?.focus();
                    }}
                  >
                    {t("chat.searchChats", "Search chats")}
                  </button>
                  <button
                    role="menuitem"
                    className="menu-action"
                    disabled={!activeConversation}
                    onClick={() => {
                      if (activeConversation)
                        exportConversation(activeConversation);
                      setChatOptionsOpen(false);
                    }}
                  >
                    {t("chat.exportActive", "Export active chat")}
                  </button>
                  <button
                    role="menuitem"
                    className="menu-action text-danger"
                    disabled={!activeConversation}
                    onClick={async () => {
                      if (activeConversation) {
                        const shouldDelete = await askDecision({
                          title: t("chat.deletePrompt", "Delete chat?"),
                          detail:
                            activeConversation.title ||
                            t("chat.untitled", "Untitled"),
                          actionLabel: t("chat.deleteAction", "Delete"),
                          danger: true,
                        });
                        if (shouldDelete) void handleDelete(activeConversation);
                      }
                      setChatOptionsOpen(false);
                    }}
                  >
                    {t("chat.deleteActive", "Delete active chat")}
                  </button>
                  <button
                    role="menuitem"
                    className="menu-action"
                    disabled={!activeConversationId}
                    onClick={() => {
                      setActiveConversation(null);
                      setChatOptionsOpen(false);
                    }}
                  >
                    {t(
                      "chat.clearActiveSelection",
                      "Clear active chat selection",
                    )}
                  </button>
                </div>
              )}
            </div>
            {historyExpanded && (
              <div
                id="chat-history-list"
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="px-3 pb-2 shrink-0">
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("chat.searchPlaceholder", "Search…")}
                    aria-label={t("chat.searchAria", "Search conversations")}
                    className="mesh-input w-full rounded-md px-2.5 py-1 vf-meta text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                  />
                  {deferredSearch !== search && (
                    <div
                      role="status"
                      className="pt-1 vf-meta text-text-muted"
                    >
                      {t("chat.searching", "Searching…")}
                    </div>
                  )}
                  {deferredSearch.trim() &&
                    searchResult.totalMatches > filtered.length && (
                      <div
                        role="status"
                        className="pt-1 vf-meta text-text-muted"
                      >
                        {t("chat.showingMatches", {
                          defaultValue:
                            "Showing first {{count}} of {{total}} matches",
                          count: filtered.length,
                          total: searchResult.totalMatches,
                        })}
                      </div>
                    )}
                </div>
                <div
                  className="flex-1 overflow-y-auto px-2 pb-3 min-h-0"
                  role="list"
                >
                  {filtered.length === 0 ? (
                    <div className="px-2 py-6 vf-meta text-text-muted text-center">
                      {deferredSearch
                        ? t("chat.noMatches", "No matches")
                        : t("chat.noConversations", "No conversations yet")}
                    </div>
                  ) : (
                    filtered.map((conv) => (
                      <ConversationRow
                        key={conv.id}
                        conv={conv}
                        isActive={conv.id === activeConversationId}
                        onSelect={() => setActiveConversation(conv.id)}
                        onDelete={() => handleDelete(conv)}
                        onExport={() => exportConversation(conv)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="shrink-0 soft-separator-y p-3 gap-2 flex flex-col">
          {/* Traffic Inspector controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="vf-tag tracking-wider text-text-muted leading-none">
                {t("inspector.title", "Traffic Inspector")}
              </span>
              <p className="vf-meta leading-snug text-text-muted mt-0.5 [@media(max-height:800px)]:hidden">
                {t(
                  "inspector.description",
                  "Shows diagnostics and local safety decisions.",
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={redTeamMode}
              onClick={toggleRedTeamMode}
              className={cn(
                "w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0",
                redTeamMode ? "bg-accent" : "bg-border",
              )}
              aria-label={t("inspector.toggle", "Toggle Traffic Inspector")}
            >
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-full bg-surface-elevated shadow-sm absolute top-[1px] transition-all",
                  redTeamMode ? "left-4" : "left-[1px]",
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="min-w-0">
              <span className="vf-tag tracking-wider text-text-muted leading-none">
                {t("familySafeMode.title", "Family Safe Mode")}
              </span>
              <p className="vf-meta leading-snug text-text-muted mt-0.5 [@media(max-height:800px)]:hidden">
                {localFamilySafeModeEnabled
                  ? t("familySafeMode.on", "ON: local family filter runs.")
                  : t(
                      "familySafeMode.off",
                      "OFF: Optional family layer off; child-safety remains active.",
                    )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localFamilySafeModeEnabled}
              onClick={() => void toggleFamilySafeMode()}
              className={cn(
                "w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0",
                localFamilySafeModeEnabled ? "bg-accent" : "bg-border",
              )}
              aria-label={t("familySafeMode.toggle", "Toggle Family Safe Mode")}
              title={
                localFamilySafeModeEnabled
                  ? t(
                      "familySafeMode.enabledTooltip",
                      "Family Safe Mode enabled",
                    )
                  : t(
                      "familySafeMode.disabledTooltip",
                      "Optional family layer disabled; child-safety remains active",
                    )
              }
            >
              <div
                className={cn(
                  "w-3.5 h-3.5 rounded-full bg-surface-elevated shadow-sm absolute top-[1px] transition-all",
                  localFamilySafeModeEnabled ? "left-4" : "left-[1px]",
                )}
              />
            </button>
          </div>

          <button
            onClick={() => setShowInspector(!showInspector)}
            className={cn(
              "flex items-center justify-center gap-1.5 w-full py-1.5 px-2 border rounded-md vf-meta font-semibold transition-colors cursor-pointer shrink-0",
              showInspector
                ? "bg-accent/10 border-accent text-accent"
                : "border-border text-text-secondary hover:border-accent hover:text-accent",
            )}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>
              {showInspector
                ? t("inspector.hide", "Hide Inspector")
                : t("inspector.show", "Show Inspector")}
            </span>
          </button>
          <div className="pt-2 vf-meta text-text-secondary flex flex-col gap-1 shrink-0 [@media(max-height:800px)]:hidden">
            <div className="flex justify-between items-center leading-none">
              <span>{t("chat.newChat", "New chat")}</span>
              <kbd className="font-mono text-text-muted">⌘N</kbd>
            </div>
            <div className="flex justify-between items-center leading-none">
              <span>{t("keyboardShortcuts.switchTab", "Switch tab")}</span>
              <kbd className="font-mono text-text-muted">⌘1-8</kbd>
            </div>
          </div>
        </div>
      )}
      {sidebarOpen && (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={tRuntime("layout.sidebar.resize")}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={clampSidebarWidth(sidebarWidth)}
          title={tRuntime("layout.sidebar.resize")}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            "absolute inset-y-0 right-0 z-20 hidden w-2 translate-x-1/2 cursor-col-resize md:block",
            "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border",
            "hover:after:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:after:bg-accent",
            dragging && "after:bg-accent",
          )}
        />
      )}
    </aside>
    {showPasswordDialog && pendingFamilySafeMode !== null && (
      <MasterPasswordDialog
        isOpen={showPasswordDialog}
        mode={masterPasswordSet ? "verify" : "setup"}
        onClose={() => {
          setShowPasswordDialog(false);
          setPendingFamilySafeMode(null);
        }}
        onSuccess={(password) => {
          setShowPasswordDialog(false);
          const enabled = pendingFamilySafeMode;
          setPendingFamilySafeMode(null);
          void applyFamilySafeModeToggle(enabled, password);
        }}
      />
    )}
  </>
  );
}

function ConversationRow({
  conv,
  isActive,
  onSelect,
  onDelete,
  onExport,
}: {
  conv: ConversationSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  const { t } = useTranslation("navigation");
  const [confirming, setConfirming] = useState(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  const startConfirm = () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setConfirming(true);
    confirmTimeoutRef.current = setTimeout(() => setConfirming(false), 2500);
  };

  const cancelConfirm = () => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    setConfirming(false);
  };

  return (
    <div
      role="listitem"
      className={cn(
        "group relative flex items-center gap-1 px-2.5 py-1.5 rounded-md vf-meta cursor-pointer transition-colors",
        isActive
          ? "bg-accent/15 text-accent font-semibold"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
        className="min-w-0 flex flex-1 items-center gap-2 truncate text-left rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      >
        {conv.character && (
          <CharacterAvatar
            character={conv.character}
            cacheKey={`sidebar-${conv.id}`}
            size="sm"
          />
        )}
        <span className="truncate">{getConversationDisplayTitle(conv)}</span>
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
          aria-label={t("chat.exportAsMarkdown", "Export as Markdown")}
          title={t("chat.exportAsMarkdown", "Export as Markdown")}
          className="text-text-secondary hover:text-text-primary p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>
        {confirming ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              cancelConfirm();
            }}
            aria-label={tRuntime(
              "runtimeGenerated.components.layout.sidebar.attribute.confirmDelete",
            )}
            className="text-danger hover:underline px-1.5 vf-meta font-semibold rounded cursor-pointer"
          >
            {t("chat.deletePrompt", "Delete?")}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startConfirm();
            }}
            aria-label={t("chat.deleteAction", "Delete")}
            title={t("chat.deleteAction", "Delete")}
            className="text-text-secondary hover:text-danger p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function conversationToMarkdown(conv: Conversation): string {
  const lines: string[] = [
    `# ${getConversationDisplayTitle(conv)}`,
    "",
    `_Model: ${conv.model} · Created: ${new Date(conv.createdAt).toISOString()}_`,
    "",
  ];
  for (const m of conv.messages) {
    lines.push(
      `## ${m.role === "user" ? "You" : m.role === "assistant" ? "Assistant" : "System"}`,
    );
    lines.push(contentToMarkdownText(m.content));
    lines.push("");
  }
  return lines.join("\n");
}
