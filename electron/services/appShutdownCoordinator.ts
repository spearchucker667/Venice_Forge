/** Coordinates exactly-once, timeout-bounded main-process shutdown cleanup. */
import { sanitizeErrorText } from "../../src/shared/redaction";

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

async function runStep(
  label: string,
  cleanup: () => Promise<unknown>,
  failures: string[],
): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    failures.push(`${label} cleanup failed`);
    // The logger itself may already be torn down at this point, so emit a
    // stderr fallback so a dropped diagnostic is recoverable.
    try {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[shutdown] ${label} cleanup failed: ${sanitizeErrorText(detail)}\n`);
    } catch {
      /* stderr may also be unavailable in extreme shutdown conditions */
    }
  }
}

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

        // Phase 1: durable cleanup runs in parallel (bridge / sync / tasks).
        // These can still emit shutdown diagnostics; we deliberately wait for
        // them to settle before flushing logs.
        await Promise.all([
          runStep("bridge", dependencies.stopBridgeServer, failures),
          runStep("sync", dependencies.stopSyncWatcher, failures),
          runStep("background tasks", dependencies.flushBackgroundTasks, failures),
        ]);

        // Phase 2: flush logs as the FINAL ordered phase so any diagnostics
        // emitted by the durable cleanup steps above are persisted before exit.
        await runStep("logs", dependencies.flushLogs, failures);

        clearTimeout(timeout);
        resolve({ timedOut: false, failures });
      })();
    });

    return shutdownPromise;
  };
}
