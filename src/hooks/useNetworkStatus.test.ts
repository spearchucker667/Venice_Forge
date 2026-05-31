import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNetworkStatus } from "./useNetworkStatus";
import type { AppDispatch } from "../types/app";

describe("useNetworkStatus", () => {
  it("dispatches SET_ONLINE true on online event", () => {
    const dispatch = vi.fn() as AppDispatch;
    renderHook(() => useNetworkStatus(dispatch));

    window.dispatchEvent(new Event("online"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ONLINE", online: true });
  });

  it("dispatches SET_ONLINE false on offline event", () => {
    const dispatch = vi.fn() as AppDispatch;
    renderHook(() => useNetworkStatus(dispatch));

    window.dispatchEvent(new Event("offline"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ONLINE", online: false });
  });
});
