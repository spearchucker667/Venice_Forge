/**
 * @fileoverview Character Editor — full editor for a single CharacterCardV1.
 *
 * Fields: name, description, system prompt, scenario, tags, author, modelId,
 * adult flag, example dialogues, avatar (PNG/JPEG/WebP, ≤ 1 GiB).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { useSettingsStore } from "../../stores/settings-store";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useSceneComposerStore } from "../../stores/scene-composer-store";
import { useScenarioStore } from "../../stores/scenario-store";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { type WorkflowStep } from "../../types/workflow";
import { CARD_FIELD_MAX, MAX_AVATAR_BYTES, MAX_TAGS, type CharacterCardV1, type CharacterCardAvatar, type CharacterExampleDialogue } from "../../types/rp";
import { GhostButton, Label, PrimaryButton, TextArea, ErrorText } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { FALLBACK_MODELS } from "../../constants/venice";
import { avatarDataUri } from "./_shared";
import { saveCharacterPromptToLibrary, startChatForCharacter, startNormalChatForCharacter } from "../../services/rpHelpers";
import { toast } from "../../stores/toast-store";
import type { Tab } from "../../stores/settings-store";
import { isSupportedImageFile, readImageAttachment } from "../../services/attachmentService";
import { askDecision } from "../ui/modal-requests";

/** Module-scoped WeakMap mapping each example object (by identity) to a stable
 *  client-side React key. Lives outside the component so keys survive remounts
 *  of the same card. Entries are GC'd when the example object is dropped. */
const EXAMPLE_KEYS_MODULE: WeakMap<CharacterExampleDialogue, string> = new WeakMap();

interface Props {
  cardId: string;
  onClose: () => void;
  /** Disables save when the main-process config has not yet hydrated
   *  (defence-in-depth mirror of the VERIFY-017 hydration gate). */
  disabled?: boolean;
}

