/**
 * @fileoverview Character Editor — full editor for a single CharacterCardV1.
 *
 * Fields: name, description, system prompt, scenario, tags, author, modelId,
 * adult flag, example dialogues, avatar (PNG/JPEG/WebP, bounded by MAX_AVATAR_BYTES).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { openCharacterCreator } from "../../stores/character-creator-launch-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { useSettingsStore } from "../../stores/settings-store";
import { usePromptLibraryStore } from "../../stores/prompt-library-store";
import { useSceneComposerStore } from "../../stores/scene-composer-store";
import { useScenarioStore } from "../../stores/scenario-store";
import { useWorkflowTemplateStore } from "../../stores/workflow-template-store";
import { isImeCompositionEvent } from "../../lib/keyboard";
import { type WorkflowStep } from "../../types/workflow";
import {
  CARD_FIELD_MAX,
  MAX_AVATAR_BYTES,
  MAX_TAGS,
  type CharacterCardV1,
  type CharacterCardAvatar,
  type CharacterExampleDialogue,
  CharacterContextFile,
  type RpChatV1,
} from "../../types/rp";
import {
  GhostButton,
  Label,
  PrimaryButton,
  TextArea,
  ErrorText,
} from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { FALLBACK_MODELS } from "../../constants/venice";
import { avatarDataUri } from "./_shared";
import {
  saveCharacterPromptToLibrary,
  startChatForCharacter,
  startNormalChatForCharacter,
} from "../../services/rpHelpers";
import { toast } from "../../stores/toast-store";
import type { Tab } from "../../stores/settings-store";
import {
  isSupportedImageFile,
  readImageAttachment,
} from "../../services/attachmentService";
import { askDecision } from "../ui/modal-requests";
import { getCharacterTokenBudget } from "../../services/rpTokenCounter";
import { validateCharacterCardAuthoring } from "../../types/character-card-spec";
import { desktopCharacterCards } from "../../services/desktopBridge";
import {
  deleteCharacterCardDraft,
  getCharacterCardDraft,
  saveCharacterCardDraft,
} from "../../services/characterCards/characterCardDraftService";
import {
  checkSystemPromptLimit,
  countPromptCharacters,
  SYSTEM_PROMPT_LIMITS,
} from "../../shared/promptLimits";
import {
  applyCharacterCardProposal,
  proposeCharacterCardRefinement,
} from "../../services/characterCards/characterCardAiService";
import type { CharacterCardPatchProposal } from "../../types/character-card-ai";
import { CharacterBookEditor } from "./CharacterBookEditor";
import { useLorebookStore } from "../../stores/lorebook-store";
import {
  mapCharacterBookV2ToLorebookV1,
  mapLorebookV1ToCharacterBookV2,
} from "../../services/characterCards/characterBookAdapter";
import { useModels } from "../../hooks/use-models";
import { useMediaStore } from "../../stores/media-store";
import {
  analyzeCharacterImage,
  generateCharacterFieldProposal,
  getVisionCapableCharacterModels,
  synthesizeCharacterCard,
} from "../../services/characterCards/characterCardGenerationService";
import type { CharacterAnalysisDraft } from "../../types/character-card-ai";
import type { CharacterCardExportReport } from "../../types/character-card-files";
import { compileRpPrompt } from "../../services/rpPromptCompiler";
import { veniceFetch } from "../../services/veniceClient/fetch";
import { useChatStore } from "../../stores/chat-store";
import { Trans, useTranslation } from "react-i18next";

/** Module-scoped WeakMap mapping each example object (by identity) to a stable
 *  client-side React key. Lives outside the component so keys survive remounts
 *  of the same card. Entries are GC'd when the example object is dropped. */
const EXAMPLE_KEYS_MODULE: WeakMap<CharacterExampleDialogue, string> =
  new WeakMap();

function avatarFromDataUrl(value: string): CharacterCardAvatar | undefined {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  if (!match) return undefined;
  const data = match[2].replace(/\s+/g, "");
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((data.length * 3) / 4) - padding);
  return byteLength > 0 && byteLength <= MAX_AVATAR_BYTES
    ? {
        mimeType: match[1].toLowerCase() as CharacterCardAvatar["mimeType"],
        data,
        byteLength,
      }
    : undefined;
}

function FieldFileLoader({
  targetField,
  onSelectFile,
  disabled = false,
}: {
  targetField: CharacterContextFile["targetField"];
  onSelectFile: (
    file: File,
    targetField: CharacterContextFile["targetField"],
  ) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline cursor-pointer ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
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
      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.label.loadFileTxtMd" />
      <input
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelectFile(f, targetField);
          e.target.value = "";
        }}
      />
    </label>
  );
}

interface Props {
  cardId: string;
  onClose: () => void;
  /** Disables save when the main-process config has not yet hydrated
   *  (defence-in-depth mirror of the VERIFY-017 hydration gate). */
  disabled?: boolean;
}

