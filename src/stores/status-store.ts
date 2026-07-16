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
import { useModelCatalogRuntimeStore } from "./model-catalog-runtime-store";
import { useSettingsStore } from "./settings-store";
import { useProjectStore } from "./project-store";

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
  const status = initialSnapshot();
  return computeSafeDiagnosticsSnapshot(status);
}

export const useStatusStore = create<StatusStoreState>((set, get) => ({
  status: initialSnapshot(),
  snapshot: initialSafeSnapshot(),
  lastRefreshedAt: null,
  isRefreshing: false,
  drawerOpen: false,
  focusedSectionId: null,

  recompute: () => {
    set({ status: computeAppStatusSnapshot() });
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
      const status = computeAppStatusSnapshot();
      set({
        status,
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
    const status = computeAppStatusSnapshot();
    set({
      drawerOpen: true,
      focusedSectionId: focusSectionId ?? null,
      status,
      snapshot: computeSafeDiagnosticsSnapshot(status),
    });
  },
  closeDrawer: () => {
    set({ drawerOpen: false, focusedSectionId: null });
  },
  setFocusedSection: (id) => {
    set({ focusedSectionId: id });
  },
}));

// Explicit narrow subscriptions keep the header reactive without tying health
// recomputation to navigation or creating store-to-store write cycles.
useAuthStore.subscribe((state, previous) => {
  if (
    state.hydrationStatus !== previous.hydrationStatus ||
    state.hydrationError !== previous.hydrationError ||
    state.isConfigured !== previous.isConfigured ||
    state.jinaIsConfigured !== previous.jinaIsConfigured ||
    state.configuredProviders !== previous.configuredProviders
  ) useStatusStore.getState().recompute();
});

useModelCatalogRuntimeStore.subscribe((state, previous) => {
  if (
    state.status !== previous.status ||
    state.totalCount !== previous.totalCount ||
    state.lastError !== previous.lastError
  ) useStatusStore.getState().recompute();
});

useSettingsStore.subscribe((state, previous) => {
  if (
    state.selectedModels !== previous.selectedModels ||
    state.enabledProviders !== previous.enabledProviders ||
    state.activeProjectId !== previous.activeProjectId ||
    state.localFamilySafeModeEnabled !== previous.localFamilySafeModeEnabled ||
    state.veniceApiSafeMode !== previous.veniceApiSafeMode
  ) useStatusStore.getState().recompute();
});

useProjectStore.subscribe((state, previous) => {
  if (state.projects !== previous.projects) useStatusStore.getState().recompute();
});
