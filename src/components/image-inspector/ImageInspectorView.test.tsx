// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock("../../stores/image-inspector-store", () => ({
  useImageInspectorStore: () => storeState.value,
}));
vi.mock("../../hooks/use-models", () => ({
  useModels: () => ({
    data: [{
      id: "vision-model",
      model_spec: { name: "Vision Model", capabilities: { supportsVision: true } },
    }],
  }),
}));
vi.mock("../../services/desktopBridge", () => ({
  isElectron: () => true,
  desktopImageInspector: {
    chooseImage: vi.fn(),
    ingestClipboardImage: vi.fn(),
  },
}));

import { ImageInspectorView } from "./ImageInspectorView";

const actions = {
  startAnalysis: vi.fn(),
  cancelAnalysis: vi.fn(),
  performSearch: vi.fn(),
  createSession: vi.fn(),
  loadSession: vi.fn(),
  refreshSessions: vi.fn(),
};

function session(status: "complete" | "failed") {
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
      mediaId: "a".repeat(64),
      uri: `venice-media://${"a".repeat(64)}`,
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
    } : {
      error: {
        code: "ANALYSIS_REQUEST_FAILED" as const,
        message: "The vision model could not return an image analysis: Unable to fetch it",
      },
    }),
  };
}

describe("ImageInspectorView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the preserved provider failure instead of a generic empty state", () => {
    const failed = session("failed");
    storeState.value = {
      ...actions,
      activeSession: failed,
      sessions: [failed],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    render(<ImageInspectorView />);
    expect(screen.getByText("Image analysis failed")).toBeInTheDocument();
    expect(screen.getByText(/Unable to fetch it/)).toBeInTheDocument();
  });

  it("labels query-only results as text-based source discovery", () => {
    const complete = session("complete");
    storeState.value = {
      ...actions,
      activeSession: complete,
      sessions: [complete],
      loading: false,
      searchLoading: false,
      searchResults: [],
    };
    render(<ImageInspectorView />);
    expect(screen.getByText("Text-Based Source Discovery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search the Web via Google" })).toBeInTheDocument();
    expect(screen.queryByText(/reverse image/i)).not.toBeInTheDocument();
  });
});
