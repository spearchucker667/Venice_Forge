import React, { useState, useEffect, useMemo } from "react";
import { Memory, searchMemory, saveMemory, deleteMemory, upsertMemory } from "../services/memoryService";
import { XIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon } from "./icons";
import { askDecision } from "./ui/modal-requests";
import { redactErrorMessage } from "../shared/redaction";

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
    <div className="fixed inset-0 bg-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-bg border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-4 border-b border-border/50 bg-surface">
          <h2 className="text-xl font-display font-semibold text-text-primary">Search AI Memory</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Sidebar (Search & Filters) */}
          <div className="w-full md:w-64 flex-none border-b md:border-b-0 md:border-r border-border/50 p-4 bg-surface-elevated/30 flex flex-col gap-4">
            <button className="btn" onClick={startAdd} disabled={loading}>
              <PlusIcon size={14} className="mr-2" /> Add Memory
            </button>
            
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Search</label>
              <div className="relative">
                <SearchIcon size={14} className="absolute left-2.5 top-2.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Query..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input text-sm pl-8 w-full"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Filter by Tag</label>
              <select
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
            
            {error && <div className="mt-auto text-xs text-danger bg-danger/10 p-2 rounded">{error}</div>}
          </div>

          {/* Main Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-bg relative">
            {loading && <div className="absolute inset-0 bg-bg/50 flex justify-center items-center z-10">Loading...</div>}
            
            {(isAdding || editingMemory) ? (
              <div className="flex flex-col gap-4 max-w-2xl mx-auto">
                <h3 className="text-lg font-medium text-text-primary">{isAdding ? "Add New Memory" : "Edit Memory"}</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-text-secondary">Memory Content</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="input w-full min-h-[120px] resize-y"
                    placeholder="Fact or preference to remember..."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-text-secondary">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="input w-full"
                    placeholder="e.g. preferences, coding, personal"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button className="btn" onClick={handleSave} disabled={loading}>Save</button>
                  <button className="btn outline" onClick={cancelEdit} disabled={loading}>Cancel</button>
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
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(mem)}
                            className="p-1.5 text-text-muted hover:text-accent rounded-md hover:bg-surface-elevated"
                            title="Edit"
                          >
                            <EditIcon size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(mem.id)}
                            className="p-1.5 text-text-muted hover:text-danger rounded-md hover:bg-surface-elevated"
                            title="Delete"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {mem.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
                            {tag}
                          </span>
                        ))}
                        {!mem.tags.length && <span className="text-[10px] text-text-muted italic">No tags</span>}
                        <span className="text-[10px] text-text-muted ml-auto my-auto">{new Date(mem.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
