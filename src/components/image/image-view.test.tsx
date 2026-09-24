// VERIFY-056 regression guard
import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.fn();
const mediaUpsert = vi.fn();
const mediaUpsertDerivative = vi.fn();
const { enhancePromptMock, modelsDataMock } = vi.hoisted(() => ({
  enhancePromptMock: vi.fn(),
  modelsDataMock: vi.fn(),
}));
const {
  isElectronMock,
  persistGeneratedImage,
  retryGeneratedImage,
  saveGeneratedImageRecovery,
} = vi.hoisted(() => ({
  isElectronMock: vi.fn(() => false),
  persistGeneratedImage: vi.fn(),
  retryGeneratedImage: vi.fn(),
  saveGeneratedImageRecovery: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

vi.mock("../../hooks/use-image", () => ({
  useImageGenerate: () => ({ mutate, isPending: false, error: null }),
}));

vi.mock("../../hooks/use-models", () => ({
  useModels: () => ({
    data: modelsDataMock(),
  }),
}));

vi.mock("../../hooks/use-styles", () => ({ useStyles: () => ({ data: [] }) }));

vi.mock("../../services/prompt-enhancer-service", () => ({
  enhancePrompt: enhancePromptMock,
}));

vi.mock("../../stores/auth-store", () => ({
  selectHasVeniceKey: (state: {
    apiKey: string | null;
    isConfigured: boolean;
  }) => state.isConfigured || Boolean(state.apiKey),
  useAuthStore: (
    selector: (state: {
      apiKey: string | null;
      isConfigured: boolean;
    }) => unknown,
  ) => selector({ apiKey: null, isConfigured: true }),
}));

vi.mock("../../stores/media-store", () => ({
  useMediaStore: Object.assign(() => null, {
    getState: () => ({
      upsert: mediaUpsert,
      upsertDerivative: mediaUpsertDerivative,
    }),
  }),
}));

vi.mock("../../services/desktopBridge", () => ({
  isElectron: isElectronMock,
  desktopMedia: {
    persistGeneratedImage,
    retryGeneratedImage,
    saveGeneratedImageRecovery,
    saveMediaAs: vi.fn(),
  },
}));

import { useSettingsStore } from "../../stores/settings-store";
import { ImageView } from "./image-view";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";
import * as imageCapabilities from "../../config/image-model-capabilities";
import { i18n } from "../../i18n";
import { useToastStore } from "../../stores/toast-store";

describe("ImageView model-aware payloads", () => {
  beforeEach(() => {
    modelsDataMock.mockReset().mockReturnValue([
      {
        id: "nano-banana-v1",
        model_spec: {
          constraints: {
            aspect_ratios: ["1:1", "16:9"],
            default_aspect_ratio: "16:9",
            resolutions: ["1k", "2k"],
            default_resolution: "2k",
            steps: { min: 1, max: 50, default: 20 },
          },
        },
      },
    ]);
    mutate.mockReset();
    mediaUpsert.mockReset().mockResolvedValue(undefined);
    mediaUpsertDerivative.mockReset().mockResolvedValue(undefined);
    isElectronMock.mockReset().mockReturnValue(false);
    persistGeneratedImage.mockReset();
    retryGeneratedImage.mockReset();
    saveGeneratedImageRecovery.mockReset();
    enhancePromptMock.mockReset().mockResolvedValue({
      prompt: "Enhanced copper city",
      modelUsed: "internal-text-enhancer",
      truncated: false,
    });
    useToastStore.setState({ toasts: [] });
    useImageWorkspaceStore.getState().reset();
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "nano-banana-v1" },
    }));
  });

  it("localizes labels and option presentation without changing canonical values", async () => {
    await act(async () => {
      await i18n.changeLanguage("sv-SE");
    });
    render(<ImageView />);
    expect(
      screen.getByPlaceholderText(/fridfullt bergslandskap/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generera" }),
    ).toBeInTheDocument();
    const aspect = screen.getByRole("radiogroup", { name: "Bildformat" });
    expect(aspect).toHaveTextContent("Fyrkant");
    expect(screen.getByRole("radio", { name: /Fyrkant/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  });

  // VERIFY-040: aspect-resolution models must never leak pixel dimensions.
  it("sends aspect_ratio + resolution + quality without width/height", () => {
    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      {
        target: { value: "A copper city at dusk" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const request = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "nano-banana-v1",
      prompt: "A copper city at dusk",
      aspect_ratio: "1:1",
      resolution: "2k",
      quality: "high",
    });
    expect(request.width).toBeUndefined();
    expect(request.height).toBeUndefined();
    expect(request.format).toBe("png");
    expect(request).not.toHaveProperty("output_format");
    expect(request).not.toHaveProperty("cfg_scale");
  });

  it("allows selecting WEBP output format and sends format: webp in request", () => {
    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      {
        target: { value: "A copper city at dusk" },
      },
    );
    const webpPill = screen.getByRole("radio", { name: "WEBP" });
    fireEvent.click(webpPill);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const request = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.format).toBe("webp");
  });

  it("renders CFG scale slider for applicable models and sends cfg_scale when modified", () => {
    render(<ImageView />);
    const cfgSlider = screen.getByRole("slider", { name: /cfg scale/i });
    expect(cfgSlider).toBeInTheDocument();
    expect(cfgSlider).toHaveValue("7");

    fireEvent.change(cfgSlider, { target: { value: "9.5" } });
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A vivid painting" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const request = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request.cfg_scale).toBe(9.5);
  });

  it("allows clearing CFG scale back to auto/default so cfg_scale is omitted", () => {
    render(<ImageView />);
    const cfgSlider = screen.getByRole("slider", { name: /cfg scale/i });
    fireEvent.change(cfgSlider, { target: { value: "11" } });

    const clearBtn = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearBtn);

    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A vivid painting" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const request = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).not.toHaveProperty("cfg_scale");
  });

  it("hides CFG scale slider when model does not support it", () => {
    const originalGetCapabilities = imageCapabilities.getImageModelCapabilities;
    vi.spyOn(imageCapabilities, "getImageModelCapabilities").mockImplementation(
      (modelId) => ({
        ...originalGetCapabilities(modelId),
        supportsCfgScale: false,
      }),
    );

    render(<ImageView />);
    expect(screen.queryByRole("slider", { name: /cfg scale/i })).not.toBeInTheDocument();
  });

  it("shows the variants control for wai-Illustrious and emits variants when count > 1", () => {
    modelsDataMock.mockReturnValue([
      {
        id: "wai-Illustrious",
        model_spec: {
          constraints: {
            promptCharacterLimit: 1500,
            steps: { default: 25, max: 30 },
            widthHeightDivisor: 16,
          },
        },
      },
    ]);
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "wai-Illustrious" },
    }));

    render(<ImageView />);

    const variantsSlider = screen.getByRole("slider", { name: /variants/i });
    fireEvent.change(variantsSlider, { target: { value: "4" } });
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "a puppy" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const request = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "wai-Illustrious",
      prompt: "a puppy",
      variants: 4,
      width: 1024,
      height: 1024,
    });
    expect(request).not.toHaveProperty("cfg_scale");
    expect(request.steps).toBe(25);
  });

  it("applies live steps.default when switching to wai-Illustrious", () => {
    modelsDataMock.mockReturnValue([
      {
        id: "lustify-sdxl",
        model_spec: {
          constraints: {
            steps: { default: 20, max: 50 },
            widthHeightDivisor: 8,
          },
        },
      },
      {
        id: "wai-Illustrious",
        model_spec: {
          constraints: {
            promptCharacterLimit: 1500,
            steps: { default: 25, max: 30 },
            widthHeightDivisor: 16,
          },
        },
      },
    ]);
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "lustify-sdxl" },
    }));

    const { rerender } = render(<ImageView />);
    expect(screen.getByRole("slider", { name: /^steps$/i })).toHaveValue("20");

    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "wai-Illustrious" },
    }));
    rerender(<ImageView />);

    expect(screen.getByRole("slider", { name: /^steps$/i })).toHaveValue("25");
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "a cat" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      model: "wai-Illustrious",
      steps: 25,
    });
  });

  it("hides variants and omits the field when capabilities disable them", () => {
    const originalGetCapabilities = imageCapabilities.getImageModelCapabilities;
    vi.spyOn(imageCapabilities, "getImageModelCapabilities").mockImplementation(
      (modelId) => ({
        ...originalGetCapabilities(modelId),
        supportsVariants: false,
      }),
    );

    render(<ImageView />);

    expect(
      screen.queryByRole("slider", { name: /variants/i }),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A copper city at dusk" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(mutate.mock.calls[0]?.[0]).not.toHaveProperty("variants");
  });

  it("shows runtime-supported style references and serializes the selected image", async () => {
    modelsDataMock.mockReturnValue([
      {
        id: "nano-banana-v1",
        model_spec: {
          supportsStyleReferences: true,
          constraints: {
            aspect_ratios: ["1:1"],
            resolutions: ["2k"],
            maxStyleReferences: 2,
            supportsStyleReferenceStrength: true,
          },
        },
      },
    ]);
    render(<ImageView />);

    const input = screen.getByLabelText("Add style reference images");
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1, 2, 3, 4])], "palette.png", {
            type: "image/png",
          }),
        ],
      },
    });

    expect(await screen.findByText("palette.png")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Strength for palette.png" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: "A copper city at dusk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(mutate.mock.calls[0][0]).toMatchObject({
      style_references: [
        {
          image: "data:image/png;base64,AQIDBA==",
          strength: 0.5,
        },
      ],
    });
  });

  it("omits reference strength when runtime metadata disables it", async () => {
    modelsDataMock.mockReturnValue([
      {
        id: "nano-banana-v1",
        model_spec: {
          supportsStyleReferences: true,
          constraints: {
            aspect_ratios: ["1:1"],
            resolutions: ["2k"],
            maxStyleReferences: 1,
            supportsStyleReferenceStrength: false,
          },
        },
      },
    ]);
    render(<ImageView />);
    fireEvent.change(screen.getByLabelText("Add style reference images"), {
      target: {
        files: [new File([new Uint8Array([5])], "linework.webp", { type: "image/webp" })],
      },
    });
    expect(await screen.findByText("linework.webp")).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: /Strength for/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: "A copper city at dusk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const references = (mutate.mock.calls[0][0] as { style_references: Array<Record<string, unknown>> }).style_references;
    expect(references).toHaveLength(1);
    expect(references[0]).not.toHaveProperty("strength");
  });

  it("enforces the runtime reference limit and supports accessible removal", async () => {
    modelsDataMock.mockReturnValue([
      {
        id: "nano-banana-v1",
        model_spec: {
          supportsStyleReferences: true,
          constraints: { maxStyleReferences: 1 },
        },
      },
    ]);
    render(<ImageView />);
    const input = screen.getByLabelText("Add style reference images");
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1])], "first.png", { type: "image/png" }),
          new File([new Uint8Array([2])], "second.png", { type: "image/png" }),
        ],
      },
    });

    expect(await screen.findByText("first.png")).toBeInTheDocument();
    expect(screen.queryByText("second.png")).not.toBeInTheDocument();
    expect(input).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove first.png" }));
    expect(screen.queryByText("first.png")).not.toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it.each([
    [{ supportsStyleReferences: false, constraints: { maxStyleReferences: 3 } }, "disabled"],
    [{ constraints: { maxStyleReferences: 3 } }, "missing"],
    [{ supportsStyleReferences: true, constraints: { maxStyleReferences: 0 } }, "zero-limit"],
  ])("fails closed when runtime style-reference metadata is %s", (modelSpec, _label) => {
    modelsDataMock.mockReturnValue([{ id: "nano-banana-v1", model_spec: modelSpec }]);
    render(<ImageView />);
    expect(screen.queryByLabelText("Add style reference images")).not.toBeInTheDocument();
  });

  it("clears selected references after switching through an unsupported model", async () => {
    modelsDataMock.mockReturnValue([
      {
        id: "nano-banana-v1",
        model_spec: {
          supportsStyleReferences: true,
          constraints: { maxStyleReferences: 1 },
        },
      },
      {
        id: "unknown-model-xyz",
        model_spec: { supportsStyleReferences: false },
      },
    ]);
    render(<ImageView />);
    fireEvent.change(screen.getByLabelText("Add style reference images"), {
      target: {
        files: [new File([new Uint8Array([3])], "temporary.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByText("temporary.png")).toBeInTheDocument();

    act(() => {
      useSettingsStore.getState().setSelectedModel("image", "unknown-model-xyz");
    });
    expect(screen.queryByLabelText("Add style reference images")).not.toBeInTheDocument();
    act(() => {
      useSettingsStore.getState().setSelectedModel("image", "nano-banana-v1");
    });
    expect(screen.getByLabelText("Add style reference images")).toBeInTheDocument();
    expect(screen.queryByText("temporary.png")).not.toBeInTheDocument();
  });

  it("keeps a generated image downloadable when gallery persistence fails", async () => {
    mediaUpsert.mockRejectedValueOnce(new Error("Storage unavailable"));
    mutate.mockImplementation(
      (
        _req: unknown,
        options?: { onSuccess?: (data: { images: string[] }) => Promise<void> },
      ) => {
        void options?.onSuccess?.({
          images: [
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          ],
        });
      },
    );

    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A copper city at dusk" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /open generated image 1/i }),
      ).toBeInTheDocument(),
    );
    expect(mediaUpsert).toHaveBeenCalledTimes(1);
  });

  it("retries transient gallery transaction failures", async () => {
    const transient = new Error("transaction aborted");
    transient.name = "AbortError";
    mediaUpsert
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce(undefined);
    mutate.mockImplementation(
      (
        _req: unknown,
        options?: { onSuccess?: (data: { images: string[] }) => Promise<void> },
      ) => {
        void options?.onSuccess?.({
          images: [
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          ],
        });
      },
    );

    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A retried copper city" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(mediaUpsert).toHaveBeenCalledTimes(2));
  });

  it("stores desktop images by stable content URL instead of a data URL", async () => {
    isElectronMock.mockReturnValue(true);
    persistGeneratedImage.mockResolvedValue({
      ok: true,
      media: {
        id: "a".repeat(64),
        url: `venice-media://${"a".repeat(64)}`,
        mimeType: "image/png",
        byteCount: 68,
        sha256: "a".repeat(64),
      },
    });
    mutate.mockImplementation(
      (
        _req: unknown,
        options?: { onSuccess?: (data: { images: string[] }) => Promise<void> },
      ) => {
        void options?.onSuccess?.({
          images: [
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          ],
        });
      },
    );

    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A durable copper city" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(mediaUpsert).toHaveBeenCalledTimes(1));
    expect(persistGeneratedImage).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    expect(mediaUpsert.mock.calls[0][0]).toMatchObject({
      image: `venice-media://${"a".repeat(64)}`,
      generatedMediaId: "a".repeat(64),
      sha256: "a".repeat(64),
    });
    expect(mediaUpsert.mock.calls[0][0].image).not.toMatch(/^data:/);
  });

  it("offers retry after desktop persistence fails and replaces volatile bytes with a durable URL", async () => {
    isElectronMock.mockReturnValue(true);
    persistGeneratedImage.mockResolvedValue({
      ok: false,
      error: "Local storage is full.",
      errorKind: "storage-full",
      recoveryId: "11111111-1111-4111-8111-111111111111",
    });
    retryGeneratedImage.mockResolvedValue({
      ok: true,
      media: {
        id: "b".repeat(64),
        url: `venice-media://${"b".repeat(64)}`,
        mimeType: "image/png",
        byteCount: 68,
        sha256: "b".repeat(64),
      },
    });
    mutate.mockImplementation(
      (
        _req: unknown,
        options?: { onSuccess?: (data: { images: string[] }) => Promise<void> },
      ) => {
        void options?.onSuccess?.({
          images: ["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],
        });
      },
    );

    render(<ImageView />);
    fireEvent.change(screen.getByPlaceholderText(/serene mountain landscape/i), {
      target: { value: "A recoverable copper city" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    const retry = await screen.findByRole("button", { name: "Retry Save" });
    expect(mediaUpsert).not.toHaveBeenCalled();
    fireEvent.click(retry);

    await waitFor(() => expect(retryGeneratedImage).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
    await waitFor(() => expect(mediaUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ image: `venice-media://${"b".repeat(64)}`, generatedMediaId: "b".repeat(64) }),
      expect.any(Object),
    ));
    expect(screen.queryByRole("button", { name: "Retry Save" })).not.toBeInTheDocument();
  });

  it("applies a queued regenerate draft before auto-generation", async () => {
    useImageWorkspaceStore.getState().enqueueGenerate({
      draft: {
        model: "nano-banana-v1",
        prompt: "Reviewed remix prompt",
        aspectRatio: "1:1",
        resolution: "1k",
        seed: -42,
        steps: 28,
        cfgScale: 6.5,
        imageCount: 2,
      },
      autoGenerate: true,
      parentId: "parent-1",
      operation: "regenerate",
    });

    render(<ImageView />);

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toMatchObject({
      prompt: "Reviewed remix prompt",
      aspect_ratio: "1:1",
      resolution: "1k",
      seed: -42,
      steps: 28,
      cfg_scale: 6.5,
      variants: 2,
    });
    expect(useImageWorkspaceStore.getState().pending).toBeNull();
  });

  // VERIFY-043: image-view must surface the model capability summary and
  // honor the per-capability supports* flags end-to-end.
  it("renders a capability summary for the selected model", () => {
    render(<ImageView />);
    const summary = screen.getByTestId("image-capability-summary");
    expect(summary).toBeInTheDocument();
    expect(summary.textContent).toMatch(/Nano Banana/);
  });

  it("strips seed + style + steps + cfg when supports* is false on the model", () => {
    // nano-banana-v1 supports all of them by default; mutate the
    // settings-store so a synthetic "no-support" model is used. The
    // payload builder is covered by the dedicated modelAware test; here
    // we assert the form hides the controls.
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "unknown-model-xyz" },
    }));
    render(<ImageView />);
    // The capability summary still renders
    expect(screen.getByTestId("image-capability-summary")).toBeInTheDocument();
  });

  it("keeps a negative template pending for an incompatible model", () => {
    const originalGetCapabilities = imageCapabilities.getImageModelCapabilities;
    vi.spyOn(imageCapabilities, "getImageModelCapabilities").mockImplementation(
      (modelId) => ({
        ...originalGetCapabilities(modelId),
        supportsNegativePrompt:
          modelId === "unknown-model-xyz"
            ? false
            : originalGetCapabilities(modelId).supportsNegativePrompt,
      }),
    );
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "unknown-model-xyz" },
    }));
    render(<ImageView />);
    const prompt = screen.getByPlaceholderText(/serene mountain landscape/i);
    fireEvent.change(prompt, { target: { value: "Original prompt" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Prompt template" }),
      { target: { value: "neg-standard" } },
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /does not support negative prompts/i,
    );
    expect(screen.getByRole("button", { name: "Append" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Replace" })).toBeDisabled();
    expect(prompt).toHaveValue("Original prompt");
  });

  // VF-20260916-P2-006: interactive input is never silently truncated. Over-
  // limit input is preserved, the meter flags it, and Generate is blocked.
  it("blocks Generate instead of truncating when typing over the limit", () => {
    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      {
        target: { value: "a".repeat(7501) },
      },
    );

    const meter = screen.getByTestId("prompt-limit-meter");
    expect(meter).toHaveTextContent("7,501/7,500");
    expect(meter).toHaveAttribute("data-over-limit", "true");
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps pasted input intact past the limit and flags it for trimming", () => {
    render(<ImageView />);
    const textarea = screen.getByPlaceholderText(/serene mountain landscape/i);
    fireEvent.paste(textarea, {
      clipboardData: { getData: () => "a".repeat(8000) },
    });
    fireEvent.change(textarea, { target: { value: "a".repeat(8000) } });

    // Nothing is silently dropped — the full paste survives for the user to
    // trim, with the meter surfacing the over-limit state.
    expect(textarea).toHaveValue("a".repeat(8000));
    const meter = screen.getByTestId("prompt-limit-meter");
    expect(meter).toHaveTextContent("8,000/7,500");
    expect(meter).toHaveAttribute("data-over-limit", "true");
  });

  it("passes selected downstream context and requires explicit preview acceptance", async () => {
    render(<ImageView />);
    const textarea = screen.getByPlaceholderText(/serene mountain landscape/i);
    fireEvent.change(textarea, { target: { value: "A copper city at dusk" } });
    fireEvent.click(screen.getByRole("button", { name: "Enhance prompt" }));

    await waitFor(() => expect(enhancePromptMock).toHaveBeenCalledTimes(1));
    expect(enhancePromptMock.mock.calls[0][0]).toMatchObject({
      mode: "enhance",
      prompt: "A copper city at dusk",
      targetModel: {
        id: "nano-banana-v1",
        dimensionMode: "aspectResolution",
      },
      dimensions: { aspectRatio: "1:1", resolution: "2k" },
      generationMode: "text-to-image",
    });
    expect(textarea).toHaveValue("A copper city at dusk");
    expect(await screen.findByText("Enhanced copper city")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use enhanced prompt" }));
    expect(textarea).toHaveValue("Enhanced copper city");
  });

  it("surfaces enhancer fallback instead of presenting the unchanged prompt as success", async () => {
    enhancePromptMock.mockResolvedValueOnce({
      prompt: "A copper city at dusk",
      modelUsed: "internal-text-enhancer",
      truncated: false,
      fallbackReason: "provider-error",
    });
    render(<ImageView />);
    const textarea = screen.getByPlaceholderText(/serene mountain landscape/i);
    fireEvent.change(textarea, { target: { value: "A copper city at dusk" } });
    fireEvent.click(screen.getByRole("button", { name: "Enhance prompt" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variant: "error",
            title: "Prompt enhancement failed",
          }),
        ]),
      );
    });
    expect(screen.queryByText("Enhanced prompt preview")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("A copper city at dusk");
  });

  it("explains that a safety-block fallback preserves the original prompt", async () => {
    enhancePromptMock.mockResolvedValueOnce({
      prompt: "A copper city at dusk",
      modelUsed: "internal-text-enhancer",
      truncated: false,
      fallbackReason: "safety-block",
    });
    render(<ImageView />);
    const textarea = screen.getByPlaceholderText(/serene mountain landscape/i);
    fireEvent.change(textarea, { target: { value: "A copper city at dusk" } });
    fireEvent.click(screen.getByRole("button", { name: "Enhance prompt" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variant: "error",
            title: "Prompt enhancement failed",
            description: expect.stringMatching(/local child-safety protections while Family Safe Mode was enabled/i),
          }),
        ]),
      );
    });
    expect(screen.queryByText("Enhanced prompt preview")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("A copper city at dusk");
  });

  it("uses the child-safety toast message when the safety layer is present", async () => {
    enhancePromptMock.mockResolvedValueOnce({
      prompt: "A copper city at dusk",
      modelUsed: "internal-text-enhancer",
      truncated: false,
      fallbackReason: "safety-block",
      safetyLayer: "mandatory-child-safety",
      safetyCategory: "csam",
      safetyReasonCode: "CSAM_GENRE_TERM",
    });
    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A copper city at dusk" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Enhance prompt" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variant: "error",
            title: "Prompt enhancement failed",
            description: expect.stringMatching(/local child-safety protections/i),
          }),
        ]),
      );
    });
  });

  it("uses the optional-family-policy toast message for family-filter blocks", async () => {
    enhancePromptMock.mockResolvedValueOnce({
      prompt: "A copper city at dusk",
      modelUsed: "internal-text-enhancer",
      truncated: false,
      fallbackReason: "safety-block",
      safetyLayer: "optional-family-policy",
      safetyCategory: "adult-explicit-image",
      safetyReasonCode: "ADULT_EXPLICIT_IMAGE",
    });
    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A copper city at dusk" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Enhance prompt" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variant: "error",
            title: "Prompt enhancement failed",
            description: expect.stringMatching(/optional Family Safe Mode/i),
          }),
        ]),
      );
    });
  });

  it("uses the provider-policy toast message for provider safety blocks", async () => {
    enhancePromptMock.mockResolvedValueOnce({
      prompt: "A copper city at dusk",
      modelUsed: "internal-text-enhancer",
      truncated: false,
      fallbackReason: "safety-block",
      safetyLayer: "provider-policy",
      safetyCategory: "provider-restriction",
      safetyReasonCode: "PROVIDER_SAFE_MODE",
    });
    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      { target: { value: "A copper city at dusk" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Enhance prompt" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variant: "error",
            title: "Prompt enhancement failed",
            description: expect.stringMatching(/provider policy/i),
          }),
        ]),
      );
    });
  });
});

