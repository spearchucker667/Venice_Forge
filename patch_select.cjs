const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/components/ui/select.tsx')
let code = fs.readFileSync(file, 'utf8')

// Add createPortal
code = code.replace(/import \{([^}]+)\} from 'react'/, "import { $1 } from 'react'\nimport { createPortal } from 'react-dom'")

// Add state for rect
code = code.replace(/const listboxId = `\$\{triggerId\}-listbox`/g, "const listboxId = `${triggerId}-listbox`\n  const [rect, setRect] = useState<DOMRect | null>(null)")

// Add position update effect
code = code.replace(/useEffect\(\(\) => \{\n    const handler = \(e: MouseEvent\) => \{\n      if \(ref.current && !ref.current.contains\(e.target as Node\)\) setOpen\(false\)\n    \}\n    document.addEventListener\('mousedown', handler\)\n    return \(\) => document.removeEventListener\('mousedown', handler\)\n  \}, \[\]\)/g, `useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Need to also check if click is inside portal
      if (ref.current && !ref.current.contains(e.target as Node) && listRef.current && !listRef.current.closest('.mesh-panel')?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const update = () => {
      if (ref.current) setRect(ref.current.getBoundingClientRect())
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])`)

// Modify trigger aria
code = code.replace(/aria-controls=\{open \? listboxId : undefined\}/g, `aria-controls={open ? listboxId : undefined}\n        aria-activedescendant={open && !searchable && filtered[highlightedIndex] ? \`\${listboxId}-opt-\${highlightedIndex}\` : undefined}`)

// Modify searchable input aria
code = code.replace(/<input\n                ref=\{inputRef\}/g, `<input\n                ref={inputRef}\n                role="combobox"\n                aria-expanded={open}\n                aria-controls={listboxId}\n                aria-activedescendant={filtered[highlightedIndex] ? \`\${listboxId}-opt-\${highlightedIndex}\` : undefined}`)

// Modify listbox rendering
code = code.replace(/\{open && \(\n        <div/g, `{open && rect && createPortal(
        <div
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width }}`)

// Modify closing tag of createPortal
code = code.replace(/<\/div>\n      \)\}\n    <\/div>/g, `</div>
      ), document.body)}
    </div>`)

// Modify option id
code = code.replace(/role="option"/g, `role="option"\n                  id={\`\${listboxId}-opt-\${i}\`}`)

fs.writeFileSync(file, code, 'utf8')
