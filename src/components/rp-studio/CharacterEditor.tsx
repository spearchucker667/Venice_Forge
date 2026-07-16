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
import { CARD_FIELD_MAX, MAX_AVATAR_BYTES, MAX_TAGS, type CharacterCardV1, type CharacterCardAvatar, type CharacterExampleDialogue, CharacterContextFile, type RpChatV1 } from "../../types/rp";
import { GhostButton, Label, PrimaryButton, TextArea, ErrorText } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { FALLBACK_MODELS } from "../../constants/venice";
import { avatarDataUri } from "./_shared";
import { saveCharacterPromptToLibrary, startChatForCharacter, startNormalChatForCharacter } from "../../services/rpHelpers";
import { toast } from "../../stores/toast-store";
import type { Tab } from "../../stores/settings-store";
import { isSupportedImageFile, readImageAttachment } from "../../services/attachmentService";
import { askDecision } from "../ui/modal-requests";
import { getCharacterTokenBudget } from "../../services/rpTokenCounter";
import { validateCharacterCardAuthoring } from "../../types/character-card-spec";
import { desktopCharacterCards } from "../../services/desktopBridge";
import { deleteCharacterCardDraft, getCharacterCardDraft, saveCharacterCardDraft } from "../../services/characterCards/characterCardDraftService";
import { applyCharacterCardProposal, proposeCharacterCardRefinement } from "../../services/characterCards/characterCardAiService";
import type { CharacterCardPatchProposal } from "../../types/character-card-ai";
import { CharacterBookEditor } from "./CharacterBookEditor";
import { useLorebookStore } from "../../stores/lorebook-store";
import { mapCharacterBookV2ToLorebookV1, mapLorebookV1ToCharacterBookV2 } from "../../services/characterCards/characterBookAdapter";
import { useModels } from "../../hooks/use-models";
import { useMediaStore } from "../../stores/media-store";
import { analyzeCharacterImage, generateCharacterFieldProposal, getVisionCapableCharacterModels, synthesizeCharacterCard } from "../../services/characterCards/characterCardGenerationService";
import type { CharacterAnalysisDraft } from "../../types/character-card-ai";
import type { CharacterCardExportReport } from "../../types/character-card-files";
import { compileRpPrompt } from "../../services/rpPromptCompiler";
import { veniceFetch } from "../../services/veniceClient/fetch";
import { useChatStore } from "../../stores/chat-store";

/** Module-scoped WeakMap mapping each example object (by identity) to a stable
 *  client-side React key. Lives outside the component so keys survive remounts
 *  of the same card. Entries are GC'd when the example object is dropped. */
const EXAMPLE_KEYS_MODULE: WeakMap<CharacterExampleDialogue, string> = new WeakMap();

