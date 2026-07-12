const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/components/prompts/PromptLibraryView.tsx')
let code = fs.readFileSync(file, 'utf8')

code = code.replace(/<PromptCreateModal\n\s*onClose/g, "<PromptCreateModal\n          allTags={allTags}\n          onClose")

fs.writeFileSync(file, code, 'utf8')
