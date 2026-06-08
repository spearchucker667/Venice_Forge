/** @fileoverview VERIFY-044 — media-send-to (Phase 2B routing). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/desktopBridge", () => ({
  isElectron: () => false,
}));

import {
  availableDestinations,
  copyModelId,
  copyNegativePrompt,
  copyPrompt,
  copySeed,
  copyText,
  sendToChat,
  sendToImageStudio,
  sendToImageTools,
  sendToVideo,
} from "./media-send-to";
import { useImageWorkspaceStore } from "./image-workspace-store";
import { useSettingsStore } from "./settings-store";
import { useChatStore } from "./chat-store";
import { useMediaSelectionStore } from "./media-selection-store";
import { MEDIA_ITEM_VERSION, type MediaItem } from "../types/media";

function makeItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "m-1",
    image: "data:image/png;base64,AA",
    prompt: "A copper city at dusk",
    negative: "fog",
    model: "flux-dev",
    width: 1024,
    height: 1024,
    seed: 0,
    timestamp: 1,
    mediaType: "image",
    operation: "generate",
    parentId: null,
    childrenIds: [],
    tags: [],
    note: "",
    favorite: false,
    mediaItemVersion: MEDIA_ITEM_VERSION,
    ...over,
  } as MediaItem;
}

function resetStores() {
  useImageWorkspaceStore.setState({ pending: null })
  useSettingsStore.setState({
    activeTab: "media",
    activeProjectId: null,
    selectedModels: { chat: "venice-uncensored-1-2", image: "flux-dev" },
  } as never)
  // chat-store is persisted — setState to reset
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    veniceParams: { include_venice_system_prompt: false, enable_web_search: "off" },
    systemPrompt: "",
    temperature: 0.7,
    topP: 1,
    maxTokens: 1024,
    _hasLoadedHistory: true,
    pendingContext: null,
  })
  useMediaSelectionStore.setState({ selectedMediaIds: [], focusedMediaId: null, lastSelectedMediaId: null })
}

beforeEach(() => {
  resetStores()
})

afterEach(() => {
  resetStores()
  vi.restoreAllMocks()
})

describe("media-send-to (VERIFY-044)", () => {
  describe("copyText / field copy helpers", () => {
    it("copyText returns false on empty input", async () => {
      expect(await copyText("")).toBe(false)
    })

    it("copyText writes non-empty input via the clipboard shim", async () => {
      // jsdom does not implement navigator.clipboard.writeText by
      // default; the helper falls back to the textarea + execCommand
      // path. We stub execCommand to capture the call.
      const exec = vi.fn(() => true)
      ;(document as unknown as { execCommand: (cmd: string) => boolean }).execCommand = exec
      const ok = await copyText("hello world")
      expect(ok).toBe(true)
      expect(exec).toHaveBeenCalledWith("copy")
    })

    it("copyPrompt no-ops on empty prompt", async () => {
      expect(await copyPrompt(makeItem({ prompt: "" }))).toBe(false)
    })

    it("copyPrompt writes the prompt", async () => {
      const exec = vi.fn(() => true)
      ;(document as unknown as { execCommand: (cmd: string) => boolean }).execCommand = exec
      expect(await copyPrompt(makeItem())).toBe(true)
    })

    it("copyNegativePrompt no-ops when negative is missing", async () => {
      expect(await copyNegativePrompt(makeItem({ negative: undefined }))).toBe(false)
      expect(await copyNegativePrompt(makeItem({ negative: "" }))).toBe(false)
    })

    it("copyNegativePrompt writes the negative prompt", async () => {
      const exec = vi.fn(() => true)
      ;(document as unknown as { execCommand: (cmd: string) => boolean }).execCommand = exec
      expect(await copyNegativePrompt(makeItem())).toBe(true)
    })

    it("copyModelId writes the model id", async () => {
      const exec = vi.fn(() => true)
      ;(document as unknown as { execCommand: (cmd: string) => boolean }).execCommand = exec
      expect(await copyModelId(makeItem())).toBe(true)
    })

    it("copySeed writes a stringified integer seed", async () => {
      const exec = vi.fn(() => true)
      ;(document as unknown as { execCommand: (cmd: string) => boolean }).execCommand = exec
      expect(await copySeed(makeItem({ seed: 42 }))).toBe(true)
    })

    it("copySeed no-ops for non-integer or missing seed", async () => {
      expect(await copySeed(makeItem({ seed: undefined }))).toBe(false)
      expect(await copySeed(makeItem({ seed: 1.5 as unknown as number }))).toBe(false)
    })
  })

  describe("sendToImageStudio", () => {
    it("routes to image tab and enqueues a generate handoff", () => {
      const r = sendToImageStudio(makeItem())
      expect(r.ok).toBe(true)
      expect(r.destination).toBe("image")
      expect(useSettingsStore.getState().activeTab).toBe("image")
      const pending = useImageWorkspaceStore.getState().pending
      expect(pending?.target).toBe("generate")
      if (pending?.target === "generate") {
        expect(pending.autoGenerate).toBe(false)
        expect(pending.draft.prompt).toBe("A copper city at dusk")
        expect(pending.draft.model).toBe("flux-dev")
      }
      // The handoff id is reported so the caller can correlate.
      expect(r.artifactId).toBe(pending?.id)
    })

    it("rejects items with no recipe", () => {
      const r = sendToImageStudio(makeItem({ prompt: "", model: "" }))
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/no recipe/i)
    })
  })

  describe("sendToImageTools", () => {
    it("routes to image tab and enqueues an edit handoff", () => {
      const r = sendToImageTools(makeItem(), "edit")
      expect(r.ok).toBe(true)
      const pending = useImageWorkspaceStore.getState().pending
      expect(pending?.target).toBe("tools")
      if (pending?.target === "tools") {
        expect(pending.tool).toBe("edit")
        expect(pending.parentId).toBe("m-1")
      }
    })

    it("can be invoked with the upscale tool", () => {
      const r = sendToImageTools(makeItem(), "upscale")
      expect(r.ok).toBe(true)
      const pending = useImageWorkspaceStore.getState().pending
      if (pending?.target === "tools") expect(pending.tool).toBe("upscale")
    })
  })

  describe("sendToChat", () => {
    it("creates a new conversation, activates it, and routes to chat", () => {
      const r = sendToChat(makeItem())
      expect(r.ok).toBe(true)
      const convs = useChatStore.getState().conversations
      expect(convs.length).toBe(1)
      expect(convs[0]?.id).toBe(r.artifactId)
      expect(useChatStore.getState().activeConversationId).toBe(r.artifactId)
      expect(useSettingsStore.getState().activeTab).toBe("chat")
    })

    it("rejects items with no prompt", () => {
      const r = sendToChat(makeItem({ prompt: "" }))
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/no prompt/i)
    })

    it("uses the chat model from settings when available", () => {
      sendToChat(makeItem())
      const created = useChatStore.getState().conversations[0]
      expect(created?.model).toBe("venice-uncensored-1-2")
    })
  })

  describe("sendToVideo", () => {
    it("routes to video tab", () => {
      const r = sendToVideo(makeItem())
      expect(r.ok).toBe(true)
      expect(useSettingsStore.getState().activeTab).toBe("video")
    })
  })

  describe("availableDestinations", () => {
    it("returns image, chat, video for all items", () => {
      const out = availableDestinations(makeItem())
      expect(out).toContain("image")
      expect(out).toContain("chat")
      expect(out).toContain("video")
    })

    it("includes image-tools for image items", () => {
      const out = availableDestinations(makeItem({ mediaType: "image" }))
      expect(out).toContain("image-tools")
    })

    it("excludes image-tools for video items", () => {
      const out = availableDestinations(makeItem({ mediaType: "video" }))
      expect(out).not.toContain("image-tools")
    })

    it("returns [] for null/undefined input", () => {
      expect(availableDestinations(null)).toEqual([])
      expect(availableDestinations(undefined)).toEqual([])
    })
  })

  describe("handoff payload safety", () => {
    it("does NOT include the source image blob in the image-studio handoff", () => {
      sendToImageStudio(makeItem())
      const pending = useImageWorkspaceStore.getState().pending
      // The image-studio handoff is text-only by design; the image data
      // would be re-fetched via loadById on the studio side. Confirm.
      const text = JSON.stringify(pending)
      expect(text).not.toContain("data:image/png;base64")
    })

    it("does NOT include API keys or tokens in any handoff", () => {
      sendToImageStudio(makeItem())
      sendToImageTools(makeItem(), "edit")
      sendToChat(makeItem())
      const dumps = [
        JSON.stringify(useImageWorkspaceStore.getState().pending),
        JSON.stringify(useChatStore.getState().conversations),
      ].join("\n")
      expect(dumps).not.toMatch(/api[_-]?key/i)
      expect(dumps).not.toMatch(/bearer/i)
      expect(dumps).not.toMatch(/authorization/i)
    })
  })
});
