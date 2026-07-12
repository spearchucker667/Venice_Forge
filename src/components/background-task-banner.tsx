import React from "react";
import { useBackgroundTaskStore } from "../stores/background-task-store";
import type { BackgroundTask } from "../types/background-task";

export function BackgroundTaskBanner() {
  const activeTask = useBackgroundTaskStore((s) => {
    const tasks = Object.values(s.tasks);
    const running = tasks.find(
      (t) => !["completed", "failed", "aborted", "timeout"].includes(t.status)
    );
    return running || null;
  });

  if (!activeTask) {
    return null;
  }

  // Only show banner for video and music tasks
  if (activeTask.type !== "video" && activeTask.type !== "music") {
    return null;
  }

  const formatStatus = (task: BackgroundTask) => {
    switch (task.status) {
      case "queued":
        return "Queued";
      case "processing":
        return "Processing";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "aborted":
        return "Cancelled";
      case "timeout":
        return "Taking longer than expected";
      default:
        return "In progress";
    }
  };

  const getProgressText = (task: BackgroundTask) => {
    if (task.status === "processing" && task.progress !== undefined) {
      return `${Math.round(task.progress * 100)}%`;
    }
    return "";
  };

  return (
    <div className="shrink-0 soft-separator-y bg-surface-elevated/50 p-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-text-primary truncate">
            {activeTask.type === "video" ? "Video Generation" : "Music Generation"}
          </div>
          <div className="text-[10px] text-text-secondary truncate">
            {formatStatus(activeTask)} {getProgressText(activeTask)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (activeTask.id) {
              useBackgroundTaskStore.getState().cancelTask(activeTask.id);
            }
          }}
          className="text-[10px] px-2 py-1 rounded border border-border hover:border-danger hover:text-danger"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}