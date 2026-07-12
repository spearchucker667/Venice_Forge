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
  
  if (code.match(/text-\[1[01](\.5)?px\]/)) {
    code = code.replace(/text-\[1[01](\.5)?px\]/g, 'text-[12px]')
    changed = true
  }

  // Find buttons with tiny touch targets: like p-1 or p-1.5, we might bump them, but let's be careful.
  // Actually, standardizing touch targets means replacing `<button ... p-1` or `p-1.5` with something bigger.
  // The instruction specifically asks for "Remaining tiny-text and touch-target inventory".
  // Let's replace button paddings `px-1.5 py-0.5` -> `px-3 py-1.5 min-h-[32px]` or something.
  // Let's just do a generic text size bump first.
  if (changed) {
    fs.writeFileSync(file, code, 'utf8')
  }
}