export function CharacterEditor({ cardId, onClose, disabled = false }: Props) {
  const cards = useCharacterCardStore((s) => s.cards);
  const upsert = useCharacterCardStore((s) => s.upsert);
  const remove = useCharacterCardStore((s) => s.remove);
  const { createWorkflow, setActiveWorkflow } = useWorkflowTemplateStore();
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const initial = useMemo(() => cards.find((c) => c.id === cardId), [cards, cardId]);
  const [draft, setDraft] = useState<CharacterCardV1 | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(initial ?? null);
  }, [initial]);

  if (!draft) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
        Character not found.
      </div>
    );
  }

  const update = <K extends keyof CharacterCardV1>(key: K, value: CharacterCardV1[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if (draft.tags.includes(t)) {
      setTagInput("");
      return;
    }
    if (draft.tags.length >= MAX_TAGS) return;
    update("tags", [...draft.tags, t].slice(0, MAX_TAGS));
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    update("tags", draft.tags.filter((t) => t !== tag));
  };

  const handleAvatarFile = async (file: File) => {
    if (!isSupportedImageFile(file)) {
      setError("Avatar must be a supported image file (PNG, JPEG, WEBP).");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(`Avatar file is too large (must be ≤ ${MAX_AVATAR_BYTES / (1024 * 1024)} MiB).`);
      return;
    }
    try {
      const attachment = await readImageAttachment(file);
      const dataUri = attachment.content;
      const match = dataUri.match(/^data:(image\/(png|jpeg|webp));base64,(.*)$/);
      if (!match) {
        setError("Failed to process avatar image.");
        return;
      }
      const mimeType = match[1] as CharacterCardAvatar["mimeType"];
      const base64 = match[3];
      const byteLength = Math.round((base64.length * 3) / 4);
      update("avatar", { data: base64, mimeType, byteLength });
      setError(null);
    } catch {
      setError("Failed to read avatar image.");
    }
  };

  const addExample = () => {
    update("exampleDialogues", [...draft.exampleDialogues, { speaker: "", text: "" }]);
  };

  const updateExample = (idx: number, key: "speaker" | "text", value: string) => {
    const next = draft.exampleDialogues.map((d, i) => (i === idx ? { ...d, [key]: value } : d));
    update("exampleDialogues", next);
  };

  const removeExample = (idx: number) => {
    update("exampleDialogues", draft.exampleDialogues.filter((_, i) => i !== idx));
  };

  // Stable per-example client-side keys. The persisted shape
  // (CharacterExampleDialogue) does not carry an id, so we map each example
  // OBJECT (by identity) to a stable key in a module-scoped WeakMap. This
  // survives reorders, removes, and store updates, and is correctly
  // garbage-collected when the example is dropped from the array. The map
  // intentionally lives at module scope (not in a ref) so the keys are stable
  // across remounts of the same card.
  const EXAMPLE_KEYS: WeakMap<CharacterExampleDialogue, string> =
    EXAMPLE_KEYS_MODULE;
  const getExampleKey = (d: CharacterExampleDialogue): string => {
    let k = EXAMPLE_KEYS.get(d);
    if (!k) {
      k = `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      EXAMPLE_KEYS.set(d, k);
    }
    return k;
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
      setError("Failed to save character. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const shouldDelete = await askDecision({
      title: "Delete character?",
      detail: draft.name,
      actionLabel: "Delete",
      danger: true,
    });
    if (!shouldDelete) return;
    await remove(draft.id);
    onClose();
  };

  const handleCreateWorkflow = async () => {
    const saved = await upsert(draft);
    if (!saved) return;
    const w = await createWorkflow({
      title: `Workflow: ${saved.name || "Untitled"}`,
      steps: [
        {
          kind: "rp_character",
          target: "rp_studio",
          title: saved.name || "Untitled",
          ref: { characterId: saved.id },
          enabled: true,
        } as WorkflowStep,
      ],
      source: { type: "rp", sourceId: saved.id },
    });
    setActiveWorkflow(w.id);
    setActiveTab("workflows");
    toast.success("Workflow created");
  };

  const handleSaveToPromptLibrary = async () => {
    try {
      const saved = await upsert(draft);
      if (!saved) return;
      const promptId = await saveCharacterPromptToLibrary(saved.id);
      if (promptId) {
        toast.success("Saved to Prompt Library", `Prompt "${saved.name}" created.`);
      } else {
        toast.error("Could not save to Prompt Library", "Safety guard blocked the prompt.");
      }
    } catch {
      toast.error("Could not save to Prompt Library", "Please try again.");
    }
  };

  const handleStartChat = async () => {
    try {
      const saved = await upsert(draft);
      if (!saved) return;
      const chatId = await startChatForCharacter(saved.id);
      if (chatId) {
        toast.success("RP chat started", `Opening "${saved.name}" in RP Studio.`);
        onClose();
      } else {
        toast.error("Could not start RP chat", "Storage rejected the request.");
      }
    } catch {
      toast.error("Could not start RP chat", "Please try again.");
    }
  };

  const handleChat = async () => {
    try {
      const saved = await upsert(draft);
      if (!saved) return;
      const convId = await startNormalChatForCharacter(saved.id);
      if (convId) {
        toast.success("Chat started", `Opening "${saved.name}" in Chat.`);
        onClose();
      } else {
        toast.error("Could not start chat", "Storage rejected the request.");
      }
    } catch {
      toast.error("Could not start chat", "Please try again.");
    }
  };

  const handleAttachScene = async (sceneId: string) => {
    if (!sceneId) return;
    const { attachSceneToCharacter } = await import("../../services/rpHelpers");
    const updated = await attachSceneToCharacter(draft.id, sceneId);
    if (updated) {
      setDraft(updated);
      const scene = useSceneComposerStore.getState().getScene(sceneId);
      toast.success("Scene attached", scene ? `Linked "${scene.title}" to this character.` : "Scene linked.");
    } else {
      toast.error("Could not attach scene", "Storage rejected the request.");
    }
  };

  const handleAttachPrompt = async (promptId: string) => {
    if (!promptId) return;
    const { attachPromptToCharacter } = await import("../../services/rpHelpers");
    const updated = await attachPromptToCharacter(draft.id, promptId);
    if (updated) {
      setDraft(updated);
      const prompt = usePromptLibraryStore.getState().getPrompt(promptId);
      toast.success("Prompt attached", prompt ? `Linked "${prompt.title}" to this character.` : "Prompt linked.");
    } else {
      toast.error("Could not attach prompt", "Storage rejected the request.");
    }
  };

  const handleCreateScenarioFromCharacter = async () => {
    const id = useScenarioStore.getState().createBlank({
      scope: "character",
      characterId: draft.id,
      name: `Scenario for ${draft.name || "character"}`,
      content: draft.scenario || draft.description || "",
    });
    useSettingsStore.getState().setActiveTab("scenes" as Tab);
    toast.success("Scenario created", "Open the Scene Composer to edit it.");
    return id;
  };

  const avatarSrc = avatarDataUri(draft.avatar);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to library"
          className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-surface-elevated transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-text-primary truncate">{draft.name || "Untitled"}</h2>
          <p className="text-[10.5px] text-text-muted truncate">
            Local character — stored in Venice Forge, not hosted on Venice.ai
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <GhostButton onClick={handleDelete}>Delete</GhostButton>
          <PrimaryButton
            onClick={handleSave}
            loading={saving}
            size="sm"
            disabled={disabled}
            ariaLabel={disabled ? "Save (waiting for config to load)" : "Save"}
          >
            Save
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <section className="flex gap-4 items-start">
          <div className="shrink-0">
            <div className="w-24 h-24 rounded-xl overflow-hidden border border-border bg-surface-elevated flex items-center justify-center text-text-muted text-3xl font-semibold">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                (draft.name || "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAvatarFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 w-24 text-[11px] py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              {draft.avatar ? "Replace" : "Upload"} avatar
            </button>
            {draft.avatar && (
              <button
                type="button"
                onClick={() => update("avatar", undefined)}
                className="mt-1 w-24 text-[11px] py-1 rounded-md text-text-muted hover:text-rose-300 transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 min-w-0">
            <div>
              <Label htmlFor="card-name">Name</Label>
              <input
                id="card-name"
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={200}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <Label htmlFor="card-author">Author</Label>
              <input
                id="card-author"
                value={draft.author ?? ""}
                onChange={(e) => update("author", e.target.value || undefined)}
                placeholder="optional"
                maxLength={200}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
              />
            </div>
            <div>
              <Label htmlFor="card-model" hint="optional">
                Default model
              </Label>
              <select
                id="card-model"
                value={draft.modelId ?? ""}
                onChange={(e) => update("modelId", e.target.value || undefined)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
              >
                <option value="">Use chat default</option>
                {FALLBACK_MODELS.text.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="card-adult"
                type="checkbox"
                checked={draft.adult}
                onChange={(e) => update("adult", e.target.checked)}
                className="accent-rose-400"
              />
              <Label htmlFor="card-adult">Adult content (18+)</Label>
            </div>
          </div>
        </section>

        <section>
          <Label htmlFor="card-desc" hint={`${draft.description.length}/${CARD_FIELD_MAX}`}>
            Description
          </Label>
          <TextArea
            value={draft.description}
            onChange={(v) => update("description", v)}
            placeholder="A short summary shown in the library grid."
            rows={3}
            maxLength={CARD_FIELD_MAX}
            ariaLabel="Description"
          />
        </section>

        <section>
          <Label htmlFor="card-system" hint={`${draft.systemPrompt.length}/${CARD_FIELD_MAX}`}>
            System prompt
          </Label>
          <TextArea
            value={draft.systemPrompt}
            onChange={(v) => update("systemPrompt", v)}
            placeholder="The character's persona, voice, and behavioural rules."
            rows={6}
            maxLength={CARD_FIELD_MAX}
            ariaLabel="System prompt"
          />
        </section>

        <section>
          <Label htmlFor="card-scenario" hint="optional">
            Scenario
          </Label>
          <TextArea
            value={draft.scenario ?? ""}
            onChange={(v) => update("scenario", v || undefined)}
            placeholder="An opener scene shown to the model on the first turn."
            rows={3}
            maxLength={CARD_FIELD_MAX}
            ariaLabel="Scenario"
          />
        </section>

        <section>
          <Label htmlFor="card-tags" hint={`${draft.tags.length}/${MAX_TAGS}`}>
            Tags
          </Label>
          <div className="flex gap-2">
            <input
              id="card-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag and press Enter…"
              maxLength={64}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
            />
            <GhostButton onClick={addTag} disabled={!tagInput.trim()}>
              Add
            </GhostButton>
          </div>
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {draft.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-[11.5px] px-2 py-0.5 rounded-md border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
                  aria-label={`Remove tag ${t}`}
                >
                  {t} ×
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <Label>Example dialogues</Label>
            <GhostButton onClick={addExample}>Add example</GhostButton>
          </div>
          {draft.exampleDialogues.length === 0 ? (
            <div className="text-[12px] text-text-muted italic">No examples. Add a few-shot exchange to lock in voice.</div>
          ) : (
            <div className="space-y-2">
              {draft.exampleDialogues.map((d, i) => (
                <div key={getExampleKey(d)} className="flex gap-2 items-start bg-surface-elevated border border-border rounded-lg p-2">
                  <input
                    value={d.speaker}
                    onChange={(e) => updateExample(i, "speaker", e.target.value)}
                    placeholder="Speaker"
                    maxLength={200}
                    className="w-32 shrink-0 bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                  />
                  <textarea
                    value={d.text}
                    onChange={(e) => updateExample(i, "text", e.target.value)}
                    placeholder="What they say…"
                    rows={2}
                    maxLength={CARD_FIELD_MAX}
                    className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted resize-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeExample(i)}
                    aria-label="Remove example"
                    className="text-text-muted hover:text-rose-300 p-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2 pt-3 border-t border-border/50" data-testid="character-editor-workflow">
          <Label>Workflow</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveToPromptLibrary()}
              disabled={disabled}
              data-testid="character-editor-save-to-prompt-library"
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save to Prompt Library
            </button>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  void handleAttachScene(e.target.value);
                  e.target.value = "";
                }
              }}
              disabled={disabled}
              data-testid="character-editor-attach-scene"
              className="text-[12px] px-2 py-1.5 rounded-md border border-border bg-surface text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <option value="">Attach scene…</option>
              {useSceneComposerStore.getState().scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  void handleAttachPrompt(e.target.value);
                  e.target.value = "";
                }
              }}
              disabled={disabled}
              data-testid="character-editor-attach-prompt"
              className="text-[12px] px-2 py-1.5 rounded-md border border-border bg-surface text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <option value="">Attach prompt…</option>
              {usePromptLibraryStore.getState().prompts
                .filter((p) => !p.archivedAt)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => void handleChat()}
              disabled={disabled}
              data-testid="character-editor-chat"
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => void handleStartChat()}
              disabled={disabled}
              data-testid="character-editor-start-chat"
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start RP chat
            </button>
            <button
              type="button"
              onClick={() => void handleCreateScenarioFromCharacter()}
              disabled={disabled}
              data-testid="character-editor-create-scenario"
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create scenario from character
            </button>
            <button
              type="button"
              onClick={() => void handleCreateWorkflow()}
              disabled={disabled}
              data-testid="character-editor-create-workflow"
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create workflow
            </button>
          </div>
          {(typeof draft.metadata?.attachedSceneId === "string" ||
            typeof draft.metadata?.attachedPromptId === "string") && (
            <div className="text-[11px] text-text-muted mt-1" data-testid="character-editor-workflow-summary">
              {draft.metadata?.attachedSceneId ? (
                <span>Scene: {String(draft.metadata.attachedSceneId).slice(0, 32)}</span>
              ) : null}
              {draft.metadata?.attachedSceneId && draft.metadata?.attachedPromptId ? " · " : null}
              {draft.metadata?.attachedPromptId ? (
                <span>Prompt: {String(draft.metadata.attachedPromptId).slice(0, 32)}</span>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {saving && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none"> {/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */}
          <Spinner className="text-text-muted" />
        </div>
      )}
    </div>
  );
}
