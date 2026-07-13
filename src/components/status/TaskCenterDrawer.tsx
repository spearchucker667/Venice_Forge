import { useEffect, useRef } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useTaskUIStore } from "../../stores/task-ui-store";
import { useBackgroundTaskStore } from "../../stores/background-task-store";
import { getActiveProfileId } from "../../services/activeProfile";
import type { BackgroundTaskStatus } from "../../types/background-task";
import { useSettingsStore } from "../../stores/settings-store";

const STATUS_BADGE: Record<BackgroundTaskStatus, string> = {
  idle: "bg-surface-muted text-text-muted border-border",
  queued: "bg-surface-muted text-text-muted border-border",
  processing: "bg-info/15 text-info border-info/30",
  completed: "bg-success/15 text-success border-success/30",
  failed: "bg-danger/15 text-danger border-danger/30",
  aborted: "bg-warning/15 text-warning border-warning/30",
  timeout: "bg-warning/15 text-warning border-warning/30",
};

export function TaskCenterDrawer() {
  const open = useTaskUIStore((s) => s.taskCenterOpen);
  const close = useTaskUIStore((s) => s.closeTaskCenter);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, open);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleEscape, { capture: true });
    }
    return () => window.removeEventListener("keydown", handleEscape, { capture: true });
  }, [open, close]);

  const rawTasks = useBackgroundTaskStore((s) => s.tasks);
  const currentProfileId = getActiveProfileId();
  
  const tasks = Object.values(rawTasks)
    .filter(t => t.profileId === currentProfileId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const cancelTask = useBackgroundTaskStore((s) => s.cancelTask);
  const clearTask = useBackgroundTaskStore((s) => s.clearTask);
  const retryTask = useBackgroundTaskStore((s) => s.retryTask);

  const handleOpenTask = (taskId: string) => {
    const task = rawTasks[taskId];
    if (!task) return;
    if (task.type === 'video' || task.type === 'music') {
      const projectId = task.metadata?.projectId as string;
      if (projectId) useSettingsStore.getState().setActiveProjectId(projectId);
      useSettingsStore.getState().setActiveTab('media');
    }
    close();
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-surface-base/80 backdrop-blur-sm transition-opacity"
        onClick={close}
        aria-hidden
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-label="Task Center"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-sm flex-col soft-separator-l bg-surface-base shadow-2xl transition-transform duration-300 ease-out"
      >
        <div className="flex shrink-0 items-center justify-between soft-separator-b p-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Task Center</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Recent background generations
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close task center"
            className="rounded-md p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" tabIndex={-1}>
          {tasks.length === 0 ? (
            <p className="text-center text-sm text-text-muted mt-8">No recent tasks.</p>
          ) : (
            tasks.map(task => {
              const typeLabel = task.type.charAt(0).toUpperCase() + task.type.slice(1);
              const isRunning = task.status === 'queued' || task.status === 'processing';
              const cancellationUnsupported = task.metadata?.cancellationUnsupported === true;
              const providerStr = task.providerId ? ` via ${task.providerId}` : '';
              const modelStr = task.modelId ? ` (${task.modelId})` : '';

              return (
                <div key={task.id} className="rounded-lg border border-border bg-surface-elevated p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-sm text-text-primary truncate">
                      {typeLabel} generation
                    </h3>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${STATUS_BADGE[task.status]}`}>
                      {task.status}
                    </span>
                  </div>
                  {(providerStr || modelStr) && (
                    <p className="text-xs text-text-muted mt-1 truncate">
                      {providerStr}{modelStr}
                    </p>
                  )}
                  {task.error && (
                    <p className="text-xs text-danger mt-1 line-clamp-2">
                      {task.error}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    {isRunning && !cancellationUnsupported && (
                      <button
                        type="button"
                        onClick={() => cancelTask(task.id)}
                        className="rounded bg-surface-base px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-muted transition-colors border border-border"
                      >
                        Cancel
                      </button>
                    )}
                    {isRunning && cancellationUnsupported && (
                      <span className="px-2 py-1 text-xs text-warning">
                        Cancellation unavailable
                      </span>
                    )}
                    {(task.status === 'failed' || task.status === 'timeout' || task.status === 'aborted') && (
                      <button
                        type="button"
                        onClick={() => retryTask(task.id)}
                        className="rounded bg-surface-base px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-muted transition-colors border border-border"
                      >
                        Retry
                      </button>
                    )}
                    {task.status === 'completed' && task.resultUrl && (
                      <button
                        type="button"
                        onClick={() => handleOpenTask(task.id)}
                        className="rounded bg-surface-base px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-muted transition-colors border border-border"
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => clearTask(task.id)}
                      className="rounded bg-surface-base px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 transition-colors border border-border"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
