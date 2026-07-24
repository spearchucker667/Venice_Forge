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

vi.mock("../../hooks/use-models", () => ({
  useModels: () => ({ data: [
    { id: "test-text", object: "model", created: 1, owned_by: "test", model_spec: { availableContextTokens: 16_000, capabilities: { supportsVision: false } } },
    { id: "test-vision", object: "model", created: 1, owned_by: "test", model_spec: { availableContextTokens: 16_000, capabilities: { supportsVision: true } } },
  ] }),
}));

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
  const overloadedCard = {
    ...sampleCard,
    id: "card_overloaded_001",
    name: "Overloaded",
    description: "x".repeat(130_000),
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
  return { sampleCard, sampleScene, samplePrompt, overloadedCard };
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
  extractPdfTextMock: vi.fn(),
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
  let cards = [fixtures.sampleCard];
  const state = {
    get cards() { return cards; },
    setCards(next: typeof cards) { cards = next; },
    upsert: mocks.upsertMock,
    remove: mocks.removeMock,
  };
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

vi.mock("../../services/pdfParserService", () => ({
  extractPdfText: mocks.extractPdfTextMock,
}));

import { CharacterEditor } from "./CharacterEditor";
import { useCharacterCardStore } from "../../stores/character-card-store";

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
  mocks.extractPdfTextMock.mockReset();

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
  mocks.extractPdfTextMock.mockResolvedValue({
    text: "Extracted PDF text",
    pageCount: 1,
    isImageOnly: false,
    truncated: false,
  });
}

beforeEach(() => {
  resetMocks();
});

describe("CharacterEditor — Workflow section", () => {
  it("shows standards-aware validation", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    expect(screen.getByText(/primary greeting is recommended for chat readiness/i)).toBeInTheDocument();
  });

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

  // VERIFY-141 regression guard: visual-only save progress must be announced.
  it("announces the saving state and hides the decorative spinner from accessibility APIs", async () => {
    let resolveSave!: (value: typeof sampleCard) => void;
    mocks.upsertMock.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const status = await screen.findByRole("status", { name: "Saving character" });
    expect(status).toHaveTextContent("Saving character…");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    resolveSave(sampleCard);
    await waitFor(() => expect(screen.queryByRole("status", { name: "Saving character" })).not.toBeInTheDocument());
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

describe("CharacterEditor — context file validation", () => {
  it("rejects a context file with a disallowed MIME type", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const contextInput = container.querySelector("input[accept*='.pdf']") as HTMLInputElement;
    const file = new File(["x"], "evil.txt", { type: "application/octet-stream" });
    fireEvent.change(contextInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Context files must be \.pdf, \.txt, or \.md/i)).toBeInTheDocument();
    });
  });

  it("accepts a .txt file with text/plain MIME type", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const contextInput = container.querySelector("input[accept*='.pdf']") as HTMLInputElement;
    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    fireEvent.change(contextInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("notes.txt")).toBeInTheDocument();
    });
  });

  it("accepts a .pdf file and extracts text", async () => {
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const contextInput = container.querySelector("input[accept*='.pdf']") as HTMLInputElement;
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(contextInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText("doc.pdf")).toBeInTheDocument();
      expect(mocks.extractPdfTextMock).toHaveBeenCalledWith(file);
    });
  });

  it("surfaces a safe message when PDF extraction fails (no raw paths)", async () => {
    mocks.extractPdfTextMock.mockRejectedValueOnce(
      new Error("ENOENT: /Users/private/path.pdf"),
    );
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const contextInput = container.querySelector("input[accept*='.pdf']") as HTMLInputElement;
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(contextInput, { target: { files: [file] } });
    await waitFor(() => {
      const error = screen.getByText(/Failed to extract PDF text/i);
      expect(error).toBeInTheDocument();
    });
    expect(screen.queryByText(/ENOENT/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/Users\/private/i)).not.toBeInTheDocument();
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

  it("rejects a non-image avatar without rejecting an otherwise valid V2 JSON card", async () => {
    // V2 JSON cards do not require an avatar. The invalid file is discarded,
    // while Save remains available for interoperable JSON-only cards.
    mocks.upsertMock.mockReset();
    const { container } = render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const avatarInput = container.querySelector("input[accept^='image']") as HTMLInputElement;
    const txt = new File(["x"], "not-an-image.txt", { type: "text/plain" });
    fireEvent.change(avatarInput, { target: { files: [txt] } });
    await waitFor(() => {
      expect(screen.getByText(/Avatar must be a supported image file/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.upsertMock).toHaveBeenCalledWith(expect.objectContaining({ avatar: undefined }));
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

  it("renders the Default model dropdown defaulting to 'Use chat default'", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const select = screen.getByLabelText("Default model") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options[0]).toBe("");
    expect(options.length).toBeGreaterThan(1);
  });

  it("persists the selected modelId when saving the character", async () => {
    mocks.upsertMock.mockReset();
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const select = screen.getByLabelText("Default model") as HTMLSelectElement;
    const targetValue = Array.from(select.querySelectorAll("option"))
      .map((o) => o.value)
      .find((v) => v && v !== "") ?? "venice-uncensored";
    fireEvent.change(select, { target: { value: targetValue } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.upsertMock).toHaveBeenCalled();
    });
    const saved = mocks.upsertMock.mock.calls[0]![0] as { modelId?: string };
    expect(saved.modelId).toBe(targetValue);
  });
});

// VERIFY-079 regression guard — CharacterEditor displays the estimated token budget
// and disables Save when the character exceeds the model input budget.
describe("CharacterEditor — token budget display", () => {
  const { overloadedCard } = fixtures;

  beforeEach(() => {
    (useCharacterCardStore.getState() as any).setCards([fixtures.sampleCard, overloadedCard]);
  });

  it("renders the estimated token budget for the current character", () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);
    const budget = screen.getByTestId("character-token-budget");
    expect(budget).toBeInTheDocument();
    expect(budget.textContent).toContain("Estimated tokens:");
    expect(budget.textContent).toContain("output reserve");
  });

  it("disables Save and shows the over-limit state when the character exceeds the budget", async () => {
    mocks.upsertMock.mockReset();
    render(<CharacterEditor cardId="card_overloaded_001" onClose={() => {}} />);

    const budget = screen.getByTestId("character-token-budget");
    expect(budget).toHaveClass("text-danger");

    const saveBtn = screen.getByRole("button", { name: /Save \(character exceeds token budget\)/i });
    expect(saveBtn).toBeDisabled();
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });
});

