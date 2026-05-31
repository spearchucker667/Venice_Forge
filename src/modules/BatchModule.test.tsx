import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchModule } from "./BatchModule";
import type { AppState, AppDispatch } from "../types/app";

vi.mock("../services/veniceClient", () => ({
  veniceFetch: vi.fn(),
  veniceStreamChat: vi.fn(),
  MAX_RAW_UPLOAD_BYTES: 10 * 1024 * 1024,
}));

vi.mock("../services/imageWorkflowService", () => ({
  generateImageWithWatermarkFallback: vi.fn(),
}));

vi.mock("../services/desktopBridge", () => ({
  isElectron: vi.fn(() => false),
  desktopFiles: { showSaveDialog: vi.fn() },
}));

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    selectedChatModel: "venice-uncensored",
    selectedImageModel: "sd-xl",
    models: { text: [], image: [], audio: [], video: [], embeddings: [], unknown: [] },
    usingFallbackModels: false,
    modelLoadError: null,
    gallery: [],
    diagnostics: null,
    conversations: [],
    activeConversationId: null,
    toasts: [],
    settings: {
      defaultSystemPrompt: "",
      webSearch: false,
      webSearchProvider: "venice",
      jinaApiKey: "",
      researchBudget: { maxQueries: 3, maxPages: 5, perRequestTimeoutMs: 15000, totalJobTimeoutMs: 120000, maxCharsPerPage: 8000 },
      genericHttpEnabled: false,
      customTheme: null,
      appearanceMode: "dark",
      includeVeniceSystemPrompt: false,
      webScraping: false,
      webCitations: false,
    },
    imageDraft: {
      prompt: "",
      negative: "",
      width: 1024,
      height: 1024,
      steps: 30,
      cfg: 7,
      aspectRatio: "1:1",
      style: "",
      safeMode: true,
      currentImage: "",
      lastSavedImageId: null,
      currentImages: [],
    },
    batchDraft: { type: "text", promptsText: "" },
    online: true,
    ...overrides,
  } as AppState;
}

describe("BatchModule", () => {
  const dispatch = vi.fn() as AppDispatch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders batch input and run button", () => {
    render(<BatchModule state={makeState()} dispatch={dispatch} />);
    expect(screen.getByPlaceholderText(/enter multiple prompts here, one per line/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run batch$/i })).toBeInTheDocument();
  });

  it("shows validation error when running with empty prompts", async () => {
    render(<BatchModule state={makeState()} dispatch={dispatch} />);
    const runBtn = screen.getByRole("button", { name: /^run batch$/i });
    await userEvent.click(runBtn);
    expect(screen.getByText(/enter at least one prompt/i)).toBeInTheDocument();
  });

  it("shows fallback model warning and blocks run", async () => {
    const state = makeState({ usingFallbackModels: true, batchDraft: { type: "text", promptsText: "hello world" } });
    render(<BatchModule state={state} dispatch={dispatch} />);
    const runBtn = screen.getByRole("button", { name: /^run batch$/i });
    await userEvent.click(runBtn);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADD_TOAST",
        toast: expect.objectContaining({ type: "error" }),
      })
    );
  });
});
