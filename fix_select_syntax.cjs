const fs = require('fs')
const path = require('path')
const file = path.join(__dirname, 'src/components/ui/select.tsx')
let code = fs.readFileSync(file, 'utf8')

code = code.replace(/<\/div>\n      \), document\.body\)\}\n    <\/div>/g, "</div>\n      , document.body)}\n    </div>")

fs.writeFileSync(file, code, 'utf8')
