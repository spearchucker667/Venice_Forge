import React, { useId, useRef, useState } from 'react';
import type { PromptKind, PromptScope } from '../../types/prompt-library';
import { useProjectStore } from '../../stores/project-store';
import { AccessibleDialog } from '../ui/AccessibleDialog';

interface Props {
  onClose: () => void;
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

export function PromptCreateModal({ onClose, onCreate }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<PromptKind>('general');
  const [scope, setScope] = useState<PromptScope>('global');
  const [projectId, setProjectId] = useState<string>('');
  const [content, setContent] = useState('');
  const [negativeContent, setNegativeContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const titleId = useId();
  const kindId = useId();
  const scopeId = useId();
  const projectIdField = useId();
  const tagsId = useId();
  const contentId = useId();
  const negativeId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (scope === 'project' && !projectId) return;

    setIsSubmitting(true);
    setError('');
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
      .map((t) => t.slice(0, 64))
      .slice(0, 64);

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
      setError('Prompt could not be created. Review the fields and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <AccessibleDialog
      title="Create New Prompt"
      description="Save reusable prompt content and metadata to your encrypted Prompt Library."
      onClose={onClose}
      initialFocusRef={titleRef}
      panelRef={dialogRef}
      panelClassName="max-w-[500px]"
      headerAction={<button type="button" onClick={onClose} aria-label="Close create prompt dialog" className="btn icon">✕</button>}
    >
        <div className="flex-1 overflow-y-auto p-5">
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor={titleId} className="block text-xs font-medium text-text-secondary mb-1">Title *</label>
              <input ref={titleRef} id={titleId} required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:border-accent" placeholder="E.g., Dark Fantasy Portrait" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={kindId} className="block text-xs font-medium text-text-secondary mb-1">Kind *</label>
                <select id={kindId} value={kind} onChange={e => setKind(e.target.value as PromptKind)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:border-accent">
                  {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={scopeId} className="block text-xs font-medium text-text-secondary mb-1">Scope *</label>
                <select id={scopeId} value={scope} onChange={e => setScope(e.target.value as PromptScope)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:border-accent">
                  <option value="global">Global</option>
                  <option value="project">Project</option>
                </select>
              </div>
            </div>
            {scope === 'project' && (
              <div>
                <label htmlFor={projectIdField} className="block text-xs font-medium text-text-secondary mb-1">Project *</label>
                <select id={projectIdField} required value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:border-accent">
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor={tagsId} className="block text-xs font-medium text-text-secondary mb-1">Tags</label>
              <input id={tagsId} value={tagsInput} onChange={e => setTagsInput(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] focus:border-accent" placeholder="e.g. dark fantasy, portrait lighting" aria-describedby={`${tagsId}-help`} />
              <p id={`${tagsId}-help`} className="mt-1 text-xs text-text-muted">Comma-separated; up to 64 tags and 64 characters per tag.</p>
            </div>
            <div>
              <label htmlFor={contentId} className="block text-xs font-medium text-text-secondary mb-1">Content *</label>
              <textarea id={contentId} required value={content} onChange={e => setContent(e.target.value)} rows={4} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] font-mono focus:border-accent resize-y min-h-[100px]" placeholder="Enter prompt text here..." />
            </div>
            {(kind === 'image' || kind === 'recipe' || kind === 'general') && (
              <div>
                <label htmlFor={negativeId} className="block text-xs font-medium text-text-secondary mb-1">Negative Content</label>
                <textarea id={negativeId} value={negativeContent} onChange={e => setNegativeContent(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-md px-3 py-2 text-[13px] font-mono focus:border-accent resize-y min-h-[60px]" placeholder="Optional negative prompt..." />
              </div>
            )}
          </form>
          {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-border/50 flex justify-end gap-3 bg-surface-elevated/30">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-[12.5px] rounded-md border border-border text-text-secondary hover:text-text-primary">Cancel</button>
          <button type="submit" form={formId} disabled={isSubmitting || !title.trim() || !content.trim() || (scope === 'project' && !projectId)} className="px-4 py-2 text-[12.5px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 font-medium">Create Prompt</button>
        </div>
    </AccessibleDialog>
  );
}
