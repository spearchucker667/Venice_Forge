/**
 * @fileoverview Fully editable character card draft editor component.
 */

import { useState, useId } from "react";
import {
  Save,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  Trash2,
  FileText,
  User,
  MessageSquare,
  ShieldAlert,
  BookOpen,
  Image as ImageIcon,
  Info,
  Wand2,
} from "lucide-react";
import type { CharacterCardV2Dto } from "../../types/character-card-spec";
import type {
  CharacterCreatorDraft,
  CharacterCreatorEditableField,
} from "../../types/character-creator";
import { CharacterCreatorProcessPanel } from "./CharacterCreatorProcessPanel";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  draft: CharacterCreatorDraft;
  onUpdateDraft: (updatedCard: CharacterCardV2Dto) => void;
  onSaveDraft: () => void;
  onValidateDraft: () => void;
  onApproveAndCreate: () => void;
  onReviseDraft: (instruction: string) => void;
  onRegenerateField: (
    field: CharacterCreatorEditableField,
    instruction?: string,
  ) => void;
  onGenerateAvatar?: () => void;
  onSelectAvatarImage?: (dataUrl: string) => void;
  avatarDataUrl?: string;
  isRevising?: boolean;
}

type TabCategory =
  | "overview"
  | "identity"
  | "behavior"
  | "conversation"
  | "advanced"
  | "lore"
  | "appearance"
  | "metadata";

