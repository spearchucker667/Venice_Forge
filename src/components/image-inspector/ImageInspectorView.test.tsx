import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
const askDecision = vi.hoisted(() => vi.fn());
const resolveUrl = vi.hoisted(() =>
  vi.fn(async (input: { scheme: string; objectId: string; resourceUrl?: string }) => {
    return `${input.resourceUrl ?? `${input.scheme}://${input.objectId}`}?cap=test-token`;
  }),
);

vi.mock("../../stores/image-inspector-store", () => ({
  useImageInspectorStore: () => storeState.value,
}));
vi.mock("../../hooks/use-models", () => ({
  useModels: () => ({
    data: [
      {
        id: "vision-model",
        model_spec: {
          name: "Vision Model",
          capabilities: { supportsVision: true },
          pricing: { input: { usd: 0.7 }, output: { usd: 2.8 } },
        },
      },
      {
        id: "text-only-model",
        model_spec: { name: "Text Only Model", capabilities: { supportsVision: false } },
      },
    ],
  }),
}));
vi.mock("../../services/desktopBridge", () => ({
  isElectron: () => true,
  desktopImageInspector: {
    chooseImage: vi.fn(),
    ingestClipboardImage: vi.fn(),
  },
  desktopMedia: {
    resolveUrl,
  },
}));
vi.mock("../ui/modal-requests", () => ({ askDecision }));

import { formatImageInspectorModelCost, ImageInspectorView } from "./ImageInspectorView";

const actions = {
  startAnalysis: vi.fn(),
  cancelAnalysis: vi.fn(),
  performSearch: vi.fn(),
  createSession: vi.fn(),
  loadSession: vi.fn(),
  refreshSessions: vi.fn(),
  deleteSession: vi.fn(),
};

function session(status: "analyzing" | "complete" | "failed", uri?: string) {
  const mediaId = "a".repeat(64);
  return {
    id: "session-1",
    schemaVersion: 1 as const,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    title: "cup.png",
    status,
    inputs: [{
      id: "input-1",
      source: "file" as const,
      displayName: "cup.png",
      mimeType: "image/png",
      byteLength: 4,
      mediaId,
      uri: uri ?? `venice-media://${mediaId}`,
    }],
    request: {
      modelId: "vision-model",
      depth: "standard" as const,
      promptTarget: "venice-image" as const,
    },
    searches: [],
    ...(status === "complete" ? {
      analysis: {
        schemaVersion: 1 as const,
        summary: "Blue cup",
        subjects: [],
        composition: { description: "Centered" },
        lighting: { description: "Soft" },
        color: { description: "Blue" },
        environment: { description: "Table" },
        style: { description: "Photo" },
        technical: { description: "50mm" },
        mood: { description: "Calm" },
        visibleText: [],
        sourceClues: [],
        replicationPrompt: { target: "venice-image" as const, positive: "blue cup", negative: "blur" },
        negativePrompt: "blur",
        searchQueries: [{ query: "blue cup", type: "descriptive" }],
        confidence: { overall: 0.9, uncertainties: [] },
        warnings: [],
      },
    } : status === "failed" ? {
      error: {
        code: "ANALYSIS_REQUEST_FAILED" as const,
        message: "The vision model could not return an image analysis: Unable to fetch it",
      },
    } : {}),
  };
}

