/** @fileoverview Phase 2D — Prompt Library view tests (VERIFY-046). */

import { describe, it, expect, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import "fake-indexeddb/auto";
import { PromptLibraryView } from "./PromptLibraryView";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useSettingsStore } from "../../stores/settings-store";

/** Reset only the in-memory state without touching localStorage. */
function resetStore(): void {
  usePromptLibraryStore.setState({
    prompts: [],
    activePromptId: null,
    hydrated: true,
    loading: false,
    loadError: null,
  });
  useSettingsStore.setState({ activeProjectId: null });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PromptLibraryView (VERIFY-046)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the empty state when there are no prompts", () => {
    render(<PromptLibraryView />);
    expect(screen.getByTestId("prompt-library-empty")).toHaveTextContent(/No saved prompts yet/i);
  });

  it("creates a prompt from the New button", async () => {
    render(<PromptLibraryView />);
    fireEvent.click(screen.getByTestId("prompt-library-new"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(1);
    expect(usePromptLibraryStore.getState().activePromptId).toBeTruthy();
  });

  it("filters by kind", async () => {
    render(<PromptLibraryView />);
    fireEvent.click(screen.getByTestId("prompt-library-new")); // v1 = general
    fireEvent.click(screen.getByTestId("prompt-library-new"));
    fireEvent.click(screen.getByTestId("prompt-library-new"));
    await flush();
    const ids = usePromptLibraryStore.getState().prompts.map((p) => p.id);
    // Mark each so we have a known mix: image, chat, general.
    await act(async () => {
      await usePromptLibraryStore.getState().updatePrompt(ids[0]!, { kind: "image" });
      await usePromptLibraryStore.getState().updatePrompt(ids[1]!, { kind: "chat" });
      await usePromptLibraryStore.getState().updatePrompt(ids[2]!, { kind: "general" });
    });
    fireEvent.change(screen.getByTestId("prompt-library-kind-filter"), { target: { value: "chat" } });
    const list = screen.getByTestId("prompt-library-list");
    const items = within(list).getAllByRole("button");
    // Only the chat item should remain.
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toMatch(/chat/i);
  });

  it("filters by favorites", async () => {
    const a = await usePromptLibraryStore.getState().createPrompt({ title: "Fav", kind: "general", content: "x", scope: "global" });
    await usePromptLibraryStore.getState().createPrompt({ title: "Not", kind: "general", content: "y", scope: "global" });
    await usePromptLibraryStore.getState().toggleFavorite(a.id);
    render(<PromptLibraryView />);
    fireEvent.click(screen.getByTestId("prompt-library-favorites-filter"));
    const list = screen.getByTestId("prompt-library-list");
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toMatch(/Fav/);
  });

  it("search matches title and content", async () => {
    await usePromptLibraryStore.getState().createPrompt({ title: "Mountains", kind: "image", content: "pine forest at sunrise", scope: "global" });
    await usePromptLibraryStore.getState().createPrompt({ title: "Ocean", kind: "image", content: "rolling waves", scope: "global" });
    render(<PromptLibraryView />);
    fireEvent.change(screen.getByTestId("prompt-library-search"), { target: { value: "pine" } });
    const list = screen.getByTestId("prompt-library-list");
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toMatch(/Mountains/);
  });

  it("renders a detail editor and saves metadata", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({ title: "Hello", kind: "image", content: "world", scope: "global" });
    usePromptLibraryStore.setState({ activePromptId: item.id });
    render(<PromptLibraryView />);
    const titleInput = screen.getByTestId("prompt-library-title") as HTMLInputElement;
    expect(titleInput.value).toBe("Hello");
    fireEvent.change(titleInput, { target: { value: "Hello v2" } });
    fireEvent.click(screen.getByTestId("prompt-library-save-metadata"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts.find((p) => p.id === item.id)?.title).toBe("Hello v2");
  });

  it("saves a new version and switches the current version", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({ title: "V", kind: "image", content: "v1", scope: "global" });
    usePromptLibraryStore.setState({ activePromptId: item.id });
    render(<PromptLibraryView />);
    fireEvent.change(screen.getByTestId("prompt-library-content"), { target: { value: "v2 body" } });
    fireEvent.click(screen.getByTestId("prompt-library-save-version"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts.find((p) => p.id === item.id)?.versions).toHaveLength(2);
    fireEvent.click(screen.getByTestId("prompt-library-toggle-history"));
    fireEvent.click(screen.getByTestId("prompt-library-use-version-1"));
    await flush();
    const updated = usePromptLibraryStore.getState().prompts.find((p) => p.id === item.id)!;
    expect(updated.currentVersionId).toBe(updated.versions[0]!.id);
  });

  it("archives and unarchives", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({ title: "A", kind: "image", content: "x", scope: "global" });
    usePromptLibraryStore.setState({ activePromptId: item.id });
    render(<PromptLibraryView />);
    fireEvent.click(screen.getByTestId("prompt-library-archive"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts[0]!.archivedAt).not.toBeNull();
    fireEvent.click(screen.getByTestId("prompt-library-archive"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts[0]!.archivedAt).toBeNull();
  });

  it("toggles favorite", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({ title: "F", kind: "image", content: "x", scope: "global" });
    usePromptLibraryStore.setState({ activePromptId: item.id });
    render(<PromptLibraryView />);
    fireEvent.click(screen.getByTestId("prompt-library-favorite"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts[0]!.favorite).toBe(true);
  });

  it("delete is gated by typing the prompt title", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({ title: "DeleteMe", kind: "image", content: "x", scope: "global" });
    usePromptLibraryStore.setState({ activePromptId: item.id });
    render(<PromptLibraryView />);
    fireEvent.click(screen.getByTestId("prompt-library-delete-arm"));
    const del = screen.getByTestId("prompt-library-delete") as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("prompt-library-delete-confirm"), { target: { value: "wrong" } });
    expect((screen.getByTestId("prompt-library-delete") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("prompt-library-delete-confirm"), { target: { value: "DeleteMe" } });
    expect((screen.getByTestId("prompt-library-delete") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("prompt-library-delete"));
    await flush();
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(0);
  });

  it("filters by scope and respects active project", async () => {
    useSettingsStore.setState({ activeProjectId: "p-1" });
    await usePromptLibraryStore.getState().createPrompt({ title: "G", kind: "general", content: "c", scope: "global" });
    await usePromptLibraryStore.getState().createPrompt({ title: "P1", kind: "general", content: "c", scope: "project", projectId: "p-1" });
    await usePromptLibraryStore.getState().createPrompt({ title: "P2", kind: "general", content: "c", scope: "project", projectId: "p-2" });
    render(<PromptLibraryView />);
    fireEvent.change(screen.getByTestId("prompt-library-scope-filter"), { target: { value: "project" } });
    const list = screen.getByTestId("prompt-library-list");
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toMatch(/P1/);
  });

  it("sort order is stable and re-applied on sort change", async () => {
    await usePromptLibraryStore.getState().createPrompt({ title: "Beta", kind: "image", content: "x", scope: "global" });
    await usePromptLibraryStore.getState().createPrompt({ title: "Alpha", kind: "image", content: "x", scope: "global" });
    render(<PromptLibraryView />);
    fireEvent.change(screen.getByTestId("prompt-library-sort"), { target: { value: "title" } });
    const list = screen.getByTestId("prompt-library-list");
    const items = within(list).getAllByRole("button");
    expect(items[0]?.textContent).toMatch(/Alpha/);
    expect(items[1]?.textContent).toMatch(/Beta/);
  });
});
