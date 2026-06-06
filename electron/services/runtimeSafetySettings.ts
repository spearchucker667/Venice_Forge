/** Main-process runtime snapshot shared by config loading, IPC, and the bridge server. */
let localFamilySafeModeEnabled = true;

export function setRuntimeLocalFamilySafeModeEnabled(enabled: boolean): void {
  localFamilySafeModeEnabled = enabled;
}

export function getRuntimeLocalFamilySafeModeEnabled(): boolean {
  return localFamilySafeModeEnabled;
}
