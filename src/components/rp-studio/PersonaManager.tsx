/**
 * @fileoverview Persona Manager — list, create, edit, and delete user personas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePersonaStore } from "../../stores/persona-store";
import {
  GhostButton,
  Label,
  PrimaryButton,
  TextArea,
  ErrorText,
  EmptyState,
} from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { formatRelativeTime, truncate } from "./_shared";
import { isImeCompositionEvent } from "../../lib/keyboard";
import type { UserPersonaV1 } from "../../types/rp";
import { MAX_PERSONA_IMAGE_BYTES } from "../../services/rp/personaService";
import {
  isSupportedImageFile,
  readImageAttachment,
} from "../../services/attachmentService";
import { Trans, useTranslation } from "react-i18next";

export function PersonaManager({
  disabled = false,
}: { disabled?: boolean } = {}) {
  const { t: tRuntime } = useTranslation("common");
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
    if (!q) return personas;
    return personas.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [personas, searchQuery]);

  if (editingId) {
    return (
      <PersonaEditor
        key={editingId}
        personaId={editingId}
        onClose={() => setEditingId(null)}
        onSave={async (p) => {
          await upsert(p);
          setEditingId(null);
        }}
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
            "runtimeGenerated.components.rpStudio.personamanager.attribute.searchPersonas",
          )}
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.personamanager.attribute.searchPersonas2",
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
          <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.newPersona" />
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
            <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.loadingPersonas" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState>
            {hasLoaded
              ? tRuntime(
                  "runtimeGenerated.components.rpStudio.personamanager.text.noPersonasYet",
                )
              : ""}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <li
                key={p.id}
                className={`flex flex-col gap-1.5 bg-vf-panel-bg border rounded-lg p-3 transition-colors ${p.id === activePersonaId ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]" : "border-vf-panel-border hover:border-accent/40"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[14px] font-semibold text-text-primary truncate">
                    {p.name}
                  </div>
                  {p.id === activePersonaId && (
                    <span className="text-[12px] uppercase tracking-wider text-[var(--color-accent)] font-semibold">
                      <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.active" />
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-[12.5px] text-text-secondary line-clamp-3">
                    {truncate(p.description, 240)}
                  </p>
                )}
                <div className="text-[12px] text-text-muted mt-0.5">
                  {formatRelativeTime(p.updatedAt)}
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="flex-1 text-[12px] py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors"
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.action.edit" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void setActive(p.id === activePersonaId ? null : p.id)
                    }
                    className="flex-1 text-[12px] py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors"
                  >
                    {p.id === activePersonaId
                      ? tRuntime(
                          "runtimeGenerated.components.rpStudio.personamanager.text.deactivate",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.rpStudio.personamanager.text.setActive",
                        )}
                  </button>
                  {confirmingDelete === p.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        void remove(p.id);
                        cancelConfirm();
                      }}
                      className="text-[12px] py-1.5 px-2 rounded-md text-rose-300 border border-rose-500/30 hover:bg-rose-500/10"
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.action.delete" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => armConfirm(p.id)}
                      aria-label={tRuntime(
                        "runtimeGenerated.components.rpStudio.personamanager.attribute.deleteValue1",
                        { value1: p.name },
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

export function PersonaEditor({
  personaId,
  onClose,
  onSave,
  disabled = false,
}: {
  personaId: string;
  onClose: () => void;
  onSave: (p: UserPersonaV1) => Promise<void>;
  disabled?: boolean;
}) {
  const { t: tRuntime } = useTranslation("common");
  const personas = usePersonaStore((s) => s.personas);
  const initial = useMemo(
    () => personas.find((p) => p.id === personaId),
    [personas, personaId],
  );
  const [draft, setDraft] = useState<UserPersonaV1 | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!draft)
    return (
      <EmptyState>
        <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.personaNotFound" />
      </EmptyState>
    );

  const update = <K extends keyof UserPersonaV1>(
    key: K,
    value: UserPersonaV1[K],
  ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || draft.tags.includes(t)) {
      setTagInput("");
      return;
    }
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
      setError(
        `Persona image must be PNG, JPEG, or WebP and no larger than ${MAX_PERSONA_IMAGE_BYTES / 1024 / 1024} MiB.`,
      );
      return;
    }
    const attachment = await readImageAttachment(file);
    const match = attachment.content.match(
      /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/,
    );
    if (!match) {
      setError("Persona image could not be decoded safely.");
      return;
    }
    update("image", {
      mimeType: match[1] as NonNullable<UserPersonaV1["image"]>["mimeType"],
      data: match[2],
      byteLength: file.size,
    });
    setError(null);
  };

  const handlePersonaFileSelect = async (file: File) => {
    try {
      const text = await file.text();
      if (text.trim()) {
        update("description", text);
        setError(null);
      }
    } catch {
      setError("Failed to read persona file.");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-y border-vf-panel-border bg-vf-shell-bg bg-vf-panel-bg">
        <button
          type="button"
          onClick={onClose}
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.personamanager.attribute.back",
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
            <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.save" />
          </PrimaryButton>
        </div>
      </div>
      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <Label htmlFor="persona-image">
            <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.personaImage" />
          </Label>
          <input
            ref={imageInputRef}
            id="persona-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-testid="persona-image-input"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImage(file);
              event.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            {draft.image && (
              <img
                src={`data:${draft.image.mimeType};base64,${draft.image.data}`}
                alt={tRuntime(
                  "runtimeGenerated.components.rpStudio.personamanager.attribute.personaPreview",
                )}
                data-testid="persona-image-preview"
                className="h-16 w-16 rounded-full border border-vf-panel-border object-cover"
              />
            )}
            <GhostButton onClick={() => imageInputRef.current?.click()}>
              {draft.image
                ? tRuntime(
                    "runtimeGenerated.components.rpStudio.personamanager.text.replaceImage",
                  )
                : tRuntime(
                    "runtimeGenerated.components.rpStudio.personamanager.text.addImage",
                  )}
            </GhostButton>
            {draft.image && (
              <GhostButton onClick={() => update("image", undefined)}>
                <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.removeImage" />
              </GhostButton>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="persona-name">
            <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.name" />
          </Label>
          <input
            id="persona-name"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            maxLength={200}
            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <Label htmlFor="persona-ref" hint="optional">
            <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.referenceThirdPerson" />
          </Label>
          <input
            id="persona-ref"
            value={draft.reference ?? ""}
            onChange={(e) => update("reference", e.target.value || undefined)}
            placeholder={tRuntime(
              "runtimeGenerated.components.rpStudio.personamanager.attribute.eGTheWanderer",
            )}
            maxLength={200}
            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor="persona-desc">
              <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.description" />
            </Label>
            <label className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline cursor-pointer">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>
              <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.label.loadFromFileTxtMd" />
              <input
                type="file"
                className="hidden"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePersonaFileSelect(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <TextArea
            value={draft.description}
            onChange={(v) => update("description", v)}
            placeholder={tRuntime(
              "runtimeGenerated.components.rpStudio.personamanager.attribute.howTheModelShouldWriteTheUser",
            )}
            rows={5}
            ariaLabel="Description"
          />
        </div>
        <div>
          <Label htmlFor="persona-tags">
            <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.tags" />
          </Label>
          <div className="flex gap-2">
            <input
              id="persona-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (isImeCompositionEvent(e)) return;
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder={tRuntime(
                "runtimeGenerated.components.rpStudio.personamanager.attribute.addTag",
              )}
              className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
            />
            <GhostButton onClick={addTag} disabled={!tagInput.trim()}>
              <Trans i18nKey="common:surface.componentsRpStudioPersonamanager.text.add" />
            </GhostButton>
          </div>
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {draft.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    update(
                      "tags",
                      draft.tags.filter((x) => x !== t),
                    )
                  }
                  className="text-[12px] px-2 py-0.5 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised text-text-secondary hover:text-text-primary"
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
