/** Main-process runtime snapshot shared by config loading, IPC, and the bridge server.
 *  Family Safe Mode fails closed (on) until config successfully loads, matching
 *  the web-proxy default (VF-AUD-20260912-GSS-P3-006). */
let localFamilySafeModeEnabled = true;
let veniceApiSafeMode = false;

export function setRuntimeLocalFamilySafeModeEnabled(enabled: boolean): void {
  localFamilySafeModeEnabled = enabled;
}

export function getRuntimeLocalFamilySafeModeEnabled(): boolean {
  return localFamilySafeModeEnabled;
}

export function setRuntimeVeniceApiSafeMode(enabled: boolean): void {
  veniceApiSafeMode = enabled;
}

export function getRuntimeVeniceApiSafeMode(): boolean {
  return veniceApiSafeMode;
}
