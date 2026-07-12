const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/components/prompts/PromptCreateModal.tsx')
let code = fs.readFileSync(file, 'utf8')

// Add allTags prop
code = code.replace(/onCreate: \(/, "allTags: string[];\n  onCreate: (")
code = code.replace(/export function PromptCreateModal\(\{ onClose, onCreate \}: Props\) \{/, "export function PromptCreateModal({ onClose, onCreate, allTags }: Props) {")

// Add datalist
const tagsRepl = `<div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">Tags</label>
              <div className="relative">
                <input list="create-prompt-tags-list" value={tagsInput} onChange={e => setTagsInput(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent" placeholder="e.g. fantasy, portrait, lighting" />
                <datalist id="create-prompt-tags-list">
                  {allTags.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
            </div>`
code = code.replace(/<div>\s*<label[^>]+>Tags<\/label>\s*<input[^>]+tagsInput[^>]+\/>\s*<\/div>/, tagsRepl)

fs.writeFileSync(file, code, 'utf8')
