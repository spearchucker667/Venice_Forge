/** @fileoverview Phase 2D — Prompt Library view.
 *
 * Renders the user's saved prompts as a list + detail editor. The view
 * is a pure consumer of `usePromptLibraryStore`; persistence is handled
 * by the store so the view can re-render on any store change without
 * a separate refetch.
 *
 * Behaviour:
 *  - List is filterable by kind, scope, tag, favorite, and search text.
 *  - The detail editor edits metadata, content, negative content, tags,
 *    and lets the user add / switch versions.
 *  - Delete / archive uses the same confirm-gated UX as the Media
 *    Studio: the user has to type the prompt title to confirm a
 *    delete, archive is a single click that toggles the flag.
 *  - The view never copies an API key / secret into a prompt; the
 *    `redactPromptSecrets` helper in the type module handles the
 *    paste / save path so secret detection stays in one place.
 */

import { useEffect, useMemo, useState } from "react";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import type { WorkflowStep } from "../../types/workflow";
import type { PromptKind, PromptLibraryItem, PromptScope, PromptVersion } from "../../types/prompt-library";
import { useSettingsStore } from "../../stores/settings-store";
import { useProjectStore } from "../../stores/project-store";
import { toast } from "../../stores/toast-store";
import { copyText } from "../../stores/media-send-to";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";
import { useChatStore } from "../../stores/chat-store";
import { PromptCreateModal } from "./PromptCreateModal";

const KIND_OPTIONS: Array<{ value: PromptKind; label: string }> = [
  { value: "image", label: "Image" },
  { value: "negative", label: "Negative" },
  { value: "chat", label: "Chat" },
  { value: "system", label: "System" },
  { value: "research", label: "Research" },
  { value: "character", label: "Character" },
  { value: "workflow", label: "Workflow" },
  { value: "recipe", label: "Recipe" },
  { value: "general", label: "General" },
];

type SortKey = "newest" | "oldest" | "title" | "kind" | "favorite";

export function reconcileSelectedPrompt(
  selectedId: string | null,
  visiblePrompts: readonly PromptLibraryItem[],
): string | null {
  if (selectedId && visiblePrompts.some((prompt) => prompt.id === selectedId)) return selectedId;
  return visiblePrompts[0]?.id ?? null;
}

