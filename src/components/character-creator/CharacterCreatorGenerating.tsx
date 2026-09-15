/**
 * @fileoverview Event-driven progress and generation screen for Character Creator.
 * Uses real application and model process events (no timer-driven fake checklists).
 */

import type { CharacterCreatorProcessEvent, CharacterCreatorProcessSummary } from "../../types/character-creator";
import { CharacterCreatorMascot } from "./CharacterCreatorMascot";
import { CharacterCreatorProcessPanel } from "./CharacterCreatorProcessPanel";
import { Trans } from 'react-i18next';

interface Props {
  onCancel: () => void;
  idea: string;
  events: CharacterCreatorProcessEvent[];
  processSummary?: CharacterCreatorProcessSummary;
  designSummary?: string;
}

export function CharacterCreatorGenerating({
  onCancel,
  idea,
  events,
  processSummary,
  designSummary,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-start min-h-full h-full p-6 md:p-8 max-w-2xl mx-auto overflow-y-auto w-full">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 mb-3 flex items-center justify-center">
          <CharacterCreatorMascot size="lg" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-1"><Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorgenerating.heading.generatingCharacterDraft" /></h2>
        <p className="text-xs text-text-muted line-clamp-2 italic max-w-md">
          “{idea}”
        </p>
      </div>

      {/* Real Visible Event-Driven Process Panel */}
      <CharacterCreatorProcessPanel
        events={events}
        processSummary={processSummary}
        designSummary={designSummary}
        isGenerating={true}
        onCancel={onCancel}
        className="w-full"
      />
    </div>
  );
}
