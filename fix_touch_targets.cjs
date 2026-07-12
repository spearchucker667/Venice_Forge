const fs = require('fs')
const path = require('path')

function walkDir(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach(file => {
    file = path.join(dir, file)
    const stat = fs.statSync(file)
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file))
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file)
    }
  })
  return results
}

const files = walkDir(path.join(__dirname, 'src'))

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8')
  let changed = false
  
  // Replace <button> with p-1 or p-1.5 or py-0.5 to have better touch targets
  code = code.replace(/<button([^>]*)className="([^"]*)\bp-1(\.5)?\b([^"]*)"/g, (match, before, clsBefore, opt, clsAfter) => {
    changed = true
    return `<button${before}className="${clsBefore}p-2${clsAfter}"`
  })
  
  code = code.replace(/<button([^>]*)className="([^"]*)\bpy-0\.5\b([^"]*)"/g, (match, before, clsBefore, clsAfter) => {
    changed = true
    return `<button${before}className="${clsBefore}py-1.5 min-h-[32px]${clsAfter}"`
  })

  // Same for px-1.5 inside buttons
  code = code.replace(/<button([^>]*)className="([^"]*)\bpx-1\.5\b([^"]*)"/g, (match, before, clsBefore, clsAfter) => {
    changed = true
    return `<button${before}className="${clsBefore}px-3${clsAfter}"`
  })

  // Same for px-1 inside buttons
  code = code.replace(/<button([^>]*)className="([^"]*)\bpx-1\b([^"]*)"/g, (match, before, clsBefore, clsAfter) => {
    changed = true
    return `<button${before}className="${clsBefore}px-2 min-h-[32px]${clsAfter}"`
  })

  // Text tiny text fixes (if missed earlier like text-[9.5px])
  if (code.match(/text-\[9\.5px\]/)) {
    code = code.replace(/text-\[9\.5px\]/g, 'text-[12px]')
    changed = true
  }

  if (changed) {
    fs.writeFileSync(file, code, 'utf8')
  }
}
