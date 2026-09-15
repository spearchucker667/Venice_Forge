/**
 * @fileoverview Modal picker for selecting a local character card to edit inside Character Creator.
 */

import { useState, useMemo } from "react";
import { Search, X, User } from "lucide-react";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { avatarDataUri, formatRelativeTime } from "../rp-studio/_shared";
import { Trans, useTranslation } from "react-i18next";

interface Props {
  onSelectCharacter: (characterId: string) => void;
  onClose: () => void;
}

export function CharacterCreatorLocalPickerModal({
  onSelectCharacter,
  onClose,
}: Props) {
  const { t: tRuntime } = useTranslation("common");
  const cards = useCharacterCardStore((s) => s.cards);
  const [search, setSearch] = useState("");

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const descMatch = c.description.toLowerCase().includes(q);
      const tagMatch = c.tags?.some((t) => t.toLowerCase().includes(q));
      return nameMatch || descMatch || tagMatch;
    });
  }, [cards, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4">
      <div className="flex flex-col w-full max-w-xl max-h-[80vh] rounded-xl border border-vf-panel-border bg-vf-panel-bg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-vf-panel-border bg-vf-panel-bg-raised">
          <div>
            <h3 className="text-sm font-bold text-text-primary">
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorlocalpickermodal.heading.selectLocalCharacterToEdit" />
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorlocalpickermodal.description.chooseACharacterFromYourLocalLibrary" />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-vf-panel-border bg-vf-panel-bg">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.characterCreator.charactercreatorlocalpickermodal.attribute.searchByCharacterNameTagOrDescription",
              )}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-vf-panel-bg-raised border border-vf-panel-border focus:outline-none focus:border-accent text-text-primary"
            />
          </div>
        </div>

        {/* Character List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {filteredCards.length === 0 ? (
            <div className="text-xs text-text-muted italic text-center py-8">
              {cards.length === 0
                ? tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorlocalpickermodal.text.noLocalCharactersFoundInYourLibrary",
                  )
                : tRuntime(
                    "runtimeGenerated.components.characterCreator.charactercreatorlocalpickermodal.text.noCharactersMatchYourSearchFilter",
                  )}
            </div>
          ) : (
            filteredCards.map((card) => {
              const avatarUri = avatarDataUri(card.avatar);

              return (
                <div
                  key={card.id}
                  onClick={() => onSelectCharacter(card.id)}
                  className="p-3 rounded-lg bg-vf-panel-bg-raised/40 border border-vf-panel-border hover:border-accent/50 cursor-pointer flex items-center justify-between gap-3 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-vf-panel-bg border border-vf-panel-border overflow-hidden shrink-0 flex items-center justify-center">
                      {avatarUri ? (
                        <img
                          src={avatarUri}
                          alt={card.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5 text-text-muted" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-text-primary group-hover:text-accent truncate">
                        {card.name}
                      </span>
                      <p className="text-[11px] text-text-muted line-clamp-1">
                        {card.description ||
                          tRuntime(
                            "runtimeGenerated.components.characterCreator.charactercreatorlocalpickermodal.text.noDescriptionProvided",
                          )}
                      </p>
                      {card.tags && card.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {card.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-vf-panel-bg border border-vf-panel-border text-text-muted font-mono"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[10px] text-text-muted font-mono">
                      {formatRelativeTime(card.updatedAt)}
                    </span>
                    <span className="text-xs font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                      <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorlocalpickermodal.text.editDraft" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-vf-panel-border bg-vf-panel-bg gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-vf-panel-bg border border-vf-panel-border text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <Trans i18nKey="common:surface.componentsCharacterCreatorCharactercreatorlocalpickermodal.action.cancel" />
          </button>
        </div>
      </div>
    </div>
  );
}
