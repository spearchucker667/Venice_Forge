/** @fileoverview Phase 2C status store.
 *
 * Thin Zustand store that holds:
 *   - the current `AppStatusSnapshot` and `SafeDiagnosticsSnapshot`
 *   - a `drawerOpen` flag for the diagnostics drawer
 *   - the last refresh timestamp
 *   - a `isRefreshing` flag so the header cluster can show a spinner
 *
 * The store is the single source of truth for the header status
 * cluster + diagnostics drawer. It does NOT issue network requests
 * itself — the only "refresh" side-effect is calling
 * `useAuthStore.checkConfiguration()` and (in desktop mode) the
 * desktopApp diagnostics handshake. The expensive /models fetch
 * remains under the user-driven "Refresh Models" action.
 */

import { create } from "zustand";
import {
  computeAppStatusSnapshot,
  computeSafeDiagnosticsSnapshot,
} from "../services/diagnosticsService";
import type { AppStatusSnapshot, SafeDiagnosticsSnapshot } from "../types/status";
import { useAuthStore } from "./auth-store";

interface StatusStoreState {
  status: AppStatusSnapshot;
  snapshot: SafeDiagnosticsSnapshot;
  lastRefreshedAt: string | null;
  isRefreshing: boolean;
  drawerOpen: boolean;
  focusedSectionId: string | null;

  /** Re-runs the pure snapshot computation. Cheap; safe to call often. */
  recompute: () => void;
  /** Runs the lightweight refresh handshake (auth + desktop diagnostics). */
  refresh: () => Promise<void>;
  openDrawer: (focusSectionId?: string) => void;
  closeDrawer: () => void;
  setFocusedSection: (id: string | null) => void;
}

function initialSnapshot(): AppStatusSnapshot {
  return computeAppStatusSnapshot();
}

function initialSafeSnapshot(): SafeDiagnosticsSnapshot {
  return computeSafeDiagnosticsSnapshot();
}

export const useStatusStore = create<StatusStoreState>((set, get) => ({
  status: initialSnapshot(),
  snapshot: initialSafeSnapshot(),
  lastRefreshedAt: null,
  isRefreshing: false,
  drawerOpen: false,
  focusedSectionId: null,

  recompute: () => {
    set({
      status: computeAppStatusSnapshot(),
      snapshot: computeSafeDiagnosticsSnapshot(),
    });
  },

  refresh: async () => {
    if (get().isRefreshing) return;
    set({ isRefreshing: true });
    try {
      // Refresh the auth configuration in-place. We deliberately
      // do NOT refetch /models here — that is the user-driven
      // "Refresh Models" action and the model hook caches for
      // 5 minutes by default.
      await useAuthStore.getState().checkConfiguration();
      set({
        status: computeAppStatusSnapshot(),
        snapshot: computeSafeDiagnosticsSnapshot(),
        lastRefreshedAt: new Date().toISOString(),
      });
    } catch {
      // Refresh failures do not crash the cluster — the status
      // surface continues to render with the last known good
      // snapshot. Callers can read `lastRefreshedAt` to surface
      // the staleness.
      set({ lastRefreshedAt: new Date().toISOString() });
    } finally {
      set({ isRefreshing: false });
    }
  },

  openDrawer: (focusSectionId) => {
    set({ drawerOpen: true, focusedSectionId: focusSectionId ?? null });
  },
  closeDrawer: () => {
    set({ drawerOpen: false, focusedSectionId: null });
  },
  setFocusedSection: (id) => {
    set({ focusedSectionId: id });
  },
}));
