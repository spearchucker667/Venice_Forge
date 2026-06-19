/** @fileoverview Phase 2E — Scene Composer view.
 *
 * Split layout (list + detail) following the same pattern as
 * PromptLibraryView. The left pane lists saved scenes; the right pane
 * shows the detail editor with a component grid, version history, and
 * compile-to-recipe / send-to-image-studio actions.
 */

import { useEffect, useMemo, useState } from "react";
import { useSceneComposerStore } from "../../stores/scene-composer-store";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { type WorkflowStep } from "../../types/workflow";
import type {
  SceneComposerItem,
  SceneComponentKind,
  SceneScope,
  SceneVersion,
  CreateSceneComponentInput,
} from "../../types/scene";
import type { SceneMediaRef, ScenePromptRef } from "../../types/scene";
import { useSettingsStore } from "../../stores/settings-store";
import { useProjectStore } from "../../stores/project-store";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { toast } from "../../stores/toast-store";
import { copyText } from "../../stores/media-send-to";
import { compileSceneToRecipe } from "../../services/sceneCompiler";

const COMPONENT_KIND_OPTIONS: Array<{ value: SceneComponentKind; label: string }> = [
  { value: "subject", label: "Subject" },
  { value: "character", label: "Character" },
  { value: "location", label: "Location" },
  { value: "mood", label: "Mood" },
  { value: "style", label: "Style" },
  { value: "camera", label: "Camera" },
  { value: "lighting", label: "Lighting" },
  { value: "composition", label: "Composition" },
  { value: "negative", label: "Negative" },
  { value: "note", label: "Note" },
];

type SortKey = "newest" | "oldest" | "title" | "favorite";

