/** @fileoverview Unit tests for useSettingsPersistence hook. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettingsPersistence } from "./useSettingsPersistence";
import StorageService from "../services/storageService";
import type { AppState, AppDispatch } from "../types/app";

vi.mock("../services/storageService", () => ({
  default: {
    saveItem: vi.fn(),
  },
}));

vi.mock("../stores/toast-store", () => ({
  toast: {
    error: vi.fn(),
  },
}));
import { toast } from "../stores/toast-store";

const mockSaveItem = vi.mocked(StorageService.saveItem);

describe("useSettingsPersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSaveItem.mockResolvedValue({ id: "app-settings", timestamp: 1 } as Awaited<ReturnType<typeof StorageService.saveItem>>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const settings: AppState["settings"] = {
    localFamilySafeModeEnabled: true,
    veniceApiSafeMode: true,
    defaultSystemPrompt: "test",
    includeVeniceSystemPrompt: true,
    webSearch: "off",
    webScraping: false,
    webCitations: false,
    theme: "dark",
    customModels: [],
    selectedThemeId: "builtin-dark",
    appearanceMode: "dark",
    customTheme: null,
  };

  it("does not save until dbReady and settingsHydrated are true", () => {
    const dispatch = vi.fn() as AppDispatch;
    renderHook(() => useSettingsPersistence(settings, false, false, dispatch));
    vi.advanceTimersByTime(1000);
    expect(mockSaveItem).not.toHaveBeenCalled();
  });

  it("debounces saves by 500ms when conditions are met", async () => {
    const dispatch = vi.fn() as AppDispatch;
    renderHook(() => useSettingsPersistence(settings, true, true, dispatch));

    vi.advanceTimersByTime(400);
    expect(mockSaveItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    // Flush pending promises so the resolved saveItem is processed
    await vi.advanceTimersByTimeAsync(0);

    expect(mockSaveItem).toHaveBeenCalledOnce();
    expect(mockSaveItem).toHaveBeenCalledWith(
      "settings",
      expect.objectContaining({
        id: "app-settings",
        value: settings,
      })
    );
  });

  it("resets the debounce timer when settings change rapidly", async () => {
    const dispatch = vi.fn() as AppDispatch;
    const { rerender } = renderHook(
      ({ s }) => useSettingsPersistence(s, true, true, dispatch),
      { initialProps: { s: { ...settings, defaultSystemPrompt: "a" } } }
    );

    vi.advanceTimersByTime(400);
    expect(mockSaveItem).not.toHaveBeenCalled();

    // Change settings before timer fires
    rerender({ s: { ...settings, defaultSystemPrompt: "b" } });
    vi.advanceTimersByTime(400);
    expect(mockSaveItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockSaveItem).toHaveBeenCalledOnce();
    expect(mockSaveItem).toHaveBeenCalledWith(
      "settings",
      expect.objectContaining({
        value: expect.objectContaining({ defaultSystemPrompt: "b" }),
      })
    );
  });

  it("dispatches a toast when save fails", async () => {
    mockSaveItem.mockRejectedValue(new Error("DB locked"));
    const dispatch = vi.fn() as AppDispatch;
    renderHook(() => useSettingsPersistence(settings, true, true, dispatch));

    vi.advanceTimersByTime(600);
    await vi.advanceTimersByTimeAsync(0);

    expect(toast.error).toHaveBeenCalledWith("Failed to save settings to local storage.");
  });

  it("cancels pending save on unmount", () => {
    const dispatch = vi.fn() as AppDispatch;
    const { unmount } = renderHook(() => useSettingsPersistence(settings, true, true, dispatch));

    vi.advanceTimersByTime(400);
    unmount();
    vi.advanceTimersByTime(200);
    expect(mockSaveItem).not.toHaveBeenCalled();
  });
});
