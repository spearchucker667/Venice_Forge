/** Main-process runtime snapshot shared by config loading, IPC, and the bridge server.
 *  Family Safe Mode fails closed (on) until config successfully loads, matching
 *  the web-proxy default (VF-AUD-20260912-GSS-P3-006). */
let localFamilySafeModeEnabled = true;
let veniceApiSafeMode = false;
let loadedFromUserConfig = false;
let lastChangedAt: string | undefined;

export function setRuntimeLocalFamilySafeModeEnabled(enabled: boolean): void {
  localFamilySafeModeEnabled = enabled;
  loadedFromUserConfig = true;
  lastChangedAt = new Date().toISOString();
}

export function getRuntimeLocalFamilySafeModeEnabled(): boolean {
  return localFamilySafeModeEnabled;
}

export function setRuntimeVeniceApiSafeMode(enabled: boolean): void {
  veniceApiSafeMode = enabled;
  loadedFromUserConfig = true;
  lastChangedAt = new Date().toISOString();
}

export function getRuntimeVeniceApiSafeMode(): boolean {
  return veniceApiSafeMode;
}

/** Where the local safeguard snapshot comes from: the user's persisted config
 *  once it has been applied, or the fail-closed policy default before that. */
export function getRuntimeSafetySettingsSource(): "user" | "policy" {
  return loadedFromUserConfig ? "user" : "policy";
}

/** ISO timestamp of the last runtime safety settings application, if any. */
export function getRuntimeSafetyLastChangedAt(): string | undefined {
  return lastChangedAt;
}

/** Resets the runtime snapshot to its fail-closed boot state. Tests only. */
export function _resetRuntimeSafetySettings_TEST_ONLY(): void {
  localFamilySafeModeEnabled = true;
  veniceApiSafeMode = false;
  loadedFromUserConfig = false;
  lastChangedAt = undefined;
}
