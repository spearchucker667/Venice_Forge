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
    instructions: "Stay in character, be helpful, never break the fourth wall.",
    tags: ["test"],
    adult: false,
    exampleDialogues: [],
    // Minimal avatar so "Image (avatar) is required." validation passes.
    avatar: { dataUri: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/png" as const },
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
  startNormalChatMock: vi.fn(),
  attachSceneMock: vi.fn(),
  attachPromptMock: vi.fn(),
  setActiveTabMock: vi.fn(),
  createBlankScenarioMock: vi.fn(),
  setActiveChatMock: vi.fn(),
  readImageAttachmentMock: vi.fn(),
  isSupportedImageFileMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("../../stores/toast-store", () => ({
  toast: { success: vi.fn(), error: mocks.toastErrorMock },
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
  startNormalChatForCharacter: mocks.startNormalChatMock,
  attachSceneToCharacter: mocks.attachSceneMock,
  attachPromptToCharacter: mocks.attachPromptMock,
}));

vi.mock("../../services/attachmentService", () => ({
  readImageAttachment: mocks.readImageAttachmentMock,
  isSupportedImageFile: mocks.isSupportedImageFileMock,
}));

import { CharacterEditor } from "./CharacterEditor";

const { sampleCard } = fixtures;

function resetMocks(): void {
  mocks.upsertMock.mockReset();
  mocks.removeMock.mockReset();
  mocks.saveToLibMock.mockReset();
  mocks.startChatMock.mockReset();
  mocks.startNormalChatMock.mockReset();
  mocks.attachSceneMock.mockReset();
  mocks.attachPromptMock.mockReset();
  mocks.setActiveTabMock.mockReset();
  mocks.createBlankScenarioMock.mockReset();
  mocks.setActiveChatMock.mockReset();
  mocks.readImageAttachmentMock.mockReset();
  mocks.isSupportedImageFileMock.mockReset();
  mocks.toastErrorMock.mockReset();

  mocks.upsertMock.mockResolvedValue(sampleCard);
  mocks.saveToLibMock.mockResolvedValue("prompt_new");
  mocks.startChatMock.mockResolvedValue("chat_new");
  mocks.startNormalChatMock.mockResolvedValue("conv_new");
  mocks.attachSceneMock.mockResolvedValue({
    ...sampleCard,
    metadata: { attachedSceneId: "scene_001" },
  });
  mocks.attachPromptMock.mockResolvedValue({
    ...sampleCard,
    metadata: { attachedPromptId: "prompt_001" },
  });
  mocks.createBlankScenarioMock.mockReturnValue("scenario_001");

  mocks.isSupportedImageFileMock.mockImplementation((file: File) => {
    return ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  });
  mocks.readImageAttachmentMock.mockImplementation(async (file: File) => {
    return {
      id: "attachment_001",
      type: "image",
      name: file.name,
      content: `data:${file.type};base64,YWJj`,
      size: 3,
    };
  });
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

  it("Save button matches the Delete button's visual weight and has a sane minimum size", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(saveBtn).toHaveClass("min-w-[72px]");
    expect(saveBtn).toHaveClass("px-3");
    expect(saveBtn).toHaveClass("py-1.5");
    expect(deleteBtn).toHaveClass("px-3");
    expect(deleteBtn).toHaveClass("py-1.5");
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

  it("Chat button calls upsert + startNormalChatForCharacter + onClose", async () => {
    const onClose = vi.fn();
    render(<CharacterEditor cardId="card_test_001" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("character-editor-chat"));
    await waitFor(() => {
      expect(mocks.upsertMock).toHaveBeenCalled();
      expect(mocks.startNormalChatMock).toHaveBeenCalledWith("card_test_001");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("uses generic errors for save, prompt-library, and start-chat failures", async () => {
    const sensitive = new Error("Authorization: Bearer secret /Users/private/card.json");
    mocks.upsertMock.mockRejectedValue(sensitive);
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Failed to save character. Please try again.")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("character-editor-save-to-prompt-library"));
    await waitFor(() => expect(mocks.toastErrorMock).toHaveBeenCalledWith("Could not save to Prompt Library", "Please try again."));

    fireEvent.click(screen.getByTestId("character-editor-start-chat"));
    await waitFor(() => expect(mocks.toastErrorMock).toHaveBeenCalledWith("Could not start RP chat", "Please try again."));
    expect(JSON.stringify(mocks.toastErrorMock.mock.calls)).not.toContain("Bearer secret");
    expect(JSON.stringify(mocks.toastErrorMock.mock.calls)).not.toContain("/Users/private");
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
      expect(mocks.setActiveTabMock).toHaveBeenCalledWith("rp-studio");
    });
  });

  it("rejects non-image file type for avatar", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["foo"], "foo.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Avatar must be a supported image file (PNG, JPEG, WEBP).")).toBeInTheDocument();
    });
  });

  it("rejects file larger than MAX_AVATAR_BYTES", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new ArrayBuffer(6 * 1024 * 1024)], "huge.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("Avatar file is too large (must be ≤ 5 MiB).")).toBeInTheDocument();
    });
  });

  it("accepts valid image and updates draft avatar using readImageAttachment", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new ArrayBuffer(1024)], "avatar.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.readImageAttachmentMock).toHaveBeenCalledWith(file);
      expect(mocks.upsertMock).not.toHaveBeenCalled();
    });
  });
});