describe("ImageInspectorView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    askDecision.mockResolvedValue(true);
  });

  async function renderView() {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<ImageInspectorView />);
    });
    return result!;
  }

  it("shows the preserved provider failure instead of a generic empty state", async () => {
    const failed = session("failed");
    storeState.value = {
      ...actions,
      activeSession: failed,
      sessions: [failed],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();
    expect(screen.getByText("Image analysis failed")).toBeInTheDocument();
    expect(screen.getByText(/Unable to fetch it/)).toBeInTheDocument();
  });

  it("disables query-derived search rather than presenting it as image matching", async () => {
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();
    expect(screen.getByText("Image-Based Source Search")).toBeInTheDocument();
    expect(screen.getByText(/Query-generated search has been disabled/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search the Web via/ })).not.toBeInTheDocument();
  });

  it("uses the shared anime loading indicator while analysis is running", async () => {
    const analyzing = session("analyzing");
    storeState.value = {
      ...actions,
      activeSession: analyzing,
      sessions: [analyzing],
      loading: true,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Analyzing image contents");
    expect(status.querySelector("img")).toBeInTheDocument();
  });

  it("confirms and deletes a prior image inspection without deleting media", async () => {
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "Delete image inspection cup.png" }));
    expect(askDecision).toHaveBeenCalledWith(expect.objectContaining({
      title: "Delete image inspection?",
      danger: true,
    }));
    await vi.waitFor(() => expect(actions.deleteSession).toHaveBeenCalledWith("session-1"));
  });

  it("formats live model pricing for the selector", () => {
    expect(formatImageInspectorModelCost({
      id: "priced-vision",
      object: "model",
      created: 0,
      owned_by: "venice",
      model_spec: {
        pricing: {
          input: { usd: 0.7 },
          output: { usd: 2.8 },
        },
      },
    })).toBe("$0.70 input / $2.80 output per 1M tokens");
    expect(formatImageInspectorModelCost(undefined)).toBe("Cost unavailable");
  });

  it("offers only vision-capable models and displays the selected model cost", async () => {
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();
    expect(screen.getByTestId("image-inspector-model-cost")).toHaveTextContent(
      "$0.70 input / $2.80 output per 1M tokens",
    );
    expect(screen.queryByText(/Text Only Model/)).not.toBeInTheDocument();
  });

  it("renders session thumbnail and primary preview with resolved capability URLs (?cap=...) and never tokenless venice-media URLs", async () => {
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();

    const previewImg = screen.getByAltText("Target");
    expect(previewImg).toBeInTheDocument();
    expect(previewImg).toHaveAttribute("src", expect.stringContaining("?cap=test-token"));

    const allImages = document.querySelectorAll("img");
    expect(allImages.length).toBeGreaterThanOrEqual(2);
    for (const img of allImages) {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("venice-media://")) {
        expect(src).toContain("cap=test-token");
        expect(src).not.toMatch(/^venice-media:\/\/[a-f0-9]{64}\/?$/);
      }
    }
  });

  it("renders non-custom image URLs synchronously without requesting capability tokens", async () => {
    resolveUrl.mockClear();
    const nonCustomSession = session("complete", "https://example.com/imported.png");
    storeState.value = {
      ...actions,
      activeSession: nonCustomSession,
      sessions: [nonCustomSession],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();

    const previewImg = screen.getByAltText("Target");
    expect(previewImg).toHaveAttribute("src", "https://example.com/imported.png");
    expect(resolveUrl).not.toHaveBeenCalled();
  });

  it("re-resolves capability URL on image error to recover transparently", async () => {
    resolveUrl.mockClear();
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();

    const previewImg = screen.getByAltText("Target");
    expect(previewImg).toHaveAttribute("src", expect.stringContaining("?cap=test-token"));

    expect(resolveUrl).toHaveBeenCalledTimes(2); // 1 thumbnail + 1 preview

    // Simulate capability token expiration triggering onError
    await act(async () => {
      fireEvent.error(previewImg);
    });

    await vi.waitFor(() => {
      expect(resolveUrl).toHaveBeenCalledTimes(3);
    });
  });

  it("fails closed without rendering broken img when capability resolution fails", async () => {
    resolveUrl.mockResolvedValueOnce("");
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    await renderView();

    await vi.waitFor(() => {
      expect(resolveUrl).toHaveBeenCalled();
    });

    const allImages = document.querySelectorAll("img");
    for (const img of allImages) {
      const src = img.getAttribute("src") || "";
      expect(src).not.toMatch(/^venice-media:\/\/[a-f0-9]{64}\/?$/);
    }
  });
});