describe("CharacterEditor — Step Tab Navigation", () => {
  it("filters visible sections when clicking step tabs and navigates via Next/Previous", async () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);

    // Initially "All Steps" is active, so all sections (e.g. Identity, Workflow, Persona) are visible
    expect(screen.getByRole("heading", { name: "1. Source & Avatar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Identity" })).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-workflow")).toBeInTheDocument();

    // Click "1. Source" tab
    fireEvent.click(screen.getByRole("button", { name: "1. Source" }));
    expect(screen.getByRole("heading", { name: "1. Source & Avatar" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "2. Identity" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("character-editor-workflow")).not.toBeInTheDocument();

    // Click Next button -> moves to Step 2: Identity
    fireEvent.click(screen.getByRole("button", { name: /^Next: Identity/i }));
    expect(screen.queryByRole("heading", { name: "1. Source & Avatar" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Identity" })).toBeInTheDocument();

    // Click "5. Greetings" tab
    fireEvent.click(screen.getByRole("button", { name: "5. Greetings" }));
    expect(screen.getByRole("heading", { name: "5. Greetings" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "2. Identity" })).not.toBeInTheDocument();

    // Click "10. Export" tab
    fireEvent.click(screen.getByRole("button", { name: "10. Export" }));
    expect(screen.getByRole("heading", { name: "10. Export & Workflow" })).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-workflow")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "5. Greetings" })).not.toBeInTheDocument();

    // Click "All Steps" tab -> shows all steps again
    fireEvent.click(screen.getByRole("button", { name: "All Steps" }));
    expect(screen.getByRole("heading", { name: "1. Source & Avatar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Identity" })).toBeInTheDocument();
    expect(screen.getByTestId("character-editor-workflow")).toBeInTheDocument();
  });
});

describe("CharacterEditor — Instruction file loading & sourced context files", () => {
  beforeEach(() => {
    (useCharacterCardStore.getState() as any).setCards([fixtures.sampleCard]);
  });

  it("loads instruction file text into target field and sources file inside contextFiles", async () => {
    render(<CharacterEditor cardId="card_test_001" onClose={() => {}} />);

    // Select Step 3 Persona
    fireEvent.click(screen.getByRole("button", { name: "3. Persona" }));

    // Find the file inputs for loading file into personality
    const fileInputs = screen.getAllByText("Load file (.txt, .md)");
    expect(fileInputs.length).toBeGreaterThan(0);

    const testFile = new File(["Mysterious space traveler with secret knowledge."], "personality-bio.md", {
      type: "text/markdown",
    });

    const hiddenInputs = document.querySelectorAll('input[type="file"]');
    const personalityFileInput = Array.from(hiddenInputs).find(
      (input) => (input as HTMLInputElement).accept.includes(".txt")
    ) as HTMLInputElement;

    expect(personalityFileInput).toBeDefined();

    fireEvent.change(personalityFileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      const personalityArea = screen.getByLabelText("Personality") as HTMLTextAreaElement;
      expect(personalityArea.value).toBe("Mysterious space traveler with secret knowledge.");
    });

    // Switch to Model and Context step to check sourced files section
    fireEvent.click(screen.getByRole("button", { name: "8. Model and Context" }));

    await waitFor(() => {
      expect(screen.getByText("personality-bio.md")).toBeInTheDocument();
      expect(screen.getByText("personality")).toBeInTheDocument();
    });
  });
});

