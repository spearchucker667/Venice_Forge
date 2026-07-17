/** Coordinates exactly-once, timeout-bounded main-process shutdown cleanup. */

export interface ShutdownDependencies {
  stopBridgeServer: () => Promise<void>;
  stopSyncWatcher: () => Promise<unknown>;
  flushBackgroundTasks: () => Promise<void>;
  flushLogs: () => Promise<void>;
}

export interface ShutdownResult {
  timedOut: boolean;
  failures: string[];
}

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

export function createShutdownCoordinator(
  dependencies: ShutdownDependencies,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
): () => Promise<ShutdownResult> {
  let shutdownPromise: Promise<ShutdownResult> | null = null;

  return () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise<ShutdownResult>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ timedOut: true, failures: ["shutdown cleanup exceeded its time limit"] });
      }, timeoutMs);
      timeout.unref?.();

      void (async () => {
        const failures: string[] = [];
        const cleanupSteps = [
          ["bridge", dependencies.stopBridgeServer],
          ["sync", dependencies.stopSyncWatcher],
          ["background tasks", dependencies.flushBackgroundTasks],
          ["logs", dependencies.flushLogs],
        ] as const;

        await Promise.all(cleanupSteps.map(async ([label, cleanup]) => {
          try {
            await cleanup();
          } catch {
            failures.push(`${label} cleanup failed`);
          }
        }));

        clearTimeout(timeout);
        resolve({ timedOut: false, failures });
      })();
    });

    return shutdownPromise;
  };
}
