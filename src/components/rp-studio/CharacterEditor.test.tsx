/** @fileoverview Phase 2F — CharacterEditor workflow section tests.
 *
 *  Exercises the new "Workflow" section: Save to Prompt Library,
 *  Attach Scene, Attach Prompt, Start Chat, and Create Scenario.
 *  Mocks the renderer services so the test does not need IndexedDB or
 *  the Electron IPC bridge.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

const fixtures = vi.hoisted(() => {
  const sampleCard = {
    schema: "CharacterCardV1",
    id: "card_test_001",
    name: "Tester",
    description: "test desc",
    systemPrompt: "You are a test character.",
    scenario: "",
    tags: ["test"],
    adult: false,
    exampleDialogues: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
  const sampleScene = {
    id: "scene_001",
    title: "Mountain Sunset",
    description: "A mountain at sunset",
    components: [],
    mediaRefs: [],
    promptRefs: [],
    tags: ["scenic"],
    favorite: false,
    archivedAt: null,
    scope: "global",
    projectId: null,
    defaultModel: "flux-dev",
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultAspectRatio: "16:9",
    outputMediaIds: [],
    currentVersionId: "v1",
    versions: [
      {
        id: "v1",
        version: 1,
        title: "v1",
        components: [],
        mediaRefs: [],
        promptRefs: [],
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
  const samplePrompt = {
    id: "prompt_001",
    kind: "character",
    scope: "global",
    title: "Combat prompt",
    currentVersionId: "pv1",
    versions: [
      {
        id: "pv1",
        promptId: "prompt_001",
        version: 1,
        title: "v1",
        content: "Engage in dramatic combat",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    tags: ["combat"],
    favorite: false,
    archivedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
  return { sampleCard, sampleScene, samplePrompt };
});

const mocks = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  removeMock: vi.fn(),
  saveToLibMock: vi.fn(),
  startChatMock: vi.fn(),
  attachSceneMock: vi.fn(),
  attachPromptMock: vi.fn(),
  setActiveTabMock: vi.fn(),
  createBlankScenarioMock: vi.fn(),
  setActiveChatMock: vi.fn(),
}));

vi.mock("../../stores/settings-store", () => {
  const state = { setActiveTab: mocks.setActiveTabMock };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  return { useSettingsStore: fn };
});

vi.mock("../../stores/character-card-store", () => {
  const cards = [fixtures.sampleCard];
  const state = { cards, upsert: mocks.upsertMock, remove: mocks.removeMock };
  const fn = (selector: (s: unknown) => unknown) => selector(state);
  (fn as unknown as { getState: () => unknown }).getState = () => state;
  return { useCharacterCardStore: fn };
});

vi.mock("../../stores/scene-composer-store", () => {
  const scenes = [fixtures.sampleScene];
  const state = { scenes, ensureLoaded: vi.fn() };
  const fn = (selector: (s: unknown) => unknown) => selector(state);
  (fn as unknown as { getState: () => unknown }).getState = () => state;
  return { useSceneComposerStore: fn };
});

vi.mock("../../stores/prompt-library-store", () => {
  const prompts = [fixtures.samplePrompt];
  const state = { prompts, ensureLoaded: vi.fn() };
  const fn = (selector: (s: unknown) => unknown) => selector(state);
  (fn as unknown as { getState: () => unknown }).getState = () => state;
  return { usePromptLibraryStore: fn };
});

vi.mock("../../stores/rp-chat-store", () => {
  const state = { setActive: mocks.setActiveChatMock };
  const fn = (selector: (s: unknown) => unknown) => selector(state);
  (fn as unknown as { getState: () => unknown }).getState = () => state;
  return { useRpChatStore: fn };
});

vi.mock("../../stores/scenario-store", () => ({
  useScenarioStore: {
    getState: () => ({ createBlank: mocks.createBlankScenarioMock }),
  },
}));

vi.mock("../../services/rpHelpers", () => ({
  saveCharacterPromptToLibrary: mocks.saveToLibMock,
  startChatForCharacter: mocks.startChatMock,
  attachSceneToCharacter: mocks.attachSceneMock,
  attachPromptToCharacter: mocks.attachPromptMock,
}));

import { CharacterEditor } from "./CharacterEditor";

const { sampleCard } = fixtures;

function resetMocks(): void {
  mocks.upsertMock.mockReset();
  mocks.removeMock.mockReset();
  mocks.saveToLibMock.mockReset();
  mocks.startChatMock.mockReset();
  mocks.attachSceneMock.mockReset();
  mocks.attachPromptMock.mockReset();
  mocks.setActiveTabMock.mockReset();
  mocks.createBlankScenarioMock.mockReset();
  mocks.setActiveChatMock.mockReset();

  mocks.upsertMock.mockResolvedValue(sampleCard);
  mocks.saveToLibMock.mockResolvedValue("prompt_new");
  mocks.startChatMock.mockResolvedValue("chat_new");
  mocks.attachSceneMock.mockResolvedValue({
    ...sampleCard,
    metadata: { attachedSceneId: "scene_001" },
  });
  mocks.attachPromptMock.mockResolvedValue({
    ...sampleCard,
    metadata: { attachedPromptId: "prompt_001" },
  });
  mocks.createBlankScenarioMock.mockReturnValue("scenario_001");
}

beforeEach(() => {
  resetMocks();
});

describe("CharacterEditor — Workflow section", () => {
  it("renders the Workflow section with 5 action controls", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    expect(screen.getByTestId("character-editor-workflow")).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-save-to-prompt-library")).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-attach-scene")).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-attach-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-start-chat")).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-create-scenario")).toBeInTheDocument();
  });

  it("Save to Prompt Library button calls upsert + saveCharacterPromptToLibrary", async () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("character-editor-save-to-prompt-library"));
    await waitFor(() => {
      expect(mocks.upsertMock).toHaveBeenCalled();
      expect(mocks.saveToLibMock).toHaveBeenCalledWith("card_test_001");
    });
  });

  it("Start chat button calls upsert + startChatForCharacter + onClose", async () => {
    const onClose = vi.fn();
    render(<CharacterEditor cardId="card_test_001" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("character-editor-start-chat"));
    await waitFor(() => {
      expect(mocks.upsertMock).toHaveBeenCalled();
      expect(mocks.startChatMock).toHaveBeenCalledWith("card_test_001");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("Attach scene dropdown renders the scene options from useSceneComposerStore", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const select = screen.getByTestId("character-editor-attach-scene") as HTMLSelectElement;
    const opts = Array.from(select.querySelectorAll("option"));
    expect(opts.find((o) => o.value === "scene_001")?.textContent).toBe("Mountain Sunset");
  });

  it("Attach prompt dropdown renders the prompt options from usePromptLibraryStore", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const select = screen.getByTestId("character-editor-attach-prompt") as HTMLSelectElement;
    const opts = Array.from(select.querySelectorAll("option"));
    expect(opts.find((o) => o.value === "prompt_001")?.textContent).toBe("Combat prompt");
  });

  it("Create scenario from character calls useScenarioStore.createBlank and switches to scenes tab", async () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("character-editor-create-scenario"));
    await waitFor(() => {
      expect(mocks.createBlankScenarioMock).toHaveBeenCalled();
      const args = mocks.createBlankScenarioMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(args).toMatchObject({
        scope: "character",
        characterId: "card_test_001",
        name: `Scenario for ${sampleCard.name}`,
      });
      expect(mocks.setActiveTabMock).toHaveBeenCalledWith("scenes");
    });
  });
});
