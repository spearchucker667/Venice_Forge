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

// VERIFY-055 regression guard: export/import failure paths must surface
// safe, generic toast messages and never emit raw exception text that
// could disclose local paths, upstream errors, or secret-adjacent data.
vi.mock("../stores/toast-store", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    fromError: vi.fn(),
  },
}));

// Mock the desktop bridge so the hook's IPC calls do not actually
// try to talk to Electron in jsdom (which would hang). We only need
// the hook to compile + run; we are not exercising the IPC paths.
//
// We spread `...actual` from `importOriginal` so newly added exports
// (e.g. `desktopConversations`, `desktopVenice`, `desktopJina`, …)
// remain present in the mock — otherwise a stale mock missing one
// export causes the chat-store bootstrap's microtask
// (`desktopConversations.list().then(...)`) to throw an
// "is not a function" error that escapes asynchronously and
// poisons unrelated tests.
vi.mock("../services/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/desktopBridge")>();
  return {
    ...actual,
    isElectron: () => false,
    desktopApp: { getVersion: async () => "test-version" },
    desktopConfig: { writeSanitized: async () => ({ ok: true }) },
    desktopFiles: {
      exportJson: vi.fn().mockResolvedValue(true),
      importJsonString: vi.fn().mockResolvedValue(null), // simulates user cancelling the file picker
    },
    // Explicit stubs for the surface the chat-store bootstrap touches.
    // These prevent a "desktopConversations is undefined" unhandled
    // error from escaping this test file and poisoning the suite.
    desktopConversations: {
      list: vi.fn().mockResolvedValue({ ok: true, records: [] }),
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      flush: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
});

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
import { toast } from "../stores/toast-store";
import { desktopFiles } from "../services/desktopBridge";

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
        await result.current.exportData("test-password");
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
        await result.current.importData("test-password");
      }),
    ).resolves.toBeUndefined();
    // The safety-choice refs must not be written when the file picker
    // was cancelled.
    expect(refs.applySafetyCancelRef.current).toBeNull();
    expect(refs.applySafetyTertiaryRef.current).toBeNull();
    expect(refs.applySafetyDismissRef.current).toBeNull();
  });

  it("T-119 / VERIFY-055: exportData failure toasts a safe message, not raw exception text", async () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    vi.mocked(desktopFiles).exportJson.mockRejectedValueOnce(
      new Error("ENOENT: /Users/sensitive/path/to-secret.json"),
    );

    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );

    await act(async () => {
      await result.current.exportData("test-password");
    });

    expect(toast.error).toHaveBeenCalledWith("Export failed. Please try again.");
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining("/Users/sensitive/path/to-secret.json"),
    );
  });

  it("T-120 / VERIFY-055: importData failure toasts a safe message, not raw exception text", async () => {
    const setters = buildSetters();
    const refs = buildSafetyRefs();
    vi.mocked(desktopFiles).importJsonString.mockRejectedValueOnce(
      new Error("Unexpected token at /Users/sensitive/path/backup.json:12"),
    );

    const { result } = renderHook(() =>
      useDataStorageActions({
        ...setters,
        localFamilySafeModeEnabled: true,
        veniceApiSafeMode: true,
        ...refs,
      }),
    );

    await act(async () => {
      await result.current.importData("test-password");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Import failed. Please check the file and try again.",
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining("/Users/sensitive/path/backup.json"),
    );
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