function avatarFromDataUrl(value: string): CharacterCardAvatar | undefined {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  if (!match) return undefined;
  const data = match[2].replace(/\s+/g, "");
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const byteLength = Math.max(0, Math.floor(data.length * 3 / 4) - padding);
  return byteLength > 0 && byteLength <= MAX_AVATAR_BYTES ? { mimeType: match[1].toLowerCase() as CharacterCardAvatar["mimeType"], data, byteLength } : undefined;
}

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
  const archiveCard = useCharacterCardStore((s) => s.archiveCard);
  const unarchiveCard = useCharacterCardStore((s) => s.unarchiveCard);
  const addVersion = useCharacterCardStore((s) => s.addVersion);
  const setCurrentVersion = useCharacterCardStore((s) => s.setCurrentVersion);
  const { createWorkflow, setActiveWorkflow } = useWorkflowTemplateStore();
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const scenes = useSceneComposerStore((s) => s.scenes);
  const prompts = usePromptLibraryStore((s) => s.prompts);
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const lorebooksLoaded = useLorebookStore((s) => s.hasLoaded);
  const saveLorebook = useLorebookStore((s) => s.upsert);
  const mediaItems = useMediaStore((s) => s.items);
  const mediaLoaded = useMediaStore((s) => s.loaded);
  const { data: liveTextModels = [] } = useModels("text");
  const initial = useMemo(() => cards.find((c) => c.id === cardId), [cards, cardId]);
  const [draft, setDraft] = useState<CharacterCardV1 | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [extensionText, setExtensionText] = useState(() => JSON.stringify(initial?.tavernExtensions ?? {}, null, 2));
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "recovered">("idle");
  const [refinementAction, setRefinementAction] = useState("Review consistency");
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const [proposal, setProposal] = useState<CharacterCardPatchProposal | null>(null);
  const [refining, setRefining] = useState(false);
  const [activeStudioStep, setActiveStudioStep] = useState(0);
  const [generationConcept, setGenerationConcept] = useState("");
  const [generationOptions, setGenerationOptions] = useState({ genre: "", setting: "", role: "", personalityDirection: "", dialogueStyle: "", relationshipToUser: "", desiredConflict: "", contentRating: "general" as "general" | "mature" | "adult", detailLevel: "detailed" as "concise" | "detailed" | "narrative" | "roleplay-heavy" | "lore-heavy" | "custom", language: "English", customDirection: "" });
  const [generationModel, setGenerationModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [selectedSourceMediaId, setSelectedSourceMediaId] = useState("");
  const [analysisDraft, setAnalysisDraft] = useState<CharacterAnalysisDraft | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<CharacterCardV1 | null>(null);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "analyzing" | "generating">("idle");
  const [fieldProposal, setFieldProposal] = useState<{ field: "name" | "description" | "personality" | "scenario" | "firstMessage" | "systemPrompt" | "postHistoryInstructions" | "rawExampleDialogue"; before: string; after: string; reason: string } | null>(null);
  const [fieldTarget, setFieldTarget] = useState<"name" | "description" | "personality" | "scenario" | "firstMessage" | "systemPrompt" | "postHistoryInstructions" | "rawExampleDialogue">("description");
  const [selectedProposalOperations, setSelectedProposalOperations] = useState<Set<number>>(new Set());
  const [testMessage, setTestMessage] = useState("Hello");
  const [testResponse, setTestResponse] = useState("");
  const [testingCard, setTestingCard] = useState(false);
  const [greetingPreviewIndex, setGreetingPreviewIndex] = useState(0);
  const [exportReport, setExportReport] = useState<CharacterCardExportReport | null>(null);
  const [comparisonVersionId, setComparisonVersionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const refinementAbortRef = useRef<AbortController | null>(null);
  const tokenBudget = useMemo(() => draft ? getCharacterTokenBudget(draft) : null, [draft]);

  useEffect(() => {
    setDraft(initial ?? null);
    setExtensionText(JSON.stringify(initial?.tavernExtensions ?? {}, null, 2));
  }, [initial]);

  useEffect(() => {
    let active = true;
    void getCharacterCardDraft(cardId).then((record) => {
      if (active && record && (!initial || record.updatedAt > initial.updatedAt)) {
        setDraft(record.card);
        setExtensionText(JSON.stringify(record.card.tavernExtensions ?? {}, null, 2));
        setDraftStatus("recovered");
      }
    });
    return () => { active = false; };
  }, [cardId, initial]);

  useEffect(() => {
    if (!lorebooksLoaded) void useLorebookStore.getState().load();
  }, [lorebooksLoaded]);

  useEffect(() => {
    if (!mediaLoaded) void useMediaStore.getState().refresh();
  }, [mediaLoaded]);

  useEffect(() => {
    const fallback = useSettingsStore.getState().selectedModels?.text || liveTextModels[0]?.id || FALLBACK_MODELS.text[0]?.id || "";
    if (!generationModel) setGenerationModel(fallback);
    const vision = getVisionCapableCharacterModels(liveTextModels)[0]?.id ?? "";
    if (!visionModel && vision) setVisionModel(vision);
  }, [generationModel, liveTextModels, visionModel]);

  useEffect(() => {
    const mediaId = typeof draft?.metadata?.sourceMediaId === "string" ? draft.metadata.sourceMediaId : "";
    if (mediaId && !selectedSourceMediaId) setSelectedSourceMediaId(mediaId);
  }, [draft, selectedSourceMediaId]);

  useEffect(() => () => { generationAbortRef.current?.abort(); refinementAbortRef.current?.abort(); }, []);

  useEffect(() => {
    if (!draft) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      void saveCharacterCardDraft(draft).then(() => setDraftStatus("saved")).catch(() => setDraftStatus("idle"));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [draft]);

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

  
  const handleContextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const allowedExts = new Set(["txt", "md", "pdf"]);
    const allowedMimeTypes = new Set([
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
    ]);
    if (file.size > 5 * 1024 * 1024) {
      setError("Context file must be 5MB or smaller.");
      e.target.value = "";
      return;
    }
    // Enforce MIME type when the browser reports one, and always require a
    // matching extension as defense-in-depth.
    const mimeAllowed = !file.type || allowedMimeTypes.has(file.type);
    const extAllowed = allowedExts.has(ext);
    if (!mimeAllowed || !extAllowed) {
      setError(
        `Context files must be .pdf, .txt, or .md. Got ".${ext}"${
          file.type ? ` (MIME type: ${file.type})` : ""
        }. ` +
        `These formats are wired to the local PDF text extractor and pass-through readers; ` +
        `JSON or CSV context is intentionally rejected to avoid prompt-injection via structured data.`,
      );
      e.target.value = "";
      return;
    }
    if (ext === "pdf") {
      try {
        const { extractPdfText } = await import("../../services/pdfParserService");
        const result = await extractPdfText(file);
        if (result.isImageOnly) {
          setError(
            "This PDF has no embedded text layer (likely a scanned image). " +
            "Use the Venice /augment/text-parser endpoint for OCR, or convert to .txt / .md first.",
          );
          e.target.value = "";
          return;
        }
        const newFile: CharacterContextFile = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          content: result.text.slice(0, 100_000),
          size: file.size,
        };
        update("contextFiles", [...(draft.contextFiles || []), newFile]);
      } catch {
        // Normalize PDF extraction failures to a safe user-facing message.
        // Raw parser errors may contain local paths or internal details.
        setError(
          "Failed to extract PDF text. The file may be corrupt, password-protected, or unreadable. " +
          "Try converting the file to .txt or .md.",
        );
      }
      e.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      const newFile: CharacterContextFile = {
        id: Date.now().toString() + Math.random(),
        name: file.name,
        content: text,
        size: file.size
      };
      update("contextFiles", [...(draft.contextFiles || []), newFile]);
    } catch {
      setError("Failed to read context file.");
    }
    e.target.value = "";
  };

  const removeContextFile = (id: string) => {
    update("contextFiles", (draft.contextFiles || []).filter(f => f.id !== id));
  };


  const handleAvatarFile = async (file: File) => {
    if (!isSupportedImageFile(file)) {
      setError("Avatar must be a supported image file (PNG, JPEG, WEBP).");
      update("avatar", undefined);
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(`Avatar file is too large (must be ≤ ${MAX_AVATAR_BYTES / (1024 * 1024)} MiB).`);
      update("avatar", undefined);
      return;
    }
    try {
      const attachment = await readImageAttachment(file);
      const dataUri = attachment.content;
      const match = dataUri.match(/^data:(image\/(png|jpeg|webp));base64,(.*)$/);
      if (!match) {
        setError("Failed to process avatar image.");
        update("avatar", undefined);
        return;
      }
      const mimeType = match[1] as CharacterCardAvatar["mimeType"];
      const base64 = match[3];
      const byteLength = Math.round((base64.length * 3) / 4);
      update("avatar", { data: base64, mimeType, byteLength });
      setError(null);
    } catch {
      setError("Failed to read avatar image.");
      update("avatar", undefined);
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
    
    // Character Card V2 permits required string fields to be empty. Authoring
    // recommendations are surfaced in the validation panel, not used to reject
    // an otherwise interoperable imported card.
    if (tokenBudget?.overLimit) {
      setError(`Character exceeds the supported context budget by ${Math.abs(tokenBudget.remainingInputTokens).toLocaleString()} estimated tokens.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const sourceMediaId = typeof draft.metadata?.sourceMediaId === "string" ? draft.metadata.sourceMediaId : undefined;
      const sourceMedia = sourceMediaId ? mediaItems.find((item) => item.id === sourceMediaId) : undefined;
      const materializedAvatar = !draft.avatar && sourceMedia?.mediaType === "image" ? avatarFromDataUrl(sourceMedia.image) : undefined;
      const saved = await upsert(materializedAvatar ? { ...draft, avatar: materializedAvatar } : draft);
      if (saved) {
        await deleteCharacterCardDraft(draft.id);
        onClose();
      }
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
    useSettingsStore.getState().setActiveTab("rp-studio" as Tab);
    toast.success("Scenario created", "Open the RP Studio to edit it.");
    return id;
  };

  const handleArchive = async () => {
    if (draft.archivedAt) {
      const restored = await unarchiveCard(draft.id);
      if (restored) setDraft(restored);
    } else {
      const archived = await archiveCard(draft.id);
      if (archived) setDraft(archived);
    }
  };

  const handleSaveVersion = async () => {
    const saved = await addVersion(draft.id);
    if (saved) {
      setDraft(saved);
      toast.success("Version saved", "Character snapshot created.");
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    const restored = await setCurrentVersion(draft.id, versionId);
    if (restored) {
      setDraft(restored);
      toast.success("Version restored", "Character reverted to saved version.");
    }
  };

  const sourceMediaId = typeof draft.metadata?.sourceMediaId === "string" ? draft.metadata.sourceMediaId : undefined;
  const sourceMedia = sourceMediaId ? mediaItems.find((item) => item.id === sourceMediaId) : undefined;
  const selectedGenerationMedia = mediaItems.find((item) => item.id === selectedSourceMediaId);
  const selectedVisionModel = liveTextModels.find((model) => model.id === visionModel);
  const avatarSrc = avatarDataUri(draft.avatar) || (sourceMedia?.mediaType === "image" ? sourceMedia.image : undefined);
  const linkedLorebookIds = Array.isArray(draft.metadata?.linkedLorebookIds)
    ? draft.metadata.linkedLorebookIds.filter((id): id is string => typeof id === "string")
    : [];
  const studioSteps = ["Source", "Identity", "Persona", "Prompt Behavior", "Greetings", "Example Dialogue", "Character Book", "Model and Context", "Test", "Export"];
  const testCompilation = compileRpPrompt({
    rpChat: { schema: "RpChatV1", id: `test-${draft.id}`, title: "Disposable card test", characterIds: [draft.id], lorebookIds: linkedLorebookIds, modelId: draft.modelId || generationModel || "", messages: [], adult: draft.adult, metadata: { pinned: false, archived: false, tags: [] }, createdAt: Date.now(), updatedAt: Date.now() } satisfies RpChatV1,
    characters: [draft], lorebooks: lorebooks.filter((book) => linkedLorebookIds.includes(book.id)), memories: [], currentUserMessage: testMessage, expectedCharacterId: draft.id,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to library"
          className="text-text-secondary hover:text-text-primary p-2 rounded-md hover:bg-surface-elevated transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-text-primary truncate">{draft.name || "Untitled"}</h2>
          <p className="text-[12px] text-text-muted truncate">
            Local character — stored in Venice Forge, not hosted on Venice.ai
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {tokenBudget && (
            <div
              className={`text-right text-[12px] ${tokenBudget.overLimit ? "text-danger" : "text-text-muted"}`}
              data-testid="character-token-budget"
              aria-label={`Estimated tokens ${tokenBudget.compiled.count.toLocaleString()} of ${tokenBudget.inputBudget.toLocaleString()}`}
            >
              <div>Estimated tokens: {tokenBudget.compiled.count.toLocaleString()} / {tokenBudget.inputBudget.toLocaleString()}</div>
              <div>Raw estimate {tokenBudget.raw.count.toLocaleString()} · output reserve {tokenBudget.reservedOutputTokens.toLocaleString()}</div>
            </div>
          )}
          <GhostButton onClick={handleDelete}>Delete</GhostButton>
          <GhostButton onClick={() => void handleArchive()}>
            {draft.archivedAt ? "Unarchive" : "Archive"}
          </GhostButton>
          <PrimaryButton
            onClick={handleSave}
            loading={saving}
            size="sm"
            disabled={disabled || tokenBudget?.overLimit === true}
            ariaLabel={disabled ? "Save (waiting for config to load)" : tokenBudget?.overLimit ? "Save (character exceeds token budget)" : "Save"}
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
        <nav aria-label="ST Card Studio steps" className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto bg-surface px-4 pb-3 soft-separator-y">
          {studioSteps.map((step, index) => <button key={step} type="button" aria-current={activeStudioStep === index ? "step" : undefined} onClick={() => setActiveStudioStep(index)} className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${activeStudioStep === index ? "border-accent bg-accent/10 text-accent" : "border-border text-text-muted"}`}>{index + 1}. {step}</button>)}
        </nav>
        <p className="text-[12px] text-text-muted">Step {activeStudioStep + 1} of {studioSteps.length}: {studioSteps[activeStudioStep]}. Your local draft remains autosaved while you move between steps.</p>
        <div className="text-[12px] text-text-muted" role="status">{draftStatus === "recovered" ? "Recovered local draft" : draftStatus === "saving" ? "Saving local draft…" : draftStatus === "saved" ? "Draft saved locally (not synced)" : ""}</div>
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
              className="mt-2 w-24 text-[12px] py-1 rounded-md border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              {draft.avatar ? "Replace" : "Upload"} avatar
            </button>
            {draft.avatar && (
              <button
                type="button"
                onClick={() => update("avatar", undefined)}
                className="mt-1 w-24 text-[12px] py-1 rounded-md text-text-muted hover:text-rose-300 transition-colors"
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

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="card-version">Character version</Label>
            <input id="card-version" value={draft.characterVersion ?? ""} onChange={(e) => update("characterVersion", e.target.value)} maxLength={64} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent" />
          </div>
          <div>
            <Label>Import source</Label>
            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-secondary">{draft.sourceFormat ?? "Venice Forge local"}</div>
          </div>
        </section>

        <section>
          <Label htmlFor="card-personality">Personality</Label>
          <TextArea id="card-personality" value={draft.personality ?? ""} onChange={(value) => update("personality", value)} rows={4} maxLength={CARD_FIELD_MAX} ariaLabel="Personality" />
        </section>

        <section>
          <Label htmlFor="card-creator-notes" hint="Display-only — never included in model prompts">Creator notes</Label>
          <TextArea id="card-creator-notes" value={draft.creatorNotes ?? ""} onChange={(value) => update("creatorNotes", value)} rows={3} maxLength={CARD_FIELD_MAX} ariaLabel="Creator notes" />
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
          <Label htmlFor="card-post-history">Post-history instructions</Label>
          <TextArea id="card-post-history" value={draft.postHistoryInstructions ?? ""} onChange={(value) => update("postHistoryInstructions", value)} rows={3} maxLength={CARD_FIELD_MAX} ariaLabel="Post-history instructions" />
        </section>

        <section>
          <Label htmlFor="card-instructions" hint={`${(draft.instructions ?? "").length}/${CARD_FIELD_MAX}`}>
            Instructions
          </Label>
          <TextArea
            id="card-instructions"
            value={draft.instructions ?? ""}
            onChange={(v) => update("instructions", v || undefined)}
            placeholder="Optional higher-level guidance for the model (steering rules, output style)."
            rows={4}
            maxLength={CARD_FIELD_MAX}
            ariaLabel="Instructions"
          />
        </section>

        <section>
          <div className="flex items-center justify-between"><Label>Alternate greetings</Label><GhostButton onClick={() => update("alternateGreetings", [...(draft.alternateGreetings ?? []), ""])}>Add greeting</GhostButton></div>
          <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3" aria-live="polite"><div className="mb-1 text-[11px] uppercase text-text-muted">Greeting preview {Math.min(greetingPreviewIndex + 1, 1 + (draft.alternateGreetings?.length ?? 0))} / {1 + (draft.alternateGreetings?.length ?? 0)}</div><p className="whitespace-pre-wrap text-[13px] text-text-primary">{[draft.firstMessage ?? "", ...(draft.alternateGreetings ?? [])][greetingPreviewIndex] || "No greeting text"}</p><div className="mt-2 flex gap-2"><GhostButton disabled={greetingPreviewIndex === 0} onClick={() => setGreetingPreviewIndex((index) => Math.max(0, index - 1))}>Previous</GhostButton><GhostButton disabled={greetingPreviewIndex >= (draft.alternateGreetings?.length ?? 0)} onClick={() => setGreetingPreviewIndex((index) => Math.min(draft.alternateGreetings?.length ?? 0, index + 1))}>Next</GhostButton></div></div>
          <div className="mt-2 space-y-2">
            {(draft.alternateGreetings ?? []).map((greeting, index) => (
              <div key={index} className="flex gap-2">
                <textarea value={greeting} onChange={(event) => update("alternateGreetings", (draft.alternateGreetings ?? []).map((value, itemIndex) => itemIndex === index ? event.target.value : value))} aria-label={`Alternate greeting ${index + 1}`} rows={2} maxLength={CARD_FIELD_MAX} className="flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary" />
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => update("firstMessage", greeting)} className="text-[11px] rounded border border-border px-2 py-1 text-text-secondary">Set primary</button>
                  <button type="button" onClick={() => update("alternateGreetings", [...(draft.alternateGreetings ?? []).slice(0, index + 1), greeting, ...(draft.alternateGreetings ?? []).slice(index + 1)])} className="text-[11px] rounded border border-border px-2 py-1 text-text-secondary">Duplicate</button>
                  <button type="button" disabled={index === 0} onClick={() => { const next = [...(draft.alternateGreetings ?? [])]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update("alternateGreetings", next); }} className="text-[11px] rounded border border-border px-2 py-1 text-text-secondary disabled:opacity-40">Up</button>
                  <button type="button" disabled={index === (draft.alternateGreetings?.length ?? 0) - 1} onClick={() => { const next = [...(draft.alternateGreetings ?? [])]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; update("alternateGreetings", next); }} className="text-[11px] rounded border border-border px-2 py-1 text-text-secondary disabled:opacity-40">Down</button>
                  <button type="button" onClick={() => update("alternateGreetings", (draft.alternateGreetings ?? []).filter((_, itemIndex) => itemIndex !== index))} className="text-[11px] rounded border border-border px-2 py-1 text-error">Remove</button>
                </div>
              </div>
            ))}
          </div>
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
          <Label htmlFor="card-raw-examples" hint="Lossless SillyTavern mes_example compatibility text">Raw example dialogue</Label>
          <TextArea id="card-raw-examples" value={draft.rawExampleDialogue ?? ""} onChange={(value) => update("rawExampleDialogue", value)} rows={5} maxLength={CARD_FIELD_MAX} ariaLabel="Raw example dialogue" />
        </section>

        <section className="space-y-2">
          <Label htmlFor="card-extensions">V2 extension data</Label>
          <textarea id="card-extensions" value={extensionText} onChange={(event) => setExtensionText(event.target.value)} onBlur={() => { try { const parsed = JSON.parse(extensionText) as unknown; if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); update("tavernExtensions", parsed as CharacterCardV1["tavernExtensions"]); setError(null); } catch { setError("Extension data must be a valid JSON object."); } }} rows={6} spellCheck={false} className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] text-text-primary" />
          <p className="text-[12px] text-text-muted">Unknown safe namespaces are preserved. Unsafe keys and over-limit values are rejected during persistence/export.</p>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-surface-elevated p-3 text-[13px] text-text-secondary">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label>Character book</Label><div className="flex gap-2">{!draft.embeddedCharacterBook ? <GhostButton onClick={() => update("embeddedCharacterBook", { name: `${draft.name || "Character"} lore`, extensions: {}, entries: [] })}>Create embedded book</GhostButton> : <GhostButton onClick={() => update("embeddedCharacterBook", undefined)}>Remove embedded book</GhostButton>}</div></div>
          <p className="text-[12px] text-text-muted">Embedded data is portable in V2 exports. Linked lorebooks remain local and are synchronized into the embedded copy only when you request it.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1"><span className="mb-1 block text-[12px] text-text-muted">Attach existing lorebook</span><select defaultValue="" onChange={(event) => {
              const lorebook = lorebooks.find((item) => item.id === event.target.value);
              if (!lorebook) return;
              update("metadata", { ...(draft.metadata ?? {}), linkedLorebookIds: Array.from(new Set([...linkedLorebookIds, lorebook.id])) });
              if (!draft.embeddedCharacterBook) update("embeddedCharacterBook", mapLorebookV1ToCharacterBookV2(lorebook));
              event.target.value = "";
            }} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-text-primary"><option value="">Choose lorebook…</option>{lorebooks.filter((book) => !linkedLorebookIds.includes(book.id)).map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></label>
            {draft.embeddedCharacterBook && <GhostButton onClick={async () => {
              const id = `cardbook-${draft.id}`.slice(0, 128);
              const saved = await saveLorebook(mapCharacterBookV2ToLorebookV1(draft.embeddedCharacterBook!, { id, characterId: draft.id }));
              if (saved) update("metadata", { ...(draft.metadata ?? {}), linkedLorebookIds: Array.from(new Set([...linkedLorebookIds, saved.id])) });
            }}>Import embedded as linked</GhostButton>}
          </div>
          {linkedLorebookIds.length > 0 && <div className="space-y-2">{linkedLorebookIds.map((id) => {
            const lorebook = lorebooks.find((item) => item.id === id);
            return <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-2 py-1.5"><span>{lorebook?.name ?? id}</span><div className="flex gap-2">{lorebook && <GhostButton onClick={() => update("embeddedCharacterBook", mapLorebookV1ToCharacterBookV2(lorebook))}>Sync into embedded</GhostButton>}<GhostButton onClick={() => update("metadata", { ...(draft.metadata ?? {}), linkedLorebookIds: linkedLorebookIds.filter((linkedId) => linkedId !== id) })}>Detach (preserve embedded)</GhostButton></div></div>;
          })}</div>}
          {draft.embeddedCharacterBook && <CharacterBookEditor book={draft.embeddedCharacterBook} onChange={(book) => update("embeddedCharacterBook", book)} />}
        </section>

        <section>
          <Label htmlFor="card-first-message" hint="optional">
            First message
          </Label>
          <TextArea
            id="card-first-message"
            value={draft.firstMessage ?? ""}
            onChange={(v) => update("firstMessage", v || undefined)}
            placeholder="Greeting shown on the first assistant turn."
            rows={3}
            maxLength={CARD_FIELD_MAX}
            ariaLabel="First message"
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
                  className="text-[12px] px-2 py-0.5 rounded-md border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
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
            <div className="flex gap-2"><GhostButton disabled={draft.exampleDialogues.length === 0} onClick={() => update("rawExampleDialogue", draft.exampleDialogues.map((example) => `${/^(user|you)$/i.test(example.speaker.trim()) ? "{{user}}" : "{{char}}"}: ${example.text}`).join("\n"))}>Update raw preview</GhostButton><GhostButton onClick={addExample}>Add example</GhostButton></div>
          </div>
          {draft.exampleDialogues.length === 0 ? (
            <div className="text-[12px] text-text-muted italic">No examples. Add a few-shot exchange to lock in voice.</div>
          ) : (
            <div className="space-y-2">
              {draft.exampleDialogues.map((d, i) => (
                <div key={getExampleKey(d)} className="flex gap-2 items-start bg-surface-elevated border border-border rounded-lg p-2">
                  <div className="w-32 shrink-0"><input
                    aria-label={`Example ${i + 1} speaker`}
                    value={d.speaker}
                    onChange={(e) => updateExample(i, "speaker", e.target.value)}
                    placeholder="Speaker"
                    maxLength={200}
                    className="w-full bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                  />{!d.speaker.trim() && <span className="mt-1 block text-[10px] text-warning" role="alert">Speaker required</span>}</div>
                  <textarea
                    value={d.text}
                    onChange={(e) => updateExample(i, "text", e.target.value)}
                    placeholder="What they say…"
                    rows={2}
                    maxLength={CARD_FIELD_MAX}
                    className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted resize-none"
                  />
                  <div className="flex flex-col gap-1"><button type="button" disabled={i === 0} onClick={() => { const next = [...draft.exampleDialogues]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; update("exampleDialogues", next); }} aria-label={`Move example ${i + 1} up`} className="text-[10px] text-text-muted disabled:opacity-30">↑</button><button type="button" disabled={i === draft.exampleDialogues.length - 1} onClick={() => { const next = [...draft.exampleDialogues]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; update("exampleDialogues", next); }} aria-label={`Move example ${i + 1} down`} className="text-[10px] text-text-muted disabled:opacity-30">↓</button></div>
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

        
        <section className="space-y-4 pt-4 border-t border-border/50">
          <Label>Special Settings</Label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!draft.webSearch} onChange={e => update("webSearch", e.target.checked)} className="rounded border-border bg-surface text-accent focus:ring-accent" />
              <span className="text-[12px] text-text-primary">Web Search</span>
            </label>
            <label className="flex flex-col gap-1 cursor-pointer">
              <span className="text-[12px] text-text-primary">URL Scraping Provider</span>
              <select
                value={draft.urlScrapingProvider ?? "off"}
                onChange={(e) => update("urlScrapingProvider", e.target.value as "off" | "brave" | "google")}
                className="bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent"
                aria-label="URL scraping provider"
              >
                <option value="off">Off</option>
                <option value="brave">Brave</option>
                <option value="google">Google</option>
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft.enableThoughts ?? true} onChange={e => update("enableThoughts", e.target.checked)} className="rounded border-border bg-surface text-accent focus:ring-accent" />
              <span className="text-[12px] text-text-primary">Enable Thoughts</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label hint="Temperature">Temperature</Label>
              <input type="number" step="0.1" min="0" max="2" value={draft.temperature ?? 0.7} onChange={e => update("temperature", parseFloat(e.target.value))} className="w-full bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent" />
            </div>
            <div>
              <Label hint="Top P">Top P</Label>
              <input type="number" step="0.05" min="0" max="1" value={draft.topP ?? 0.9} onChange={e => update("topP", parseFloat(e.target.value))} className="w-full bg-surface border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent" />
            </div>
          </div>
        </section>

        <section className="space-y-2 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <Label>Context Files</Label>
            <label className="text-[12px] px-2 py-1 rounded-md border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:border-accent/40 cursor-pointer transition-colors">
              Upload File (Max 5MB)
              <input type="file" className="hidden" onChange={handleContextFileUpload} accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" />
            </label>
          </div>
          {(!draft.contextFiles || draft.contextFiles.length === 0) ? (
            <div className="text-[12px] text-text-muted italic">No context files uploaded.</div>
          ) : (
            <div className="space-y-2">
              {draft.contextFiles.map((f) => (
                <div key={f.id} className="flex gap-2 items-center justify-between bg-surface-elevated border border-border rounded-lg p-2">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12.5px] text-text-primary truncate">{f.name}</span>
                    <span className="text-[12px] text-text-muted">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button type="button" onClick={() => removeContextFile(f.id)} className="text-text-muted hover:text-rose-300 p-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <Label>Version history</Label>
            <GhostButton onClick={() => void handleSaveVersion()}>Save version</GhostButton>
          </div>
          {draft.versions && draft.versions.length > 0 ? (
            <div className="space-y-1">
              {[...draft.versions].reverse().map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-[12px] ${
                    v.id === draft.currentVersionId
                      ? "border-accent/30 bg-accent/5"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-text-primary">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {v.reason ? (
                      <span className="text-text-muted ml-2">— {v.reason}</span>
                    ) : null}
                    {v.id === draft.currentVersionId ? (
                      <span className="text-accent ml-2">(current)</span>
                    ) : null}
                  </div>
                  {v.id !== draft.currentVersionId && (
                    <div className="flex gap-1"><button type="button" onClick={() => setComparisonVersionId(v.id)} className="text-[12px] px-2 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors">Compare</button><button
                      type="button"
                      onClick={() => void handleRestoreVersion(v.id)}
                      className="text-[12px] px-2 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                    >
                      Restore
                    </button></div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-text-muted italic">
              No versions saved. Save a version to track changes.
            </div>
          )}
          {comparisonVersionId && (() => {
            const version = draft.versions?.find((item) => item.id === comparisonVersionId);
            if (!version) return null;
            const fields = ["name", "description", "personality", "scenario", "firstMessage", "systemPrompt", "postHistoryInstructions", "rawExampleDialogue", "characterVersion"] as const;
            return <div className="rounded-lg border border-border bg-surface p-3" aria-label="Character version comparison"><div className="mb-2 flex items-center justify-between"><strong className="text-[13px] text-text-primary">Version comparison</strong><GhostButton onClick={() => setComparisonVersionId(null)}>Close</GhostButton></div><div className="space-y-2">{fields.filter((field) => String(version.snapshot[field] ?? "") !== String(draft[field] ?? "")).map((field) => <div key={field} className="grid gap-2 text-[12px] sm:grid-cols-[8rem_1fr_1fr]"><span className="font-mono text-text-muted">{field}</span><span className="rounded border border-border p-2"><span className="block text-[10px] uppercase text-text-muted">Saved</span>{String(version.snapshot[field] ?? "")}</span><span className="rounded border border-border p-2"><span className="block text-[10px] uppercase text-text-muted">Current</span>{String(draft[field] ?? "")}</span></div>)}</div></div>;
          })()}
        </section>

        <section className="space-y-2 pt-3 border-t border-border/50">
          <Label>Disposable test chat</Label>
          <p className="text-[12px] text-text-muted">Runs one unsaved turn. The response never mutates this card or becomes example dialogue automatically.</p>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Prompt-order trace</Label><ol className="max-h-40 overflow-y-auto rounded border border-border bg-surface p-2 text-[11px] text-text-secondary">{testCompilation.sections.filter((section) => section.included).map((section) => <li key={section.id}>{section.kind} · ~{section.tokens} tokens</li>)}</ol><p className="mt-1 text-[11px] text-text-muted">Estimated system prompt: {testCompilation.totalSystemTokens.toLocaleString()} tokens · activated lorebook sections: {testCompilation.sections.filter((section) => section.kind === "lorebook-entry" && section.included).length}</p></div><div><Label>Test user message</Label><TextArea value={testMessage} onChange={setTestMessage} rows={3} ariaLabel="Disposable test user message" /><PrimaryButton disabled={testingCard || !testMessage.trim() || !(draft.modelId || generationModel)} onClick={async () => {
            setTestingCard(true); setError(null); setTestResponse("");
            try {
              const result = await veniceFetch("/chat/completions", { method: "POST", body: { model: draft.modelId || generationModel, messages: [
                { role: "system", content: testCompilation.systemPrompt },
                ...(testCompilation.exampleDialogue ? [{ role: "system", content: testCompilation.exampleDialogue.content }] : []),
                ...(testCompilation.firstMessage ? [{ role: "assistant", content: testCompilation.firstMessage.content }] : []),
                ...testCompilation.postHistoryMessages,
                testCompilation.userMessage,
              ] } });
              const choices = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>).choices : undefined;
              const message = Array.isArray(choices) && choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : undefined;
              const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : undefined;
              if (typeof content !== "string") throw new Error("Test chat returned no message.");
              setTestResponse(content);
            } catch (cause) { setError(cause instanceof Error ? cause.message : "Test chat failed."); }
            finally { setTestingCard(false); }
          }}>{testingCard ? "Testing…" : "Run disposable test"}</PrimaryButton></div></div>
          {testResponse && <div className="rounded border border-border bg-surface p-3 text-[13px] text-text-primary"><div className="mb-1 text-[11px] uppercase text-text-muted">Unsaved model response</div>{testResponse}<div className="mt-2 flex flex-wrap gap-2"><PrimaryButton onClick={async () => {
            const saved = await upsert(draft);
            if (!saved) { setError("Save the card before promoting this test chat."); return; }
            const model = draft.modelId || generationModel || FALLBACK_MODELS.text[0]?.id || "venice-uncensored";
            const chat = useChatStore.getState();
            const conversationId = chat.createLocalCharacterConversation(saved, model);
            chat.addMessage(conversationId, { role: "user", content: testMessage });
            chat.addMessage(conversationId, { role: "assistant", content: testResponse, metadata: { source: "st-card-disposable-test" } });
            setActiveTab("character-chats");
            toast.success("Test chat saved", "The disposable turn was promoted to a real local conversation.");
          }}>Save as real conversation</PrimaryButton><GhostButton onClick={() => setTestResponse("")}>Reset test</GhostButton></div></div>}
        </section>

        <section className="space-y-2 pt-3 border-t border-border/50">
          <Label>ST Card export</Label>
          <div className="flex flex-wrap gap-2">
            <GhostButton onClick={async () => { const result = await desktopCharacterCards.exportJson({ cardId: draft.id, profile: "standard" }); if (!result.ok) setError(result.error ?? "JSON export failed."); else if (result.report) setExportReport(result.report); }}>Export V2 JSON</GhostButton>
            <GhostButton disabled={!draft.avatar && !sourceMedia} onClick={async () => { const result = await desktopCharacterCards.exportPng({ cardId: draft.id, profile: "standard" }); if (!result.ok) setError(result.error ?? "PNG export failed."); else if (result.report) setExportReport(result.report); }}>Export V2 PNG</GhostButton>
            <GhostButton onClick={async () => { const result = await desktopCharacterCards.exportJson({ cardId: draft.id, profile: "privacy-reduced" }); if (!result.ok) setError(result.error ?? "Privacy-reduced export failed."); else if (result.report) setExportReport(result.report); }}>Export privacy-reduced JSON</GhostButton>
          </div>
          {exportReport && <dl className="grid gap-x-3 gap-y-1 rounded border border-border bg-surface p-3 text-[12px] sm:grid-cols-[auto_1fr]" aria-label="ST Card export report"><dt className="text-text-muted">Validation</dt><dd className="text-success">Round-trip verified</dd><dt className="text-text-muted">Output</dt><dd>{exportReport.format.toUpperCase()} · {exportReport.outputBytes.toLocaleString()} bytes{exportReport.image ? ` · ${exportReport.image.width}×${exportReport.image.height}` : ""}</dd><dt className="text-text-muted">V2 fields</dt><dd>{exportReport.validV2Fields.join(", ")}</dd><dt className="text-text-muted">Extensions</dt><dd>{exportReport.extensionNamespaces.join(", ") || "None"}</dd><dt className="text-text-muted">Embedded lore entries</dt><dd>{exportReport.embeddedLorebookCount}</dd><dt className="text-text-muted">Dropped local-only fields</dt><dd>{exportReport.droppedInternalFields.join(", ") || "None"}</dd>{exportReport.warnings.length > 0 && <><dt className="text-warning">Warnings</dt><dd>{exportReport.warnings.join(" ")}</dd></>}</dl>}
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-surface-elevated p-3" aria-labelledby="card-generation-title">
          <div className="flex items-center justify-between gap-2"><div><h3 id="card-generation-title" className="text-[14px] font-semibold text-text-primary">AI draft generation</h3><p className="text-[12px] text-text-muted">Analysis and generated cards remain proposals. Your current draft is preserved until you explicitly apply one.</p></div>{generationStatus !== "idle" && <GhostButton onClick={() => generationAbortRef.current?.abort()}>Cancel</GhostButton>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-[12px] text-text-muted">Card-generation model</span><select value={generationModel} onChange={(event) => setGenerationModel(event.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-text-primary">{liveTextModels.map((model) => <option key={model.id} value={model.id}>{model.model_spec?.name ?? model.id}</option>)}</select></label>
            <label><span className="mb-1 block text-[12px] text-text-muted">Vision-analysis model</span><select value={visionModel} onChange={(event) => setVisionModel(event.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-text-primary"><option value="">No compatible live model</option>{getVisionCapableCharacterModels(liveTextModels).map((model) => <option key={model.id} value={model.id}>{model.model_spec?.name ?? model.id} · vision · {(model.model_spec?.availableContextTokens ?? 0).toLocaleString()} context</option>)}</select></label>
            <label><span className="mb-1 block text-[12px] text-text-muted">Local image asset</span><select value={selectedSourceMediaId} onChange={(event) => setSelectedSourceMediaId(event.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-text-primary"><option value="">Choose Media Studio image…</option>{mediaItems.filter((item) => item.mediaType === "image").map((item) => <option key={item.id} value={item.id}>{item.note || item.prompt || item.id}</option>)}</select></label>
            <label><span className="mb-1 block text-[12px] text-text-muted">Text concept</span><input value={generationConcept} onChange={(event) => setGenerationConcept(event.target.value)} placeholder="Genre, setting, role, personality, relationship…" className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-text-primary" /></label>
          </div>
          {selectedVisionModel && <div className="rounded border border-border bg-surface p-2 text-[11px] text-text-muted" aria-label="Vision model capability summary">Vision capable · provider {selectedVisionModel.owned_by || "unknown"} · {(selectedVisionModel.model_spec?.availableContextTokens ?? 0).toLocaleString()} context tokens · request image ~{Math.ceil((selectedGenerationMedia?.image.length ?? 0) / 1024).toLocaleString()} KiB · private/anonymous status not published by the live model catalog</div>}
          <details className="rounded border border-border bg-surface p-2"><summary className="cursor-pointer text-[12px] text-text-secondary">Text generation profile</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">{([['genre', 'Genre'], ['setting', 'Setting'], ['role', 'Character role'], ['personalityDirection', 'Personality direction'], ['dialogueStyle', 'Dialogue style'], ['relationshipToUser', 'Relationship to user'], ['desiredConflict', 'Desired conflict'], ['language', 'Language']] as const).map(([key, label]) => <label key={key}><span className="mb-1 block text-[11px] text-text-muted">{label}</span><input value={generationOptions[key]} onChange={(event) => setGenerationOptions((options) => ({ ...options, [key]: event.target.value }))} className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-[12px]" /></label>)}<label><span className="mb-1 block text-[11px] text-text-muted">Content rating</span><select value={generationOptions.contentRating} onChange={(event) => setGenerationOptions((options) => ({ ...options, contentRating: event.target.value as typeof options.contentRating }))} className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-[12px]"><option value="general">General</option><option value="mature">Mature</option><option value="adult">Adult</option></select></label><label><span className="mb-1 block text-[11px] text-text-muted">Detail level</span><select value={generationOptions.detailLevel} onChange={(event) => setGenerationOptions((options) => ({ ...options, detailLevel: event.target.value as typeof options.detailLevel }))} className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-[12px]">{['concise', 'detailed', 'narrative', 'roleplay-heavy', 'lore-heavy', 'custom'].map((value) => <option key={value}>{value}</option>)}</select></label>{generationOptions.detailLevel === "custom" && <label className="sm:col-span-3"><span className="mb-1 block text-[11px] text-text-muted">Custom generation direction</span><input value={generationOptions.customDirection} onChange={(event) => setGenerationOptions((options) => ({ ...options, customDirection: event.target.value }))} className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-[12px]" /></label>}</div></details>
          <div className="flex flex-wrap gap-2">
            <GhostButton disabled={!selectedSourceMediaId || !visionModel || generationStatus !== "idle"} onClick={async () => {
              const controller = new AbortController(); generationAbortRef.current = controller; setGenerationStatus("analyzing"); setError(null);
              try { const model = liveTextModels.find((item) => item.id === visionModel); setAnalysisDraft(await analyzeCharacterImage({ assetId: selectedSourceMediaId, modelId: visionModel, model, requestedFields: ["appearance", "setting", "genre", "uncertainty"], signal: controller.signal })); }
              catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Image analysis failed."); }
              finally { generationAbortRef.current = null; setGenerationStatus("idle"); }
            }}>{generationStatus === "analyzing" ? "Analyzing…" : "Analyze image"}</GhostButton>
            <PrimaryButton disabled={!generationConcept.trim() || !generationModel || generationStatus !== "idle"} onClick={async () => {
              const controller = new AbortController(); generationAbortRef.current = controller; setGenerationStatus("generating"); setError(null);
              try { setGeneratedDraft(await synthesizeCharacterCard({ modelId: generationModel, concept: { concept: generationConcept, ...generationOptions }, analysis: analysisDraft ?? undefined, signal: controller.signal })); }
              catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Card generation failed."); }
              finally { generationAbortRef.current = null; setGenerationStatus("idle"); }
            }}>{generationStatus === "generating" ? "Generating…" : analysisDraft ? "Synthesize from image + text" : "Generate from text"}</PrimaryButton>
          </div>
          {analysisDraft && <div className="rounded border border-border bg-surface p-2 text-[12px] text-text-secondary"><strong className="text-text-primary">Visual analysis:</strong> {analysisDraft.visualDescription || "No direct description"}{analysisDraft.warnings.length > 0 && <div className="mt-1 text-warning">{analysisDraft.warnings.join(" · ")}</div>}</div>}
          {generatedDraft && <div className="space-y-2 rounded border border-accent/40 bg-surface p-3"><div className="text-[13px] font-medium text-text-primary">Generated V2 draft: {generatedDraft.name || "Untitled"}</div><p className="text-[12px] text-text-secondary">{generatedDraft.description || "No description"}</p><div className="flex gap-2"><PrimaryButton onClick={() => { setDraft({ ...generatedDraft, id: draft.id, avatar: draft.avatar, createdAt: draft.createdAt, updatedAt: Date.now(), versions: draft.versions, metadata: draft.metadata }); setExtensionText(JSON.stringify(generatedDraft.tavernExtensions ?? {}, null, 2)); setGeneratedDraft(null); }}>Apply to local draft</PrimaryButton><GhostButton onClick={() => setGeneratedDraft(null)}>Reject</GhostButton></div></div>}
          <div className="pt-3 soft-separator-y"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><select value={fieldTarget} onChange={(event) => setFieldTarget(event.target.value as typeof fieldTarget)} className="rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-text-primary">{["name", "description", "personality", "scenario", "firstMessage", "systemPrompt", "postHistoryInstructions", "rawExampleDialogue"].map((field) => <option key={field} value={field}>Generate {field}</option>)}</select><GhostButton disabled={!generationModel || generationStatus !== "idle"} onClick={async () => {
                const controller = new AbortController(); generationAbortRef.current = controller; setGenerationStatus("generating"); setError(null);
                try { setFieldProposal(await generateCharacterFieldProposal({ card: draft, field: fieldTarget, modelId: generationModel, signal: controller.signal })); }
                catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Field generation failed."); }
                finally { generationAbortRef.current = null; setGenerationStatus("idle"); }
              }}>Generate field proposal</GhostButton></div>
            {fieldProposal && <div className="mt-2 grid gap-2 rounded border border-border bg-surface p-2 text-[12px] sm:grid-cols-2"><div><span className="text-text-muted">Before</span><p>{fieldProposal.before}</p></div><div><span className="text-text-muted">After</span><p>{fieldProposal.after}</p></div><p className="sm:col-span-2 text-text-muted">{fieldProposal.reason}</p><div className="flex gap-2 sm:col-span-2"><PrimaryButton onClick={async () => { await addVersion(draft.id, `Before AI field proposal: ${fieldProposal.field}`); update(fieldProposal.field, fieldProposal.after); setFieldProposal(null); }}>Apply proposal</PrimaryButton><GhostButton onClick={() => setFieldProposal(null)}>Reject</GhostButton></div></div>}
          </div>
        </section>

        <section className="space-y-3 pt-3 border-t border-border/50">
          <Label>AI refinement assistant</Label>
          <p className="text-[12px] text-text-muted">Produces an allowlisted proposal only. Nothing changes until you apply it.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={refinementAction} onChange={(event) => setRefinementAction(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary">
              {["Review consistency", "Find contradictions", "Improve greeting", "Improve personality", "Improve scenario", "Improve dialogue style", "Generate missing fields", "Reduce token usage", "Change tone", "Change genre", "Make safer", "Make more detailed"].map((action) => <option key={action}>{action}</option>)}
            </select>
            <input value={refinementInstruction} onChange={(event) => setRefinementInstruction(event.target.value)} placeholder="Optional direction" className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary" />
          </div>
          <div className="flex gap-2"><PrimaryButton disabled={refining} onClick={async () => {
            setRefining(true); setError(null);
            const controller = new AbortController(); refinementAbortRef.current = controller;
            try {
              const model = useSettingsStore.getState().selectedModels.text || FALLBACK_MODELS.text[0]?.id || "llama-3.3-70b";
              const nextProposal = await proposeCharacterCardRefinement({ card: draft, action: refinementAction, instruction: refinementInstruction, model, signal: controller.signal });
              setProposal(nextProposal); setSelectedProposalOperations(new Set(nextProposal.operations.map((_, index) => index)));
            } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "AI refinement failed."); }
            finally { refinementAbortRef.current = null; setRefining(false); }
          }}>{refining ? "Generating proposal…" : "Generate proposal"}</PrimaryButton>{refining && <GhostButton onClick={() => refinementAbortRef.current?.abort()}>Cancel</GhostButton>}</div>
          {proposal && <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-3">
            <div className="text-[13px] font-medium text-text-primary">{proposal.summary}</div>
            {proposal.operations.map((operation, index) => <div key={index} className="rounded border border-border bg-surface p-2 text-[12px]">
              <label className="flex items-center gap-2 font-mono text-text-secondary"><input type="checkbox" checked={selectedProposalOperations.has(index)} onChange={(event) => setSelectedProposalOperations((selected) => { const next = new Set(selected); if (event.target.checked) next.add(index); else next.delete(index); return next; })} />{operation.op} {operation.path}</label>
              {operation.op === "replace" && <div className="mt-1 grid gap-1 sm:grid-cols-2"><div><span className="text-text-muted">Before:</span> {String((draft as unknown as Record<string, unknown>)[operation.path] ?? "")}</div><div><span className="text-text-muted">After:</span> {String(operation.value)}</div></div>}
              {operation.reason && <div className="mt-1 text-text-muted">{operation.reason}</div>}
            </div>)}
            <div className="flex flex-wrap gap-2"><PrimaryButton disabled={selectedProposalOperations.size === 0} onClick={async () => { await addVersion(draft.id, `Before AI refinement: ${proposal.summary}`); setDraft(applyCharacterCardProposal(draft, proposal, selectedProposalOperations)); setProposal(null); }}>Apply selected</PrimaryButton><GhostButton onClick={() => setSelectedProposalOperations(new Set(proposal.operations.map((_, index) => index)))}>Select all</GhostButton><GhostButton onClick={() => setProposal(null)}>Reject</GhostButton></div>
          </div>}
        </section>

        <section className="space-y-2 pt-3 border-t border-border/50">
          <Label>Card Validation</Label>
          {(() => {
            const issues = validateCharacterCardAuthoring(draft);
            if (issues.length === 0) {
              return <div className="text-[12px] text-success">Format valid and recommended fields complete.</div>;
            }
            return (
              <div className="space-y-1">
                {issues.map((iss, i) => {
                  const colors = {
                    error: "text-error",
                    warning: "text-warning",
                    info: "text-text-secondary"
                  };
                  return (
                    <div key={i} className={`text-[12px] ${colors[iss.severity as keyof typeof colors]}`}>
                      {iss.severity}: {iss.message}
                    </div>
                  );
                })}
              </div>
            );
          })()}
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
              {scenes.map((s) => (
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
              {prompts
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
            <div className="text-[12px] text-text-muted mt-1" data-testid="character-editor-workflow-summary">
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
