const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/components/layout/inspector-pane.tsx')
let code = fs.readFileSync(file, 'utf8')

// Add dependencies
code = code.replace(/import \{ useMemo, useState \} from 'react'/, "import { useMemo, useState, useRef, useEffect } from 'react'")

// Add state/hooks
const hooksRepl = `const setShowInspector = useSettingsStore((s) => s.setShowInspector)
  const inspectorWidth = useSettingsStore((s) => s.inspectorWidth)
  const setInspectorWidth = useSettingsStore((s) => s.setInspectorWidth)
  const logs = useInspectorStore((s) => s.logs)
  const clearLogs = useInspectorStore((s) => s.clearLogs)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<InspectorLogFilter>('all')

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startWidth: inspectorWidth }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startX - e.clientX
    const newWidth = Math.max(300, Math.min(800, dragRef.current.startWidth + delta))
    setDragWidth(newWidth)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (dragWidth !== null) setInspectorWidth(dragWidth)
    dragRef.current = null
    setDragWidth(null)
  }`

code = code.replace(/const setShowInspector = useSettingsStore\(\(s\) => s\.setShowInspector\)\n  const logs = useInspectorStore\(\(s\) => s\.logs\)\n  const clearLogs = useInspectorStore\(\(s\) => s\.clearLogs\)\n  const \[selectedLogId, setSelectedLogId\] = useState<string \| null>\(null\)\n  const \[activeFilter, setActiveFilter\] = useState<InspectorLogFilter>\('all'\)/, hooksRepl)

// Add style to aside
const asideRepl = `<aside
      className="relative soft-separator-x mesh-surface flex flex-col h-full shrink-0 min-w-0 shell-region"
      aria-label="Developer traffic inspector"
      style={{ width: dragWidth ?? inspectorWidth }}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 w-1.5 -ml-[0.75px] cursor-col-resize hover:bg-accent/50 z-50 transition-colors"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />`

code = code.replace(/<aside\n      className="w-\[480px\] soft-separator-x mesh-surface flex flex-col h-full shrink-0 min-w-0 shell-region"\n      aria-label="Developer traffic inspector"\n    >/, asideRepl)

fs.writeFileSync(file, code, 'utf8')
