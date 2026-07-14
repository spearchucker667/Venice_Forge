// VERIFY-116 regression guard
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AUDIO_PREFERENCES, useSettingsStore } from "../../stores/settings-store";

const clearCache = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const success = vi.hoisted(() => vi.fn());

vi.mock("../../services/uiSoundController", () => ({ uiSoundController: { play: vi.fn(), preview: vi.fn() } }));
vi.mock("../../services/desktopBridge", () => ({ isElectron: () => true, desktopTts: { clearCache } }));
vi.mock("../../stores/toast-store", () => ({
  toast: { success, error: vi.fn(), fromError: vi.fn() },
}));
vi.mock("../../hooks/use-models", () => ({
  useModels: () => ({
    isLoading: false,
    data: [{
      id: "tts-live",
      object: "model",
      created: 1,
      owned_by: "venice",
      model_spec: { name: "Live Speech", voices: ["voice-one", "voice-two"] },
    }],
  }),
}));

import { AudioSpeechPanel } from "./AudioSpeechPanel";

describe("AudioSpeechPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ audioPreferences: DEFAULT_AUDIO_PREFERENCES });
  });

  it("renders the live TTS catalog and persists model and voice choices", () => {
    const { container } = render(<AudioSpeechPanel />);
    const selects = Array.from(container.querySelectorAll("select"));
    const modelSelect = selects.find((select) => Array.from(select.options).some((option) => option.value === "tts-live"))!;
    fireEvent.change(modelSelect, { target: { value: "tts-live" } });

    const voiceSelect = Array.from(container.querySelectorAll("select"))
      .find((select) => Array.from(select.options).some((option) => option.value === "voice-one"))!;
    fireEvent.change(voiceSelect, { target: { value: "voice-two" } });

    expect(useSettingsStore.getState().audioPreferences.chatTts).toMatchObject({ model: "tts-live", voice: "voice-two" });
  });

  it("clears the desktop cache and reports success", async () => {
    render(<AudioSpeechPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Clear TTS cache" }));

    await waitFor(() => expect(clearCache).toHaveBeenCalledOnce());
    expect(success).toHaveBeenCalledWith("TTS cache cleared");
  });
});
