import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { ToastHost } from "./ToastHost";
import type { AppState } from "../types/app";

function makeState(toasts: AppState["toasts"] = []): AppState {
  return {
    activeTab: "chat",
    selectedChatModel: "venice-uncensored",
    selectedImageModel: "sd-xl",
    selectedVideoModel: "wan-2.6-text-to-video",
    models: { text: [], image: [], audio: [], video: [], embeddings: [], unknown: [] },
    usingFallbackModels: false,
    sidebarCollapsed: false,
    modelLoadError: "",
    gallery: [],
    files: [],
    diagnostics: null,
    diagnosticsLog: [],
    chats: [],
    conversations: [],
    activeConversationId: null,
    sourcePanelOpen: false,
    isOnline: true,
    toasts,

    settings: {
      localFamilySafeModeEnabled: true,
      veniceApiSafeMode: true,
      defaultSystemPrompt: "",
      webSearch: "off",
      includeVeniceSystemPrompt: false,
      webScraping: false,
      webCitations: false,
      theme: "dark",
      customModels: [],
      selectedThemeId: "builtin-dark",
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
      imageCount: 1,
      currentImage: "",
      currentImages: [],
      lastSavedImageId: null,
      currentBatchId: null,
      generationProgress: "",
      batchQueueStatus: "",
      disableWatermark: false,
      imageUrl: "",
      imageUrls: [],
      upscaleFactor: 2,
      imageMode: "text-to-image",
    },
    videoDraft: {
      prompt: "",
      negative: "",
      aspectRatio: "16:9",
      duration: "5s",
      resolution: "720p",
      upscaleFactor: 2,
      audio: true,
      videoUrl: "",
      imageUrl: "",
      sourceVideoUrl: "",
      videoMode: "text-to-video",
      generationProgress: "",
      queueId: null,
      status: null,
      downloadUrl: null,
    },
    batchDraft: { type: "text", promptsText: "" },
    chatDraft: { systemPrompt: "", messages: [] },
  };
}

describe("ToastHost", () => {
  const dispatch = vi.fn();

  it("renders nothing when no toasts are provided", () => {
    render(<ToastHost state={makeState([])} dispatch={dispatch} />);
    expect(screen.queryByRole("log")).toBeEmptyDOMElement();
  });

  it("renders toast messages", () => {
    const state = makeState([
      { id: "t1", message: "Hello", type: "info" },
      { id: "t2", message: "Oops", type: "error" },
    ]);
    render(<ToastHost state={state} dispatch={dispatch} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Oops")).toBeInTheDocument();
  });
});
