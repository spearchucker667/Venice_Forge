/** @fileoverview Hydration-gated access to the renderer-side Family Safe Mode
 *  toggle for code paths that run BEFORE the Electron main-process config
 *  snapshot has been loaded into the renderer.
 *
 *  In Electron mode the main-process `runtimeSafetySettings.ts` snapshot is
 *  the canonical source of truth for the local Family Safe Mode toggle, and
 *  every Venice transport boundary in the main process reads it directly
 *  via `electron/services/guardPipeline.ts`. The renderer-side Zustand
 *  `localFamilySafeModeEnabled` is only a UI hint that drives renderer-only
 *  preflight boundaries (e.g. RP chat save, character card import, scene
 *  generation).
 *
 *  Before the main-process config hydrates into the renderer, the renderer
 *  must NOT make preflight guard decisions — it could disagree with the
 *  canonical toggle and either:
 *    - skip the guard when the canonical state is ON (Adult Mode apparent
 *      in the UI when Family Safe Mode is actually on), or
 *    - run the guard when the canonical state is OFF (Family Safe Mode
 *      apparent in the UI when Adult Mode is actually on).
 *
 *  This module exposes two helpers that enforce a single rule: in Electron
 *  mode, never call the local preflight guard until the main-process
 *  config has hydrated. Web mode never needs the gate (there is no
 *  main-process snapshot to wait for).
 *
 *  Consumers SHOULD call `getEffectiveRendererLocalFamilySafeModeEnabled()`
 *  in place of `useSettingsStore.getState().localFamilySafeModeEnabled` and
 *  SHOULD wrap the entire save/generate flow in a hydration check. */

import { isElectron } from "./services/desktopBridge";
import { useConfigStore } from "./stores/config-store";
import { useSettingsStore } from "./stores/settings-store";

/** Thrown when a renderer-side safety decision is requested before the
 *  main-process config snapshot has been hydrated into the renderer in
 *  Electron mode. Callers should surface a "config still loading" message
 *  and retry after hydration completes. */
export class ConfigNotHydratedError extends Error {
  constructor() {
    super(
      "Local config is still loading. Renderer-side safety preflight is " +
        "deferred until the main-process snapshot hydrates. Try again in a " +
        "moment.",
    );
    this.name = "ConfigNotHydratedError";
  }
}

/**
 * Throws `ConfigNotHydratedError` in Electron mode when the main-process
 * config has not yet been hydrated into the renderer. In web mode this is
 * a no-op (the renderer is the only enforcement layer; no main-process
 * snapshot to wait for).
 *
 * Use this guard at the entry point of any renderer-side service that
 * performs a local Family Safe Mode preflight check before persistence or
 * network dispatch (e.g. `saveCharacterCard`, `savePersona`, `appendRpMessage`,
 * `generateScene`, `chat.submit`).
 */
export function assertConfigHydratedForSafety(): void {
  if (!isElectron()) return;
  if (!useConfigStore.getState().hydrated) {
    throw new ConfigNotHydratedError();
  }
}

/**
 * Returns the renderer-side local Family Safe Mode toggle value, gated by
 * the main-process config hydration state in Electron mode.
 *
 * Behavior matrix:
 *
 *   | Mode        | Hydrated | Returns                                      |
 *   |-------------|----------|----------------------------------------------|
 *   | Electron    | no       | throws `ConfigNotHydratedError`              |
 *   | Electron    | yes      | `useSettingsStore.getState().localFamilySafeModeEnabled` |
 *   | Web         | n/a      | `useSettingsStore.getState().localFamilySafeModeEnabled` |
 *
 * This is the canonical replacement for any renderer-side code that
 * previously read `useSettingsStore.getState().localFamilySafeModeEnabled`
 * directly. Direct reads of the Zustand value at call sites of safety
 * preflight checks are a defense-in-depth regression and should be
 * migrated to this helper.
 */
export function getEffectiveRendererLocalFamilySafeModeEnabled(): boolean {
  assertConfigHydratedForSafety();
  return useSettingsStore.getState().localFamilySafeModeEnabled;
}

/**
 * Returns the renderer-side Venice API Safe Mode (`safe_mode`) toggle value,
 * gated by the same hydration check as
 * `getEffectiveRendererLocalFamilySafeModeEnabled`.
 *
 * The provider-side `safe_mode` flag is COMPLETELY SEPARATE from
 * `localFamilySafeModeEnabled` (Family Safe Mode / Adult Mode). Adult Mode
 * does NOT disable `safe_mode`; toggling `safe_mode` does NOT enable Adult
 * Mode. They are independent controls and need independent hydration.
 *
 * Callers (e.g. `sceneGenerationService`) should prefer this helper over
 * reading `useSettingsStore.getState().veniceApiSafeMode` directly, for
 * the same defense-in-depth reason
 * `getEffectiveRendererLocalFamilySafeModeEnabled` exists.
 */
export function getEffectiveRendererVeniceApiSafeMode(): boolean {
  assertConfigHydratedForSafety();
  return useSettingsStore.getState().veniceApiSafeMode;
}

/**
 * React-friendly hook that returns whether the main-process config snapshot
 * has been hydrated into the renderer. In Electron mode this is the gate
 * the RP Studio save buttons should consult to disable themselves — without
 * it, the renderer could attempt a preflight guard decision that disagrees
 * with the canonical main-process state.
 *
 * In web mode this hook always returns `true` (the renderer is the only
 * enforcement layer, no snapshot to wait for).
 */
export function useRendererConfigHydrated(): boolean {
  if (!isElectron()) return true;
  return useConfigStore((s) => s.hydrated);
}
