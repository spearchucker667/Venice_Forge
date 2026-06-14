import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Props {
  controls: ReactNode
  output: ReactNode
  history?: ReactNode
  className?: string
}

/**
 * Common layout for image / audio / music / video generation:
 *   ┌─────────┬───────────────────┐
 *   │ Form    │ Output / Gallery  │
 *   │ (left)  │ (right, primary)  │
 *   └─────────┴───────────────────┘
 *
 * On narrow screens, controls collapse above output.
 */
export function GenerationView({ controls, output, history, className }: Props) {
  return (
    <div className={cn('flex flex-col md:flex-row h-full bg-surface', className)}>
      <aside className="md:w-[360px] lg:w-[400px] shrink-0 border-r border-border flex flex-col bg-surface max-h-[55vh] md:max-h-none">
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {controls}
        </div>
        {history && (
          <div className="border-t border-border flex-1 min-h-0 overflow-y-auto p-3">
            {history}
          </div>
        )}
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto p-5 md:p-7">
        {output}
      </main>
    </div>
  )
}
