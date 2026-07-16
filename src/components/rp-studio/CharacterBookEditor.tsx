import { useState } from "react";
import type { CharacterBookEntryV2Dto, CharacterBookV2Dto, JsonObject } from "../../types/character-card-spec";
import { GhostButton, Label, TextArea } from "../ui/shared";

function emptyEntry(): CharacterBookEntryV2Dto {
  return {
    keys: [],
    secondary_keys: [],
    content: "",
    extensions: {},
    enabled: true,
    insertion_order: 0,
    priority: 0,
    selective: false,
    constant: false,
    case_sensitive: false,
    position: "before_char",
  };
}

function parseList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function JsonObjectEditor({ value, onChange, label }: { value: JsonObject; onChange: (value: JsonObject) => void; label: string }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  return <div>
    <Label>{label}</Label>
    <textarea
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        try {
          const parsed = JSON.parse(text) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
          onChange(parsed as JsonObject);
          setInvalid(false);
        } catch { setInvalid(true); }
      }}
      aria-invalid={invalid}
      rows={4}
      spellCheck={false}
      className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] text-text-primary"
    />
    {invalid && <p className="mt-1 text-[12px] text-error" role="alert">Enter a valid JSON object.</p>}
  </div>;
}

export function CharacterBookEditor({ book, onChange }: { book: CharacterBookV2Dto; onChange: (book: CharacterBookV2Dto) => void }) {
  const updateEntry = (index: number, patch: Partial<CharacterBookEntryV2Dto>) => {
    onChange({ ...book, entries: book.entries.map((entry, itemIndex) => itemIndex === index ? { ...entry, ...patch } : entry) });
  };
  const moveEntry = (index: number, delta: -1 | 1) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= book.entries.length) return;
    const entries = [...book.entries];
    [entries[index], entries[nextIndex]] = [entries[nextIndex], entries[index]];
    onChange({ ...book, entries });
  };

  return <div className="space-y-4" data-testid="character-book-editor">
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label>Book name</Label><input value={book.name ?? ""} onChange={(event) => onChange({ ...book, name: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary" /></div>
      <div><Label>Description</Label><input value={book.description ?? ""} onChange={(event) => onChange({ ...book, description: event.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary" /></div>
      <div><Label>Scan depth</Label><input type="number" min={0} value={book.scan_depth ?? 4} onChange={(event) => onChange({ ...book, scan_depth: Number(event.target.value) })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary" /></div>
      <div><Label>Token budget</Label><input type="number" min={0} value={book.token_budget ?? 512} onChange={(event) => onChange({ ...book, token_budget: Number(event.target.value) })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary" /></div>
    </div>
    <label className="flex items-center gap-2 text-[13px] text-text-secondary"><input type="checkbox" checked={book.recursive_scanning ?? false} onChange={(event) => onChange({ ...book, recursive_scanning: event.target.checked })} /> Recursive scanning</label>
    <JsonObjectEditor value={book.extensions} onChange={(extensions) => onChange({ ...book, extensions })} label="Book extension data" />
    <div className="flex items-center justify-between"><Label>Entries ({book.entries.length})</Label><GhostButton onClick={() => onChange({ ...book, entries: [...book.entries, emptyEntry()] })}>Add entry</GhostButton></div>
    {book.entries.map((entry, index) => <fieldset key={`${entry.id ?? "entry"}-${index}`} className="space-y-3 rounded-lg border border-border bg-surface-elevated p-3">
      <legend className="px-1 text-[13px] font-medium text-text-primary">Entry {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Name</Label><input value={entry.name ?? ""} onChange={(event) => updateEntry(index, { name: event.target.value })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]" /></div>
        <div><Label>Primary keys (comma separated)</Label><input value={entry.keys.join(", ")} onChange={(event) => updateEntry(index, { keys: parseList(event.target.value) })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]" /></div>
        <div><Label>Secondary keys</Label><input value={(entry.secondary_keys ?? []).join(", ")} onChange={(event) => updateEntry(index, { secondary_keys: parseList(event.target.value) })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]" /></div>
        <div><Label>Comment</Label><input value={entry.comment ?? ""} onChange={(event) => updateEntry(index, { comment: event.target.value })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]" /></div>
      </div>
      <div><Label>Content</Label><TextArea value={entry.content} onChange={(value) => updateEntry(index, { content: value })} rows={4} ariaLabel={`Character book entry ${index + 1} content`} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label>Insertion position</Label><select value={entry.position ?? "before_char"} onChange={(event) => updateEntry(index, { position: event.target.value as "before_char" | "after_char" })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]"><option value="before_char">Before character</option><option value="after_char">After character</option></select></div>
        <div><Label>Insertion order</Label><input type="number" value={entry.insertion_order} onChange={(event) => updateEntry(index, { insertion_order: Number(event.target.value) })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]" /></div>
        <div><Label>Priority</Label><input type="number" value={entry.priority ?? 0} onChange={(event) => updateEntry(index, { priority: Number(event.target.value) })} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px]" /></div>
      </div>
      <div className="flex flex-wrap gap-3 text-[12px] text-text-secondary">
        {(["enabled", "constant", "selective", "case_sensitive"] as const).map((field) => <label key={field} className="flex items-center gap-1.5"><input type="checkbox" checked={entry[field] ?? false} onChange={(event) => updateEntry(index, { [field]: event.target.checked })} /> {field.replace("_", " ")}</label>)}
      </div>
      <JsonObjectEditor value={entry.extensions} onChange={(extensions) => updateEntry(index, { extensions })} label="Entry extension data" />
      <div className="flex gap-2"><GhostButton disabled={index === 0} onClick={() => moveEntry(index, -1)}>Move up</GhostButton><GhostButton disabled={index === book.entries.length - 1} onClick={() => moveEntry(index, 1)}>Move down</GhostButton><GhostButton onClick={() => onChange({ ...book, entries: book.entries.filter((_, itemIndex) => itemIndex !== index) })}>Remove</GhostButton></div>
    </fieldset>)}
  </div>;
}
