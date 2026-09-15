import { translateRuntime } from "../../i18n/runtimeTranslator";
/**
 * @fileoverview Lorebook Manager — list lorebooks, edit entries inline.
 *
 * Each lorebook is a named collection of keyword-triggered entries that get
 * injected into the RP prompt by the lorebookService.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLorebookStore } from "../../stores/lorebook-store";
import {
  GhostButton,
  Label,
  PrimaryButton,
  TextArea,
  ErrorText,
  EmptyState,
  PillGroup,
} from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { formatRelativeTime, truncate } from "./_shared";
import {
  MAX_LOREBOOK_ENTRIES,
  MAX_LOREBOOK_ENTRY_CHARS,
  MAX_TAGS,
  type LorebookEntryV1,
  type LorebookInsertionMode,
  type LorebookV1,
} from "../../types/rp";
import { Trans, useTranslation } from "react-i18next";

const INSERTION_MODES: Array<{ value: LorebookInsertionMode; label: string }> =
  [
    {
      value: "before_char",
      get label() {
        return translateRuntime(
          "runtimeGenerated.components.rpStudio.lorebookmanager.metadata.beforeChar",
          "Before char",
        );
      },
    },
    {
      value: "after_char",
      get label() {
        return translateRuntime(
          "runtimeGenerated.components.rpStudio.lorebookmanager.metadata.afterChar",
          "After char",
        );
      },
    },
    {
      value: "at_depth",
      get label() {
        return translateRuntime(
          "runtimeGenerated.components.rpStudio.lorebookmanager.metadata.atDepth",
          "At depth",
        );
      },
    },
  ];

export function LorebookManager({
  disabled = false,
}: { disabled?: boolean } = {}) {
  const { t: tRuntime } = useTranslation("common");
  const load = useLorebookStore((s) => s.load);
  const hasLoaded = useLorebookStore((s) => s.hasLoaded);
  const isLoading = useLorebookStore((s) => s.isLoading);
  const error = useLorebookStore((s) => s.error);
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const searchQuery = useLorebookStore((s) => s.searchQuery);
  const setSearchQuery = useLorebookStore((s) => s.setSearchQuery);
  const createBlank = useLorebookStore((s) => s.createBlank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remove = useLorebookStore((s) => s.remove);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null)
        clearTimeout(confirmTimerRef.current);
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
    if (!q) return lorebooks;
    return lorebooks.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q),
    );
  }, [lorebooks, searchQuery]);

  if (editingId) {
    return (
      <LorebookEditor
        key={editingId}
        lorebookId={editingId}
        onClose={() => setEditingId(null)}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-y border-vf-panel-border bg-vf-shell-bg bg-vf-panel-bg">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={tRuntime(
            "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.searchLorebooks",
          )}
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.searchLorebooks2",
          )}
          className="flex-1 min-w-[12rem] bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
        />
        <PrimaryButton
          size="sm"
          disabled={disabled}
          onClick={() => {
            const blank = createBlank();
            if (blank) setEditingId(blank);
          }}
        >
          <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.newLorebook" />
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
            <Spinner className="text-text-muted" />{" "}
            <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.loading" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState>
            {hasLoaded
              ? tRuntime(
                  "runtimeGenerated.components.rpStudio.lorebookmanager.text.noLorebooksYet",
                )
              : ""}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((l) => (
              <li
                key={l.id}
                className="flex flex-col gap-1.5 bg-vf-panel-bg border border-vf-panel-border hover:border-accent/40 rounded-lg p-3 transition-colors"
              >
                <div className="text-[14px] font-semibold text-text-primary truncate">
                  {l.name}
                </div>
                {l.description && (
                  <p className="text-[12.5px] text-text-secondary line-clamp-2">
                    {truncate(l.description, 180)}
                  </p>
                )}
                <div className="text-[12px] text-text-muted mt-0.5">
                  {l.entries.length}{" "}
                  {l.entries.length === 1 ? "entry" : "entries"} ·{" "}
                  {formatRelativeTime(l.updatedAt)}
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(l.id)}
                    className="flex-1 text-[12px] py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors"
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.action.edit" />
                  </button>
                  {confirmingDelete === l.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        void remove(l.id);
                        cancelConfirm();
                      }}
                      className="text-[12px] py-1.5 px-2 rounded-md text-rose-300 border border-rose-500/30 hover:bg-rose-500/10"
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.action.delete" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => armConfirm(l.id)}
                      aria-label={tRuntime(
                        "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.deleteValue1",
                        { value1: l.name },
                      )}
                      className="text-text-muted hover:text-rose-300 p-1.5"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
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

export function LorebookEditor({
  lorebookId,
  onClose,
  disabled = false,
}: {
  lorebookId: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  const { t: tRuntime } = useTranslation("common");
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const upsert = useLorebookStore((s) => s.upsert);
  const initial = useMemo(
    () => lorebooks.find((l) => l.id === lorebookId),
    [lorebooks, lorebookId],
  );
  const [draft, setDraft] = useState<LorebookV1 | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft)
    return (
      <EmptyState>
        <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.lorebookNotFound" />
      </EmptyState>
    );

  const update = <K extends keyof LorebookV1>(key: K, value: LorebookV1[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const addEntry = () => {
    if (draft.entries.length >= MAX_LOREBOOK_ENTRIES) return;
    const next: LorebookEntryV1 = {
      id: `e_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      keys: [],
      content: "",
      constant: false,
      insertionMode: "after_char",
      order: draft.entries.length,
      caseSensitive: false,
      matchWholeWords: true,
      enabled: true,
    };
    update("entries", [...draft.entries, next]);
  };

  const updateEntry = (idx: number, patch: Partial<LorebookEntryV1>) => {
    update(
      "entries",
      draft.entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    );
  };

  const removeEntry = (idx: number) => {
    update(
      "entries",
      draft.entries.filter((_, i) => i !== idx),
    );
  };

  const handleSave = async () => {
    if (disabled) {
      setError("Local config is still loading. Try again in a moment.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsert(draft);
      onClose();
    } catch {
      setError("Failed to save lorebook. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-y border-vf-panel-border bg-vf-shell-bg bg-vf-panel-bg">
        <button
          type="button"
          onClick={onClose}
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.back",
          )}
          className="text-text-secondary hover:text-text-primary p-2 rounded-md hover:bg-vf-control-hover"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="text-[15px] font-semibold text-text-primary truncate">
          {draft.name}
        </h2>
        <div className="ml-auto">
          <PrimaryButton
            size="sm"
            loading={saving}
            disabled={disabled}
            onClick={handleSave}
          >
            <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.save" />
          </PrimaryButton>
        </div>
      </div>
      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lb-name">
              <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.name" />
            </Label>
            <input
              id="lb-name"
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={200}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <Label htmlFor="lb-tags">
              <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.tagsCommaSeparated" />
            </Label>
            <input
              id="lb-tags"
              value={draft.tags.join(", ")}
              onChange={(e) => {
                const tags = Array.from(
                  new Set(
                    e.target.value
                      .split(",")
                      .map((t) => t.trim().toLowerCase())
                      .filter(Boolean),
                  ),
                ).slice(0, MAX_TAGS);
                update("tags", tags);
              }}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="lb-desc">
            <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.description" />
          </Label>
          <TextArea
            value={draft.description}
            onChange={(v) => update("description", v)}
            rows={2}
            ariaLabel="Description"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label hint={`${draft.entries.length}/${MAX_LOREBOOK_ENTRIES}`}>
            <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.entries" />
          </Label>
          <GhostButton
            onClick={addEntry}
            disabled={draft.entries.length >= MAX_LOREBOOK_ENTRIES}
          >
            <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.addEntry" />
          </GhostButton>
        </div>

        {draft.entries.length === 0 ? (
          <div className="text-[12px] text-text-muted italic">
            <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.text.noEntriesYet" />
          </div>
        ) : (
          <div className="space-y-2">
            {draft.entries.map((entry, i) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onChange={(patch) => updateEntry(i, patch)}
                onRemove={() => removeEntry(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  onChange,
  onRemove,
}: {
  entry: LorebookEntryV1;
  onChange: (patch: Partial<LorebookEntryV1>) => void;
  onRemove: () => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  const [keysText, setKeysText] = useState(entry.keys.join(", "));
  const parseKeys = (value: string) =>
    Array.from(
      new Set(
        value
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  return (
    <div className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={keysText}
          onChange={(e) => {
            const next = e.target.value;
            setKeysText(next);
            onChange({ keys: parseKeys(next) });
          }}
          placeholder={tRuntime(
            "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.triggerKeysCommaSeparated",
          )}
          className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.label.enabled" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            checked={entry.constant}
            onChange={(e) => onChange({ constant: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.label.always" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <input
            type="checkbox"
            checked={entry.matchWholeWords}
            onChange={(e) => onChange({ matchWholeWords: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          <Trans i18nKey="common:surface.componentsRpStudioLorebookmanager.label.wholeWords" />
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.removeEntry",
          )}
          className="text-text-muted hover:text-rose-300 p-2"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <PillGroup
          options={INSERTION_MODES}
          value={entry.insertionMode}
          onChange={(v) =>
            onChange({ insertionMode: v as LorebookInsertionMode })
          }
          ariaLabel="Insertion mode"
        />
        {entry.insertionMode === "at_depth" && (
          <input
            type="number"
            value={entry.depth ?? 0}
            onChange={(e) =>
              onChange({
                depth: Math.max(0, parseInt(e.target.value, 10) || 0),
              })
            }
            min={0}
            max={50}
            className="w-20 bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors"
            aria-label={tRuntime(
              "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.depth",
            )}
          />
        )}
        <input
          type="number"
          value={entry.order}
          onChange={(e) =>
            onChange({ order: parseInt(e.target.value, 10) || 0 })
          }
          min={0}
          max={1000}
          className="w-20 bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors"
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.order",
          )}
        />
      </div>
      <TextArea
        value={entry.content}
        onChange={(v) =>
          onChange({ content: v.slice(0, MAX_LOREBOOK_ENTRY_CHARS) })
        }
        rows={3}
        maxLength={MAX_LOREBOOK_ENTRY_CHARS}
        placeholder={tRuntime(
          "runtimeGenerated.components.rpStudio.lorebookmanager.attribute.injectedContent",
        )}
        ariaLabel="Content"
      />
    </div>
  );
}
