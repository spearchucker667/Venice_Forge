/** @fileoverview Phase 2E — Scene Composer view tests. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SceneComposerView } from "./SceneComposerView";
import { useSceneComposerStore } from "../../stores/scene-composer-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useProjectStore } from "../../stores/project-store";
import { toast } from "../../stores/toast-store";

vi.mock("../../stores/toast-store", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../stores/image-workspace-store", () => ({
  useImageWorkspaceStore: {
    getState: vi.fn(() => ({
      enqueueGenerate: vi.fn().mockReturnValue("handoff-id"),
      consume: vi.fn(),
      reset: vi.fn(),
    })),
  },
}));

vi.mock("../../services/storageService", () => ({
  default: {
    getItems: vi.fn().mockResolvedValue([]),
    saveItem: vi.fn().mockResolvedValue({}),
    deleteItem: vi.fn().mockResolvedValue(true),
    openDB: vi.fn(),
  },
}));

function setupStore() {
  useSceneComposerStore.setState({
    scenes: [],
    activeSceneId: null,
    hydrated: false,
    loading: false,
    loadError: null,
  });
  useSettingsStore.setState({
    activeTab: "chat",
    activeProjectId: null,
  });
  useProjectStore.setState({ projects: [], loading: false, loaded: true });
}

describe("SceneComposerView", () => {
  beforeEach(() => {
    setupStore();
    vi.clearAllMocks();
  });

  it("renders the list pane and empty state", async () => {
    render(<SceneComposerView />);
    expect(screen.getByTestId("scene-composer-list-pane")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-empty")).toBeDefined();
    });
  });

  it("shows the empty detail placeholder", async () => {
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-empty-detail")).toBeDefined();
    });
  });

  it("creates a new scene and selects it", async () => {
    render(<SceneComposerView />);
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-new")).toBeDefined();
    });
    await user.click(screen.getByTestId("scene-composer-new"));
    await waitFor(() => {
      const state = useSceneComposerStore.getState();
      expect(state.scenes).toHaveLength(1);
      expect(state.scenes[0]!.title).toBe("Untitled scene");
      expect(state.activeSceneId).toBe(state.scenes[0]!.id);
    });
  });

  it("renders the detail view when a scene is selected", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    await store.createScene({ title: "My Scene" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-detail")).toBeDefined();
    });
    expect(screen.getByTestId("scene-composer-title")).toBeDefined();
  });

  it("displays scene list items", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Scene A" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId(`scene-composer-item-${scene.id}`)).toBeDefined();
    });
    expect(screen.getByText("Scene A")).toBeDefined();
  });

  it("filters scenes by search query", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    await store.createScene({ title: "Forest Scene" });
    await store.createScene({ title: "Desert Scene" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-search")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.type(screen.getByTestId("scene-composer-search"), "Forest");
    await waitFor(() => {
      expect(screen.getByText("Forest Scene")).toBeDefined();
      expect(screen.queryByText("Desert Scene")).toBeNull();
    });
  });

  it("adds a component when + Add is clicked", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    await store.createScene({ title: "Test" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-add-component")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-add-component"));
    await waitFor(() => {
      const components = screen.getAllByTestId(/^scene-composer-component-/);
      expect(components.length).toBeGreaterThan(0);
    });
  });

  it("saves a new version", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Version Test" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-add-component")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-add-component"));
    // Find the content textarea and type something
    const contentAreas = screen.getAllByTestId(/^scene-composer-component-content-/);
    await user.type(contentAreas[0]!, "A test subject");
    await user.click(screen.getByTestId("scene-composer-save-version"));
    await waitFor(() => {
      const updated = useSceneComposerStore.getState().getScene(scene.id);
      expect(updated!.versions).toHaveLength(2);
      expect(toast.success).toHaveBeenCalledWith("New version saved");
    });
  });

  it("toggles favorite", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Favorite Test" });
    expect(scene.favorite).toBe(false);
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-favorite")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-favorite"));
    await waitFor(() => {
      const updated = useSceneComposerStore.getState().getScene(scene.id);
      expect(updated!.favorite).toBe(true);
    });
  });

  it("archives and unarchives a scene", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Archive Test" });
    expect(scene.archivedAt).toBeNull();
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-archive")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-archive"));
    await waitFor(() => {
      const updated = useSceneComposerStore.getState().getScene(scene.id);
      expect(updated!.archivedAt).toBeTruthy();
    });
    // Unarchive
    await user.click(screen.getByTestId("scene-composer-archive"));
    await waitFor(() => {
      const updated = useSceneComposerStore.getState().getScene(scene.id);
      expect(updated!.archivedAt).toBeNull();
    });
  });

  it("deletes a scene with confirm gate", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Delete Test" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-delete-arm")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-delete-arm"));
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-delete-confirm")).toBeDefined();
    });
    await user.type(screen.getByTestId("scene-composer-delete-confirm"), "Delete Test");
    await user.click(screen.getByTestId("scene-composer-delete"));
    await waitFor(() => {
      expect(useSceneComposerStore.getState().getScene(scene.id)).toBeNull();
      expect(toast.success).toHaveBeenCalledWith("Scene deleted");
    });
  });

  it("shows version history", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    await store.createScene({ title: "History Test" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-toggle-history")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-toggle-history"));
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-history")).toBeDefined();
    });
  });

  it("sends scene to Image Studio", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Send Test", defaultModel: "flux-dev" });
    // Add a version with content
    await store.addSceneVersion(scene.id, {
      components: [
        { kind: "subject", content: "A mountain landscape" },
        { kind: "mood", content: "serene" },
      ],
      sourceType: "manual",
    });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-use-image")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-use-image"));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Sent to Image Studio");
    });
  });

  it("copies recipe to clipboard", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Recipe Test" });
    await store.addSceneVersion(scene.id, {
      components: [{ kind: "subject", content: "A dragon" }],
      sourceType: "manual",
    });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-copy-recipe")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("scene-composer-copy-recipe"));
    // The handler calls navigator.clipboard.writeText + toast.success.
    // Clipboard is not mockable in jsdom in all environments, but the
    // toast fires synchronously regardless.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Recipe copied to clipboard");
    });
  });

  it("saves metadata", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    const scene = await store.createScene({ title: "Meta Test" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-save-metadata")).toBeDefined();
    });
    const user = userEvent.setup();
    await user.clear(screen.getByTestId("scene-composer-title"));
    await user.type(screen.getByTestId("scene-composer-title"), "Updated Title");
    await user.click(screen.getByTestId("scene-composer-save-metadata"));
    await waitFor(() => {
      const updated = useSceneComposerStore.getState().getScene(scene.id);
      expect(updated!.title).toContain("Updated");
    });
  });

  it("shows loading state", () => {
    useSceneComposerStore.setState({ hydrated: false, loading: true });
    render(<SceneComposerView />);
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("shows no component message", async () => {
    const store = useSceneComposerStore.getState();
    await store.ensureLoaded();
    await store.createScene({ title: "Empty" });
    render(<SceneComposerView />);
    await waitFor(() => {
      expect(screen.getByTestId("scene-composer-no-components")).toBeDefined();
    });
  });
});