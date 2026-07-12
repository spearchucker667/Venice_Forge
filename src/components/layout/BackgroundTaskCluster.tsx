import { useShallow } from 'zustand/shallow'
import { useBackgroundTaskStore } from '../../stores/background-task-store'

export function BackgroundTaskCluster() {
  const { tasks } = useBackgroundTaskStore(
    useShallow((s) => ({
      tasks: s.tasks,
      clearTask: s.clearTask,
    }))
  )
  
  const activeTasks = Object.values(tasks).filter(
    t => !['completed', 'failed', 'aborted', 'timeout'].includes(t.status)
  )

  if (activeTasks.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      {activeTasks.map((task) => (
        <div key={task.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] text-text-secondary">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          <span className="capitalize">{task.type}</span>
          <span className="hidden sm:inline capitalize">({task.status})</span>
        </div>
      ))}
    </div>
  )
}
