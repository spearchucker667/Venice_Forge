/**
 * @fileoverview Persona Manager — list, create, edit, and delete user personas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePersonaStore } from "../../stores/persona-store";
import { GhostButton, Label, PrimaryButton, TextArea, ErrorText, EmptyState } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { formatRelativeTime, truncate } from "./_shared";
import type { UserPersonaV1 } from "../../types/rp";
import { MAX_PERSONA_IMAGE_BYTES } from "../../services/rp/personaService";
import { isSupportedImageFile, readImageAttachment } from "../../services/attachmentService";


export function PersonaManager({ disabled = false }: { disabled?: boolean } = {}) {
  const load = usePersonaStore((s) => s.load);
  const hasLoaded = usePersonaStore((s) => s.hasLoaded);
  const isLoading = usePersonaStore((s) => s.isLoading);
  const error = usePersonaStore((s) => s.error);
  const personas = usePersonaStore((s) => s.personas);
  const searchQuery = usePersonaStore((s) => s.searchQuery);
  const setSearchQuery = usePersonaStore((s) => s.setSearchQuery);
  const activePersonaId = usePersonaStore((s) => s.activePersonaId);
  const setActive = usePersonaStore((s) => s.setActive);
  const createBlank = usePersonaStore((s) => s.createBlank);
  const upsert = usePersonaStore((s) => s.upsert);
  const remove = usePersonaStore((s) => s.remove);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  // Clear the delete-confirmation timer on unmount.
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const armConfirm = (id: string) => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingDelete(null);
      confirmTimerRef.current = null;
    }, 2500);
  };
  const cancelConfirm = () => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setConfirmingDelete(null);
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [personas, searchQuery]);

  if (editingId) {
    return (
      <PersonaEditor
        key={editingId}
        personaId={editingId}
        onClose={() => setEditingId(null)}
        onSave={async (p) => { await upsert(p); setEditingId(null); }}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search personas…"
          aria-label="Search personas"
          className="flex-1 min-w-[12rem] bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
        />
        <PrimaryButton
          size="sm"
          disabled={disabled}
          onClick={() => {
            const blank = createBlank();
            if (blank) setEditingId(blank);
          }}
        >
          New persona
        </PrimaryButton>
      </div>

      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && !hasLoaded ? (
          <div className="flex items-center justify-center h-full text-text-muted gap-2 text-[13px]">
            <Spinner className="text-text-muted" /> Loading personas…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState>{hasLoaded ? "No personas yet" : ""}</EmptyState>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <li
                key={p.id}
                className={`flex flex-col gap-1.5 bg-surface border rounded-xl p-3 transition-colors ${p.id === activePersonaId ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]" : "border-border hover:border-accent/40"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[14px] font-semibold text-text-primary truncate">{p.name}</div>
                  {p.id === activePersonaId && (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-accent)] font-semibold">Active</span>
                  )}
                </div>
                {p.description && (
                  <p className="text-[12.5px] text-text-secondary line-clamp-3">{truncate(p.description, 240)}</p>
                )}
                <div className="text-[11px] text-text-muted mt-0.5">{formatRelativeTime(p.updatedAt)}</div>
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="flex-1 text-[12px] py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void setActive(p.id === activePersonaId ? null : p.id)}
                    className="flex-1 text-[12px] py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                  >
                    {p.id === activePersonaId ? "Deactivate" : "Set active"}
                  </button>
                  {confirmingDelete === p.id ? (
                    <button
                      type="button"
                      onClick={() => { void remove(p.id); cancelConfirm(); }}
                      className="text-[12px] py-1.5 px-2 rounded-md text-rose-300 border border-rose-500/30 hover:bg-rose-500/10"
                    >
                      Delete?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => armConfirm(p.id)}
                      aria-label={`Delete ${p.name}`}
                      className="text-text-muted hover:text-rose-300 p-1.5"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PersonaEditor({ personaId, onClose, onSave, disabled = false }: { personaId: string; onClose: () => void; onSave: (p: UserPersonaV1) => Promise<void>; disabled?: boolean }) {
  const personas = usePersonaStore((s) => s.personas);
  const initial = useMemo(() => personas.find((p) => p.id === personaId), [personas, personaId]);
  const [draft, setDraft] = useState<UserPersonaV1 | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!draft) return <EmptyState>Persona not found.</EmptyState>;

  const update = <K extends keyof UserPersonaV1>(key: K, value: UserPersonaV1[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || draft.tags.includes(t)) { setTagInput(""); return; }
    update("tags", [...draft.tags, t]);
    setTagInput("");
  };

  const handleSave = async () => {
    if (disabled) {
      setError("Local config is still loading. Try again in a moment.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch {
      setError("Failed to save persona. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleImage = async (file: File) => {
    if (!isSupportedImageFile(file) || file.size > MAX_PERSONA_IMAGE_BYTES) {
      setError(`Persona image must be PNG, JPEG, or WebP and no larger than ${MAX_PERSONA_IMAGE_BYTES / 1024 / 1024} MiB.`);
      return;
    }
    const attachment = await readImageAttachment(file);
    const match = attachment.content.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!match) {
      setError("Persona image could not be decoded safely.");
      return;
    }
    update("image", { mimeType: match[1] as NonNullable<UserPersonaV1["image"]>["mimeType"], data: match[2], byteLength: file.size });
    setError(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-surface-elevated"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="text-[15px] font-semibold text-text-primary truncate">{draft.name}</h2>
        <div className="ml-auto">
          <PrimaryButton size="sm" loading={saving} disabled={disabled} onClick={handleSave}>Save</PrimaryButton>
        </div>
      </div>
      {error && <div className="px-4 py-3"><ErrorText>{error}</ErrorText></div>}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <Label htmlFor="persona-image">Persona image</Label>
          <input ref={imageInputRef} id="persona-image" type="file" accept="image/png,image/jpeg,image/webp" data-testid="persona-image-input" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImage(file); event.target.value = ""; }} />
          <div className="flex items-center gap-3">
            {draft.image && (
              <img
                src={`data:${draft.image.mimeType};base64,${draft.image.data}`}
                alt="Persona preview"
                data-testid="persona-image-preview"
                className="h-16 w-16 rounded-full border border-border object-cover"
              />
            )}
            <GhostButton onClick={() => imageInputRef.current?.click()}>
              {draft.image ? "Replace image" : "Add image"}
            </GhostButton>
            {draft.image && (
              <GhostButton onClick={() => update("image", undefined)}>
                Remove image
              </GhostButton>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="persona-name">Name</Label>
          <input
            id="persona-name"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            maxLength={200}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <Label htmlFor="persona-ref" hint="optional">
            Reference (third-person)
          </Label>
          <input
            id="persona-ref"
            value={draft.reference ?? ""}
            onChange={(e) => update("reference", e.target.value || undefined)}
            placeholder="e.g. The Wanderer"
            maxLength={200}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
          />
        </div>
        <div>
          <Label htmlFor="persona-desc">Description</Label>
          <TextArea
            value={draft.description}
            onChange={(v) => update("description", v)}
            placeholder="How the model should write the user."
            rows={5}
            ariaLabel="Description"
          />
        </div>
        <div>
          <Label htmlFor="persona-tags">Tags</Label>
          <div className="flex gap-2">
            <input
              id="persona-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              placeholder="Add tag…"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
            />
            <GhostButton onClick={addTag} disabled={!tagInput.trim()}>Add</GhostButton>
          </div>
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {draft.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update("tags", draft.tags.filter((x) => x !== t))}
                  className="text-[11.5px] px-2 py-0.5 rounded-md border border-border bg-surface-elevated text-text-secondary hover:text-text-primary"
                >
                  {t} ×
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
