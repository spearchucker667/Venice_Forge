// @vitest-environment jsdom
/** @fileoverview Unit tests for the `useDataStorageActions` hook.
 *
 *  These tests exercise the hook's return shape and the safety-ref
 *  callback wiring without standing up the full IDB / Electron IPC
 *  surface. The full E2E coverage of the 4 actions lives in
 *  `SettingsView.test.tsx` (which renders the panel and exercises the
 *  onClick handlers).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MutableRefObject } from "react";

// Mock the desktop bridge so the hook's IPC calls do not actually
// try to talk to Electron in jsdom (which would hang). We only need
// the hook to compile + run; we are not exercising the IPC paths.
vi.mock("../services/desktopBridge", () => ({
  isElectron: () => false,
  desktopApp: { getVersion: async () => "test-version" },
  desktopConfig: { writeSanitized: async () => ({ ok: true }) },
  desktopFiles: {
    exportJson: async () => true,
    importJsonString: async () => null, // simulates user cancelling the file picker
  },
}));

// Mock the StorageService default export. The real one is a default
// export wrapping an IDB-backed module; we replace it with no-op
// stubs so the hook does not actually touch IDB in this test.
vi.mock("../services/storageService", () => ({
  default: {
    clearStore: async () => undefined,
    getItems: async () => [],
    getItemsPage: async () => ({ items: [], total: 0, offset: 0, limit: 1, hasMore: false }),
    getItem: async () => null,
    saveItem: async (item: Record<string, unknown>) => ({ ...item, id: "x", timestamp: 0 }),
    deleteItem: async () => true,
  },
}));

import { useDataStorageActions } from "./use-data-storage-actions";

function buildSetters() {
  return {
    setSystemPrompt: vi.fn(),
    setVeniceParams: vi.fn(),
    setLocalFamilySafeModeEnabled: vi.fn(),
    setVeniceApiSafeMode: vi.fn(),
    setPendingConfirm: vi.fn(),
  };
}

function buildSafetyRefs() {
  return {
    applySafetyCancelRef: { current: null } as MutableRefObject<(() => void) | null>,
    applySafetyTertiaryRef: { current: null } as MutableRefObject<(() => void) | null>,
    applySafetyDismissRef: { current: null } as MutableRefObject<(() => void) | null>,
  };
}

describe("useDataStorageActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the 4 expected action functions", () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );
    expect(typeof result.current.clearLocalSettings).toBe("function");
    expect(typeof result.current.clearAllHistory).toBe("function");
    expect(typeof result.current.exportData).toBe("function");
    expect(typeof result.current.importData).toBe("function");
  });

  it("clearLocalSettings delegates to setPendingConfirm (does not call setters directly)", async () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );
    await act(async () => {
      await result.current.clearLocalSettings();
    });
    expect(setters.setPendingConfirm).toHaveBeenCalledTimes(1);
    // The setters are not called until the confirm handler fires.
    expect(setters.setSystemPrompt).not.toHaveBeenCalled();
    expect(setters.setVeniceParams).not.toHaveBeenCalled();
    expect(setters.setLocalFamilySafeModeEnabled).not.toHaveBeenCalled();
    expect(setters.setVeniceApiSafeMode).not.toHaveBeenCalled();
  });

  it("clearAllHistory delegates to setPendingConfirm", async () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );
    await act(async () => {
      await result.current.clearAllHistory();
    });
    expect(setters.setPendingConfirm).toHaveBeenCalledTimes(1);
  });

  it("exportData returns cleanly when the IPC stub resolves", async () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );
    await expect(
      act(async () => {
        await result.current.exportData();
      }),
    ).resolves.toBeUndefined();
  });

  it("importData returns cleanly when the file picker is cancelled (IPC returns null)", async () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );
    await expect(
      act(async () => {
        await result.current.importData();
      }),
    ).resolves.toBeUndefined();
    // The safety-choice refs must not be written when the file picker
    // was cancelled.
    expect(refs.applySafetyCancelRef.current).toBeNull();
    expect(refs.applySafetyTertiaryRef.current).toBeNull();
    expect(refs.applySafetyDismissRef.current).toBeNull();
  });

  it("clearLocalSettings and clearAllHistory are referentially stable across re-renders", () => {
    // These two functions do not depend on the safety flags, so they
    // are memoized once and stay referentially equal across renders.
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    const { result, rerender } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );
    const first = {
      clearLocalSettings: result.current.clearLocalSettings,
      clearAllHistory: result.current.clearAllHistory,
    };
    // Re-render with the same flags — functions should remain equal.
    rerender();
    expect(result.current.clearLocalSettings).toBe(first.clearLocalSettings);
    expect(result.current.clearAllHistory).toBe(first.clearAllHistory);
  });
});
