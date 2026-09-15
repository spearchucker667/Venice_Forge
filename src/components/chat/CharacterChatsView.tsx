import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Plus, Search, Sparkles, Users } from "lucide-react";
import { useChatStore } from "../../stores/chat-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import {
  getCharacterConversationSource,
  getConversationKind,
} from "../../utils/conversationKind";
import { getConversationDisplayTitle } from "../../utils/conversationDisplayTitle";
import { CharacterAvatar } from "../characters/CharacterAvatar";
import { ChatView } from "./chat-view";
import { startNormalChatForCharacter } from "../../services/rpHelpers";
import { createBlankCharacterCardDraft } from "../../services/characterCards/characterCardStudioHandoff";
import { avatarDataUri } from "../rp-studio/_shared";
import { AccessibleDialog } from "../ui/AccessibleDialog";
import { Trans, useTranslation } from "react-i18next";

function formatActivity(timestamp: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function CharacterChatsView() {
  const { t: tRuntime } = useTranslation("common");
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  );
  const setActiveConversation = useChatStore(
    (state) => state.setActiveConversation,
  );
  const setActiveTab = useSettingsStore((state) => state.setActiveTab);

  const cards = useCharacterCardStore((state) => state.cards);
  const cardsLoaded = useCharacterCardStore((state) => state.hasLoaded);
  const loadCards = useCharacterCardStore((state) => state.load);

  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [emptyLocalSearch, setEmptyLocalSearch] = useState("");
  const pickerPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardsLoaded) void loadCards();
  }, [cardsLoaded, loadCards]);

  const localCards = useMemo(
    () => cards.filter((card) => !card.archivedAt),
    [cards],
  );

  const characterConversations = useMemo(
    () =>
      conversations.filter((item) => getConversationKind(item) === "character"),
    [conversations],
  );

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return characterConversations;
    return characterConversations.filter((item) =>
      [
        getConversationDisplayTitle(item),
        item.metadata?.character?.name ?? "",
        item.model,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [characterConversations, search]);

  const activeConversation = characterConversations.find(
    (item) => item.id === activeConversationId,
  );

  useEffect(() => {
    if (!activeConversation && characterConversations.length > 0)
      setActiveConversation(characterConversations[0].id);
    if (characterConversations.length === 0 && activeConversationId)
      setActiveConversation(null);
  }, [
    activeConversation,
    activeConversationId,
    characterConversations,
    setActiveConversation,
  ]);

  const filteredLocalCardsForEmpty = useMemo(() => {
    const q = emptyLocalSearch.trim().toLowerCase();
    if (!q) return localCards;
    return localCards.filter(
      (card) =>
        card.name.toLowerCase().includes(q) ||
        (card.description && card.description.toLowerCase().includes(q)) ||
        card.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [emptyLocalSearch, localCards]);

  const filteredLocalCardsForPicker = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return localCards;
    return localCards.filter(
      (card) =>
        card.name.toLowerCase().includes(q) ||
        (card.description && card.description.toLowerCase().includes(q)) ||
        card.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [localCards, pickerQuery]);

  const handleStartLocalChat = async (cardId: string) => {
    setShowPicker(false);
    await startNormalChatForCharacter(cardId);
  };

  const handleCreateNewLocalCard = async () => {
    setShowPicker(false);
    await createBlankCharacterCardDraft();
    setActiveTab("rp-studio");
  };

  const handleBrowseHosted = () => {
    setShowPicker(false);
    setActiveTab("characters");
  };

  return (
    <div
      className="flex flex-col md:flex-row h-full min-h-0 bg-vf-panel-bg shell-region"
      data-testid="character-chats-workspace"
    >
      <aside className="flex w-full md:w-[clamp(260px,28%,360px)] shrink-0 flex-col border-b md:border-b-0 md:border-r border-vf-panel-border bg-vf-shell-bg max-h-[35vh] md:max-h-none">
        <header className="space-y-3 px-4 py-4 border-b border-vf-panel-border bg-vf-shell-bg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[16px] font-semibold text-text-primary">
                <Trans i18nKey="common:surface.componentsChatCharacterchatsview.heading.characterChats" />
              </h1>
              <p className="mt-0.5 text-[12px] text-text-muted">
                <Trans i18nKey="common:surface.componentsChatCharacterchatsview.description.hostedAndLocalCharacterConversations" />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="rounded-md border border-vf-panel-border bg-vf-panel-bg p-2 text-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent hover:bg-vf-control-hover hover:text-accent shadow-sm transition-colors cursor-pointer"
              aria-label={tRuntime(
                "runtimeGenerated.components.chat.characterchatsview.attribute.newCharacterChat",
              )}
              title={tRuntime(
                "runtimeGenerated.components.chat.characterchatsview.attribute.chooseOrStartACharacterChat",
              )}
            >
              <MessageSquarePlus size={17} />
            </button>
          </div>
          <label htmlFor="char-chats-1" className="flex items-center gap-2 rounded-md border border-vf-panel-border bg-vf-panel-bg-inset px-3 py-2 text-text-primary focus-within:border-accent transition-colors">
            <Search size={14} className="text-text-muted" />
            <span className="sr-only">
              <Trans i18nKey="common:surface.componentsChatCharacterchatsview.text.searchCharacterChats" />
            </span>
            <input
              type="search" id="char-chats-1" 
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.chat.characterchatsview.attribute.searchCharacterChats",
              )}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {visibleConversations.map((conversation) => {
            const character = conversation.metadata?.character;
            const source = getCharacterConversationSource(conversation);
            const selected = conversation.id === activeConversation?.id;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversation(conversation.id)}
                aria-current={selected ? "page" : undefined}
                className={`mb-1 flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${
                  selected
                    ? "bg-accent/15 text-text-primary border border-accent/40 shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)]"
                    : "text-text-secondary hover:bg-vf-control-hover hover:text-text-primary border border-transparent"
                }`}
              >
                {character ? (
                  <CharacterAvatar
                    character={character}
                    cacheKey={`character-chat-${conversation.id}`}
                    size="md"
                  />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent">
                    <Users size={15} />
                  </div>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">
                      {character?.name ||
                        tRuntime(
                          "runtimeGenerated.components.chat.characterchatsview.text.characterChat",
                        )}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {formatActivity(conversation.updatedAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px]">
                    {getConversationDisplayTitle(conversation)}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
                    <span className="rounded bg-vf-panel-bg-inset border border-vf-panel-border px-1.5 py-0.5">
                      {source === "local"
                        ? tRuntime(
                            "runtimeGenerated.components.chat.characterchatsview.text.local",
                          )
                        : tRuntime(
                            "runtimeGenerated.components.chat.characterchatsview.text.hosted",
                          )}
                    </span>
                    <span className="truncate normal-case tracking-normal">
                      {conversation.model}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}

          {visibleConversations.length === 0 &&
            characterConversations.length > 0 && (
              <p className="px-3 py-10 text-center text-[12px] text-text-muted">
                <Trans i18nKey="common:surface.componentsChatCharacterchatsview.description.noCharacterChatsMatchThisSearch" />
              </p>
            )}

          {characterConversations.length === 0 && localCards.length > 0 && (
            <div className="mt-4 px-2">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <span>
                  <Trans i18nKey="common:surface.componentsChatCharacterchatsview.text.localCharacters" />
                </span>
                <span className="text-[10px] text-accent">
                  {localCards.length}{" "}
                  <Trans i18nKey="common:surface.componentsChatCharacterchatsview.text.available" />
                </span>
              </div>
              <div className="space-y-1">
                {localCards.slice(0, 8).map((card) => {
                  const meta = {
                    id: card.id,
                    localCharacterId: card.id,
                    name: card.name,
                    photoUrl: avatarDataUri(card.avatar),
                  };
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => void handleStartLocalChat(card.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-text-secondary hover:bg-vf-control-hover hover:text-text-primary transition-colors cursor-pointer group"
                    >
                      <CharacterAvatar
                        character={meta}
                        cacheKey={`sidebar-quick-${card.id}`}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {card.name}
                      </span>
                      <span className="text-[11px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trans i18nKey="common:surface.componentsChatCharacterchatsview.text.chat" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {activeConversation ? (
          <ChatView />
        ) : (
          <div className="flex h-full min-h-0 flex-col items-center justify-center p-6 md:p-10">
            {localCards.length > 0 ? (
              <div className="w-full max-w-4xl space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-vf-panel-border pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-accent" />
                      <Trans i18nKey="common:surface.componentsChatCharacterchatsview.heading.startALocalCharacterChat" />
                    </h2>
                    <p className="mt-1 text-[13px] text-text-muted">
                      <Trans i18nKey="common:surface.componentsChatCharacterchatsview.description.selectAnyOfYourLocallyCreatedCharacters" />
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCreateNewLocalCard()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-1.5 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:bg-vf-control-hover hover:border-accent/40 transition-colors cursor-pointer"
                    >
                      <Plus size={14} />{" "}
                      <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.newStCard" />
                    </button>
                    <button
                      type="button"
                      onClick={handleBrowseHosted}
                      className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] transition-colors cursor-pointer"
                    >
                      <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.browseHosted" />
                    </button>
                  </div>
                </div>

                {localCards.length > 3 && (
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      type="search"
                      value={emptyLocalSearch}
                      onChange={(e) => setEmptyLocalSearch(e.target.value)}
                      placeholder={tRuntime(
                        "runtimeGenerated.components.chat.characterchatsview.attribute.searchLocalCharacters",
                      )}
                      className="w-full rounded-md border border-vf-panel-border bg-vf-panel-bg-inset pl-9 pr-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredLocalCardsForEmpty.map((card) => {
                    const meta = {
                      id: card.id,
                      localCharacterId: card.id,
                      name: card.name,
                      photoUrl: avatarDataUri(card.avatar),
                      modelId: card.modelId,
                    };
                    return (
                      <article
                        key={card.id}
                        className="flex flex-col justify-between rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-4 hover:border-accent/40 hover:shadow-sm transition-all"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <CharacterAvatar
                              character={meta}
                              cacheKey={`empty-local-${card.id}`}
                              size="lg"
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-text-primary truncate">
                                {card.name}
                              </h3>
                              <span className="text-[10px] uppercase tracking-wider text-accent font-mono">
                                {card.sourceFormat === "tavern-v1-json"
                                  ? tRuntime(
                                      "runtimeGenerated.components.chat.characterchatsview.text.v1Imported",
                                    )
                                  : card.sourceFormat === "card-v2-json"
                                    ? tRuntime(
                                        "runtimeGenerated.components.chat.characterchatsview.text.v2Json",
                                      )
                                    : card.sourceFormat === "card-v2-png"
                                      ? tRuntime(
                                          "runtimeGenerated.components.chat.characterchatsview.text.v2Png",
                                        )
                                      : tRuntime(
                                          "runtimeGenerated.components.chat.characterchatsview.text.localCharacter",
                                        )}
                              </span>
                            </div>
                          </div>
                          {card.description && (
                            <p className="text-[12.5px] text-text-secondary line-clamp-3 leading-relaxed">
                              {card.description}
                            </p>
                          )}
                          {card.tags && card.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {card.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-vf-panel-bg-inset px-2 py-0.5 text-[11px] text-text-muted border border-vf-panel-border"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 pt-3 border-t border-vf-panel-border flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleStartLocalChat(card.id)}
                            className="flex-1 rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] transition-colors cursor-pointer"
                          >
                            <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.startChat" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("rp-studio")}
                            className="rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-1.5 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:bg-vf-control-hover transition-colors cursor-pointer"
                          >
                            <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.edit" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {filteredLocalCardsForEmpty.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-text-muted">
                    <Trans i18nKey="common:surface.componentsChatCharacterchatsview.description.noLocalCharactersMatch" />
                    {emptyLocalSearch}".
                  </p>
                )}
              </div>
            ) : (
              <div className="max-w-md rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-8 text-center shadow-lg">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Users size={22} />
                </div>
                <h2 className="text-[17px] font-semibold text-text-primary">
                  <Trans i18nKey="common:surface.componentsChatCharacterchatsview.heading.noCharacterChatsYet" />
                </h2>
                <p className="mt-2 text-[13px] text-text-muted">
                  <Trans i18nKey="common:surface.componentsChatCharacterchatsview.description.chooseAHostedOrLocalCharacterTo" />
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleBrowseHosted}
                    className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
                  >
                    <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.browseCharacters" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateNewLocalCard()}
                    className="rounded-md border border-vf-panel-border bg-vf-panel-bg px-4 py-2 text-[13px] font-semibold text-text-secondary hover:text-text-primary hover:bg-vf-control-hover cursor-pointer"
                  >
                    <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.createLocalCharacter" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {showPicker && (
        <AccessibleDialog
          title={tRuntime(
            "runtimeGenerated.components.chat.characterchatsview.attribute.newCharacterChat2",
          )}
          description={tRuntime(
            "runtimeGenerated.components.chat.characterchatsview.attribute.selectALocalCharacterOrBrowseHostedCharactersToLaunch",
          )}
          panelRef={pickerPanelRef}
          onClose={() => setShowPicker(false)}
          headerAction={
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="rounded border border-vf-panel-border bg-vf-panel-bg px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-vf-control-hover cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.close" />
            </button>
          }
        >
          <div className="flex flex-col gap-4 p-5 max-h-[75vh] overflow-y-auto bg-vf-shell-bg">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleBrowseHosted}
                className="flex-1 rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:bg-vf-control-hover hover:border-accent/40 cursor-pointer"
              >
                <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.browseHostedCharacters" />
              </button>
              <button
                type="button"
                onClick={() => void handleCreateNewLocalCard()}
                className="flex-1 rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:bg-vf-control-hover hover:border-accent/40 cursor-pointer"
              >
                <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.createNewStCard" />
              </button>
            </div>

            <div className="space-y-2">
              <label htmlFor="char-chats-2" className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                <Trans i18nKey="common:surface.componentsChatCharacterchatsview.label.localCharacters" />
                {localCards.length})
              </label>
              {localCards.length > 3 && (
                <input
                  type="search" id="char-chats-2" 
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={tRuntime(
                    "runtimeGenerated.components.chat.characterchatsview.attribute.filterLocalCharacters",
                  )}
                  className="w-full rounded-md border border-vf-panel-border bg-vf-panel-bg-inset px-3 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-accent"
                />
              )}
              {filteredLocalCardsForPicker.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filteredLocalCardsForPicker.map((card) => {
                    const meta = {
                      id: card.id,
                      localCharacterId: card.id,
                      name: card.name,
                      photoUrl: avatarDataUri(card.avatar),
                    };
                    return (
                      <div
                        key={card.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-vf-panel-border p-3 hover:border-accent/40 transition-colors bg-vf-panel-bg-raised"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CharacterAvatar
                            character={meta}
                            cacheKey={`picker-local-${card.id}`}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h4 className="truncate font-semibold text-[13px] text-text-primary">
                              {card.name}
                            </h4>
                            <p className="truncate text-[11.5px] text-text-muted">
                              {card.description ||
                                tRuntime(
                                  "runtimeGenerated.components.chat.characterchatsview.text.localCharacter2",
                                )}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleStartLocalChat(card.id)}
                          className="shrink-0 rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg hover:bg-accent-hover shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)] cursor-pointer"
                        >
                          <Trans i18nKey="common:surface.componentsChatCharacterchatsview.action.chat" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-[12.5px] text-text-muted">
                  {localCards.length === 0
                    ? tRuntime(
                        "runtimeGenerated.components.chat.characterchatsview.text.noLocalCharactersCreatedYet",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.chat.characterchatsview.text.noCharactersMatchPickerquery",
                        { pickerQuery: pickerQuery },
                      )}
                </p>
              )}
            </div>
          </div>
        </AccessibleDialog>
      )}
    </div>
  );
}
