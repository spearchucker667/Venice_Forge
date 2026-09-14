/**
 * @fileoverview Character Creator splash screen and idea composer with animated Mio mascot.
 */

import { useState, useId } from "react";
import {
  Sparkles,
  FolderOpen,
  FileUp,
  Edit3,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
} from "lucide-react";
import type {
  CharacterCreatorDraftSummary,
  OptionalDraftContext,
} from "../../types/character-creator";
import { CharacterCreatorMascot } from "./CharacterCreatorMascot";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  onCreateDraft: (idea: string, context?: OptionalDraftContext) => void;
  onOpenDraft: (draftId: string) => void;
  onDuplicateDraft?: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
  onImportCard: () => void;
  onEditLocalCharacter: () => void;
  recentDrafts: CharacterCreatorDraftSummary[];
  isGenerating?: boolean;
}

export function CharacterCreatorWelcome({
  onCreateDraft,
  onOpenDraft,
  onDuplicateDraft,
  onDeleteDraft,
  onImportCard,
  onEditLocalCharacter,
  recentDrafts,
  isGenerating = false,
}: Props) {
  const { t: tRuntime } = useTranslation("common");
  const baseId = useId();
  const [idea, setIdea] = useState("");
  const [showAdvancedContext, setShowAdvancedContext] = useState(false);
  const [context, setContext] = useState<OptionalDraftContext>({});

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim() || isGenerating) return;
    onCreateDraft(idea.trim(), context);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-full p-6 md:p-10 max-w-4xl mx-auto overflow-y-auto">
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-accent/10 border border-accent/20 mb-2 flex items-center justify-center">
          <CharacterCreatorMascot size="lg" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
          <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.heading.characterCreator" />
        </h1>
        <p className="text-sm md:text-base text-text-secondary font-medium max-w-xl">
          <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.description.turnARoughIdeaIntoAComplete" />
        </p>
        <p className="text-xs md:text-sm text-text-muted max-w-2xl leading-relaxed mt-1">
          <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.description.startWithASentenceADetailedConcept" />
        </p>
        <div className="mt-1 px-3 py-1 rounded-full bg-surface-elevated border border-border text-[11px] font-mono text-text-muted">
          <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.creatorModel" />{" "}
          <span className="text-accent font-semibold">GLM 5.2</span>{" "}
          <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.immutable" />
        </div>
      </div>

      {/* Idea Intake Form */}
      <form
        onSubmit={handleStart}
        className="w-full flex flex-col gap-4 mb-10 bg-surface/50 p-6 rounded-2xl border border-border/60 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="character-idea-input"
            className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
          >
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.label.characterConcept" />
          </label>
          <textarea
            id="character-idea-input"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={tRuntime(
              "runtimeGenerated.components.characterCreator.charactercreatorwelcome.attribute.exampleIWantABroodingNocturnalDetectiveWhoProtectsA",
            )}
            rows={3}
            className="w-full p-4 text-sm rounded-xl bg-surface-elevated border border-border focus:outline-none focus:border-accent text-text-primary resize-y min-h-[90px]"
          />
        </div>

        {/* Optional Context Accordion */}
        <div className="border-t border-border/40 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvancedContext(!showAdvancedContext)}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary font-medium"
          >
            {showAdvancedContext ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.optionalDesignConstraintsContext" />
            </span>
          </button>

          {showAdvancedContext && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-2">
              <div>
                <label htmlFor={`${baseId}-w1`} className="text-[11px] text-text-muted font-medium">
                  {tRuntime("runtimeSlashLabels.settingWorld")}
                </label>
                <input id={`${baseId}-w1`} 
                  type="text"
                  placeholder={tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorwelcome.attribute.eGNeoGothicMetropolis1920sNoir",
                  )}
                  value={context.setting || ""}
                  onChange={(e) =>
                    setContext({ ...context, setting: e.target.value })
                  }
                  className="w-full p-2 text-xs rounded-lg bg-surface border border-border text-text-primary mt-1"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-w2`} className="text-[11px] text-text-muted font-medium">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.label.tone" />
                </label>
                <input id={`${baseId}-w2`} 
                  type="text"
                  placeholder={tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorwelcome.attribute.eGGrittyMelancholicSatirical",
                  )}
                  value={context.tone || ""}
                  onChange={(e) =>
                    setContext({ ...context, tone: e.target.value })
                  }
                  className="w-full p-2 text-xs rounded-lg bg-surface border border-border text-text-primary mt-1"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-w3`} className="text-[11px] text-text-muted font-medium">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.label.relationshipToUser" />
                </label>
                <input id={`${baseId}-w3`} 
                  type="text"
                  placeholder={tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorwelcome.attribute.eGReluctantAllyMysteriousInformant",
                  )}
                  value={context.relationship || ""}
                  onChange={(e) =>
                    setContext({ ...context, relationship: e.target.value })
                  }
                  className="w-full p-2 text-xs rounded-lg bg-surface border border-border text-text-primary mt-1"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-w4`} className="text-[11px] text-text-muted font-medium">
                  <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.label.contentRating" />
                </label>
                <select id={`${baseId}-w4`} 
                  value={context.contentRating || "general"}
                  onChange={(e) =>
                    setContext({ ...context, contentRating: e.target.value })
                  }
                  className="w-full p-2 text-xs rounded-lg bg-surface border border-border text-text-primary mt-1"
                >
                  <option value="general">
                    {tRuntime("runtimeSlashLabels.generalPg")}
                  </option>
                  <option value="mature">
                    {tRuntime("runtimeSlashLabels.matureDarkThemes")}
                  </option>
                  <option value="adult">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.option.adultUncensored" />
                  </option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
          <div className="text-[11px] text-text-muted italic">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.allGeneratedContentRemainsADraftUntil" />
          </div>
          <button
            type="submit"
            disabled={!idea.trim() || isGenerating}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-accent text-accent-contrast font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.createDraft" />
            </span>
          </button>
        </div>
      </form>

      {/* Secondary Quick Actions */}
      <div className="flex flex-wrap items-center justify-center gap-3 w-full mb-10">
        <button
          type="button"
          onClick={onImportCard}
          className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-xs font-medium text-text-primary flex items-center gap-2 transition-colors"
        >
          <FileUp className="w-4 h-4 text-accent" />
          <span>
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.importExistingCard" />
          </span>
        </button>
        <button
          type="button"
          onClick={onEditLocalCharacter}
          className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-xs font-medium text-text-primary flex items-center gap-2 transition-colors"
        >
          <Edit3 className="w-4 h-4 text-accent" />
          <span>
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.editLocalCharacter" />
          </span>
        </button>
      </div>

      {/* Three Step Instruction Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-10">
        <div className="p-4 rounded-xl bg-surface/30 border border-border/40 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-accent">
            <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px]">
              1
            </span>
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.describe" />
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.description.enterAnythingFromAOneLineConcept" />
          </p>
        </div>
        <div className="p-4 rounded-xl bg-surface/30 border border-border/40 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-accent">
            <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px]">
              2
            </span>
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.review" />
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.description.inspectAndEditTheIdentityPersonalityScenario" />
          </p>
        </div>
        <div className="p-4 rounded-xl bg-surface/30 border border-border/40 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-accent">
            <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px]">
              3
            </span>
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.create" />
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.description.approveTheFinalDraftToAddThe" />
          </p>
        </div>
      </div>

      {/* Recent Drafts Section */}
      {recentDrafts.length > 0 && (
        <div className="w-full flex flex-col gap-3 pt-4 border-t border-border/40">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            <span>
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.recentUnfinishedDrafts" />
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentDrafts.map((d) => (
              <div
                key={d.id}
                className="p-3 rounded-xl bg-surface border border-border hover:border-accent/40 flex flex-col justify-between gap-2 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span
                    onClick={() => onOpenDraft(d.id)}
                    className="text-xs font-bold text-text-primary hover:text-accent truncate cursor-pointer"
                  >
                    {d.name}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-surface-elevated text-text-muted font-mono">
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.rev" />{" "}
                    {d.revision}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted line-clamp-1 italic">
                  {d.sourceIdea}
                </p>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => onOpenDraft(d.id)}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.action.open" />
                  </button>
                  {onDuplicateDraft && (
                    <button
                      type="button"
                      onClick={() => onDuplicateDraft(d.id)}
                      className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1"
                      title={tRuntime(
                        "runtimeGenerated.components.characterCreator.charactercreatorwelcome.attribute.duplicateDraft",
                      )}
                    >
                      <Copy className="w-3 h-3" />
                      <span>
                        <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.duplicate" />
                      </span>
                    </button>
                  )}
                  {onDeleteDraft && (
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(d.id)}
                      className="text-[11px] text-text-muted hover:text-danger flex items-center gap-1 transition-colors"
                      title={tRuntime(
                        "runtimeGenerated.components.characterCreator.charactercreatorwelcome.attribute.deleteDraft",
                      )}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>
                        <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorwelcome.text.delete" />
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
