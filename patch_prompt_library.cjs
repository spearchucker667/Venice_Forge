const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'src/components/prompts/PromptLibraryView.tsx')
let code = fs.readFileSync(file, 'utf8')

// Add allTags prop to PromptDetailProps
code = code.replace(/onCreateWorkflow: \(\) => Promise<void>;/, "onCreateWorkflow: () => Promise<void>;\n  allTags: string[];")

// Pass allTags to PromptDetail
code = code.replace(/onCreateWorkflow=\{async \(\) => \{/, "allTags={allTags}\n            onCreateWorkflow={async () => {")

// Add datalist for tags and dirty indicators
code = code.replace(/const \{ item, projects, onUpdate, onAddVersion, onSetCurrentVersion, onToggleFavorite, onArchive, onDelete, onCreateWorkflow \} = props;/, `const { item, projects, onUpdate, onAddVersion, onSetCurrentVersion, onToggleFavorite, onArchive, onDelete, onCreateWorkflow, allTags } = props;`)

// Compute dirty state
const dirtyCompute = `
  const isMetadataDirty =
    title.trim() !== item.title ||
    description.trim() !== (item.description ?? "") ||
    kind !== item.kind ||
    Array.from(new Set(tagsInput.split(/[,\\s]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))).sort().join(",") !== [...item.tags].sort().join(",");

  const isContentDirty = content !== current.content || negativeContent !== (current.negativeContent ?? "");
`
code = code.replace(/useEffect\(\(\) => \{\n    setTitle\(item.title\);/g, dirtyCompute + '\n  useEffect(() => {\n    setTitle(item.title);')

// Tags input datalist
const tagsInputRepl = `<div className="relative flex-1 min-w-[200px]">
            <input
              list="prompt-library-tags-list"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tags, comma separated"
              className="w-full rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]"
              data-testid="prompt-library-tags"
            />
            <datalist id="prompt-library-tags-list">
              {allTags.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>`
code = code.replace(/<input\n            value=\{tagsInput\}[^>]+data-testid="prompt-library-tags"\n          \/>/, tagsInputRepl)

// Metadata save button
const saveMetaRepl = `<button
            type="button"
            disabled={!isMetadataDirty}
            onClick={() => void persistMetadata()}
            className={\`rounded-md border px-2 py-0.5 text-[11.5px] transition-colors \${isMetadataDirty ? 'border-accent text-accent' : 'border-border text-text-muted'}\`}
            data-testid="prompt-library-save-metadata"
          >
            Save metadata
          </button>`
code = code.replace(/<button\n            type="button"\n            onClick=\{\(\) => void persistMetadata\(\)\}[^>]+>\n            Save metadata\n          <\/button>/, saveMetaRepl)

// Content save button
const saveContentRepl = `<button
            type="button"
            disabled={!isContentDirty}
            onClick={saveNewVersion}
            className={\`rounded-md border px-2 py-1 text-[12px] transition-colors \${isContentDirty ? 'border-accent text-accent' : 'border-border text-text-muted'}\`}
            data-testid="prompt-library-save-version"
          >
            Save new version
          </button>`
code = code.replace(/<button\n            type="button"\n            onClick=\{saveNewVersion\}[^>]+>\n            Save new version\n          <\/button>/, saveContentRepl)


fs.writeFileSync(file, code, 'utf8')