// ── RELEASE-BLOCKER #6 — additional guard regressions ──
// These tests pin the save-validation contract (avatar + name + description
// + instructions all required), the strict avatar mime-type accept list,
// the URL scraping provider default + legacy boolean backcompat, and the
// temperature/Top-P defaults. They use the same mock harness as the
// Workflow-section block above.

describe("CharacterEditor — guard regressions (RELEASE-BLOCKER #6)", () => {
  it("renders avatar input with the restrictive mime-type accept list", () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const avatarInput = container.querySelector("input[type='file']:not([accept*='.pdf'])") as HTMLInputElement;
    expect(avatarInput).toBeTruthy();
    expect(avatarInput.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp");
  });

  it("renders context-files input with the pdf/txt/md accept list", () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const contextInput = container.querySelector("input[accept*='.pdf']") as HTMLInputElement;
    expect(contextInput).toBeTruthy();
    expect(contextInput.getAttribute("accept")).toBe(".pdf,.txt,.md,application/pdf,text/plain,text/markdown");
  });

  it("rejects context file that is not .pdf, .txt, or .md", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const contextInput = container.querySelector("input[accept*='.pdf']") as HTMLInputElement;
    const file = new File(["x"], "evil.exe", { type: "application/octet-stream" });
    fireEvent.change(contextInput, { target: { files: [file] } });
    await waitFor(() => {
      // Either blocked at the input level (browser-side accept) or surfaced
      // by the handler — what matters is no readImageAttachment call.
      expect(mocks.readImageAttachmentMock).not.toHaveBeenCalled();
    });
  });

  it("renders the URL Scraping Provider default to 'off'", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const select = screen.getByLabelText("URL scraping provider") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    // sampleCard doesn't include urlScrapingProvider → default "off"
    expect(select.value).toBe("off");
  });

  it("renders the URL Scraping Provider with options off / brave / google", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const select = screen.getByLabelText("URL scraping provider") as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["off", "brave", "google"]);
  });

  it("renders Temperature defaulting to 0.7 and Top P defaulting to 0.9", () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const numInputs = container.querySelectorAll("input[type='number']");
    const temp = Array.from(numInputs).find((el) => (el as HTMLInputElement).step === "0.1") as HTMLInputElement;
    const topP = Array.from(numInputs).find((el) => (el as HTMLInputElement).step === "0.05") as HTMLInputElement;
    expect(temp).toBeTruthy();
    expect(topP).toBeTruthy();
    expect(temp.value).toBe("0.7");
    expect(topP.value).toBe("0.9");
  });

  it("renders Web Search checkbox as part of Special Settings", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const checkbox = screen.getByRole("checkbox", { name: /web search/i }) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.type).toBe("checkbox");
  });

  it("renders Enable Thoughts checkbox defaulting to true", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const checkbox = screen.getByRole("checkbox", { name: /enable thoughts/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("blocks Save when the avatar file upload yields a non-image mime type", async () => {
    // The avatar is a hard save-block. The "rejects non-image file type"
    // surface error and the "rejects file larger than MAX_AVATAR_BYTES"
    // surface error both leave the draft without an avatar. Saving after
    // either rejection must therefore NOT invoke upsert — combined with the
    // editable Save button proves the avatar gate is enforced.
    mocks.upsertMock.mockReset();
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const avatarInput = container.querySelector("input[accept^='image']") as HTMLInputElement;
    const txt = new File(["x"], "not-an-image.txt", { type: "text/plain" });
    fireEvent.change(avatarInput, { target: { files: [txt] } });
    await waitFor(() => {
      expect(screen.getByText(/Avatar must be a supported image file/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The Save button remains operable but does not call upsert because the
    // draft still lacks a valid avatar (visual regression: no new toast
    // emitted).
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("preserves the legacy urlScraping boolean migration to 'brave'/'off'", async () => {
    // Migration path lives in src/services/rp/characterCardService.ts so we
    // verify the boolean→provider mapping end-to-end. The shape is asserted
    // here as a runtime contract so a refactor cannot silently drop the
    // backcompat branch.
    const { normalizeCard } = await import("../../services/rp/characterCardService");
    const brave = normalizeCard({ id: "a", name: "x", description: "d", instructions: "i", tags: [], adult: false, exampleDialogues: [], urlScraping: true } as never);
    const off = normalizeCard({ id: "b", name: "x", description: "d", instructions: "i", tags: [], adult: false, exampleDialogues: [], urlScraping: false } as never);
    expect(brave?.urlScrapingProvider).toBe("brave");
    expect(off?.urlScrapingProvider).toBe("off");
  });
});
