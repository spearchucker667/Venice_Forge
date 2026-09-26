/**
 * @fileoverview Character creation completion screen with actions.
 */

import { CheckCircle2, MessageSquare, User, FileUp, Sparkles, Edit3 } from "lucide-react";
import type { CharacterCardV1 } from "../../types/rp";
import { CharacterCreatorMascot } from "./CharacterCreatorMascot";
import { Trans } from 'react-i18next';

interface Props {
  character: CharacterCardV1;
  onStartChat: () => void;
  onViewCharacter: () => void;
  onContinueEditing: () => void;
  onExportCard: () => void;
  onCreateAnother: () => void;
}

export function CharacterCreatorCompleted({
  character,
  onStartChat,
  onViewCharacter,
  onContinueEditing,
  onExportCard,
  onCreateAnother,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] h-full p-6 text-center max-w-md mx-auto">
      <div className="relative mb-4">
        <CharacterCreatorMascot size="lg" />
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-success text-button-primary-fg flex items-center justify-center border-2 border-surface">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-text-primary mb-1"><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.heading.characterCreated" /></h2>
      <p className="text-xs text-text-muted mb-6">
        “<span className="text-text-primary font-semibold">{character.name}</span><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.description.hasBeenSavedToYourLocalCharacter" /></p>

      {/* Primary & Secondary Actions */}
      <div className="flex flex-col gap-2.5 w-full">
        <button
          type="button"
          onClick={onStartChat}
          className="w-full py-2.5 rounded-lg bg-accent text-accent-fg font-medium text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <MessageSquare className="w-4 h-4" />
          <span><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.text.startChat" /></span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onViewCharacter}
            className="py-2 px-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-primary flex items-center justify-center gap-1.5 transition-colors"
          >
            <User className="w-3.5 h-3.5" />
            <span><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.text.viewCharacter" /></span>
          </button>
          <button
            type="button"
            onClick={onContinueEditing}
            className="py-2 px-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-primary flex items-center justify-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.text.continueEditing" /></span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-vf-panel-border">
          <button
            type="button"
            onClick={onExportCard}
            className="py-2 px-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary flex items-center justify-center gap-1.5 transition-colors"
          >
            <FileUp className="w-3.5 h-3.5 text-accent" />
            <span><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.text.exportCard" /></span>
          </button>
          <button
            type="button"
            onClick={onCreateAnother}
            className="py-2 px-3 rounded-lg bg-vf-panel-bg border border-vf-panel-border hover:bg-vf-control-hover text-xs font-medium text-text-secondary flex items-center justify-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorcompleted.text.createAnother" /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
