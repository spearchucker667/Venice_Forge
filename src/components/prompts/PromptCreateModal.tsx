import React, { useState } from 'react';
import type { PromptKind, PromptScope } from '../../types/prompt-library';
import { useProjectStore } from '../../stores/project-store';

interface Props {
  onClose: () => void;
  allTags: string[];
  onCreate: (data: {
    title: string;
    kind: PromptKind;
    scope: PromptScope;
    projectId: string | null;
    content: string;
    negativeContent?: string;
    tags: string[];
  }) => Promise<void>;
}

const KIND_OPTIONS: Array<{ value: PromptKind; label: string }> = [
  { value: 'image', label: 'Image' },
  { value: 'negative', label: 'Negative' },
  { value: 'chat', label: 'Chat' },
  { value: 'system', label: 'System' },
  { value: 'research', label: 'Research' },
  { value: 'character', label: 'Character' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'general', label: 'General' },
];

export function PromptCreateModal({ onClose, onCreate, allTags }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PromptKind>('general');
  const [scope, setScope] = useState<PromptScope>('global');
  const [projectId, setProjectId] = useState<string>('');
  const [content, setContent] = useState('');
  const [negativeContent, setNegativeContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (scope === 'project' && !projectId) return;

    setIsSubmitting(true);
    const tags = tagsInput
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    try {
      await onCreate({
        title: title.trim(),
        kind,
        scope,
        projectId: scope === 'project' ? projectId : null,
        content: content.trim(),
        negativeContent: negativeContent.trim() || undefined,
        tags: Array.from(new Set(tags)),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-[500px] flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-primary">Create New Prompt</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <form id="create-prompt-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">Title *</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent" placeholder="E.g., Dark Fantasy Portrait" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1">Kind *</label>
                <select value={kind} onChange={e => setKind(e.target.value as PromptKind)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent">
                  {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1">Scope *</label>
                <select value={scope} onChange={e => setScope(e.target.value as PromptScope)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent">
                  <option value="global">Global</option>
                  <option value="project">Project</option>
                </select>
              </div>
            </div>
            {scope === 'project' && (
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1">Project *</label>
                <select required value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent">
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">Tags</label>
              <input value={tagsInput} onChange={e => setTagsInput(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-accent" placeholder="e.g. fantasy, portrait, lighting" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">Content *</label>
              <textarea required value={content} onChange={e => setContent(e.target.value)} rows={4} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-accent resize-y min-h-[100px]" placeholder="Enter prompt text here..." />
            </div>
            {(kind === 'image' || kind === 'recipe' || kind === 'general') && (
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1">Negative Content</label>
                <textarea value={negativeContent} onChange={e => setNegativeContent(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-accent resize-y min-h-[60px]" placeholder="Optional negative prompt..." />
              </div>
            )}
          </form>
        </div>
        <div className="px-5 py-4 border-t border-border/50 flex justify-end gap-3 bg-surface-elevated/30">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[12.5px] rounded-md border border-border text-text-secondary hover:text-text-primary">Cancel</button>
          <button type="submit" form="create-prompt-form" disabled={isSubmitting || !title.trim() || !content.trim() || (scope === 'project' && !projectId)} className="px-4 py-2 text-[12.5px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 font-medium">Create Prompt</button>
        </div>
      </div>
    </div>
  );
}
