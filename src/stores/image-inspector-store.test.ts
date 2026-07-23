import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageInspectorSession } from "../types/imageInspector";

const records = vi.hoisted(() => new Map<string, ImageInspectorSession>());
const veniceFetch = vi.hoisted(() => vi.fn());
const readMediaDataUrl = vi.hoisted(() => vi.fn());
const runResearchSearch = vi.hoisted(() => vi.fn());

vi.mock("../services/storageService", () => ({
  default: {
    getItems: vi.fn(async () => [...records.values()]),
    getItem: vi.fn(async (_store: string, id: string) => records.get(id) ?? null),
    saveItem: vi.fn(async (_store: string, value: ImageInspectorSession) => {
      records.set(value.id, structuredClone(value));
      return structuredClone(value);
    }),
    deleteItem: vi.fn(async (_store: string, id: string) => records.delete(id)),
  },
}));
vi.mock("../services/desktopBridge", () => ({
  desktopImageInspector: { readMediaDataUrl },
}));
vi.mock("../services/veniceClient/fetch", () => ({ veniceFetch }));
vi.mock("../services/researchService", () => ({ runResearchSearch }));

import { useImageInspectorStore } from "./image-inspector-store";
import { useToastStore } from "./toast-store";

function validAnalysis() {
  return {
    schemaVersion: 1 as const,
    summary: "Blue cup",
    subjects: [{ description: "Cup", attributes: ["blue"] }],
    composition: { description: "Centered" },
    lighting: { description: "Soft" },
    color: { description: "Blue" },
    environment: { description: "Table" },
    style: { description: "Photo" },
    technical: { description: "50mm" },
    mood: { description: "Calm" },
    visibleText: [],
    sourceClues: [],
    replicationPrompt: {
      target: "venice-image" as const,
      positive: "blue cup",
      negative: "blur",
      cameraHints: [],
      lightingHints: [],
      colorHints: [],
    },
    negativePrompt: "blur",
    searchQueries: [{ query: "blue cup", type: "descriptive" }],
    confidence: { overall: 0.9, uncertainties: [] },
    warnings: [],
  };
}

async function createSession(): Promise<void> {
  await useImageInspectorStore.getState().createSession({
    id: "input-1",
    source: "file",
    displayName: "cup.png",
    mimeType: "image/png",
    byteLength: 4,
    width: 512,
    height: 512,
    mediaId: "a".repeat(64),
    uri: `venice-media://${"a".repeat(64)}`,
  });
}

describe("Image Inspector store", () => {
  beforeEach(() => {
    records.clear();
    vi.clearAllMocks();
    readMediaDataUrl.mockResolvedValue({
      ok: true,
      result: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png", byteLength: 4 },
    });
    useToastStore.setState({ toasts: [] });
    useImageInspectorStore.setState({
      activeSession: null,
      sessions: [],
      loading: false,
      searchLoading: false,
      searchResults: [],
      activeAbortController: null,
    });
  });

  it("resolves durable media through the desktop bridge and stores validated analysis", async () => {
    veniceFetch.mockResolvedValue({
      data: { choices: [{ message: { content: JSON.stringify(validAnalysis()) } }] },
    });
    await createSession();
    await useImageInspectorStore.getState().startAnalysis(
      "vision-model",
      "standard",
      "venice-image",
      "Focus on lighting",
    );

    const state = useImageInspectorStore.getState();
    expect(state.activeSession?.status).toBe("complete");
    expect(state.activeSession?.analysis?.summary).toBe("Blue cup");
    expect(readMediaDataUrl).toHaveBeenCalledWith({ mediaId: "a".repeat(64) });

    const body = veniceFetch.mock.calls[0][1].body;
    expect(body.messages[0].content).toContain('"schemaVersion":1');
    expect(body.messages[1].content[1].image_url.url).toBe("data:image/png;base64,AAAA");
    expect(body.response_format).toBeUndefined();
  });

  it("requests the Venice JSON schema when the selected model supports it", async () => {
    veniceFetch.mockResolvedValue({
      data: { choices: [{ message: { content: JSON.stringify(validAnalysis()) } }] },
    });
    await createSession();
    await useImageInspectorStore.getState().startAnalysis(
      "schema-vision-model",
      "standard",
      "flux",
      undefined,
      true,
    );

    const body = veniceFetch.mock.calls[0][1].body;
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        properties: {
          replicationPrompt: {
            properties: { target: { enum: ["flux"] } },
          },
        },
      },
    });
  });

  it("preserves a provider-side image failure in the failed session", async () => {
    veniceFetch.mockResolvedValue({
      data: { choices: [{ message: { content: "Unable to fetch it" } }] },
    });
    await createSession();
    await useImageInspectorStore.getState().startAnalysis(
      "vision-model",
      "quick",
      "generic",
    );

    expect(useImageInspectorStore.getState().activeSession).toMatchObject({
      status: "failed",
      error: {
        code: "ANALYSIS_REQUEST_FAILED",
        message: expect.stringContaining("Unable to fetch it"),
      },
    });
  });

  it("labels query-only search results as ranked potential sources", async () => {
    await createSession();
    const active = useImageInspectorStore.getState().activeSession!;
    useImageInspectorStore.setState({
      activeSession: { ...active, status: "complete", analysis: validAnalysis() },
    });
    runResearchSearch.mockResolvedValue({
      sources: [
        {
          title: "Unsafe result",
          url: "javascript:alert(1)",
          excerpt: "Must not become a renderer link",
        },
        {
          title: "Cup reference",
          url: "https://example.com/cup",
          excerpt: "A visually similar description",
        },
      ],
      warnings: [],
    });

    await useImageInspectorStore.getState().performSearch("venice-google", "blue cup");
    const state = useImageInspectorStore.getState();
    expect(state.searchResults[0]).toMatchObject({
      matchType: "potential-source",
      rank: 1,
      pageUrl: "https://example.com/cup",
    });
    expect(state.searchResults).toHaveLength(1);
    expect(state.activeSession?.searches[0].mode).toBe("text-source-discovery");
    expect(runResearchSearch).toHaveBeenCalledWith({
      query: "blue cup",
      provider: "venice-google",
      maxResults: 10,
    });
  });
});