export function CharacterCreatorDraftEditor({
  draft,
  onUpdateDraft,
  onSaveDraft,
  onValidateDraft,
  onApproveAndCreate,
  onReviseDraft,
  onRegenerateField,
  onGenerateAvatar,
  onSelectAvatarImage,
  avatarDataUrl,
  isRevising = false,
}: Props) {
  const { t: tRuntime } = useTranslation("common");
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<TabCategory>("overview");
  const [revisionInput, setRevisionInput] = useState("");
  const [showProcessLog, setShowProcessLog] = useState(false);

  const cardData = draft.card.data;

  const updateCardField = <K extends keyof typeof cardData>(
    field: K,
    value: (typeof cardData)[K],
  ) => {
    onUpdateDraft({
      ...draft.card,
      data: {
        ...cardData,
        [field]: value,
      },
    });
  };

  const handleFullRevisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionInput.trim() || isRevising) return;
    onReviseDraft(revisionInput.trim());
    setRevisionInput("");
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSelectAvatarImage) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        const rawUrl = reader.result;
        if (
          rawUrl.startsWith("data:image/jpeg") ||
          rawUrl.startsWith("data:image/webp")
        ) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || 512;
            canvas.height = img.naturalHeight || 512;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              onSelectAvatarImage(canvas.toDataURL("image/png"));
              return;
            }
            onSelectAvatarImage(rawUrl);
          };
          img.onerror = () => onSelectAvatarImage(rawUrl);
          img.src = rawUrl;
        } else {
          onSelectAvatarImage(rawUrl);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-vf-shell-bg">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-vf-panel-border bg-vf-panel-bg/60 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent font-semibold shrink-0">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.draftRev" />{" "}
            {draft.revision}
          </span>
          <h2 className="text-base font-bold text-text-primary truncate min-w-0">
            {cardData.name ||
              tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.text.untitledCharacter",
              )}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveDraft}
            className="px-3 py-1.5 rounded-md bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary hover:text-text-primary flex items-center gap-1.5 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.saveDraft" />
            </span>
          </button>
          <button
            type="button"
            onClick={onValidateDraft}
            className="px-3 py-1.5 rounded-md bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary hover:text-text-primary flex items-center gap-1.5 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.validate" />
            </span>
          </button>
          <button
            type="button"
            onClick={onApproveAndCreate}
            className="px-4 py-1.5 rounded-md bg-accent text-accent-fg font-medium text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.approveCreateCharacter" />
            </span>
          </button>
        </div>
      </div>

      {/* Assumptions & Design Summary Banner */}
      {draft.creatorMetadata && (
        <div className="p-3 bg-vf-panel-bg-raised/40 border-b border-vf-panel-border text-xs flex flex-col gap-1 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-text-primary font-semibold">
              <Info className="w-3.5 h-3.5 text-accent" />
              <span>{draft.creatorMetadata.designSummary}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowProcessLog(!showProcessLog)}
              className="text-[11px] font-medium text-accent hover:underline flex items-center gap-1 shrink-0"
            >
              <span>
                {showProcessLog
                  ? tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.text.hideAiDesignProcess",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.text.viewAiDesignProcessLog",
                    )}
              </span>
            </button>
          </div>
          {draft.creatorMetadata.assumptions.length > 0 && (
            <div className="text-text-muted text-[11px] flex flex-wrap gap-2">
              <span className="font-semibold text-text-secondary">
                <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.assumptions" />
              </span>
              {draft.creatorMetadata.assumptions.map((a, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-vf-panel-bg border border-vf-panel-border"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
          {showProcessLog && (
            <div className="mt-2 pt-2 border-t border-vf-panel-border">
              <CharacterCreatorProcessPanel
                events={draft.processTrace || []}
                processSummary={draft.creatorMetadata.processSummary}
                designSummary={draft.creatorMetadata.designSummary}
                isGenerating={isRevising}
              />
            </div>
          )}
        </div>
      )}

      {/* Main Tab Bar */}
      <div className="flex items-center gap-1 px-4 pt-2 border-b border-vf-panel-border bg-vf-panel-bg/30 overflow-x-auto shrink-0 scrollbar-none">
        {[
          {
            id: "overview",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.overview",
            ),
            icon: FileText,
          },
          {
            id: "identity",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.identity",
            ),
            icon: User,
          },
          {
            id: "behavior",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.behavior",
            ),
            icon: Wand2,
          },
          {
            id: "conversation",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.conversation",
            ),
            icon: MessageSquare,
          },
          {
            id: "advanced",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.advancedPrompting",
            ),
            icon: ShieldAlert,
          },
          {
            id: "lore",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.lore",
            ),
            icon: BookOpen,
          },
          {
            id: "appearance",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.appearance",
            ),
            icon: ImageIcon,
          },
          {
            id: "metadata",
            label: tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.metadata.metadata",
            ),
            icon: Info,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabCategory)}
              className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isActive
                  ? "border-accent text-accent font-semibold"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content & Revision Split View */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Active Tab Form Fields */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">
          {activeTab === "overview" && (
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor={`${baseId}-1`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.characterName" />
                </label>
                <input
                  type="text" id={`${baseId}-1`} 
                  value={cardData.name}
                  onChange={(e) => updateCardField("name", e.target.value)}
                  className="w-full mt-1 p-3 text-sm rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-2`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  {tRuntime("runtimeSlashLabels.shortDescriptionSummary")}
                </label>
                <textarea
                  rows={4} id={`${baseId}-2`} 
                  value={cardData.description}
                  onChange={(e) =>
                    updateCardField("description", e.target.value)
                  }
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-3`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.tagsCommaSeparated" />
                </label>
                <input
                  type="text" id={`${baseId}-3`} 
                  value={cardData.tags.join(", ")}
                  onChange={(e) =>
                    updateCardField(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-4`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.creatorNotes" />
                </label>
                <textarea
                  rows={3} id={`${baseId}-4`} 
                  value={cardData.creator_notes}
                  onChange={(e) =>
                    updateCardField("creator_notes", e.target.value)
                  }
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "identity" && (
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor={`${baseId}-5`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.fullIdentityBackground" />
                </label>
                <textarea
                  rows={8} id={`${baseId}-5`} 
                  value={cardData.description}
                  onChange={(e) =>
                    updateCardField("description", e.target.value)
                  }
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "behavior" && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={`${baseId}-6`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.personalitySpeechStyle" />
                  </label>
                  <button
                    type="button"
                    onClick={() => onRegenerateField("personality")}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>
                      <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.aiRegenerate" />
                    </span>
                  </button>
                </div>
                <textarea
                  rows={8} id={`${baseId}-6`} 
                  value={cardData.personality}
                  onChange={(e) =>
                    updateCardField("personality", e.target.value)
                  }
                  className="w-full p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "conversation" && (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={`${baseId}-7`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.scenarioContext" />
                  </label>
                  <button
                    type="button"
                    onClick={() => onRegenerateField("scenario")}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>
                      <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.aiRegenerate" />
                    </span>
                  </button>
                </div>
                <textarea
                  rows={4} id={`${baseId}-7`} 
                  value={cardData.scenario}
                  onChange={(e) => updateCardField("scenario", e.target.value)}
                  className="w-full p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={`${baseId}-8`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.firstMessagePrimaryGreeting" />
                  </label>
                  <button
                    type="button"
                    onClick={() => onRegenerateField("first_mes")}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>
                      <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.aiRegenerate" />
                    </span>
                  </button>
                </div>
                <textarea
                  rows={5} id={`${baseId}-8`} 
                  value={cardData.first_mes}
                  onChange={(e) => updateCardField("first_mes", e.target.value)}
                  className="w-full p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-9`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.alternateGreetings" />
                </label>
                <div className="flex flex-col gap-2 mt-1">
                  {cardData.alternate_greetings.map((g, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <textarea
                        rows={2} id={`${baseId}-9`} 
                        value={g}
                        onChange={(e) => {
                          const next = [...cardData.alternate_greetings];
                          next[idx] = e.target.value;
                          updateCardField("alternate_greetings", next);
                        }}
                        className="flex-1 p-2 text-xs rounded-md bg-vf-panel-bg border border-vf-panel-border text-text-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = cardData.alternate_greetings.filter(
                            (_, i) => i !== idx,
                          );
                          updateCardField("alternate_greetings", next);
                        }}
                        className="p-1 text-danger hover:bg-vf-control-hover rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateCardField("alternate_greetings", [
                        ...cardData.alternate_greetings,
                        "",
                      ])
                    }
                    className="self-start text-xs text-accent hover:underline flex items-center gap-1 mt-1 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.addAlternateGreeting" />
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor={`${baseId}-10`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.exampleDialogue" />
                </label>
                <textarea
                  rows={6} id={`${baseId}-10`} 
                  value={cardData.mes_example}
                  onChange={(e) =>
                    updateCardField("mes_example", e.target.value)
                  }
                  placeholder={tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.attribute.start10UserHello10CharGreetings",
                  )}
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary font-mono focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="flex flex-col gap-4">
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.advancedPromptingInstructionsDirectlyModifySystemPrompt" />
                </span>
              </div>

              <div>
                <label htmlFor={`${baseId}-11`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.systemPromptOverride" />
                </label>
                <textarea
                  rows={6} id={`${baseId}-11`} 
                  value={cardData.system_prompt}
                  onChange={(e) =>
                    updateCardField("system_prompt", e.target.value)
                  }
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary font-mono focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-12`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.postHistoryInstructions" />
                </label>
                <textarea
                  rows={4} id={`${baseId}-12`} 
                  value={cardData.post_history_instructions}
                  onChange={(e) =>
                    updateCardField("post_history_instructions", e.target.value)
                  }
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary font-mono focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-32 h-32 rounded-lg bg-vf-panel-bg-raised border border-vf-panel-border flex items-center justify-center overflow-hidden shrink-0">
                  {avatarDataUrl ? (
                    <img
                      src={avatarDataUrl}
                      alt={tRuntime(
                        "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.attribute.avatarPreview",
                      )}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-text-muted text-center p-2">
                      <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.noAvatarSelected" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.avatarControls" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label htmlFor={`${baseId}-14`} className="px-3 py-1.5 rounded-md bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium cursor-pointer transition-colors">
                      <span>
                        <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.chooseImageFile" />
                      </span>
                      <input
                        type="file" id={`${baseId}-14`} 
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    {onGenerateAvatar && (
                      <button
                        type="button"
                        onClick={onGenerateAvatar}
                        className="px-3 py-1.5 rounded-md bg-accent/20 border border-accent/30 text-accent text-xs font-medium flex items-center gap-1 hover:bg-accent/30 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.generateAvatar" />
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor={`${baseId}-15`} className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.visualAvatarPrompt" />
                </label>
                <textarea
                  rows={4} id={`${baseId}-15`} 
                  value={draft.creatorMetadata.avatarPrompt || ""}
                  onChange={(e) => {
                    onUpdateDraft({
                      ...draft.card,
                      data: {
                        ...cardData,
                        extensions: {
                          ...(cardData.extensions || {}),
                          "venice-forge": {
                            ...((cardData.extensions?.[
                              "venice-forge"
                            ] as Record<string, unknown>) || {}),
                            avatarPrompt: e.target.value,
                          },
                        },
                      },
                    });
                  }}
                  className="w-full mt-1 p-3 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {activeTab === "lore" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.heading.embeddedLorebookWorldInfo" />
                  </h3>
                  <p className="text-[11px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.description.manageWorldLoreEntriesEmbeddedInsideThis" />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const currentBook = cardData.character_book || {
                      name: `${cardData.name || "Character"} Lorebook`,
                      extensions: {},
                      entries: [],
                    };
                    const newEntry = {
                      keys: ["keyword"],
                      content: "",
                      enabled: true,
                      insertion_order: (currentBook.entries?.length || 0) + 1,
                      extensions: {},
                    };
                    updateCardField("character_book", {
                      ...currentBook,
                      entries: [...(currentBook.entries || []), newEntry],
                    });
                  }}
                  className="px-3 py-1.5 rounded-md bg-accent text-accent-fg text-xs font-medium flex items-center gap-1 hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.addLoreEntry" />
                  </span>
                </button>
              </div>

              {!cardData.character_book?.entries ||
              cardData.character_book.entries.length === 0 ? (
                <div className="p-6 text-center rounded-lg bg-vf-panel-bg border border-vf-panel-border text-xs text-text-muted flex flex-col items-center gap-2">
                  <BookOpen className="w-8 h-8 text-text-muted/60" />
                  <span>
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.noEmbeddedLoreEntriesYetAddKeywords" />
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cardData.character_book.entries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg bg-vf-panel-bg border border-vf-panel-border flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-vf-panel-bg-raised text-accent font-bold">
                            #{entry.insertion_order || idx + 1}
                          </span>
                          <input
                            type="text"
                            value={entry.keys.join(", ")}
                            onChange={(e) => {
                              const newKeys = e.target.value
                                .split(",")
                                .map((k) => k.trim())
                                .filter(Boolean);
                              const entries = [
                                ...(cardData.character_book?.entries || []),
                              ];
                              entries[idx] = { ...entries[idx], keys: newKeys };
                              updateCardField("character_book", {
                                ...cardData.character_book!,
                                entries,
                              });
                            }}
                            placeholder={tRuntime(
                              "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.attribute.triggerKeywordsEGGothamBatcave",
                            )}
                            className="p-1.5 text-xs rounded-md bg-vf-panel-bg-raised border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent w-64"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label htmlFor={`${baseId}-16`} className="flex items-center gap-1 text-[11px] text-text-secondary cursor-pointer">
                            <input
                              type="checkbox" id={`${baseId}-16`} 
                              checked={entry.enabled}
                              onChange={(e) => {
                                const entries = [
                                  ...(cardData.character_book?.entries || []),
                                ];
                                entries[idx] = {
                                  ...entries[idx],
                                  enabled: e.target.checked,
                                };
                                updateCardField("character_book", {
                                  ...cardData.character_book!,
                                  entries,
                                });
                              }}
                              className="rounded border-vf-panel-border bg-vf-panel-bg text-accent"
                            />
                            <span>
                              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.enabled" />
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const entries = (
                                cardData.character_book?.entries || []
                              ).filter((_, i) => i !== idx);
                              updateCardField("character_book", {
                                ...cardData.character_book!,
                                entries,
                              });
                            }}
                            className="p-1 text-text-muted hover:text-danger rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={3}
                        value={entry.content}
                        onChange={(e) => {
                          const entries = [
                            ...(cardData.character_book?.entries || []),
                          ];
                          entries[idx] = {
                            ...entries[idx],
                            content: e.target.value,
                          };
                          updateCardField("character_book", {
                            ...cardData.character_book!,
                            entries,
                          });
                        }}
                        placeholder={tRuntime(
                          "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.attribute.loreDetailContentTriggeredWhenAnyKeywordAppearsInConversation",
                        )}
                        className="w-full p-2.5 text-xs rounded-md bg-vf-panel-bg-raised border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "metadata" && (
            <div className="flex flex-col gap-3 text-xs">
              <div className="p-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.draftId" />
                </span>
                <span className="font-mono text-text-primary">{draft.id}</span>
              </div>
              <div className="p-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.revisionNumber" />
                </span>
                <span className="font-mono text-text-primary">
                  {draft.revision}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.creatorModel" />
                </span>
                <span className="font-mono text-accent font-semibold">
                  {draft.modelId}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.specification" />
                </span>
                <span className="font-mono text-text-primary">
                  {draft.card.spec} v{draft.card.spec_version}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Natural Language AI Revision Panel */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-vf-panel-border bg-vf-panel-bg/20 p-4 flex flex-col gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
            <Sparkles className="w-4 h-4 text-accent" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.text.aiAssistedRevisions" />
            </span>
          </div>

          <form
            onSubmit={handleFullRevisionSubmit}
            className="flex flex-col gap-2"
          >
            <label htmlFor={`${baseId}-17`} className="text-[11px] text-text-muted font-medium">
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatordrafteditor.label.naturalLanguageRequest" />
            </label>
            <textarea
              rows={3} id={`${baseId}-17`} 
              value={revisionInput}
              onChange={(e) => setRevisionInput(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.attribute.eGMakeHerLessHostileGiveHimADry",
              )}
              className="w-full p-2.5 text-xs rounded-lg bg-vf-panel-bg border border-vf-panel-border text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!revisionInput.trim() || isRevising}
              className="w-full py-2 rounded-lg bg-accent/20 border border-accent/30 text-accent font-medium text-xs flex items-center justify-center gap-1.5 hover:bg-accent/30 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {isRevising
                  ? tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.text.revisingDraft",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.characterCreator.charactercreatordrafteditor.text.reviseWholeDraft",
                    )}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
