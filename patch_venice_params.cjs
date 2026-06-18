const fs = require('fs');

const path = 'src/components/chat/venice-params.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('usePromptLibraryStore')) {
  code = code.replace(
    "import { useChatStore } from '../../stores/chat-store'",
    "import { useChatStore } from '../../stores/chat-store'\nimport { usePromptLibraryStore } from '../../stores/prompt-library-store'"
  );
}

// In the component:
const componentStr = `export function VeniceParams() {\n  const {`;
const insertHook = `export function VeniceParams() {\n  const customPrompts = usePromptLibraryStore(s => s.prompts.filter(p => !p.archivedAt && (p.kind === 'system' || p.kind === 'chat' || p.kind === 'general')))\n  const {`;
code = code.replace(componentStr, insertHook);

const selectHtml = `
            <div className="flex justify-between items-center mb-1">
              <label className="text-[13px] text-text-muted/40 font-medium block uppercase tracking-[0.08em]">App System Prompt</label>
              {customPrompts.length > 0 && (
                <select
                  className="bg-surface-elevated border border-border rounded px-2 py-0.5 text-[11px] text-text-muted outline-none hover:text-text-secondary transition-colors max-w-[200px] cursor-pointer"
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) {
                      const store = usePromptLibraryStore.getState();
                      const version = store.getCurrentVersion(id);
                      if (version && version.content) {
                        setSystemPrompt(version.content);
                      }
                    }
                    // Reset selection immediately to allow re-selection
                    e.target.value = "";
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Load from library...</option>
                  {customPrompts.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              )}
            </div>`;

code = code.replace(
  `<label className="text-[13px] text-text-muted/40 font-medium mb-1 block uppercase tracking-[0.08em]">App System Prompt</label>`,
  selectHtml
);

fs.writeFileSync(path, code);
console.log('patched');