export function SceneComposerView() {
  const ensureLoaded = useSceneComposerStore((s) => s.ensureLoaded);
  const hydrated = useSceneComposerStore((s) => s.hydrated);
  const scenes = useSceneComposerStore((s) => s.scenes);
  const activeSceneId = useSceneComposerStore((s) => s.activeSceneId);
  const setActiveScene = useSceneComposerStore((s) => s.setActiveScene);
  const createScene = useSceneComposerStore((s) => s.createScene);
  const updateScene = useSceneComposerStore((s) => s.updateScene);
  const addSceneVersion = useSceneComposerStore((s) => s.addSceneVersion);
  const setCurrentVersion = useSceneComposerStore((s) => s.setCurrentVersion);
  const toggleFavorite = useSceneComposerStore((s) => s.toggleFavorite);
  const archiveScene = useSceneComposerStore((s) => s.archiveScene);
  const unarchiveScene = useSceneComposerStore((s) => s.unarchiveScene);
  const deleteScene = useSceneComposerStore((s) => s.deleteScene);
  const { createWorkflow, setActiveWorkflow } = useWorkflowTemplateStore();
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const activeProjectId = useSettingsStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const [scopeFilter, setScopeFilter] = useState<SceneScope | "all">("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenes
      .filter((s) => (showArchived ? true : s.archivedAt === null))
      .filter((s) => {
        if (scopeFilter === "all") return true;
        if (scopeFilter === "global") return s.scope === "global";
        return (
          s.scope === "project" &&
          (s.projectId === activeProjectId ||
            (activeProjectId === null && s.projectId === null))
        );
      })
      .filter((s) => (favoritesOnly ? s.favorite : true))
      .filter((s) => {
        if (!q) return true;
        if (s.title.toLowerCase().includes(q)) return true;
        if ((s.description ?? "").toLowerCase().includes(q)) return true;
        if (s.versions.some((v) => v.components.some((c) => c.content.toLowerCase().includes(q)))) return true;
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
          case "favorite":
            return Number(b.favorite) - Number(a.favorite);
        }
      });
  }, [scenes, showArchived, scopeFilter, activeProjectId, favoritesOnly, query, sort]);

  const active = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId],
  );

  return (
    <div className="flex h-full w-full min-h-0 text-text-primary">
      <aside
        className="w-[340px] shrink-0 border-r border-border flex flex-col min-h-0"
        data-testid="scene-composer-list-pane"
      >
        <div className="px-3 py-2 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold">Scene Composer</h2>
            <button
              type="button"
              onClick={async () => {
                const created = await createScene({ title: "Untitled scene" });
                setActiveScene(created.id);
              }}
              className="ml-auto rounded-md border border-border px-2 py-1 text-[11.5px] hover:border-accent hover:text-accent"
              data-testid="scene-composer-new"
            >
              New
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scenes…"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] focus:outline-none focus:border-accent"
            data-testid="scene-composer-search"
          />
          <div className="flex flex-wrap gap-1.5">
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as SceneScope | "all")}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
              data-testid="scene-composer-scope-filter"
            >
              <option value="all">All scopes</option>
              <option value="global">Global</option>
              <option value="project">Project</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
              data-testid="scene-composer-sort"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title</option>
              <option value="favorite">Favorite</option>
            </select>
            <button
              type="button"
              onClick={() => setFavoritesOnly((v) => !v)}
              aria-pressed={favoritesOnly}
              className={`rounded-md border px-2 py-0.5 text-[11.5px] ${
                favoritesOnly
                  ? "border-amber-500/40 text-amber-300"
                  : "border-border text-text-secondary hover:border-accent hover:text-accent"
              }`}
              data-testid="scene-composer-favorites-filter"
            >
              ★ Favorites
            </button>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              className={`rounded-md border px-2 py-0.5 text-[11.5px] ${
                showArchived
                  ? "border-accent text-accent"
                  : "border-border text-text-secondary hover:border-accent hover:text-accent"
              }`}
              data-testid="scene-composer-archive-filter"
            >
              Archive
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" data-testid="scene-composer-list">
          {!hydrated ? (
            <p className="p-3 text-text-muted text-[12px]">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-text-muted text-[12px]" data-testid="scene-composer-empty">
              {scenes.length === 0
                ? "No saved scenes yet. Click \"New\" to create one."
                : "No scenes match the current filters."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveScene(s.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-background ${
                      s.id === activeSceneId ? "bg-background" : ""
                    }`}
                    data-testid={`scene-composer-item-${s.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] truncate">
                        {s.favorite ? "★ " : ""}
                        {s.title}
                      </span>
                      <span className="ml-auto text-[10.5px] text-text-muted">
                        {s.outputMediaIds.length > 0
                          ? `${s.outputMediaIds.length} output${s.outputMediaIds.length === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 truncate">
                      {s.scope === "project" ? "Project" : "Global"} ·{" "}
                      {s.versions.length} version{s.versions.length === 1 ? "" : "s"} ·{" "}
                      {s.versions[0]?.components.length ?? 0} component
                      {(s.versions[0]?.components.length ?? 0) === 1 ? "" : "s"}
                    </div>
                    {s.tags.length > 0 && (
                      <div className="text-[10.5px] text-text-muted mt-0.5 truncate">
                        {s.tags.map((t) => `#${t}`).join(" ")}
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
          <SceneDetail
            key={active.id}
            item={active}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            onUpdate={async (patch) => {
              await updateScene(active.id, patch as Parameters<typeof updateScene>[1]);
            }}
            onAddVersion={async (input) => {
              await addSceneVersion(active.id, input);
              toast.success("New version saved");
            }}
            onSetCurrentVersion={async (versionId) => {
              await setCurrentVersion(active.id, versionId);
            }}
            onToggleFavorite={async () => {
              await toggleFavorite(active.id);
            }}
            onArchive={async () => {
              if (active.archivedAt) await unarchiveScene(active.id);
              else await archiveScene(active.id);
            }}
            onDelete={async () => {
              await deleteScene(active.id);
              toast.success("Scene deleted");
            }}
            onCreateWorkflow={async () => {
              const w = await createWorkflow({
                title: `Workflow: ${active.title}`,
                steps: [
                  {
                    kind: "scene",
                    target: "scene_composer",
                    title: active.title,
                    ref: { sceneId: active.id },
                    enabled: true,
                  } as WorkflowStep,
                ],
                source: { type: "scene", sourceId: active.id },
              });
              setActiveWorkflow(w.id);
              setActiveTab("workflows");
              toast.success("Workflow created");
            }}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center text-text-muted text-[12.5px]"
            data-testid="scene-composer-empty-detail"
          >
            {hydrated && scenes.length > 0
              ? "Select a scene to compose."
              : "No scene selected. Create a new one to get started."}
          </div>
        )}
      </section>
    </div>
  );
}

interface SceneDetailProps {
  item: SceneComposerItem;
  projects: Array<{ id: string; name: string }>;
  onUpdate: (patch: Partial<Pick<SceneComposerItem, "title" | "description" | "scope" | "tags" | "favorite" | "archivedAt" | "defaultModel" | "defaultWidth" | "defaultHeight" | "defaultAspectRatio">>) => Promise<void>;
  onAddVersion: (input: {
    title?: string;
    components: CreateSceneComponentInput[];
    mediaRefs?: SceneMediaRef[];
    promptRefs?: ScenePromptRef[];
    notes?: string;
    sourceType?: "manual" | "media" | "recipe" | "prompt" | "import";
    sourceId?: string;
  }) => Promise<void>;
  onSetCurrentVersion: (versionId: string) => Promise<void>;
  onToggleFavorite: () => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  onCreateWorkflow: () => Promise<void>;
}

function SceneDetail(props: SceneDetailProps) {
  const { item, projects, onUpdate, onAddVersion, onSetCurrentVersion, onToggleFavorite, onArchive, onDelete, onCreateWorkflow } = props;
  const currentVersion: SceneVersion =
    item.versions.find((v) => v.id === item.currentVersionId) ??
    item.versions[0]!;

  const ensurePromptsLoaded = usePromptLibraryStore((s) => s.ensureLoaded);
  const getPrompt = usePromptLibraryStore((s) => s.getPrompt);
  const getCurrentVersion = usePromptLibraryStore((s) => s.getCurrentVersion);

  const resolvePromptRef = (ref: ScenePromptRef) => {
    const prompt = getPrompt(ref.promptId);
    if (!prompt) return null;
    const version = ref.versionId
      ? prompt.versions.find((v) => v.id === ref.versionId)
      : getCurrentVersion(ref.promptId);
    if (!version) return null;
    return {
      promptId: ref.promptId,
      versionId: version.id,
      title: prompt.title,
      content: version.content,
      negativeContent: version.negativeContent,
    };
  };

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [tagsInput, setTagsInput] = useState(item.tags.join(", "));
  const [defaultModel, setDefaultModel] = useState(item.defaultModel ?? "");
  const [defaultWidth, setDefaultWidth] = useState(item.defaultWidth ? String(item.defaultWidth) : "");
  const [defaultHeight, setDefaultHeight] = useState(item.defaultHeight ? String(item.defaultHeight) : "");
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(item.defaultAspectRatio ?? "");
  const [components, setComponents] = useState(
    currentVersion.components.map((c) => ({
      kind: c.kind,
      content: c.content,
      enabled: c.enabled,
      title: c.title ?? "",
      key: crypto.randomUUID ? crypto.randomUUID() : `${c.kind}-${Date.now()}-${Math.random()}`,
    })) as Array<{
      kind: SceneComponentKind;
      content: string;
      enabled: boolean;
      title: string;
      key: string;
    }>,
  );
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");

  useEffect(() => {
    setTitle(item.title);
    setDescription(item.description ?? "");
    setTagsInput(item.tags.join(", "));
    setDefaultModel(item.defaultModel ?? "");
    setDefaultWidth(item.defaultWidth ? String(item.defaultWidth) : "");
    setDefaultHeight(item.defaultHeight ? String(item.defaultHeight) : "");
    setDefaultAspectRatio(item.defaultAspectRatio ?? "");
    setComponents(
      currentVersion.components.map((c) => ({
        kind: c.kind,
        content: c.content,
        enabled: c.enabled,
        title: c.title ?? "",
        key: crypto.randomUUID ? crypto.randomUUID() : `${c.kind}-${Date.now()}-${Math.random()}`,
      })),
    );
  }, [item.id, currentVersion.id]);

  const persistMetadata = async () => {
    const tags = tagsInput
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    await onUpdate({
      title: title.trim() || item.title,
      description: description.trim() || undefined,
      tags: Array.from(new Set(tags)),
      defaultModel: defaultModel.trim() || undefined,
      defaultWidth: defaultWidth ? Number(defaultWidth) : undefined,
      defaultHeight: defaultHeight ? Number(defaultHeight) : undefined,
      defaultAspectRatio: defaultAspectRatio.trim() || undefined,
    });
    toast.success("Scene metadata saved");
  };

  const saveNewVersion = async () => {
    const comps = components
      .filter((c) => c.content.trim().length > 0)
      .map((c) => ({
        kind: c.kind,
        content: c.content.trim(),
        title: c.title.trim() || undefined,
        enabled: c.enabled,
      }));
    if (comps.length === 0) {
      toast.error("Add at least one component with content");
      return;
    }
    await onAddVersion({
      title: `v${item.versions.length + 1}`,
      components: comps,
      sourceType: "manual",
    });
  };

  const addComponent = () => {
    setComponents((prev) => [
      ...prev,
      {
        kind: "subject",
        content: "",
        enabled: true,
        title: "",
        key: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      },
    ]);
  };

  const updateComponent = (key: string, patch: Partial<{ kind: SceneComponentKind; content: string; enabled: boolean; title: string }>) => {
    setComponents((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const removeComponent = (key: string) => {
    setComponents((prev) => prev.filter((c) => c.key !== key));
  };

  const handleSendToImageStudio = async () => {
    await ensurePromptsLoaded();
    const result = compileSceneToRecipe(item, currentVersion, { resolvePrompt: resolvePromptRef });
    if (!result.recipe.prompt) {
      toast.error("Scene has no prompt content");
      return;
    }
    useImageWorkspaceStore.getState().enqueueGenerate({
      draft: {
        prompt: result.recipe.prompt,
        negativePrompt: result.recipe.negativePrompt,
        model: result.recipe.model,
        width: result.recipe.width,
        height: result.recipe.height,
        aspectRatio: result.recipe.aspectRatio,
        style: result.recipe.style,
        recipeMeta: result.recipe.metadata,
      },
      autoGenerate: false,
      parentId: null,
      operation: "generate",
    });
    useSettingsStore.getState().setActiveTab("image");
    toast.success("Sent to Image Studio");
  };

  const handleCopyRecipe = async () => {
    await ensurePromptsLoaded();
    const result = compileSceneToRecipe(item, currentVersion, { resolvePrompt: resolvePromptRef });
    const text = JSON.stringify(result.recipe, null, 2);
    await copyText(text);
    toast.success("Recipe copied to clipboard");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="scene-composer-detail">
      <header className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-semibold focus:outline-none"
            data-testid="scene-composer-title"
          />
          <button
            type="button"
            onClick={onToggleFavorite}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="scene-composer-favorite"
          >
            {item.favorite ? "★ Favorited" : "☆ Favorite"}
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="scene-composer-archive"
          >
            {item.archivedAt ? "Unarchive" : "Archive"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
          <span>
            v{currentVersion.version} of {item.versions.length} ·{" "}
            {item.scope === "project"
              ? `Project: ${projects.find((p) => p.id === item.projectId)?.name ?? "(unknown)"}`
              : "Global"}
          </span>
          <span>· Created {new Date(item.createdAt).toLocaleString()}</span>
          <span>· Updated {new Date(item.updatedAt).toLocaleString()}</span>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px]"
          data-testid="scene-composer-description"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="tags, comma separated"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] flex-1 min-w-[200px]"
            data-testid="scene-composer-tags"
          />
          <button
            type="button"
            onClick={() => void persistMetadata()}
            className="rounded-md border border-accent text-accent px-2 py-0.5 text-[11.5px]"
            data-testid="scene-composer-save-metadata"
          >
            Save metadata
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-text-muted">Defaults:</label>
          <input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="Model (e.g. flux-dev)"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] w-[160px]"
            data-testid="scene-composer-default-model"
          />
          <input
            value={defaultWidth}
            onChange={(e) => setDefaultWidth(e.target.value)}
            placeholder="Width"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] w-[70px]"
            data-testid="scene-composer-default-width"
          />
          <input
            value={defaultHeight}
            onChange={(e) => setDefaultHeight(e.target.value)}
            placeholder="Height"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] w-[70px]"
            data-testid="scene-composer-default-height"
          />
          <input
            value={defaultAspectRatio}
            onChange={(e) => setDefaultAspectRatio(e.target.value)}
            placeholder="Aspect (e.g. 16:9)"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] w-[100px]"
            data-testid="scene-composer-default-aspect"
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {/* Component grid */}
        <div data-testid="scene-composer-components">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">
              Components ({components.length})
            </h3>
            <button
              type="button"
              onClick={addComponent}
              className="rounded-md border border-border px-2 py-0.5 text-[11.5px] hover:border-accent hover:text-accent"
              data-testid="scene-composer-add-component"
            >
              + Add
            </button>
          </div>
          {components.length === 0 ? (
            <p className="text-[12px] text-text-muted" data-testid="scene-composer-no-components">
              No components yet. Click "+ Add" to begin composing.
            </p>
          ) : (
            <div className="space-y-2">
              {components.map((c) => (
                <div
                  key={c.key}
                  className="flex gap-2 items-start rounded-md border border-border p-2"
                  data-testid={`scene-composer-component-${c.key}`}
                >
                  <select
                    value={c.kind}
                    onChange={(e) => updateComponent(c.key, { kind: e.target.value as SceneComponentKind })}
                    className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] w-[110px] shrink-0"
                    data-testid={`scene-composer-component-kind-${c.key}`}
                  >
                    {COMPONENT_KIND_OPTIONS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={c.title}
                    onChange={(e) => updateComponent(c.key, { title: e.target.value })}
                    placeholder="Optional label"
                    className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] w-[120px] shrink-0"
                    data-testid={`scene-composer-component-title-${c.key}`}
                  />
                  <textarea
                    value={c.content}
                    onChange={(e) => updateComponent(c.key, { content: e.target.value })}
                    placeholder="Component content…"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] min-h-[36px] resize-none"
                    rows={1}
                    data-testid={`scene-composer-component-content-${c.key}`}
                  />
                  <button
                    type="button"
                    onClick={() => updateComponent(c.key, { enabled: !c.enabled })}
                    className={`rounded-md border px-1.5 py-0.5 text-[10.5px] shrink-0 ${
                      c.enabled
                        ? "border-accent/40 text-accent"
                        : "border-border text-text-muted"
                    }`}
                    data-testid={`scene-composer-component-toggle-${c.key}`}
                  >
                    {c.enabled ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeComponent(c.key)}
                    className="rounded-md border border-red-500/40 text-red-300 px-1.5 py-0.5 text-[10.5px] shrink-0"
                    data-testid={`scene-composer-component-remove-${c.key}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveNewVersion}
            className="rounded-md border border-accent text-accent px-2 py-1 text-[12px]"
            data-testid="scene-composer-save-version"
          >
            Save new version
          </button>
          <button
            type="button"
            onClick={handleSendToImageStudio}
            className="rounded-md border border-border px-2 py-1 text-[12px] hover:border-accent hover:text-accent"
            data-testid="scene-composer-use-image"
          >
            Use in Image Studio
          </button>
          <button
            type="button"
            onClick={handleCopyRecipe}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="scene-composer-copy-recipe"
          >
            Copy recipe
          </button>
          <button
            type="button"
            onClick={onCreateWorkflow}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="scene-composer-create-workflow"
          >
            Create Workflow
          </button>
          <button
            type="button"
            onClick={() => setShowVersionHistory((v) => !v)}
            className="rounded-md border border-border px-2 py-1 text-[12px]"
            data-testid="scene-composer-toggle-history"
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
                data-testid="scene-composer-delete-confirm"
              />
              <button
                type="button"
                disabled={confirmDeleteText.trim() !== item.title}
                onClick={onDelete}
                className="rounded-md border border-red-500/60 text-red-300 px-2 py-1 text-[12px] disabled:opacity-50"
                data-testid="scene-composer-delete"
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
              data-testid="scene-composer-delete-arm"
            >
              Delete
            </button>
          )}
        </div>

        {/* Version history */}
        {showVersionHistory && (
          <ul className="space-y-1.5" data-testid="scene-composer-history">
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
                    <span className="font-medium">{v.title}</span>
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
                      data-testid={`scene-composer-use-version-${v.version}`}
                    >
                      Use this version
                    </button>
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {v.components.length} component
                    {v.components.length === 1 ? "" : "s"}
                    {v.mediaRefs.length > 0 && ` · ${v.mediaRefs.length} media ref${v.mediaRefs.length === 1 ? "" : "s"}`}
                    {v.promptRefs.length > 0 && ` · ${v.promptRefs.length} prompt ref${v.promptRefs.length === 1 ? "" : "s"}`}
                  </div>
                  {v.notes && (
                    <p className="text-[11px] text-text-muted mt-0.5">{v.notes}</p>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SceneComposerView;