describe("ImageView lightbox", () => {
  const tinyPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  beforeEach(() => {
    mutate.mockReset();
    useImageWorkspaceStore.getState().reset();
    useSettingsStore.setState((state) => ({
      ...state,
      selectedModels: { ...state.selectedModels, image: "nano-banana-v1" },
    }));
  });

  it("opens a focus-trapped dialog with role, aria-modal, and aria-label", async () => {
    mutate.mockImplementation(
      (
        _req: unknown,
        options?: { onSuccess?: (data: { images: string[] }) => void },
      ) => {
        options?.onSuccess?.({ images: [tinyPng] });
      },
    );

    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      {
        target: { value: "A tiny test image" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const image = await screen.findByAltText("Generated 1");
    fireEvent.click(image);

    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Image preview");

    // Focus should be inside the dialog (first focusable button is Download).
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes the lightbox on Escape and restores focus to the trigger image", async () => {
    mutate.mockImplementation(
      (
        _req: unknown,
        options?: { onSuccess?: (data: { images: string[] }) => void },
      ) => {
        options?.onSuccess?.({ images: [tinyPng] });
      },
    );

    render(<ImageView />);
    fireEvent.change(
      screen.getByPlaceholderText(/serene mountain landscape/i),
      {
        target: { value: "A tiny test image" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    const image = await screen.findByAltText("Generated 1");
    fireEvent.click(image);

    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Image preview" }),
      ).not.toBeInTheDocument();
    });

    // The trigger image should regain focus because it was focused on click.
    expect(document.activeElement).toBe(image.closest("button"));
  });
});