export function CharacterEditor({ cardId, onClose, disabled = false }: Props) {
  const { t: tRuntime } = useTranslation("common");
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
  const initial = useMemo(
    () => cards.find((c) => c.id === cardId),
    [cards, cardId],
  );
  const [draft, setDraft] = useState<CharacterCardV1 | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [extensionText, setExtensionText] = useState(() =>
    JSON.stringify(initial?.tavernExtensions ?? {}, null, 2),
  );
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "recovered"
  >("idle");
  const [refinementAction, setRefinementAction] =
    useState("Review consistency");
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const [proposal, setProposal] = useState<CharacterCardPatchProposal | null>(
    null,
  );
  const [refining, setRefining] = useState(false);
  const [activeStudioStep, setActiveStudioStep] = useState<number | "all">(
    "all",
  );
  const [generationConcept, setGenerationConcept] = useState("");
  const [generationOptions, setGenerationOptions] = useState({
    genre: "",
    setting: "",
    role: "",
    personalityDirection: "",
    dialogueStyle: "",
    relationshipToUser: "",
    desiredConflict: "",
    contentRating: "general" as "general" | "mature" | "adult",
    detailLevel: "detailed" as
      | "concise"
      | "detailed"
      | "narrative"
      | "roleplay-heavy"
      | "lore-heavy"
      | "custom",
    language: "English",
    customDirection: "",
  });
  const [generationModel, setGenerationModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [selectedSourceMediaId, setSelectedSourceMediaId] = useState("");
  const [analysisDraft, setAnalysisDraft] =
    useState<CharacterAnalysisDraft | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<CharacterCardV1 | null>(
    null,
  );
  const [generationStatus, setGenerationStatus] = useState<
    "idle" | "analyzing" | "generating"
  >("idle");
  const [fieldProposal, setFieldProposal] = useState<{
    field:
      | "name"
      | "description"
      | "personality"
      | "scenario"
      | "firstMessage"
      | "systemPrompt"
      | "postHistoryInstructions"
      | "rawExampleDialogue";
    before: string;
    after: string;
    reason: string;
  } | null>(null);
  const [fieldTarget, setFieldTarget] = useState<
    | "name"
    | "description"
    | "personality"
    | "scenario"
    | "firstMessage"
    | "systemPrompt"
    | "postHistoryInstructions"
    | "rawExampleDialogue"
  >("description");
  const [selectedProposalOperations, setSelectedProposalOperations] = useState<
    Set<number>
  >(new Set());
  const [testMessage, setTestMessage] = useState("Hello");
  const [testResponse, setTestResponse] = useState("");
  const [testingCard, setTestingCard] = useState(false);
  const [greetingPreviewIndex, setGreetingPreviewIndex] = useState(0);
  const [exportReport, setExportReport] =
    useState<CharacterCardExportReport | null>(null);
  const [comparisonVersionId, setComparisonVersionId] = useState<string | null>(
    null,
  );
  const [viewingContextFile, setViewingContextFile] =
    useState<CharacterContextFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const refinementAbortRef = useRef<AbortController | null>(null);
  const tokenBudget = useMemo(
    () => (draft ? getCharacterTokenBudget(draft) : null),
    [draft],
  );

  useEffect(() => {
    setDraft(initial ?? null);
    setExtensionText(JSON.stringify(initial?.tavernExtensions ?? {}, null, 2));
  }, [initial]);

  useEffect(() => {
    let active = true;
    void getCharacterCardDraft(cardId).then((record) => {
      if (
        active &&
        record &&
        (!initial || record.updatedAt > initial.updatedAt)
      ) {
        setDraft(record.card);
        setExtensionText(
          JSON.stringify(record.card.tavernExtensions ?? {}, null, 2),
        );
        setDraftStatus("recovered");
      }
    });
    return () => {
      active = false;
    };
  }, [cardId, initial]);

  useEffect(() => {
    if (!lorebooksLoaded) void useLorebookStore.getState().load();
  }, [lorebooksLoaded]);

  useEffect(() => {
    if (!mediaLoaded) void useMediaStore.getState().refresh();
  }, [mediaLoaded]);

  useEffect(() => {
    const fallback =
      useSettingsStore.getState().selectedModels?.text ||
      liveTextModels[0]?.id ||
      FALLBACK_MODELS.text[0]?.id ||
      "";
    if (!generationModel) setGenerationModel(fallback);
    const vision = getVisionCapableCharacterModels(liveTextModels)[0]?.id ?? "";
    if (!visionModel && vision) setVisionModel(vision);
  }, [generationModel, liveTextModels, visionModel]);

  useEffect(() => {
    const mediaId =
      typeof draft?.metadata?.sourceMediaId === "string"
        ? draft.metadata.sourceMediaId
        : "";
    if (mediaId && !selectedSourceMediaId) setSelectedSourceMediaId(mediaId);
  }, [draft, selectedSourceMediaId]);

  useEffect(
    () => () => {
      generationAbortRef.current?.abort();
      refinementAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!draft) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      void saveCharacterCardDraft(draft)
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("idle"));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [draft]);

  if (!draft) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.characterNotFound" />
      </div>
    );
  }
  const draftSystemPromptLimitResult = checkSystemPromptLimit(draft.systemPrompt);

  const update = <K extends keyof CharacterCardV1>(
    key: K,
    value: CharacterCardV1[K],
  ) => {
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
    update(
      "tags",
      draft.tags.filter((t) => t !== tag),
    );
  };

  const handleInstructionFileSelect = async (
    file: File,
    targetField: CharacterContextFile["targetField"] = "general",
    mode: "replace" | "append" = "replace",
  ) => {
    if (!draft) return;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const allowedExts = new Set(["txt", "md", "pdf"]);
    const allowedMimeTypes = new Set([
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
    ]);
    if (file.size > 5 * 1024 * 1024) {
      setError("Instruction file must be 5MB or smaller.");
      return;
    }
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
      return;
    }

    let text = "";
    if (ext === "pdf") {
      try {
        const { extractPdfText } =
          await import("../../services/pdfParserService");
        const result = await extractPdfText(file);
        if (result.isImageOnly) {
          setError(
            "This PDF has no embedded text layer (likely a scanned image). Use OCR or convert to .txt / .md first.",
          );
          return;
        }
        text = result.text.slice(0, 100_000);
      } catch {
        setError(
          "Failed to extract PDF text. Try converting the file to .txt or .md.",
        );
        return;
      }
    } else {
      try {
        text = await file.text();
      } catch {
        setError("Failed to read instruction file.");
        return;
      }
    }

    if (!text.trim()) {
      setError("Instruction file is empty.");
      return;
    }

    let fieldLabel = "General Context";
    if (targetField === "systemPrompt") {
      fieldLabel = "System Prompt";
      const current = draft.systemPrompt || "";
      const updated =
        mode === "append" && current ? `${current}\n\n${text}` : text;
      const promptLimitResult = checkSystemPromptLimit(updated);
      if (promptLimitResult.isOverLimit) {
        setError(
          promptLimitResult.message ??
            tRuntime(
              "runtimeGenerated.components.rpStudio.charactereditor.metadata.systemPromptExceedsApplicationLimit",
              "System prompt exceeds the application limit.",
            ),
        );
        return;
      }
      update("systemPrompt", updated);
    } else if (targetField === "personality") {
      fieldLabel = "Personality";
      const current = draft.personality || "";
      const updated =
        mode === "append" && current ? `${current}\n\n${text}` : text;
      update("personality", updated.slice(0, CARD_FIELD_MAX));
    } else if (targetField === "instructions") {
      fieldLabel = "Instructions";
      const current = draft.instructions || "";
      const updated =
        mode === "append" && current ? `${current}\n\n${text}` : text;
      update("instructions", updated.slice(0, CARD_FIELD_MAX));
    } else if (targetField === "scenario") {
      fieldLabel = "Scenario";
      const current = draft.scenario || "";
      const updated =
        mode === "append" && current ? `${current}\n\n${text}` : text;
      update("scenario", updated.slice(0, CARD_FIELD_MAX));
    } else if (targetField === "postHistoryInstructions") {
      fieldLabel = "Post-history Instructions";
      const current = draft.postHistoryInstructions || "";
      const updated =
        mode === "append" && current ? `${current}\n\n${text}` : text;
      update("postHistoryInstructions", updated.slice(0, CARD_FIELD_MAX));
    }

    const newFile: CharacterContextFile = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      name: file.name,
      content: text,
      size: file.size,
      targetField,
      loadedAt: Date.now(),
    };

    const existingFiles = draft.contextFiles || [];
    const fileIndex = existingFiles.findIndex((f) => f.name === file.name);
    let updatedFiles: CharacterContextFile[];
    if (fileIndex >= 0) {
      updatedFiles = [...existingFiles];
      updatedFiles[fileIndex] = newFile;
    } else {
      updatedFiles = [...existingFiles, newFile];
    }
    update("contextFiles", updatedFiles);
    setError(null);
    toast.success(
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.fileLoadedSourced",
      ),
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.loadedValue1IntoFieldlabelAndSavedInsideCharacterFile",
        { value1: file.name, fieldLabel: fieldLabel },
      ),
    );
  };

  const handleContextFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleInstructionFileSelect(file, "general");
    e.target.value = "";
  };

  const handleReapplySourcedFile = (file: CharacterContextFile) => {
    if (!file.targetField || file.targetField === "general") {
      toast.info(
        "General context file",
        "This file is supplied directly as general character context.",
      );
      return;
    }
    if (file.targetField === "systemPrompt") {
      update("systemPrompt", file.content);
    } else if (file.targetField === "personality") {
      update("personality", file.content);
    } else if (file.targetField === "instructions") {
      update("instructions", file.content);
    } else if (file.targetField === "scenario") {
      update("scenario", file.content);
    } else if (file.targetField === "postHistoryInstructions") {
      update("postHistoryInstructions", file.content);
    }
    toast.success(
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.reAppliedSourcedFile",
      ),
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.reLoadedValue1ContentIntoValue2",
        { value1: file.name, value2: file.targetField },
      ),
    );
  };

  const removeContextFile = (id: string) => {
    update(
      "contextFiles",
      (draft.contextFiles || []).filter((f) => f.id !== id),
    );
  };

  const handleAvatarFile = async (file: File) => {
    if (!isSupportedImageFile(file)) {
      setError("Avatar must be a supported image file (PNG, JPEG, WEBP).");
      update("avatar", undefined);
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(
        `Avatar file is too large (must be ≤ ${MAX_AVATAR_BYTES / (1024 * 1024)} MiB).`,
      );
      update("avatar", undefined);
      return;
    }
    try {
      const attachment = await readImageAttachment(file);
      const dataUri = attachment.content;
      const match = dataUri.match(
        /^data:(image\/(png|jpeg|webp));base64,(.*)$/,
      );
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
    update("exampleDialogues", [
      ...draft.exampleDialogues,
      { speaker: "", text: "" },
    ]);
  };

  const updateExample = (
    idx: number,
    key: "speaker" | "text",
    value: string,
  ) => {
    const next = draft.exampleDialogues.map((d, i) =>
      i === idx ? { ...d, [key]: value } : d,
    );
    update("exampleDialogues", next);
  };

  const removeExample = (idx: number) => {
    update(
      "exampleDialogues",
      draft.exampleDialogues.filter((_, i) => i !== idx),
    );
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
    if (!draft.sourceFormat || draft.sourceFormat === "venice-forge") {
      const missingFields = [];
      if (!draft.name?.trim()) missingFields.push("Name");
      if (!draft.description?.trim()) missingFields.push("Description");
      if (!draft.instructions?.trim()) missingFields.push("Instructions");
      
      const sourceMediaId = typeof draft.metadata?.sourceMediaId === "string" ? draft.metadata.sourceMediaId : undefined;
      const sourceMediaFound = sourceMediaId ? mediaItems.some(item => item.id === sourceMediaId) : false;
      if (!draft.avatar && !sourceMediaFound) missingFields.push("Image");
      
      if (missingFields.length > 0) {
        setError(`New Venice Forge characters require: ${missingFields.join(", ")}`);
        return;
      }
    }

    if (tokenBudget?.overLimit) {
      setError(
        `Character exceeds the supported context budget by ${Math.abs(tokenBudget.remainingInputTokens).toLocaleString()} estimated tokens.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const sourceMediaId =
        typeof draft.metadata?.sourceMediaId === "string"
          ? draft.metadata.sourceMediaId
          : undefined;
      const sourceMedia = sourceMediaId
        ? mediaItems.find((item) => item.id === sourceMediaId)
        : undefined;
      const materializedAvatar =
        !draft.avatar && sourceMedia?.mediaType === "image"
          ? avatarFromDataUrl(sourceMedia.image)
          : undefined;
      const saved = await upsert(
        materializedAvatar ? { ...draft, avatar: materializedAvatar } : draft,
      );
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
      title: tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.metadata.deleteCharacter",
      ),
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
      title: tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.metadata.workflowValue1",
        { value1: saved.name || "Untitled" },
      ),
      steps: [
        {
          kind: "rp_character",
          target: "rp_studio",
          title:
            saved.name ||
            tRuntime(
              "runtimeGenerated.components.rpStudio.charactereditor.metadata.untitled",
            ),
          ref: { characterId: saved.id },
          enabled: true,
        } as WorkflowStep,
      ],
      source: { type: "rp", sourceId: saved.id },
    });
    setActiveWorkflow(w.id);
    setActiveTab("workflows");
    toast.success(
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.workflowCreated",
      ),
    );
  };

  const handleSaveToPromptLibrary = async () => {
    try {
      const saved = await upsert(draft);
      if (!saved) return;
      const promptId = await saveCharacterPromptToLibrary(saved.id);
      if (promptId) {
        toast.success(
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.savedToPromptLibrary",
          ),
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.promptValue1Created",
            { value1: saved.name },
          ),
        );
      } else {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotSaveToPromptLibrary",
          ),
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.safetyGuardBlockedThePrompt",
          ),
        );
      }
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotSaveToPromptLibrary",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.pleaseTryAgain",
        ),
      );
    }
  };

  const handleStartChat = async () => {
    try {
      const saved = await upsert(draft);
      if (!saved) return;
      const chatId = await startChatForCharacter(saved.id);
      if (chatId) {
        toast.success(
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.rpChatStarted",
          ),
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.openingValue1InRpStudio",
            { value1: saved.name },
          ),
        );
        onClose();
      } else {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotStartRpChat",
          ),
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.storageRejectedTheRequest",
          ),
        );
      }
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotStartRpChat",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.pleaseTryAgain",
        ),
      );
    }
  };

  const handleChat = async () => {
    try {
      const saved = await upsert(draft);
      if (!saved) return;
      const convId = await startNormalChatForCharacter(saved.id);
      if (convId) {
        toast.success(
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.chatStarted",
          ),
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.openingValue1InChat",
            { value1: saved.name },
          ),
        );
        onClose();
      } else {
        toast.error(
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotStartChat",
          ),
          tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.notification.storageRejectedTheRequest",
          ),
        );
      }
    } catch {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotStartChat",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.pleaseTryAgain",
        ),
      );
    }
  };

  const handleAttachScene = async (sceneId: string) => {
    if (!sceneId) return;
    const { attachSceneToCharacter } = await import("../../services/rpHelpers");
    const updated = await attachSceneToCharacter(draft.id, sceneId);
    if (updated) {
      setDraft(updated);
      const scene = useSceneComposerStore.getState().getScene(sceneId);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.sceneAttached",
        ),
        scene
          ? tRuntime(
              "runtimeGenerated.components.rpStudio.charactereditor.notification.linkedValue1ToThisCharacter",
              { value1: scene.title },
            )
          : tRuntime(
              "runtimeGenerated.components.rpStudio.charactereditor.notification.sceneLinked",
            ),
      );
    } else {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotAttachScene",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.storageRejectedTheRequest",
        ),
      );
    }
  };

  const handleAttachPrompt = async (promptId: string) => {
    if (!promptId) return;
    const { attachPromptToCharacter } =
      await import("../../services/rpHelpers");
    const updated = await attachPromptToCharacter(draft.id, promptId);
    if (updated) {
      setDraft(updated);
      const prompt = usePromptLibraryStore.getState().getPrompt(promptId);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.promptAttached",
        ),
        prompt
          ? tRuntime(
              "runtimeGenerated.components.rpStudio.charactereditor.notification.linkedValue1ToThisCharacter",
              { value1: prompt.title },
            )
          : tRuntime(
              "runtimeGenerated.components.rpStudio.charactereditor.notification.promptLinked",
            ),
      );
    } else {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.couldNotAttachPrompt",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.storageRejectedTheRequest",
        ),
      );
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
    toast.success(
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.scenarioCreated",
      ),
      tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.notification.openTheRpStudioToEditIt",
      ),
    );
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
      toast.success(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.versionSaved",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.characterSnapshotCreated",
        ),
      );
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    const restored = await setCurrentVersion(draft.id, versionId);
    if (restored) {
      setDraft(restored);
      toast.success(
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.versionRestored",
        ),
        tRuntime(
          "runtimeGenerated.components.rpStudio.charactereditor.notification.characterRevertedToSavedVersion",
        ),
      );
    }
  };

  const sourceMediaId =
    typeof draft.metadata?.sourceMediaId === "string"
      ? draft.metadata.sourceMediaId
      : undefined;
  const sourceMedia = sourceMediaId
    ? mediaItems.find((item) => item.id === sourceMediaId)
    : undefined;
  const selectedGenerationMedia = mediaItems.find(
    (item) => item.id === selectedSourceMediaId,
  );
  const selectedVisionModel = liveTextModels.find(
    (model) => model.id === visionModel,
  );
  const avatarSrc =
    avatarDataUri(draft.avatar) ||
    (sourceMedia?.mediaType === "image" ? sourceMedia.image : undefined);
  const linkedLorebookIds = Array.isArray(draft.metadata?.linkedLorebookIds)
    ? draft.metadata.linkedLorebookIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const studioSteps = [
    "Source",
    "Identity",
    "Persona",
    "Prompt Behavior",
    "Greetings",
    "Example Dialogue",
    "Character Book",
    "Model and Context",
    "Test",
    "Export",
  ];
  const isStepVisible = (stepIndex: number) =>
    activeStudioStep === "all" || activeStudioStep === stepIndex;
  const testCompilation = compileRpPrompt({
    rpChat: {
      schema: "RpChatV1",
      id: `test-${draft.id}`,
      title: tRuntime(
        "runtimeGenerated.components.rpStudio.charactereditor.metadata.disposableCardTest",
      ),
      characterIds: [draft.id],
      lorebookIds: linkedLorebookIds,
      modelId: draft.modelId || generationModel || "",
      messages: [],
      adult: draft.adult,
      metadata: { pinned: false, archived: false, tags: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies RpChatV1,
    characters: [draft],
    lorebooks: lorebooks.filter((book) => linkedLorebookIds.includes(book.id)),
    memories: [],
    currentUserMessage: testMessage,
    expectedCharacterId: draft.id,
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-y border-vf-panel-border bg-vf-shell-bg bg-vf-panel-bg">
        <button
          type="button"
          onClick={onClose}
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.attribute.backToLibrary",
          )}
          className="text-text-secondary hover:text-text-primary p-2 rounded-md hover:bg-vf-control-hover transition-colors"
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
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-text-primary truncate">
            {draft.name ||
              tRuntime(
                "runtimeGenerated.components.rpStudio.charactereditor.text.untitled",
              )}
          </h2>
          <p className="text-[12px] text-text-muted truncate">
            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.localCharacterStoredInVeniceForgeNot" />
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {tokenBudget && (
            <div
              className={`text-right text-[12px] ${tokenBudget.overLimit ? "text-danger" : "text-text-muted"}`}
              data-testid="character-token-budget"
              aria-label={tRuntime(
                "runtimeGenerated.components.rpStudio.charactereditor.attribute.estimatedTokensValue1OfValue2",
                {
                  value1: tokenBudget.compiled.count.toLocaleString(),
                  value2: tokenBudget.inputBudget.toLocaleString(),
                },
              )}
            >
              <div>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.estimatedTokens" />{" "}
                {tokenBudget.compiled.count.toLocaleString()} /{" "}
                {tokenBudget.inputBudget.toLocaleString()}
              </div>
              <div>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.rawEstimate" />{" "}
                {tokenBudget.raw.count.toLocaleString()}{" "}
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.outputReserve" />{" "}
                {tokenBudget.reservedOutputTokens.toLocaleString()}
              </div>
            </div>
          )}
          <GhostButton
            onClick={() => {
              openCharacterCreator({
                mode: "edit-local-character",
                localCharacterId: draft.id,
              });
            }}
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.editWithCharacterCreator" />
          </GhostButton>
          <GhostButton onClick={handleDelete}>
            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.delete" />
          </GhostButton>
          <GhostButton onClick={() => void handleArchive()}>
            {draft.archivedAt
              ? tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.text.unarchive",
                )
              : tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.text.archive",
                )}
          </GhostButton>
          <PrimaryButton
            onClick={handleSave}
            loading={saving}
            size="sm"
            disabled={disabled || tokenBudget?.overLimit === true}
            ariaLabel={
              disabled
                ? "Save (waiting for config to load)"
                : tokenBudget?.overLimit
                  ? "Save (character exceeds token budget)"
                  : "Save"
            }
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.save" />
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <nav
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.attribute.stCardStudioSteps",
          )}
          className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto bg-vf-panel-bg px-4 pb-3 border-y border-vf-panel-border"
        >
          <button
            type="button"
            aria-current={activeStudioStep === "all" ? "step" : undefined}
            onClick={() => setActiveStudioStep("all")}
            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${activeStudioStep === "all" ? "border-accent bg-accent/10 text-accent" : "border-vf-panel-border text-text-muted"}`}
          >
            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.allSteps" />
          </button>
          {studioSteps.map((step, index) => (
            <button
              key={step}
              type="button"
              aria-current={activeStudioStep === index ? "step" : undefined}
              onClick={() => setActiveStudioStep(index)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${activeStudioStep === index ? "border-accent bg-accent/10 text-accent" : "border-vf-panel-border text-text-muted"}`}
            >
              {index + 1}. {step}
            </button>
          ))}
        </nav>
        <p className="text-[12px] text-text-muted">
          {typeof activeStudioStep === "number"
            ? tRuntime(
                "runtimeGenerated.components.rpStudio.charactereditor.text.stepValue1OfValue2Value3YourLocalDraftRemainsAutosaved",
                {
                  value1: activeStudioStep + 1,
                  value2: studioSteps.length,
                  value3: studioSteps[activeStudioStep],
                },
              )
            : tRuntime(
                "runtimeGenerated.components.rpStudio.charactereditor.text.showingAllSteps110SelectAStepTabAbove",
              )}
        </p>
        <div className="text-[12px] text-text-muted" role="status">
          {draftStatus === "recovered"
            ? tRuntime(
                "runtimeGenerated.components.rpStudio.charactereditor.text.recoveredLocalDraft",
              )
            : draftStatus === "saving"
              ? tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.text.savingLocalDraft",
                )
              : draftStatus === "saved"
                ? tRuntime(
                    "runtimeGenerated.components.rpStudio.charactereditor.text.draftSavedLocallyNotSynced",
                  )
                : ""}
        </div>

        {/* Step 1: Source */}
        {isStepVisible(0) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.1SourceAvatar" />
            </h3>
            <div className="flex gap-4 items-start">
              <div className="shrink-0">
                <div className="w-24 h-24 rounded-lg overflow-hidden border border-vf-panel-border bg-vf-panel-bg-raised flex items-center justify-center text-text-muted text-3xl font-semibold">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className="w-full h-full object-cover"
                    />
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
                  className="mt-2 w-24 text-[12px] py-1 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors"
                >
                  {draft.avatar
                    ? tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.replace",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.upload",
                      )}{" "}
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.avatar" />
                </button>
                {draft.avatar && (
                  <button
                    type="button"
                    onClick={() => update("avatar", null)}
                    className="mt-1 w-24 text-[12px] py-1 rounded-md text-text-muted hover:text-rose-300 transition-colors"
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.remove" />
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <Label htmlFor="card-version">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.characterVersion" />
                  </Label>
                  <input
                    id="card-version"
                    value={draft.characterVersion ?? ""}
                    onChange={(e) => update("characterVersion", e.target.value)}
                    maxLength={64}
                    className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <Label>
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.importSource" />
                  </Label>
                  <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[13px] text-text-secondary">
                    {draft.sourceFormat ??
                      tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.veniceForgeLocal",
                      )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 2: Identity */}
        {isStepVisible(1) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.2Identity" />
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="card-name">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.name" />
                </Label>
                <input
                  id="card-name"
                  value={draft.name}
                  onChange={(e) => update("name", e.target.value)}
                  maxLength={200}
                  className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <Label htmlFor="card-author">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.author" />
                </Label>
                <input
                  id="card-author"
                  value={draft.author ?? ""}
                  onChange={(e) =>
                    update("author", e.target.value || undefined)
                  }
                  placeholder="optional"
                  maxLength={200}
                  className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="card-adult"
                type="checkbox"
                checked={draft.adult}
                onChange={(e) => update("adult", e.target.checked)}
                className="accent-danger"
              />
              <Label htmlFor="card-adult">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.adultContent18" />
              </Label>
            </div>
            <div>
              <Label
                htmlFor="card-desc"
                hint={`${draft.description.length}/${CARD_FIELD_MAX}`}
              >
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.description" />
              </Label>
              <TextArea
                value={draft.description}
                onChange={(v) => update("description", v)}
                placeholder={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.aShortSummaryShownInTheLibraryGrid",
                )}
                rows={3}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Description"
              />
            </div>
            <div>
              <Label
                htmlFor="card-creator-notes"
                hint={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.displayOnlyNeverIncludedInModelPrompts",
                )}
              >
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.creatorNotes" />
              </Label>
              <TextArea
                id="card-creator-notes"
                value={draft.creatorNotes ?? ""}
                onChange={(value) => update("creatorNotes", value)}
                rows={3}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Creator notes"
              />
            </div>
            <div>
              <Label
                htmlFor="card-tags"
                hint={`${draft.tags.length}/${MAX_TAGS}`}
              >
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.tags" />
              </Label>
              <div className="flex gap-2">
                <input
                  id="card-tags"
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
                    "runtimeGenerated.components.rpStudio.charactereditor.attribute.addATagAndPressEnter",
                  )}
                  maxLength={64}
                  className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                />
                <GhostButton onClick={addTag} disabled={!tagInput.trim()}>
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.add" />
                </GhostButton>
              </div>
              {draft.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {draft.tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-[12px] px-2 py-0.5 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
                      aria-label={tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.attribute.removeTagT",
                        { t: t },
                      )}
                    >
                      {t} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 3: Persona */}
        {isStepVisible(2) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.3Persona" />
            </h3>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="card-personality">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.personality" />
                </Label>
                <FieldFileLoader
                  targetField="personality"
                  onSelectFile={handleInstructionFileSelect}
                />
              </div>
              <TextArea
                id="card-personality"
                value={draft.personality ?? ""}
                onChange={(value) => update("personality", value)}
                rows={4}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Personality"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="card-scenario" hint="optional">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.scenario" />
                </Label>
                <FieldFileLoader
                  targetField="scenario"
                  onSelectFile={handleInstructionFileSelect}
                />
              </div>
              <TextArea
                value={draft.scenario ?? ""}
                onChange={(v) => update("scenario", v || undefined)}
                placeholder={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.anOpenerSceneShownToTheModelOnTheFirst",
                )}
                rows={3}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Scenario"
              />
            </div>
          </section>
        )}

        {/* Step 4: Prompt Behavior */}
        {isStepVisible(3) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.4PromptBehavior" />
            </h3>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label
                  htmlFor="card-system"
                  hint={tRuntime(
                    "surface.componentsRpStudioCharactereditor.text.estimatedSystemPromptTokens",
                    "{{estimatedTokenCount}} / {{maximumTokens}} estimated tokens",
                    {
                      estimatedTokenCount: draftSystemPromptLimitResult.estimatedTokenCount.toLocaleString(),
                      maximumTokens: SYSTEM_PROMPT_LIMITS.maxTokens.toLocaleString(),
                    },
                  )}
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.systemPrompt" />
                </Label>
                <FieldFileLoader
                  targetField="systemPrompt"
                  onSelectFile={handleInstructionFileSelect}
                />
              </div>
              <TextArea
                value={draft.systemPrompt}
                onChange={(v) => update("systemPrompt", v)}
                placeholder={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.theCharacterSPersonaVoiceAndBehaviouralRules",
                )}
                rows={6}
                ariaLabel="System prompt"
              />
              {draftSystemPromptLimitResult.isWarning && (
                <div className="text-[12px] text-amber-500 mt-1">
                  {tRuntime(
                    "surface.componentsRpStudioCharactereditor.text.approachingSystemPromptSizeLimit",
                    "System prompt size: {{estimatedTokenCount}} / {{maximumTokens}} estimated tokens; {{codePointCount}} / {{maximumCodePoints}} Unicode code points.",
                    {
                      estimatedTokenCount: draftSystemPromptLimitResult.estimatedTokenCount.toLocaleString(),
                      maximumTokens: SYSTEM_PROMPT_LIMITS.maxTokens.toLocaleString(),
                      codePointCount: countPromptCharacters(draft.systemPrompt).toLocaleString(),
                      maximumCodePoints: SYSTEM_PROMPT_LIMITS.maxCodePoints.toLocaleString(),
                    },
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="card-post-history">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.postHistoryInstructions" />
                </Label>
                <FieldFileLoader
                  targetField="postHistoryInstructions"
                  onSelectFile={handleInstructionFileSelect}
                />
              </div>
              <TextArea
                id="card-post-history"
                value={draft.postHistoryInstructions ?? ""}
                onChange={(value) => update("postHistoryInstructions", value)}
                rows={3}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Post-history instructions"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label
                  htmlFor="card-instructions"
                  hint={`${(draft.instructions ?? "").length}/${CARD_FIELD_MAX}`}
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.instructions" />
                </Label>
                <FieldFileLoader
                  targetField="instructions"
                  onSelectFile={handleInstructionFileSelect}
                />
              </div>
              <TextArea
                id="card-instructions"
                value={draft.instructions ?? ""}
                onChange={(v) => update("instructions", v || undefined)}
                placeholder={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.optionalHigherLevelGuidanceForTheModelSteeringRulesOutput",
                )}
                rows={4}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Instructions"
              />
            </div>
          </section>
        )}

        {/* Step 5: Greetings */}
        {isStepVisible(4) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.5Greetings" />
            </h3>
            <div>
              <Label htmlFor="card-first-message" hint="optional">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.firstMessagePrimaryGreeting" />
              </Label>
              <TextArea
                id="card-first-message"
                value={draft.firstMessage ?? ""}
                onChange={(v) => update("firstMessage", v || undefined)}
                placeholder={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.greetingShownOnTheFirstAssistantTurn",
                )}
                rows={3}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="First message"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.alternateGreetings" />
                </Label>
                <GhostButton
                  onClick={() =>
                    update("alternateGreetings", [
                      ...(draft.alternateGreetings ?? []),
                      "",
                    ])
                  }
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.addGreeting" />
                </GhostButton>
              </div>
              <div
                className="mt-2 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-3"
                aria-live="polite"
              >
                <div className="mb-1 text-[11px] uppercase text-text-muted">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.greetingPreview" />{" "}
                  {Math.min(
                    greetingPreviewIndex + 1,
                    1 + (draft.alternateGreetings?.length ?? 0),
                  )}{" "}
                  / {1 + (draft.alternateGreetings?.length ?? 0)}
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-text-primary">
                  {[
                    draft.firstMessage ?? "",
                    ...(draft.alternateGreetings ?? []),
                  ][greetingPreviewIndex] ||
                    tRuntime(
                      "runtimeGenerated.components.rpStudio.charactereditor.text.noGreetingText",
                    )}
                </p>
                <div className="mt-2 flex gap-2">
                  <GhostButton
                    disabled={greetingPreviewIndex === 0}
                    onClick={() =>
                      setGreetingPreviewIndex((index) => Math.max(0, index - 1))
                    }
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.previous" />
                  </GhostButton>
                  <GhostButton
                    disabled={
                      greetingPreviewIndex >=
                      (draft.alternateGreetings?.length ?? 0)
                    }
                    onClick={() =>
                      setGreetingPreviewIndex((index) =>
                        Math.min(
                          draft.alternateGreetings?.length ?? 0,
                          index + 1,
                        ),
                      )
                    }
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.next" />
                  </GhostButton>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {(draft.alternateGreetings ?? []).map((greeting, index) => (
                  <div key={index} className="flex gap-2">
                    <textarea
                      value={greeting}
                      onChange={(event) =>
                        update(
                          "alternateGreetings",
                          (draft.alternateGreetings ?? []).map(
                            (value, itemIndex) =>
                              itemIndex === index ? event.target.value : value,
                          ),
                        )
                      }
                      aria-label={tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.attribute.alternateGreetingValue1",
                        { value1: index + 1 },
                      )}
                      rows={2}
                      maxLength={CARD_FIELD_MAX}
                      className="flex-1 resize-y rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[13px] text-text-primary"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => update("firstMessage", greeting)}
                        className="text-[11px] rounded border border-vf-panel-border px-2 py-1 text-text-secondary"
                      >
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.setPrimary" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update("alternateGreetings", [
                            ...(draft.alternateGreetings ?? []).slice(
                              0,
                              index + 1,
                            ),
                            greeting,
                            ...(draft.alternateGreetings ?? []).slice(
                              index + 1,
                            ),
                          ])
                        }
                        className="text-[11px] rounded border border-vf-panel-border px-2 py-1 text-text-secondary"
                      >
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.duplicate" />
                      </button>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...(draft.alternateGreetings ?? [])];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          update("alternateGreetings", next);
                        }}
                        className="text-[11px] rounded border border-vf-panel-border px-2 py-1 text-text-secondary disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={
                          index === (draft.alternateGreetings?.length ?? 0) - 1
                        }
                        onClick={() => {
                          const next = [...(draft.alternateGreetings ?? [])];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          update("alternateGreetings", next);
                        }}
                        className="text-[11px] rounded border border-vf-panel-border px-2 py-1 text-text-secondary disabled:opacity-40"
                      >
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.down" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "alternateGreetings",
                            (draft.alternateGreetings ?? []).filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        className="text-[11px] rounded border border-vf-panel-border px-2 py-1 text-error"
                      >
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.remove" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Step 6: Example Dialogue */}
        {isStepVisible(5) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.6ExampleDialogue" />
            </h3>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.exampleDialogues" />
                </Label>
                <div className="flex gap-2">
                  <GhostButton
                    disabled={draft.exampleDialogues.length === 0}
                    onClick={() =>
                      update(
                        "rawExampleDialogue",
                        draft.exampleDialogues
                          .map(
                            (example) =>
                              `${/^(user|you)$/i.test(example.speaker.trim()) ? "{{user}}" : "{{char}}"}: ${example.text}`,
                          )
                          .join("\n"),
                      )
                    }
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.updateRawPreview" />
                  </GhostButton>
                  <GhostButton onClick={addExample}>
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.addExample" />
                  </GhostButton>
                </div>
              </div>
              {draft.exampleDialogues.length === 0 ? (
                <div className="text-[12px] text-text-muted italic">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.noExamplesAddAFewShotExchange" />
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.exampleDialogues.map((d, i) => (
                    <div
                      key={getExampleKey(d)}
                      className="flex gap-2 items-start bg-vf-panel-bg-raised border border-vf-panel-border rounded-md p-2"
                    >
                      <div className="w-32 shrink-0">
                        <input
                          aria-label={tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.attribute.exampleValue1Speaker",
                            { value1: i + 1 },
                          )}
                          value={d.speaker}
                          onChange={(e) =>
                            updateExample(i, "speaker", e.target.value)
                          }
                          placeholder={tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.attribute.speaker",
                          )}
                          maxLength={200}
                          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
                        />
                        {!d.speaker.trim() && (
                          <span
                            className="mt-1 block text-[10px] text-warning"
                            role="alert"
                          >
                            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.speakerRequired" />
                          </span>
                        )}
                      </div>
                      <textarea
                        value={d.text}
                        onChange={(e) =>
                          updateExample(i, "text", e.target.value)
                        }
                        placeholder={tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.attribute.whatTheySay",
                        )}
                        rows={2}
                        maxLength={CARD_FIELD_MAX}
                        className="flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted resize-none"
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => {
                            const next = [...draft.exampleDialogues];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            update("exampleDialogues", next);
                          }}
                          aria-label={tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.attribute.moveExampleValue1Up",
                            { value1: i + 1 },
                          )}
                          className="text-[10px] text-text-muted disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={i === draft.exampleDialogues.length - 1}
                          onClick={() => {
                            const next = [...draft.exampleDialogues];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            update("exampleDialogues", next);
                          }}
                          aria-label={tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.attribute.moveExampleValue1Down",
                            { value1: i + 1 },
                          )}
                          className="text-[10px] text-text-muted disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExample(i)}
                        aria-label={tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.attribute.removeExample",
                        )}
                        className="text-text-muted hover:text-rose-300 p-1"
                      >
                        <svg
                          width="12"
                          height="12"
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
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label
                htmlFor="card-raw-examples"
                hint={tRuntime(
                  "runtimeGenerated.components.rpStudio.charactereditor.attribute.losslessSillytavernMesExampleCompatibilityText",
                )}
              >
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.rawExampleDialogue" />
              </Label>
              <TextArea
                id="card-raw-examples"
                value={draft.rawExampleDialogue ?? ""}
                onChange={(value) => update("rawExampleDialogue", value)}
                rows={5}
                maxLength={CARD_FIELD_MAX}
                ariaLabel="Raw example dialogue"
              />
            </div>
          </section>
        )}

        {/* Step 7: Character Book */}
        {isStepVisible(6) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.7CharacterBookExtensions" />
            </h3>
            <div className="space-y-2">
              <Label htmlFor="card-extensions">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.v2ExtensionData" />
              </Label>
              <textarea
                id="card-extensions"
                value={extensionText}
                onChange={(event) => setExtensionText(event.target.value)}
                onBlur={() => {
                  try {
                    const parsed = JSON.parse(extensionText) as unknown;
                    if (
                      !parsed ||
                      typeof parsed !== "object" ||
                      Array.isArray(parsed)
                    )
                      throw new Error();
                    update(
                      "tavernExtensions",
                      parsed as CharacterCardV1["tavernExtensions"],
                    );
                    setError(null);
                  } catch {
                    setError("Extension data must be a valid JSON object.");
                  }
                }}
                rows={6}
                spellCheck={false}
                className="w-full resize-y rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 font-mono text-[12px] text-text-primary"
              />
              <p className="text-[12px] text-text-muted">
                Unknown safe namespaces are preserved. Unsafe keys and
                over-limit values are rejected during persistence/export.
              </p>
            </div>
            <div className="space-y-3 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-3 text-[13px] text-text-secondary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.characterBook" />
                </Label>
                <div className="flex gap-2">
                  {!draft.embeddedCharacterBook ? (
                    <GhostButton
                      onClick={() =>
                        update("embeddedCharacterBook", {
                          name: `${draft.name || "Character"} lore`,
                          extensions: {},
                          entries: [],
                        })
                      }
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.createEmbeddedBook" />
                    </GhostButton>
                  ) : (
                    <GhostButton
                      onClick={() => update("embeddedCharacterBook", undefined)}
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.removeEmbeddedBook" />
                    </GhostButton>
                  )}
                </div>
              </div>
              <p className="text-[12px] text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.embeddedDataIsPortableInV2Exports" />
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-56 flex-1">
                  <span className="mb-1 block text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.attachExistingLorebook" />
                  </span>
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const lorebook = lorebooks.find(
                        (item) => item.id === event.target.value,
                      );
                      if (!lorebook) return;
                      update("metadata", {
                        ...(draft.metadata ?? {}),
                        linkedLorebookIds: Array.from(
                          new Set([...linkedLorebookIds, lorebook.id]),
                        ),
                      });
                      if (!draft.embeddedCharacterBook)
                        update(
                          "embeddedCharacterBook",
                          mapLorebookV1ToCharacterBookV2(lorebook),
                        );
                      event.target.value = "";
                    }}
                    className="w-full rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5 text-[13px] text-text-primary"
                  >
                    <option value="">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.chooseLorebook" />
                    </option>
                    {lorebooks
                      .filter((book) => !linkedLorebookIds.includes(book.id))
                      .map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.name}
                        </option>
                      ))}
                  </select>
                </label>
                {draft.embeddedCharacterBook && (
                  <GhostButton
                    onClick={async () => {
                      const id = `cardbook-${draft.id}`.slice(0, 128);
                      const saved = await saveLorebook(
                        mapCharacterBookV2ToLorebookV1(
                          draft.embeddedCharacterBook!,
                          { id, characterId: draft.id },
                        ),
                      );
                      if (saved)
                        update("metadata", {
                          ...(draft.metadata ?? {}),
                          linkedLorebookIds: Array.from(
                            new Set([...linkedLorebookIds, saved.id]),
                          ),
                        });
                    }}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.importEmbeddedAsLinked" />
                  </GhostButton>
                )}
              </div>
              {linkedLorebookIds.length > 0 && (
                <div className="space-y-2">
                  {linkedLorebookIds.map((id) => {
                    const lorebook = lorebooks.find((item) => item.id === id);
                    return (
                      <div
                        key={id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5"
                      >
                        <span>{lorebook?.name ?? id}</span>
                        <div className="flex gap-2">
                          {lorebook && (
                            <GhostButton
                              onClick={() =>
                                update(
                                  "embeddedCharacterBook",
                                  mapLorebookV1ToCharacterBookV2(lorebook),
                                )
                              }
                            >
                              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.syncIntoEmbedded" />
                            </GhostButton>
                          )}
                          <GhostButton
                            onClick={() =>
                              update("metadata", {
                                ...(draft.metadata ?? {}),
                                linkedLorebookIds: linkedLorebookIds.filter(
                                  (linkedId) => linkedId !== id,
                                ),
                              })
                            }
                          >
                            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.detachPreserveEmbedded" />
                          </GhostButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {draft.embeddedCharacterBook && (
                <CharacterBookEditor
                  book={draft.embeddedCharacterBook}
                  onChange={(book) => update("embeddedCharacterBook", book)}
                />
              )}
            </div>
          </section>
        )}

        {/* Step 8: Model and Context */}
        {isStepVisible(7) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.8ModelAndContext" />
            </h3>
            <div>
              <Label htmlFor="card-model" hint="optional">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.defaultModel" />
              </Label>
              <select
                id="card-model"
                value={draft.modelId ?? ""}
                onChange={(e) => update("modelId", e.target.value || undefined)}
                className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
              >
                <option value="">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.useChatDefault" />
                </option>
                {FALLBACK_MODELS.text.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-4 pt-2 border-t border-vf-panel-border">
              <Label>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.specialSettings" />
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.webSearch}
                    onChange={(e) => update("webSearch", e.target.checked)}
                    className="rounded border-vf-panel-border bg-vf-panel-bg text-accent focus:ring-accent"
                  />
                  <span className="text-[12px] text-text-primary">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.webSearch" />
                  </span>
                </label>
                <label className="flex flex-col gap-1 cursor-pointer">
                  <span className="text-[12px] text-text-primary">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.urlScrapingProvider" />
                  </span>
                  <select
                    value={draft.urlScrapingProvider ?? "off"}
                    onChange={(e) =>
                      update(
                        "urlScrapingProvider",
                        e.target.value as "off" | "brave" | "google",
                      )
                    }
                    className="bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent"
                    aria-label={tRuntime(
                      "runtimeGenerated.components.rpStudio.charactereditor.attribute.urlScrapingProvider",
                    )}
                  >
                    <option value="off">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.off" />
                    </option>
                    <option value="brave">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.brave" />
                    </option>
                    <option value="google">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.google" />
                    </option>
                  </select>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.enableThoughts ?? true}
                    onChange={(e) => update("enableThoughts", e.target.checked)}
                    className="rounded border-vf-panel-border bg-vf-panel-bg text-accent focus:ring-accent"
                  />
                  <span className="text-[12px] text-text-primary">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.enableThoughts" />
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label
                    hint={tRuntime(
                      "runtimeGenerated.components.rpStudio.charactereditor.attribute.temperature",
                    )}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.temperature" />
                  </Label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={draft.temperature ?? 0.7}
                    onChange={(e) =>
                      update("temperature", parseFloat(e.target.value))
                    }
                    className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <Label
                    hint={tRuntime(
                      "runtimeGenerated.components.rpStudio.charactereditor.attribute.topP",
                    )}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.topP" />
                  </Label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={draft.topP ?? 0.9}
                    onChange={(e) => update("topP", parseFloat(e.target.value))}
                    className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-vf-panel-border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label>
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.sourcedContextFiles" />
                  </Label>
                  <p className="text-[11.5px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.filesLoadedIntoPersonalitySystemPromptInstructions" />
                  </p>
                </div>
                <label className="text-[12px] px-2.5 py-1 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised text-text-secondary hover:text-text-primary hover:border-accent/40 cursor-pointer transition-colors shrink-0">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.label.uploadFileMax5mb" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleContextFileUpload}
                    accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  />
                </label>
              </div>
              {!draft.contextFiles || draft.contextFiles.length === 0 ? (
                <div className="text-[12px] text-text-muted italic">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.noSourcedOrContextFilesUploaded" />
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.contextFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex gap-2 items-center justify-between bg-vf-panel-bg-raised border border-vf-panel-border rounded-md p-2.5"
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-text-primary truncate">
                            {f.name}
                          </span>
                          {f.targetField && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent font-medium uppercase tracking-wider">
                              {f.targetField}
                            </span>
                          )}
                        </div>
                        <span className="text-[11.5px] text-text-muted">
                          {(f.size / 1024).toFixed(1)} KB{" "}
                          {f.loadedAt
                            ? tRuntime(
                                "runtimeGenerated.components.rpStudio.charactereditor.text.value1",
                                {
                                  value1: new Date(
                                    f.loadedAt,
                                  ).toLocaleDateString(),
                                },
                              )
                            : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <GhostButton onClick={() => setViewingContextFile(f)}>
                          <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.view" />
                        </GhostButton>
                        {f.targetField && f.targetField !== "general" && (
                          <GhostButton
                            onClick={() => handleReapplySourcedFile(f)}
                          >
                            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.reApply" />
                          </GhostButton>
                        )}
                        <button
                          type="button"
                          onClick={() => removeContextFile(f.id)}
                          aria-label={tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.attribute.removeFileValue1",
                            { value1: f.name },
                          )}
                          className="text-text-muted hover:text-rose-300 p-1"
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
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 9: Test */}
        {isStepVisible(8) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.9TestAiRefinement" />
            </h3>
            <div className="space-y-2">
              <Label>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.disposableTestChat" />
              </Label>
              <p className="text-[12px] text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.runsOneUnsavedTurnTheResponseNever" />
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.promptOrderTrace" />
                  </Label>
                  <ol className="max-h-40 overflow-y-auto rounded border border-vf-panel-border bg-vf-panel-bg p-2 text-[11px] text-text-secondary">
                    {testCompilation.sections
                      .filter((section) => section.included)
                      .map((section) => (
                        <li key={section.id}>
                          {section.kind} · ~{section.tokens}{" "}
                          <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.item.tokens" />
                        </li>
                      ))}
                  </ol>
                  <p className="mt-1 text-[11px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.estimatedSystemPrompt" />{" "}
                    {testCompilation.totalSystemTokens.toLocaleString()}{" "}
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.tokensActivatedLorebookSections" />{" "}
                    {
                      testCompilation.sections.filter(
                        (section) =>
                          section.kind === "lorebook-entry" && section.included,
                      ).length
                    }
                  </p>
                </div>
                <div>
                  <Label>
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.testUserMessage" />
                  </Label>
                  <TextArea
                    value={testMessage}
                    onChange={setTestMessage}
                    rows={3}
                    ariaLabel="Disposable test user message"
                  />
                  <PrimaryButton
                    disabled={
                      testingCard ||
                      !testMessage.trim() ||
                      !(draft.modelId || generationModel)
                    }
                    onClick={async () => {
                      setTestingCard(true);
                      setError(null);
                      setTestResponse("");
                      try {
                        const result = await veniceFetch("/chat/completions", {
                          method: "POST",
                          body: {
                            model: draft.modelId || generationModel,
                            messages: [
                              {
                                role: "system",
                                content: testCompilation.systemPrompt,
                              },
                              ...(testCompilation.exampleDialogue
                                ? [
                                    {
                                      role: "system",
                                      content:
                                        testCompilation.exampleDialogue.content,
                                    },
                                  ]
                                : []),
                              ...(testCompilation.firstMessage
                                ? [
                                    {
                                      role: "assistant",
                                      content:
                                        testCompilation.firstMessage.content,
                                    },
                                  ]
                                : []),
                              ...testCompilation.postHistoryMessages,
                              testCompilation.userMessage,
                            ],
                          },
                        });
                        const choices =
                          result.data && typeof result.data === "object"
                            ? (result.data as Record<string, unknown>).choices
                            : undefined;
                        const message =
                          Array.isArray(choices) &&
                          choices[0] &&
                          typeof choices[0] === "object"
                            ? (choices[0] as Record<string, unknown>).message
                            : undefined;
                        const content =
                          message && typeof message === "object"
                            ? (message as Record<string, unknown>).content
                            : undefined;
                        if (typeof content !== "string")
                          throw new Error("Test chat returned no message.");
                        setTestResponse(content);
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Test chat failed.",
                        );
                      } finally {
                        setTestingCard(false);
                      }
                    }}
                  >
                    {testingCard
                      ? tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.text.testing",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.text.runDisposableTest",
                        )}
                  </PrimaryButton>
                </div>
              </div>
              {testResponse && (
                <div className="rounded border border-vf-panel-border bg-vf-panel-bg p-3 text-[13px] text-text-primary">
                  <div className="mb-1 text-[11px] uppercase text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.unsavedModelResponse" />
                  </div>
                  {testResponse}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PrimaryButton
                      onClick={async () => {
                        const saved = await upsert(draft);
                        if (!saved) {
                          setError(
                            "Save the card before promoting this test chat.",
                          );
                          return;
                        }
                        const model =
                          draft.modelId ||
                          generationModel ||
                          FALLBACK_MODELS.text[0]?.id ||
                          "venice-uncensored";
                        const chat = useChatStore.getState();
                        const conversationId =
                          chat.createLocalCharacterConversation(saved, model);
                        chat.addMessage(conversationId, {
                          role: "user",
                          content: testMessage,
                        });
                        chat.addMessage(conversationId, {
                          role: "assistant",
                          content: testResponse,
                          metadata: { source: "st-card-disposable-test" },
                        });
                        setActiveTab("character-chats");
                        toast.success(
                          tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.notification.testChatSaved",
                          ),
                          tRuntime(
                            "runtimeGenerated.components.rpStudio.charactereditor.notification.theDisposableTurnWasPromotedToARealLocalConversation",
                          ),
                        );
                      }}
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.saveAsRealConversation" />
                    </PrimaryButton>
                    <GhostButton onClick={() => setTestResponse("")}>
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.resetTest" />
                    </GhostButton>
                  </div>
                </div>
              )}
            </div>
            <div
              className="space-y-3 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-3"
              aria-labelledby="card-generation-title"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3
                    id="card-generation-title"
                    className="text-[14px] font-semibold text-text-primary"
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.aiDraftGeneration" />
                  </h3>
                  <p className="text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.analysisAndGeneratedCardsRemainProposalsYour" />
                  </p>
                </div>
                {generationStatus !== "idle" && (
                  <GhostButton
                    onClick={() => generationAbortRef.current?.abort()}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.cancel" />
                  </GhostButton>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.cardGenerationModel" />
                  </span>
                  <select
                    value={generationModel}
                    onChange={(event) => setGenerationModel(event.target.value)}
                    className="w-full rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5 text-[13px] text-text-primary"
                  >
                    {liveTextModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.model_spec?.name ?? model.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.visionAnalysisModel" />
                  </span>
                  <select
                    value={visionModel}
                    onChange={(event) => setVisionModel(event.target.value)}
                    className="w-full rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5 text-[13px] text-text-primary"
                  >
                    <option value="">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.noCompatibleLiveModel" />
                    </option>
                    {getVisionCapableCharacterModels(liveTextModels).map(
                      (model) => (
                        <option key={model.id} value={model.id}>
                          {model.model_spec?.name ?? model.id}{" "}
                          <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.vision" />{" "}
                          {(
                            model.model_spec?.availableContextTokens ?? 0
                          ).toLocaleString()}{" "}
                          <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.context" />
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.localImageAsset" />
                  </span>
                  <select
                    value={selectedSourceMediaId}
                    onChange={(event) =>
                      setSelectedSourceMediaId(event.target.value)
                    }
                    className="w-full rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5 text-[13px] text-text-primary"
                  >
                    <option value="">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.chooseMediaStudioImage" />
                    </option>
                    {mediaItems
                      .filter((item) => item.mediaType === "image")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.note || item.prompt || item.id}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[12px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.textConcept" />
                  </span>
                  <input
                    value={generationConcept}
                    onChange={(event) =>
                      setGenerationConcept(event.target.value)
                    }
                    placeholder={tRuntime(
                      "runtimeGenerated.components.rpStudio.charactereditor.attribute.genreSettingRolePersonalityRelationship",
                    )}
                    className="w-full rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5 text-[13px] text-text-primary"
                  />
                </label>
              </div>
              {selectedVisionModel && (
                <div
                  className="rounded border border-vf-panel-border bg-vf-panel-bg p-2 text-[11px] text-text-muted"
                  aria-label={tRuntime(
                    "runtimeGenerated.components.rpStudio.charactereditor.attribute.visionModelCapabilitySummary",
                  )}
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.visionCapableProvider" />{" "}
                  {selectedVisionModel.owned_by || "unknown"} ·{" "}
                  {(
                    selectedVisionModel.model_spec?.availableContextTokens ?? 0
                  ).toLocaleString()}{" "}
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.contextTokensRequestImage" />
                  {Math.ceil(
                    (selectedGenerationMedia?.image.length ?? 0) / 1024,
                  ).toLocaleString()}{" "}
                  KiB · private/anonymous status not published by the live model
                  catalog
                </div>
              )}
              <details className="rounded border border-vf-panel-border bg-vf-panel-bg p-2">
                <summary className="cursor-pointer text-[12px] text-text-secondary">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.textGenerationProfile" />
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["genre", "Genre"],
                      ["setting", "Setting"],
                      ["role", "Character role"],
                      ["personalityDirection", "Personality direction"],
                      ["dialogueStyle", "Dialogue style"],
                      ["relationshipToUser", "Relationship to user"],
                      ["desiredConflict", "Desired conflict"],
                      ["language", "Language"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <span className="mb-1 block text-[11px] text-text-muted">
                        {label}
                      </span>
                      <input
                        value={generationOptions[key]}
                        onChange={(event) =>
                          setGenerationOptions((options) => ({
                            ...options,
                            [key]: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-[12px]"
                      />
                    </label>
                  ))}
                  <label>
                    <span className="mb-1 block text-[11px] text-text-muted">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.contentRating" />
                    </span>
                    <select
                      value={generationOptions.contentRating}
                      onChange={(event) =>
                        setGenerationOptions((options) => ({
                          ...options,
                          contentRating: event.target
                            .value as typeof options.contentRating,
                        }))
                      }
                      className="w-full rounded border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-[12px]"
                    >
                      <option value="general">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.general" />
                      </option>
                      <option value="mature">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.mature" />
                      </option>
                      <option value="adult">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.adult" />
                      </option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] text-text-muted">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.detailLevel" />
                    </span>
                    <select
                      value={generationOptions.detailLevel}
                      onChange={(event) =>
                        setGenerationOptions((options) => ({
                          ...options,
                          detailLevel: event.target
                            .value as typeof options.detailLevel,
                        }))
                      }
                      className="w-full rounded border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-[12px]"
                    >
                      {[
                        "concise",
                        "detailed",
                        "narrative",
                        "roleplay-heavy",
                        "lore-heavy",
                        "custom",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  {generationOptions.detailLevel === "custom" && (
                    <label className="sm:col-span-3">
                      <span className="mb-1 block text-[11px] text-text-muted">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.customGenerationDirection" />
                      </span>
                      <input
                        value={generationOptions.customDirection}
                        onChange={(event) =>
                          setGenerationOptions((options) => ({
                            ...options,
                            customDirection: event.target.value,
                          }))
                        }
                        className="w-full rounded border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-[12px]"
                      />
                    </label>
                  )}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <GhostButton
                  disabled={
                    !selectedSourceMediaId ||
                    !visionModel ||
                    generationStatus !== "idle"
                  }
                  onClick={async () => {
                    const controller = new AbortController();
                    generationAbortRef.current = controller;
                    setGenerationStatus("analyzing");
                    setError(null);
                    try {
                      const model = liveTextModels.find(
                        (item) => item.id === visionModel,
                      );
                      setAnalysisDraft(
                        await analyzeCharacterImage({
                          assetId: selectedSourceMediaId,
                          modelId: visionModel,
                          model,
                          requestedFields: [
                            "appearance",
                            "setting",
                            "genre",
                            "uncertainty",
                          ],
                          signal: controller.signal,
                        }),
                      );
                    } catch (cause) {
                      if (!controller.signal.aborted)
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Image analysis failed.",
                        );
                    } finally {
                      generationAbortRef.current = null;
                      setGenerationStatus("idle");
                    }
                  }}
                >
                  {generationStatus === "analyzing"
                    ? tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.analyzing",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.analyzeImage",
                      )}
                </GhostButton>
                <PrimaryButton
                  disabled={
                    !generationConcept.trim() ||
                    !generationModel ||
                    generationStatus !== "idle"
                  }
                  onClick={async () => {
                    const controller = new AbortController();
                    generationAbortRef.current = controller;
                    setGenerationStatus("generating");
                    setError(null);
                    try {
                      setGeneratedDraft(
                        await synthesizeCharacterCard({
                          modelId: generationModel,
                          concept: {
                            concept: generationConcept,
                            ...generationOptions,
                          },
                          analysis: analysisDraft ?? undefined,
                          signal: controller.signal,
                        }),
                      );
                    } catch (cause) {
                      if (!controller.signal.aborted)
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Card generation failed.",
                        );
                    } finally {
                      generationAbortRef.current = null;
                      setGenerationStatus("idle");
                    }
                  }}
                >
                  {generationStatus === "generating"
                    ? tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.generating",
                      )
                    : analysisDraft
                      ? tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.text.synthesizeFromImageText",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.text.generateFromText",
                        )}
                </PrimaryButton>
              </div>
              {analysisDraft && (
                <div className="rounded border border-vf-panel-border bg-vf-panel-bg p-2 text-[12px] text-text-secondary">
                  <strong className="text-text-primary">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.visualAnalysis" />
                  </strong>{" "}
                  {analysisDraft.visualDescription ||
                    tRuntime(
                      "runtimeGenerated.components.rpStudio.charactereditor.text.noDirectDescription",
                    )}
                  {analysisDraft.warnings.length > 0 && (
                    <div className="mt-1 text-warning">
                      {analysisDraft.warnings.join(" · ")}
                    </div>
                  )}
                </div>
              )}
              {generatedDraft && (
                <div className="space-y-2 rounded border border-accent/40 bg-vf-panel-bg p-3">
                  <div className="text-[13px] font-medium text-text-primary">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.generatedV2Draft" />{" "}
                    {generatedDraft.name ||
                      tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.untitled",
                      )}
                  </div>
                  <p className="text-[12px] text-text-secondary">
                    {generatedDraft.description ||
                      tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.noDescription",
                      )}
                  </p>
                  <div className="flex gap-2">
                    <PrimaryButton
                      onClick={() => {
                        setDraft({
                          ...generatedDraft,
                          id: draft.id,
                          avatar: draft.avatar,
                          createdAt: draft.createdAt,
                          updatedAt: Date.now(),
                          versions: draft.versions,
                          metadata: draft.metadata,
                        });
                        setExtensionText(
                          JSON.stringify(
                            generatedDraft.tavernExtensions ?? {},
                            null,
                            2,
                          ),
                        );
                        setGeneratedDraft(null);
                      }}
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.applyToLocalDraft" />
                    </PrimaryButton>
                    <GhostButton onClick={() => setGeneratedDraft(null)}>
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.reject" />
                    </GhostButton>
                  </div>
                </div>
              )}
              <div className="pt-3 border-y border-vf-panel-border">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    value={fieldTarget}
                    onChange={(event) =>
                      setFieldTarget(event.target.value as typeof fieldTarget)
                    }
                    className="rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1.5 text-[13px] text-text-primary"
                  >
                    {[
                      "name",
                      "description",
                      "personality",
                      "scenario",
                      "firstMessage",
                      "systemPrompt",
                      "postHistoryInstructions",
                      "rawExampleDialogue",
                    ].map((field) => (
                      <option key={field} value={field}>
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.generate" />{" "}
                        {field}
                      </option>
                    ))}
                  </select>
                  <GhostButton
                    disabled={!generationModel || generationStatus !== "idle"}
                    onClick={async () => {
                      const controller = new AbortController();
                      generationAbortRef.current = controller;
                      setGenerationStatus("generating");
                      setError(null);
                      try {
                        setFieldProposal(
                          await generateCharacterFieldProposal({
                            card: draft,
                            field: fieldTarget,
                            modelId: generationModel,
                            signal: controller.signal,
                          }),
                        );
                      } catch (cause) {
                        if (!controller.signal.aborted)
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Field generation failed.",
                          );
                      } finally {
                        generationAbortRef.current = null;
                        setGenerationStatus("idle");
                      }
                    }}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.generateFieldProposal" />
                  </GhostButton>
                </div>
                {fieldProposal && (
                  <div className="mt-2 grid gap-2 rounded border border-vf-panel-border bg-vf-panel-bg p-2 text-[12px] sm:grid-cols-2">
                    <div>
                      <span className="text-text-muted">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.before" />
                      </span>
                      <p>{fieldProposal.before}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.after" />
                      </span>
                      <p>{fieldProposal.after}</p>
                    </div>
                    <p className="sm:col-span-2 text-text-muted">
                      {fieldProposal.reason}
                    </p>
                    <div className="flex gap-2 sm:col-span-2">
                      <PrimaryButton
                        onClick={async () => {
                          await addVersion(
                            draft.id,
                            `Before AI field proposal: ${fieldProposal.field}`,
                          );
                          update(fieldProposal.field, fieldProposal.after);
                          setFieldProposal(null);
                        }}
                      >
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.applyProposal" />
                      </PrimaryButton>
                      <GhostButton onClick={() => setFieldProposal(null)}>
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.reject" />
                      </GhostButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 pt-3 border-t border-vf-panel-border">
              <Label>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.aiRefinementAssistant" />
              </Label>
              <p className="text-[12px] text-text-muted">
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.description.producesAnAllowlistedProposalOnlyNothingChanges" />
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={refinementAction}
                  onChange={(event) => setRefinementAction(event.target.value)}
                  className="rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[13px] text-text-primary"
                >
                  {[
                    "Review consistency",
                    "Find contradictions",
                    "Improve greeting",
                    "Improve personality",
                    "Improve scenario",
                    "Improve dialogue style",
                    "Generate missing fields",
                    "Reduce token usage",
                    "Change tone",
                    "Change genre",
                    "Make safer",
                    "Make more detailed",
                  ].map((action) => (
                    <option key={action}>{action}</option>
                  ))}
                </select>
                <input
                  value={refinementInstruction}
                  onChange={(event) =>
                    setRefinementInstruction(event.target.value)
                  }
                  placeholder={tRuntime(
                    "runtimeGenerated.components.rpStudio.charactereditor.attribute.optionalDirection",
                  )}
                  className="rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[13px] text-text-primary"
                />
              </div>
              <div className="flex gap-2">
                <PrimaryButton
                  disabled={refining}
                  onClick={async () => {
                    setRefining(true);
                    setError(null);
                    const controller = new AbortController();
                    refinementAbortRef.current = controller;
                    try {
                      const model =
                        useSettingsStore.getState().selectedModels.text ||
                        FALLBACK_MODELS.text[0]?.id ||
                        "llama-3.3-70b";
                      const nextProposal = await proposeCharacterCardRefinement(
                        {
                          card: draft,
                          action: refinementAction,
                          instruction: refinementInstruction,
                          model,
                          signal: controller.signal,
                        },
                      );
                      setProposal(nextProposal);
                      setSelectedProposalOperations(
                        new Set(
                          nextProposal.operations.map((_, index) => index),
                        ),
                      );
                    } catch (cause) {
                      if (!controller.signal.aborted)
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "AI refinement failed.",
                        );
                    } finally {
                      refinementAbortRef.current = null;
                      setRefining(false);
                    }
                  }}
                >
                  {refining
                    ? tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.generatingProposal",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.generateProposal",
                      )}
                </PrimaryButton>
                {refining && (
                  <GhostButton
                    onClick={() => refinementAbortRef.current?.abort()}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.cancel" />
                  </GhostButton>
                )}
              </div>
              {proposal && (
                <div className="space-y-2 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-3">
                  <div className="text-[13px] font-medium text-text-primary">
                    {proposal.summary}
                  </div>
                  {proposal.operations.map((operation, index) => (
                    <div
                      key={index}
                      className="rounded border border-vf-panel-border bg-vf-panel-bg p-2 text-[12px]"
                    >
                      <label className="flex items-center gap-2 font-mono text-text-secondary">
                        <input
                          type="checkbox"
                          checked={selectedProposalOperations.has(index)}
                          onChange={(event) =>
                            setSelectedProposalOperations((selected) => {
                              const next = new Set(selected);
                              if (event.target.checked) next.add(index);
                              else next.delete(index);
                              return next;
                            })
                          }
                        />
                        {operation.op} {operation.path}
                      </label>
                      {operation.op === "replace" && (
                        <div className="mt-1 grid gap-1 sm:grid-cols-2">
                          <div>
                            <span className="text-text-muted">
                              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.before842beb5" />
                            </span>{" "}
                            {String(
                              (draft as unknown as Record<string, unknown>)[
                                operation.path
                              ] ?? "",
                            )}
                          </div>
                          <div>
                            <span className="text-text-muted">
                              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.after13f2d65" />
                            </span>{" "}
                            {String(operation.value)}
                          </div>
                        </div>
                      )}
                      {operation.reason && (
                        <div className="mt-1 text-text-muted">
                          {operation.reason}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton
                      disabled={selectedProposalOperations.size === 0}
                      onClick={async () => {
                        await addVersion(
                          draft.id,
                          `Before AI refinement: ${proposal.summary}`,
                        );
                        setDraft(
                          applyCharacterCardProposal(
                            draft,
                            proposal,
                            selectedProposalOperations,
                          ),
                        );
                        setProposal(null);
                      }}
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.applySelected" />
                    </PrimaryButton>
                    <GhostButton
                      onClick={() =>
                        setSelectedProposalOperations(
                          new Set(proposal.operations.map((_, index) => index)),
                        )
                      }
                    >
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.selectAll" />
                    </GhostButton>
                    <GhostButton onClick={() => setProposal(null)}>
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.reject" />
                    </GhostButton>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2 pt-3 border-t border-vf-panel-border">
              <Label>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.cardValidation" />
              </Label>
              {(() => {
                const issues = validateCharacterCardAuthoring(draft);
                if (issues.length === 0) {
                  return (
                    <div className="text-[12px] text-success">
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.formatValidAndRecommendedFieldsComplete" />
                    </div>
                  );
                }
                return (
                  <div className="space-y-1">
                    {issues.map((iss, i) => {
                      const colors = {
                        error: "text-error",
                        warning: "text-warning",
                        info: "text-text-secondary",
                      };
                      return (
                        <div
                          key={i}
                          className={`text-[12px] ${colors[iss.severity as keyof typeof colors]}`}
                        >
                          {iss.severity}: {iss.message}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* Step 10: Export */}
        {isStepVisible(9) && (
          <section className="space-y-4 rounded-lg border border-vf-panel-border bg-vf-panel-bg/50 p-4">
            <h3 className="text-[13px] font-semibold text-text-primary">
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.heading.10ExportWorkflow" />
            </h3>
            <div className="space-y-2">
              <Label>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.stCardExport" />
              </Label>
              <div className="flex flex-wrap gap-2">
                <GhostButton
                  onClick={async () => {
                    const result = await desktopCharacterCards.exportJson({
                      cardId: draft.id,
                      profile: "standard",
                    });
                    if (!result.ok)
                      setError(result.error ?? "JSON export failed.");
                    else if (result.report) setExportReport(result.report);
                  }}
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.exportV2Json" />
                </GhostButton>
                <GhostButton
                  disabled={!draft.avatar && !sourceMedia}
                  onClick={async () => {
                    const result = await desktopCharacterCards.exportPng({
                      cardId: draft.id,
                      profile: "standard",
                    });
                    if (!result.ok)
                      setError(result.error ?? "PNG export failed.");
                    else if (result.report) setExportReport(result.report);
                  }}
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.exportV2Png" />
                </GhostButton>
                <GhostButton
                  onClick={async () => {
                    const result = await desktopCharacterCards.exportJson({
                      cardId: draft.id,
                      profile: "privacy-reduced",
                    });
                    if (!result.ok)
                      setError(
                        result.error ?? "Privacy-reduced export failed.",
                      );
                    else if (result.report) setExportReport(result.report);
                  }}
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.exportPrivacyReducedJson" />
                </GhostButton>
              </div>
              {exportReport && (
                <dl
                  className="grid gap-x-3 gap-y-1 rounded border border-vf-panel-border bg-vf-panel-bg p-3 text-[12px] sm:grid-cols-[auto_1fr]"
                  aria-label={tRuntime(
                    "runtimeGenerated.components.rpStudio.charactereditor.attribute.stCardExportReport",
                  )}
                >
                  <dt className="text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.validation" />
                  </dt>
                  <dd className="text-success">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.roundTripVerified" />
                  </dd>
                  <dt className="text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.output" />
                  </dt>
                  <dd>
                    {exportReport.format.toUpperCase()} ·{" "}
                    {exportReport.outputBytes.toLocaleString()}{" "}
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.bytes" />
                    {exportReport.image
                      ? tRuntime(
                          "runtimeGenerated.components.rpStudio.charactereditor.text.value1Value2",
                          {
                            value1: exportReport.image.width,
                            value2: exportReport.image.height,
                          },
                        )
                      : ""}
                  </dd>
                  <dt className="text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.v2Fields" />
                  </dt>
                  <dd>{exportReport.validV2Fields.join(", ")}</dd>
                  <dt className="text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.extensions" />
                  </dt>
                  <dd>
                    {exportReport.extensionNamespaces.join(", ") ||
                      tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.none",
                      )}
                  </dd>
                  <dt className="text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.embeddedLoreEntries" />
                  </dt>
                  <dd>{exportReport.embeddedLorebookCount}</dd>
                  <dt className="text-text-muted">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.droppedLocalOnlyFields" />
                  </dt>
                  <dd>
                    {exportReport.droppedInternalFields.join(", ") ||
                      tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.none",
                      )}
                  </dd>
                  {exportReport.warnings.length > 0 && (
                    <>
                      <dt className="text-warning">
                        <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.warnings" />
                      </dt>
                      <dd>{exportReport.warnings.join(" ")}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>
            <div className="space-y-2 pt-3 border-t border-vf-panel-border">
              <div className="flex items-center justify-between">
                <Label>
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.versionHistory" />
                </Label>
                <GhostButton onClick={() => void handleSaveVersion()}>
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.saveVersion" />
                </GhostButton>
              </div>
              {draft.versions && draft.versions.length > 0 ? (
                <div className="space-y-1">
                  {[...draft.versions].reverse().map((v) => (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-[12px] ${
                        v.id === draft.currentVersionId
                          ? "border-accent/30 bg-accent/5"
                          : "border-vf-panel-border bg-vf-panel-bg"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-text-primary">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                        {v.reason ? (
                          <span className="text-text-muted ml-2">
                            — {v.reason}
                          </span>
                        ) : null}
                        {v.id === draft.currentVersionId ? (
                          <span className="text-accent ml-2">
                            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.current" />
                          </span>
                        ) : null}
                      </div>
                      {v.id !== draft.currentVersionId && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setComparisonVersionId(v.id)}
                            className="text-[12px] px-2 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                          >
                            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.compare" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRestoreVersion(v.id)}
                            className="text-[12px] px-2 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                          >
                            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.restore" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-text-muted italic">
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.noVersionsSavedSaveAVersionTo" />
                </div>
              )}
              {comparisonVersionId &&
                (() => {
                  const version = draft.versions?.find(
                    (item) => item.id === comparisonVersionId,
                  );
                  if (!version) return null;
                  const fields = [
                    "name",
                    "description",
                    "personality",
                    "scenario",
                    "firstMessage",
                    "systemPrompt",
                    "postHistoryInstructions",
                    "rawExampleDialogue",
                    "characterVersion",
                  ] as const;
                  return (
                    <div
                      className="rounded-md border border-vf-panel-border bg-vf-panel-bg p-3"
                      aria-label={tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.attribute.characterVersionComparison",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <strong className="text-[13px] text-text-primary">
                          <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.versionComparison" />
                        </strong>
                        <GhostButton
                          onClick={() => setComparisonVersionId(null)}
                        >
                          <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.close" />
                        </GhostButton>
                      </div>
                      <div className="space-y-2">
                        {fields
                          .filter(
                            (field) =>
                              String(version.snapshot[field] ?? "") !==
                              String(draft[field] ?? ""),
                          )
                          .map((field) => (
                            <div
                              key={field}
                              className="grid gap-2 text-[12px] sm:grid-cols-[8rem_1fr_1fr]"
                            >
                              <span className="font-mono text-text-muted">
                                {field}
                              </span>
                              <span className="rounded border border-vf-panel-border p-2">
                                <span className="block text-[10px] uppercase text-text-muted">
                                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.saved" />
                                </span>
                                {String(version.snapshot[field] ?? "")}
                              </span>
                              <span className="rounded border border-vf-panel-border p-2">
                                <span className="block text-[10px] uppercase text-text-muted">
                                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.current4fc0e2b" />
                                </span>
                                {String(draft[field] ?? "")}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })()}
            </div>
            <div
              className="space-y-2 pt-3 border-t border-vf-panel-border"
              data-testid="character-editor-workflow"
            >
              <Label>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.workflow" />
              </Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveToPromptLibrary()}
                  disabled={disabled}
                  data-testid="character-editor-save-to-prompt-library"
                  className="text-[12px] px-2.5 py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.saveToPromptLibrary" />
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
                  className="text-[12px] px-2 py-1.5 rounded-md border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:bg-vf-control-hover hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  <option value="">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.attachScene" />
                  </option>
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
                  className="text-[12px] px-2 py-1.5 rounded-md border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:bg-vf-control-hover hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  <option value="">
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.option.attachPrompt" />
                  </option>
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
                  className="text-[12px] px-2.5 py-1.5 rounded-md border border-success/30 text-success hover:bg-success/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.chat" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleStartChat()}
                  disabled={disabled}
                  data-testid="character-editor-start-chat"
                  className="text-[12px] px-2.5 py-1.5 rounded-md border border-accent/30 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.startRpChat" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateScenarioFromCharacter()}
                  disabled={disabled}
                  data-testid="character-editor-create-scenario"
                  className="text-[12px] px-2.5 py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.createScenarioFromCharacter" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateWorkflow()}
                  disabled={disabled}
                  data-testid="character-editor-create-workflow"
                  className="text-[12px] px-2.5 py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.createWorkflow" />
                </button>
              </div>
              {(typeof draft.metadata?.attachedSceneId === "string" ||
                typeof draft.metadata?.attachedPromptId === "string") && (
                <div
                  className="text-[12px] text-text-muted mt-1"
                  data-testid="character-editor-workflow-summary"
                >
                  {draft.metadata?.attachedSceneId ? (
                    <span>
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.scene" />{" "}
                      {String(draft.metadata.attachedSceneId).slice(0, 32)}
                    </span>
                  ) : null}
                  {draft.metadata?.attachedSceneId &&
                  draft.metadata?.attachedPromptId
                    ? " · "
                    : null}
                  {draft.metadata?.attachedPromptId ? (
                    <span>
                      <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.prompt" />{" "}
                      {String(draft.metadata.attachedPromptId).slice(0, 32)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        )}

        {typeof activeStudioStep === "number" && (
          <div className="flex items-center justify-between pt-4 border-t border-vf-panel-border mt-4">
            <button
              type="button"
              disabled={activeStudioStep === 0}
              onClick={() =>
                setActiveStudioStep((prev) =>
                  typeof prev === "number" && prev > 0 ? prev - 1 : prev,
                )
              }
              className="text-[12px] px-3 py-1.5 rounded-md border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.previous" />
              {activeStudioStep > 0 ? studioSteps[activeStudioStep - 1] : ""})
            </button>
            <button
              type="button"
              onClick={() => setActiveStudioStep("all")}
              className="text-[12px] px-3 py-1.5 rounded-md border border-vf-panel-border text-text-muted hover:text-text-primary hover:bg-vf-control-hover transition-colors"
            >
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.viewAllSteps" />
            </button>
            <button
              type="button"
              disabled={activeStudioStep === studioSteps.length - 1}
              onClick={() =>
                setActiveStudioStep((prev) =>
                  typeof prev === "number" && prev < studioSteps.length - 1
                    ? prev + 1
                    : prev,
                )
              }
              className="text-[12px] px-3 py-1.5 rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.action.next" />{" "}
              {activeStudioStep < studioSteps.length - 1
                ? studioSteps[activeStudioStep + 1]
                : ""}{" "}
              →
            </button>
          </div>
        )}
      </div>

      {viewingContextFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4">
          <div className="flex flex-col w-full max-w-2xl max-h-[80vh] rounded-lg border border-vf-panel-border bg-vf-panel-bg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-vf-panel-border bg-vf-panel-bg-raised">
              <div>
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {viewingContextFile.name}
                </h3>
                <p className="text-[11px] text-text-muted">
                  {(viewingContextFile.size / 1024).toFixed(1)} KB
                  {viewingContextFile.targetField
                    ? tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.targetFieldValue1",
                        { value1: viewingContextFile.targetField },
                      )
                    : tRuntime(
                        "runtimeGenerated.components.rpStudio.charactereditor.text.generalContextFile",
                      )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingContextFile(null)}
                className="text-text-muted hover:text-text-primary p-1 rounded-md"
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[12px] text-text-secondary whitespace-pre-wrap bg-vf-panel-bg-raised/30">
              {viewingContextFile.content}
            </div>
            <div className="flex items-center justify-end px-4 py-3 border-t border-vf-panel-border bg-vf-panel-bg gap-2">
              {viewingContextFile.targetField &&
                viewingContextFile.targetField !== "general" && (
                  <PrimaryButton
                    size="sm"
                    onClick={() => {
                      handleReapplySourcedFile(viewingContextFile);
                      setViewingContextFile(null);
                    }}
                  >
                    <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.reApplyTo" />{" "}
                    {viewingContextFile.targetField}
                  </PrimaryButton>
                )}
              <GhostButton onClick={() => setViewingContextFile(null)}>
                <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.close" />
              </GhostButton>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div
          role="status"
          aria-label={tRuntime(
            "runtimeGenerated.components.rpStudio.charactereditor.attribute.savingCharacter",
          )}
          aria-live="polite"
          className="absolute inset-0 flex items-center justify-center gap-2 bg-overlay/30 pointer-events-none"
        >
          <Spinner className="text-text-muted" />
          <span className="text-sm text-text-primary">
            <Trans i18nKey="common:surface.componentsRpStudioCharactereditor.text.savingCharacter" />
          </span>
        </div>
      )}
    </div>
  );
}
