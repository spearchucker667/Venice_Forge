/** Main-process runtime snapshot shared by config loading, IPC, and the bridge server. */
let localFamilySafeModeEnabled = true;
let veniceApiSafeMode = true;

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
