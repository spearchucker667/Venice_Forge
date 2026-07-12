import React, { useState, useEffect, useId, useMemo, useRef } from "react";
import { Memory, searchMemory, saveMemory, deleteMemory, upsertMemory } from "../services/memoryService";
import { XIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon } from "./icons";
import { askDecision } from "./ui/modal-requests";
import { redactErrorMessage } from "../shared/redaction";
import { AccessibleDialog } from "./ui/AccessibleDialog";

interface MemoryManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function MemoryManagerModal({ open, onClose }: MemoryManagerModalProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const tagFilterId = useId();
  const contentId = useId();
  const tagsId = useId();

  useEffect(() => {
    if (open) {
      loadMemories();
    }
  }, [open, searchQuery, tagFilter]);

  async function loadMemories() {
    setLoading(true);
    try {
      const results = await searchMemory(searchQuery, tagFilter);
      setMemories(results);
    } catch (err) {
      setError(redactErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function startAdd() {
    setIsAdding(true);
    setEditingMemory(null);
    setEditContent("");
    setEditTags("");
    setError("");
  }

  function startEdit(mem: Memory) {
    setIsAdding(false);
    setEditingMemory(mem);
    setEditContent(mem.content);
    setEditTags(mem.tags.join(", "));
    setError("");
  }

  function cancelEdit() {
    setIsAdding(false);
    setEditingMemory(null);
    setEditContent("");
    setEditTags("");
    setError("");
  }

  async function handleSave() {
    if (!editContent.trim()) {
      setError("Memory content cannot be empty.");
      return;
    }
    
    setLoading(true);
    try {
      const tagsArray = editTags.split(",").map(t => t.trim()).filter(Boolean);
      
      if (isAdding) {
        await saveMemory(editContent, tagsArray);
      } else if (editingMemory) {
        await upsertMemory({
          ...editingMemory,
          content: editContent,
          tags: tagsArray
        });
      }
      
      cancelEdit();
      await loadMemories();
    } catch (err) {
      setError(redactErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const shouldDelete = await askDecision({
      title: "Delete memory?",
      detail: "This removes the saved memory permanently.",
      actionLabel: "Delete",
      danger: true,
    });
    if (!shouldDelete) return;
    setLoading(true);
    try {
      await deleteMemory(id);
      await loadMemories();
    } catch (err) {
      setError(redactErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    memories.forEach(m => m.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [memories]);

  if (!open) return null;

  return (
    <AccessibleDialog
      title="Search AI Memory"
      description="Review and edit memories stored for future conversations."
      onClose={onClose}
      initialFocusRef={searchRef}
      panelRef={dialogRef}
      panelClassName="max-w-3xl"
      headerAction={<button type="button" onClick={onClose} className="btn icon" aria-label="Close memory manager"><XIcon size={20} /></button>}
    >

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Sidebar (Search & Filters) */}
          <div className="w-full md:w-64 flex-none border-b md:border-b-0 md:border-r border-border/50 p-4 bg-surface-elevated/30 flex flex-col gap-4">
            <button type="button" className="btn" onClick={startAdd} disabled={loading}>
              <PlusIcon size={14} className="mr-2" /> Add Memory
            </button>
            
            <div className="flex flex-col gap-2 mt-2">
              <label htmlFor={searchId} className="text-xs font-semibold text-text-muted uppercase tracking-wider">Search</label>
              <div className="relative">
                <SearchIcon size={14} className="absolute left-2.5 top-2.5 text-text-muted" />
                <input
                  ref={searchRef}
                  id={searchId}
                  type="text"
                  placeholder="Query..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input text-sm pl-8 w-full"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label htmlFor={tagFilterId} className="text-xs font-semibold text-text-muted uppercase tracking-wider">Filter by Tag</label>
              <select
                id={tagFilterId}
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="input text-sm w-full bg-bg"
              >
                <option value="">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            
            {error && <div role="alert" className="mt-auto text-xs text-danger bg-danger/10 p-2 rounded">{error}</div>}
          </div>

          {/* Main Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-bg relative">
            {loading && <div role="status" aria-live="polite" className="absolute inset-0 bg-bg/50 flex justify-center items-center z-10">Loading...</div>}
            
            {(isAdding || editingMemory) ? (
              <div className="flex flex-col gap-4 max-w-2xl mx-auto">
                <h3 className="text-lg font-medium text-text-primary">{isAdding ? "Add New Memory" : "Edit Memory"}</h3>
                <div className="flex flex-col gap-1">
                  <label htmlFor={contentId} className="text-sm font-medium text-text-secondary">Memory Content</label>
                  <textarea
                    id={contentId}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="input w-full min-h-[120px] resize-y"
                    placeholder="Fact or preference to remember..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={tagsId} className="text-sm font-medium text-text-secondary">Tags (comma separated)</label>
                  <input
                    id={tagsId}
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="input w-full"
                    placeholder="e.g. preferences, coding, personal"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" className="btn" onClick={handleSave} disabled={loading}>Save</button>
                  <button type="button" className="btn outline" onClick={cancelEdit} disabled={loading}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {memories.length === 0 ? (
                  <div className="text-center text-text-muted p-8">No memories found.</div>
                ) : (
                  memories.map(mem => (
                    <div key={mem.id} className="group flex flex-col p-3 rounded-xl border border-border/50 bg-surface hover:border-accent/40 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="text-sm text-text-primary whitespace-pre-wrap flex-1">{mem.content}</div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => startEdit(mem)}
                            className="p-1.5 text-text-muted hover:text-accent focus:opacity-100 rounded-md hover:bg-surface-elevated"
                            aria-label="Edit memory"
                          >
                            <EditIcon size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(mem.id)}
                            className="p-1.5 text-text-muted hover:text-danger focus:opacity-100 rounded-md hover:bg-surface-elevated"
                            aria-label="Delete memory"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {mem.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[12px] font-medium bg-accent/10 text-accent border border-accent/20">
                            {tag}
                          </span>
                        ))}
                        {!mem.tags.length && <span className="text-[12px] text-text-muted italic">No tags</span>}
                        <span className="text-[12px] text-text-muted ml-auto my-auto">{new Date(mem.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
    </AccessibleDialog>
  );
}
