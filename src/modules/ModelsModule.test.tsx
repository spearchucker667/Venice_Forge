import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { ModelsModule } from "./ModelsModule";
import type { AppState, AppDispatch } from "../types/app";

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    selectedChatModel: "venice-uncensored",
    selectedImageModel: "sd-xl",
    models: {
      text: [{ id: "m1", name: "Text Model", type: "text" }],
      image: [{ id: "m2", name: "Image Model", type: "image" }],
      audio: [],
      video: [],
      embeddings: [],
      unknown: [],
    },
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

describe("ModelsModule", () => {
  const dispatch = vi.fn() as AppDispatch;

  it("renders the models header", () => {
    render(<ModelsModule state={makeState()} dispatch={dispatch} />);
    expect(screen.getByText("Models")).toBeInTheDocument();
  });

  it("displays model load error when present", () => {
    render(<ModelsModule state={makeState({ modelLoadError: "Network failure" })} dispatch={dispatch} />);
    expect(screen.getByText("Network failure")).toBeInTheDocument();
  });

  it("renders model select fields for chat and image", () => {
    render(<ModelsModule state={makeState()} dispatch={dispatch} />);
    expect(screen.getByText("Current chat model")).toBeInTheDocument();
    expect(screen.getByText("Current image model")).toBeInTheDocument();
  });
});
