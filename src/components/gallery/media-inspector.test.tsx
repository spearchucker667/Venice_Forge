/** @fileoverview Tests for the MediaInspector new gallery actions. */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/prompt-enhancer-service", () => ({
  enhancePrompt: vi.fn().mockResolvedValue({ prompt: "Enhanced prompt", modelUsed: "test" }),
  remixPrompt: vi.fn().mockResolvedValue({ prompt: "Reviewed remix", modelUsed: "test" }),
}));

import { useConfigStore } from "../../stores/config-store";
import type { MediaItem } from "../../types/media";
import { MediaInspector } from "./media-inspector";

const baseItem: MediaItem = {
  id: "img-1",
  image: "data:image/png;base64,abc",
  prompt: "A misty mountain",
  negative: "blurry",
  model: "flux-dev",
  width: 1024,
  height: 1024,
  steps: 20,
  cfg: 7,
  seed: 12345,
  source: "image-page",
  timestamp: 1,
  mediaType: "image",
  operation: "generate",
  parentId: null,
  childrenIds: [],
  tags: [],
  note: "",
  favorite: false,
};

beforeEach(() => {
  useConfigStore.setState({
    config: {
      version: 1,
      app: { config_name: "x", profile: "p", auto_open_devtools: false, check_for_updates: true },
      secrets: { has_venice_api_key: false, has_jina_api_key: false, keep_plaintext_keys: false },
      theme: { active: "x", themes_file: "" },
      models: { chat: "", image: "", video: "", audio: "", music: "", embedding: "", upscale: "" },
      chat: {
        system_prompt: "",
        temperature: 0.7,
        top_p: 1,
        max_tokens: 1024,
        include_venice_system_prompt: false,
        enable_web_search: "off",
        enable_web_scraping: false,
        enable_web_citations: false,
        strip_thinking_response: false,
        disable_thinking: false,
      },
      memory: { enable_memory_retrieval: true, show_pulled_context_before_sending: false },
      research: { default_provider: "venice", enable_jina: false, enable_social_discovery: false },
      characters: { enabled: true, include_adult_characters: false, default_character_slug: "" },
      safety: { local_family_safe_mode_enabled: true, venice_api_safe_mode: true },
      developer: {
        verbose_config_logging: false,
        allow_config_key_import: true,
        force_import_keys: false,
        force_apply_config: false,
      },
      internal_prompt_enhancer: {
        enabled: true,
        model: "venice-uncensored-1-2",
        temperature: 0.4,
        maxTokens: 350,
        systemPrompt: "",
        remixSystemPrompt: "",
      },
    },
    status: null,
    loading: false,
    hydrated: true,
    error: null,
    lastLoadedAt: 0,
  });
});

describe("MediaInspector — gallery actions", () => {
  it("renders Use settings / Regenerate / Same seed / Copy prompt / Copy negative / Copy seed / Copy metadata buttons", () => {
    render(
      <MediaInspector
        item={baseItem}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("inspector-use-settings")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-regenerate")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-regenerate-same-seed")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-copy-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-copy-negative")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-copy-seed")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-copy-metadata")).toBeInTheDocument();
  });

  it("hides Copy seed when no seed is present", () => {
    render(
      <MediaInspector
        item={{ ...baseItem, seed: undefined }}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("inspector-copy-seed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-regenerate-same-seed")).not.toBeInTheDocument();
  });

  it("hides Copy negative when no negative prompt is present", () => {
    render(
      <MediaInspector
        item={{ ...baseItem, negative: undefined }}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("inspector-copy-negative")).not.toBeInTheDocument();
  });

  it("invokes onUseSettings when Use settings is clicked", () => {
    const onUseSettings = vi.fn();
    render(
      <MediaInspector
        item={baseItem}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={onUseSettings}
        onRegenerate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-use-settings"));
    expect(onUseSettings).toHaveBeenCalledTimes(1);
    expect(onUseSettings.mock.calls[0][0].id).toBe("img-1");
  });

  it("invokes onRegenerate without seed when Regenerate is clicked", () => {
    const onRegenerate = vi.fn();
    render(
      <MediaInspector
        item={baseItem}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={vi.fn()}
        onRegenerate={onRegenerate}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-regenerate"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    const [item, opts] = onRegenerate.mock.calls[0];
    expect(item.id).toBe("img-1");
    expect(opts?.sameSeed).toBe(false);
  });

  it("invokes onRegenerate with sameSeed: true when Same seed is clicked", () => {
    const onRegenerate = vi.fn();
    render(
      <MediaInspector
        item={baseItem}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={vi.fn()}
        onRegenerate={onRegenerate}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-regenerate-same-seed"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate.mock.calls[0][1]?.sameSeed).toBe(true);
  });

  it("sends the reviewed remix as one regenerate request", async () => {
    const onRegenerate = vi.fn();
    const onApplyRemix = vi.fn();
    render(
      <MediaInspector
        item={baseItem}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onRegenerate={onRegenerate}
        onApplyRemix={onApplyRemix}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-remix"));
    fireEvent.click(await screen.findByTestId("inspector-remix-and-generate"));

    expect(onRegenerate).toHaveBeenCalledWith(baseItem, {
      sameSeed: false,
      promptOverride: "Reviewed remix",
    });
    expect(onApplyRemix).not.toHaveBeenCalled();
  });

  it("disables Enhance / Remix when internal_prompt_enhancer.enabled is false", () => {
    useConfigStore.setState((state) => ({
      config: state.config
        ? { ...state.config, internal_prompt_enhancer: { ...state.config.internal_prompt_enhancer, enabled: false } }
        : state.config,
    }));
    render(
      <MediaInspector
        item={baseItem}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const enhance = screen.getByTestId("inspector-enhance") as HTMLButtonElement;
    const remix = screen.getByTestId("inspector-remix") as HTMLButtonElement;
    expect(enhance.disabled).toBe(true);
    expect(remix.disabled).toBe(true);
  });

  it("renders Upscale / Edit when the model capabilities include them", () => {
    render(
      <MediaInspector
        item={{ ...baseItem, model: "esrgan-edit" }}
        parentItem={null}
        childrenItems={[]}
        missingChildIds={[]}
        onPatch={vi.fn()}
        onDelete={vi.fn()}
        onOpenChild={vi.fn()}
        onOpenParent={vi.fn()}
        onClose={vi.fn()}
        onUseSettings={vi.fn()}
        onRegenerate={vi.fn()}
        onUpscale={vi.fn()}
        onOpenImageTools={vi.fn()}
      />,
    );
    // The capabilities classifier may mark some models as upscale/edit;
    // the assertion is that, when applicable, the buttons render.
    const upscale = screen.queryByTestId("inspector-upscale");
    const edit = screen.queryByTestId("inspector-edit");
    expect(upscale).toBeInTheDocument();
    expect(edit).toBeInTheDocument();
  });
});