export function PromptLibraryView() {
  const ensureLoaded = usePromptLibraryStore((s) => s.ensureLoaded);
  const hydrated = usePromptLibraryStore((s) => s.hydrated);
  const prompts = usePromptLibraryStore((s) => s.prompts);
  const activePromptId = usePromptLibraryStore((s) => s.activePromptId);
  const setActivePrompt = usePromptLibraryStore((s) => s.setActivePrompt);
  const createPrompt = usePromptLibraryStore((s) => s.createPrompt);
  const updatePrompt = usePromptLibraryStore((s) => s.updatePrompt);
  const addPromptVersion = usePromptLibraryStore((s) => s.addPromptVersion);
  const setCurrentVersion = usePromptLibraryStore((s) => s.setCurrentVersion);
  const toggleFavorite = usePromptLibraryStore((s) => s.toggleFavorite);
  const archivePrompt = usePromptLibraryStore((s) => s.archivePrompt);
  const unarchivePrompt = usePromptLibraryStore((s) => s.unarchivePrompt);
  const deletePrompt = usePromptLibraryStore((s) => s.deletePrompt);
  const { createWorkflow, setActiveWorkflow } = useWorkflowTemplateStore();
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const activeProjectId = useSettingsStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [kindFilter, setKindFilter] = useState<PromptKind | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<PromptScope | "all">("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prompts
      .filter((p) => (showArchived ? true : p.archivedAt === null))
      .filter((p) => (kindFilter === "all" ? true : p.kind === kindFilter))
      .filter((p) => {
        if (scopeFilter === "all") return true;
        if (scopeFilter === "global") return p.scope === "global";
        return (
          p.scope === "project" &&
          (p.projectId === activeProjectId ||
            (activeProjectId === null && p.projectId === null))
        );
      })
      .filter((p) => (favoritesOnly ? p.favorite : true))
      .filter((p) => (tagFilter ? p.tags.includes(tagFilter.toLowerCase()) : true))
      .filter((p) => {
        if (!q) return true;
        if (p.title.toLowerCase().includes(q)) return true;
        if ((p.description ?? "").toLowerCase().includes(q)) return true;
        if (p.versions.some((v) => v.content.toLowerCase().includes(q))) return true;
        return false;
      })
      .sort((a, b) => {
        switch (sort) {
          case "newest":
            return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
          case "oldest":
            return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
          case "title":
            return a.title.localeCompare(b.title);
          case "kind":
            return a.kind.localeCompare(b.kind);
          case "favorite":
            return Number(b.favorite) - Number(a.favorite);
        }
      });
  }, [
    prompts,
    showArchived,
    kindFilter,
    scopeFilter,
    activeProjectId,
    favoritesOnly,
    tagFilter,
    query,
    sort,
  ]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of prompts) for (const t of p.tags) set.add(t);
    return Array.from(set).sort();
  }, [prompts]);

  const active = useMemo(
    () => filtered.find((p) => p.id === activePromptId) ?? null,
    [filtered, activePromptId],
  );

  useEffect(() => {
    const reconciled = reconcileSelectedPrompt(activePromptId, filtered);
    if (reconciled !== activePromptId) setActivePrompt(reconciled);
  }, [activePromptId, filtered, setActivePrompt]);

  return (
    <div className="flex h-full w-full min-h-0 text-text-primary">
      <aside
        className="w-[clamp(280px,30%,400px)] shrink-0 soft-separator-x mesh-surface flex flex-col min-h-0"
        data-testid="prompt-library-list-pane"
      >
        <div className="px-3 py-2 soft-separator-y mesh-header mesh-surface space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold">Prompt Library</h2>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsCreateModalOpen(true)
                }
              }}
              className="ml-auto rounded-md border border-border px-2 py-1 text-[11.5px] hover:border-accent hover:text-accent"
              data-testid="prompt-library-new"
            >
              New
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] focus:outline-none focus:border-accent"
            data-testid="prompt-library-search"
          />
          <div className="flex flex-wrap gap-1.5">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as PromptKind | "all")}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
              data-testid="prompt-library-kind-filter"
            >
              <option value="all">All kinds</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as PromptScope | "all")}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
              data-testid="prompt-library-scope-filter"
            >
              <option value="all">All scopes</option>
              <option value="global">Global</option>
              <option value="project">Project</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
              data-testid="prompt-library-sort"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
              <option value="kind">Kind</option>
              <option value="favorite">Favorite</option>
            </select>
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
                data-testid="prompt-library-tag-filter"
              >
                <option value="">All tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setFavoritesOnly((value) => !value)}
              aria-pressed={favoritesOnly}
              className={`rounded-md border px-2 py-0.5 text-[11.5px] ${
                favoritesOnly
                  ? "border-amber-500/40 text-amber-300"
                  : "border-border text-text-secondary hover:border-accent hover:text-accent"
              }`}
              data-testid="prompt-library-favorites-filter"
            >
              ★ Favorites
            </button>
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              aria-pressed={showArchived}
              className={`rounded-md border px-2 py-0.5 text-[11.5px] ${
                showArchived
                  ? "border-accent text-accent"
                  : "border-border text-text-secondary hover:border-accent hover:text-accent"
              }`}
              data-testid="prompt-library-archive-filter"
            >
              Archive
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" data-testid="prompt-library-list">
          {!hydrated ? (
            <p className="p-3 text-text-muted text-[12px]">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-text-muted text-[12px]" data-testid="prompt-library-empty">
              {prompts.length === 0
                ? <>
                    <p>No saved prompts yet.</p>
                    <p className="mt-1">Click the <strong className="text-text-primary">New</strong> button above to create your first prompt.</p>
                  </>
                : "No prompts match the current filters."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActivePrompt(p.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-background ${
                      p.id === activePromptId ? "bg-background" : ""
                    }`}
                    data-testid={`prompt-library-item-${p.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] truncate">
                        {p.favorite ? "★ " : ""}
                        {p.title}
                      </span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded border border-border">
                        {p.kind}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 truncate">
                      {p.scope === "project" ? "Project" : "Global"} ·{" "}
                      {p.versions.length} version{p.versions.length === 1 ? "" : "s"}
                    </div>
                    {p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.tags.map((t) => (
                          <span key={t} className="text-[9.5px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full border border-accent/20">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <section className="flex-1 min-w-0 flex flex-col">
        {active ? (
          <PromptDetail
            key={active.id}
            item={active}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            onUpdate={async (patch) => {
              await updatePrompt(active.id, patch);
            }}
            onAddVersion={async (input) => {
              await addPromptVersion(active.id, input);
              toast.success("New version saved");
            }}
            onSetCurrentVersion={async (versionId) => {
              await setCurrentVersion(active.id, versionId);
            }}
            onToggleFavorite={async () => {
              await toggleFavorite(active.id);
            }}
            onArchive={async () => {
              if (active.archivedAt) await unarchivePrompt(active.id);
              else await archivePrompt(active.id);
            }}
            onDelete={async () => {
              const deletedIndex = filtered.findIndex((prompt) => prompt.id === active.id);
              const replacement = filtered[deletedIndex + 1]?.id
                ?? filtered[deletedIndex - 1]?.id
                ?? null;
              await deletePrompt(active.id);
              setActivePrompt(replacement);
              toast.success("Prompt deleted");
            }}
            onCreateWorkflow={async () => {
              const w = await createWorkflow({
                title: `Workflow: ${active.title}`,
                steps: [
                  {
                    kind: "prompt",
                    target: "chat",
                    title: active.title,
                    ref: { promptId: active.id },
                    enabled: true,
                  } as WorkflowStep,
                ],
                source: { type: "prompt", sourceId: active.id },
              });
              setActiveWorkflow(w.id);
              setActiveTab("workflows");
              toast.success("Workflow created");
            }}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center text-text-muted text-[12.5px]"
            data-testid="prompt-library-empty-detail"
          >
            {hydrated && prompts.length > 0
              ? "Select a prompt to view its details."
              : "No prompt selected. Create a new one to get started."}
          </div>
        )}
      </section>
      {isCreateModalOpen && (
        <PromptCreateModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={async (data) => {
            const created = await createPrompt({
              ...data,
              source: { type: "manual" },
            });
            setActivePrompt(created.id);
            toast.success("Prompt created");
          }}
        />
      )}
    </div>
  );
}

interface PromptDetailProps {
  item: PromptLibraryItem;
  projects: Array<{ id: string; name: string }>;
  onUpdate: (patch: {
    title?: string;
    description?: string;
    kind?: PromptKind;
    tags?: string[];
    favorite?: boolean;
    archivedAt?: string | null;
    modelHints?: string[];
  }) => Promise<void>;
  onAddVersion: (input: {
    content: string;
    negativeContent?: string;
    notes?: string;
    sourceType?: "manual" | "chat" | "image" | "media" | "recipe" | "research" | "import" | "system";
    sourceId?: string;
  }) => Promise<void>;
  onSetCurrentVersion: (versionId: string) => Promise<void>;
  onToggleFavorite: () => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  onCreateWorkflow: () => Promise<void>;
}

function PromptDetail(props: PromptDetailProps) {
  const { item, projects, onUpdate, onAddVersion, onSetCurrentVersion, onToggleFavorite, onArchive, onDelete, onCreateWorkflow } = props;
  const current: PromptVersion =
    item.versions.find((v) => v.id === item.currentVersionId) ??
    item.versions[item.versions.length - 1]!;

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [kind, setKind] = useState<PromptKind>(item.kind);
  const [tagsInput, setTagsInput] = useState(item.tags.join(", "));
  const [content, setContent] = useState(current.content);
  const [negativeContent, setNegativeContent] = useState(current.negativeContent ?? "");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");

  // When the user switches active version, mirror its content into the
  // editor so the edits apply to the right version. The store remains
  // the source of truth for the persisted state.
  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description ?? "");
    setKind(item.kind);
    setTagsInput(item.tags.join(", "));
    setContent(current.content);
    setNegativeContent(current.negativeContent ?? "");
  }, [item.id, current.id]);

  const persistMetadata = async () => {
    const tags = tagsInput
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    await onUpdate({
      title: title.trim() || item.title,
      description: description.trim() || undefined,
      kind,
      tags: Array.from(new Set(tags)),
    });
  };

  const saveNewVersion = async () => {
    if (!content.trim()) {
      toast.error("Version content is empty");
      return;
    }
    await onAddVersion({
      content,
      negativeContent: negativeContent.trim() || undefined,
      sourceType: "manual",
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="prompt-library-detail">
      <header className="px-4 py-3 soft-separator-y mesh-header mesh-surface space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-semibold focus:outline-none"
            data-testid="prompt-library-title"
          />
          <button
            type="button"
            onClick={onToggleFavorite}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="prompt-library-favorite"
          >
            {item.favorite ? "★ Favorited" : "☆ Favorite"}
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="prompt-library-archive"
          >
            {item.archivedAt ? "Unarchive" : "Archive"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
          <span>
            v{current.version} of {item.versions.length} ·{" "}
            {item.scope === "project"
              ? `Project: ${projects.find((p) => p.id === item.projectId)?.name ?? "(unknown)"}`
              : "Global"}
          </span>
          <span>· Created {new Date(item.createdAt).toLocaleString()}</span>
          <span>· Updated {new Date(item.updatedAt).toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PromptKind)}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
            data-testid="prompt-library-kind"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="tags, comma separated"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] flex-1 min-w-[200px]"
            data-testid="prompt-library-tags"
          />
          <button
            type="button"
            onClick={() => void persistMetadata()}
            className="rounded-md border border-accent text-accent px-2 py-0.5 text-[11.5px]"
            data-testid="prompt-library-save-metadata"
          >
            Save metadata
          </button>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px]"
          data-testid="prompt-library-description"
        />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-text-muted">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1 w-full min-h-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] font-mono"
            data-testid="prompt-library-content"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-text-muted">
            Negative content
          </label>
          <textarea
            value={negativeContent}
            onChange={(e) => setNegativeContent(e.target.value)}
            className="mt-1 w-full min-h-[100px] rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] font-mono"
            data-testid="prompt-library-negative"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveNewVersion}
            className="rounded-md border border-accent text-accent px-2 py-1 text-[12px]"
            data-testid="prompt-library-save-version"
          >
            Save new version
          </button>
          {(item.kind === "image" || item.kind === "general" || item.kind === "recipe") && (
            <button
              type="button"
              onClick={() => {
                useImageWorkspaceStore.getState().enqueueGenerate({
                  draft: {
                    prompt: content,
                    negativePrompt: negativeContent || undefined,
                    model: item.modelHints?.[0],
                  },
                  autoGenerate: false,
                  parentId: null,
                  operation: "generate",
                });
                useSettingsStore.getState().setActiveTab("image");
                toast.success("Sent to Image Studio");
              }}
              className="rounded-md border border-border px-2 py-1 text-[12px]"
              data-testid="prompt-library-use-image"
            >
              Use in Image Studio
            </button>
          )}
          {(item.kind === "chat" || item.kind === "system" || item.kind === "general") && (
            <button
              type="button"
              onClick={() => {
                useSettingsStore.getState().setActiveTab("chat");
                useChatStore.setState({ systemPrompt: content });
                toast.success("Sent to Chat");
              }}
              className="rounded-md border border-border px-2 py-1 text-[12px]"
              data-testid="prompt-library-use-chat"
            >
              Use in Chat
            </button>
          )}
          <button
            type="button"
            onClick={onCreateWorkflow}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="prompt-library-create-workflow"
          >
            Create Workflow
          </button>
          <button
            type="button"
            onClick={async () => { await copyText(content); }}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="prompt-library-copy"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => setShowVersionHistory((value) => !value)}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="prompt-library-toggle-history"
          >
            {showVersionHistory ? "Hide" : "Show"} history ({item.versions.length})
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <input
                value={confirmDeleteText}
                onChange={(e) => setConfirmDeleteText(e.target.value)}
                placeholder={`Type "${item.title}" to confirm`}
                className="rounded-md border border-red-500/40 bg-background px-2 py-1 text-[12px]"
                data-testid="prompt-library-delete-confirm"
              />
              <button
                type="button"
                disabled={confirmDeleteText.trim() !== item.title}
                onClick={onDelete}
                className="rounded-md border border-red-500/60 text-red-300 px-2 py-1 text-[12px] disabled:opacity-50"
                data-testid="prompt-library-delete"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  setConfirmDeleteText("");
                }}
                className="rounded-md border border-border px-2 py-1 text-[12px]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-red-500/40 text-red-300 px-2 py-1 text-[12px]"
              data-testid="prompt-library-delete-arm"
            >
              Delete
            </button>
          )}
        </div>
        {showVersionHistory && (
          <ul className="space-y-1.5" data-testid="prompt-library-history">
            {[...item.versions]
              .sort((a, b) => b.version - a.version)
              .map((v) => (
                <li
                  key={v.id}
                  className={`rounded-md border px-2 py-1.5 ${
                    v.id === item.currentVersionId
                      ? "border-accent/60"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-text-muted">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {v.id === item.currentVersionId && (
                      <span className="text-accent text-[10.5px]">CURRENT</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void onSetCurrentVersion(v.id)}
                      disabled={v.id === item.currentVersionId}
                      className="ml-auto rounded-md border border-border px-2 py-0.5 text-[11px] disabled:opacity-50"
                      data-testid={`prompt-library-use-version-${v.version}`}
                    >
                      Use this version
                    </button>
                  </div>
                  {v.notes && (
                    <p className="text-[11px] text-text-muted mt-0.5">{v.notes}</p>
                  )}
                  <pre className="text-[11.5px] text-text-secondary whitespace-pre-wrap mt-1 line-clamp-3">
                    {v.content}
                  </pre>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PromptLibraryView;
