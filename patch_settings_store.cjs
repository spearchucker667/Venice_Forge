const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/stores/settings-store.ts')
let code = fs.readFileSync(file, 'utf8')

code = code.replace(/showInspector: boolean/, "showInspector: boolean\n  inspectorWidth: number")
code = code.replace(/setShowInspector: \(show: boolean\) => void/, "setShowInspector: (show: boolean) => void\n  setInspectorWidth: (width: number) => void")

code = code.replace(/showInspector: false,/, "showInspector: false,\n      inspectorWidth: 480,")
code = code.replace(/setShowInspector: \(show\) => set\(\{ showInspector: show \}\),/, "setShowInspector: (show) => set({ showInspector: show }),\n      setInspectorWidth: (width) => set({ inspectorWidth: width }),")

fs.writeFileSync(file, code, 'utf8')
