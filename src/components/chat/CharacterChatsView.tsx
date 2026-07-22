import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, Plus, Search, Sparkles, Users } from 'lucide-react'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useCharacterCardStore } from '../../stores/character-card-store'
import { getCharacterConversationSource, getConversationKind } from '../../utils/conversationKind'
import { getConversationDisplayTitle } from '../../utils/conversationDisplayTitle'
import { CharacterAvatar } from '../characters/CharacterAvatar'
import { ChatView } from './chat-view'
import { startNormalChatForCharacter } from '../../services/rpHelpers'
import { createBlankCharacterCardDraft } from '../../services/characterCards/characterCardStudioHandoff'
import { avatarDataUri } from '../rp-studio/_shared'
import { AccessibleDialog } from '../ui/AccessibleDialog'

function formatActivity(timestamp: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function CharacterChatsView() {
  const conversations = useChatStore((state) => state.conversations)
  const activeConversationId = useChatStore((state) => state.activeConversationId)
  const setActiveConversation = useChatStore((state) => state.setActiveConversation)
  const setActiveTab = useSettingsStore((state) => state.setActiveTab)

  const cards = useCharacterCardStore((state) => state.cards)
  const cardsLoaded = useCharacterCardStore((state) => state.hasLoaded)
  const loadCards = useCharacterCardStore((state) => state.load)

  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [emptyLocalSearch, setEmptyLocalSearch] = useState('')
  const pickerPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!cardsLoaded) void loadCards()
  }, [cardsLoaded, loadCards])

  const localCards = useMemo(() => cards.filter((card) => !card.archivedAt), [cards])

  const characterConversations = useMemo(
    () => conversations.filter((item) => getConversationKind(item) === 'character'),
    [conversations],
  )

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return characterConversations
    return characterConversations.filter((item) => [
      getConversationDisplayTitle(item),
      item.metadata?.character?.name ?? '',
      item.model,
    ].some((value) => value.toLocaleLowerCase().includes(query)))
  }, [characterConversations, search])

  const activeConversation = characterConversations.find((item) => item.id === activeConversationId)

  useEffect(() => {
    if (!activeConversation && characterConversations.length > 0) setActiveConversation(characterConversations[0].id)
    if (characterConversations.length === 0 && activeConversationId) setActiveConversation(null)
  }, [activeConversation, activeConversationId, characterConversations, setActiveConversation])

  const filteredLocalCardsForEmpty = useMemo(() => {
    const q = emptyLocalSearch.trim().toLowerCase()
    if (!q) return localCards
    return localCards.filter((card) =>
      card.name.toLowerCase().includes(q) ||
      (card.description && card.description.toLowerCase().includes(q)) ||
      card.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [emptyLocalSearch, localCards])

  const filteredLocalCardsForPicker = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return localCards
    return localCards.filter((card) =>
      card.name.toLowerCase().includes(q) ||
      (card.description && card.description.toLowerCase().includes(q)) ||
      card.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [localCards, pickerQuery])

  const handleStartLocalChat = async (cardId: string) => {
    setShowPicker(false)
    await startNormalChatForCharacter(cardId)
  }

  const handleCreateNewLocalCard = async () => {
    setShowPicker(false)
    await createBlankCharacterCardDraft()
    setActiveTab('rp-studio')
  }

  const handleBrowseHosted = () => {
    setShowPicker(false)
    setActiveTab('characters')
  }

  return (
    <div className="flex h-full min-h-0 mesh-surface shell-region" data-testid="character-chats-workspace">
      <aside className="flex w-[clamp(260px,28%,360px)] shrink-0 flex-col soft-separator-x mesh-surface-elevated">
        <header className="space-y-3 px-4 py-4 soft-separator-y mesh-header">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[16px] font-semibold text-text-primary">Character Chats</h1>
              <p className="mt-0.5 text-[12px] text-text-muted">Hosted and local character conversations</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mesh-input rounded-lg p-2 text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent hover:bg-accent/10 transition-colors"
              aria-label="New character chat"
              title="Choose or start a character chat"
            >
              <MessageSquarePlus size={17} />
            </button>
          </div>
          <label className="mesh-input flex items-center gap-2 rounded-lg px-3 py-2">
            <Search size={14} className="text-text-muted" />
            <span className="sr-only">Search character chats</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search character chats"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {visibleConversations.map((conversation) => {
            const character = conversation.metadata?.character
            const source = getCharacterConversationSource(conversation)
            const selected = conversation.id === activeConversation?.id
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversation(conversation.id)}
                aria-current={selected ? 'page' : undefined}
                className={`mb-1 flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${selected ? 'bg-accent/12 text-text-primary shadow-sm' : 'text-text-secondary hover:bg-surface-elevated/60 hover:text-text-primary'}`}
              >
                {character ? <CharacterAvatar character={character} cacheKey={`character-chat-${conversation.id}`} size="md" /> : <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent"><Users size={15} /></div>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">{character?.name || 'Character chat'}</span>
                    <span className="text-[11px] text-text-muted">{formatActivity(conversation.updatedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px]">{getConversationDisplayTitle(conversation)}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
                    <span className="rounded bg-surface px-1.5 py-0.5">{source === 'local' ? 'Local' : 'Hosted'}</span>
                    <span className="truncate normal-case tracking-normal">{conversation.model}</span>
                  </span>
                </span>
              </button>
            )
          })}

          {visibleConversations.length === 0 && characterConversations.length > 0 && (
            <p className="px-3 py-10 text-center text-[12px] text-text-muted">No character chats match this search.</p>
          )}

          {characterConversations.length === 0 && localCards.length > 0 && (
            <div className="mt-4 px-2">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <span>Local Characters</span>
                <span className="text-[10px] text-accent">{localCards.length} available</span>
              </div>
              <div className="space-y-1">
                {localCards.slice(0, 8).map((card) => {
                  const meta = { id: card.id, localCharacterId: card.id, name: card.name, photoUrl: avatarDataUri(card.avatar) }
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => void handleStartLocalChat(card.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors cursor-pointer group"
                    >
                      <CharacterAvatar character={meta} cacheKey={`sidebar-quick-${card.id}`} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-medium">{card.name}</span>
                      <span className="text-[11px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">Chat →</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {activeConversation ? <ChatView /> : (
          <div className="flex h-full min-h-0 flex-col items-center justify-center p-6 md:p-10">
            {localCards.length > 0 ? (
              <div className="w-full max-w-4xl space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-accent" />
                      Start a Local Character Chat
                    </h2>
                    <p className="mt-1 text-[13px] text-text-muted">
                      Select any of your locally created characters to launch a dedicated conversation.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCreateNewLocalCard()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
                    >
                      <Plus size={14} /> New ST Card
                    </button>
                    <button
                      type="button"
                      onClick={handleBrowseHosted}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:bg-accent-hover transition-colors"
                    >
                      Browse Hosted
                    </button>
                  </div>
                </div>

                {localCards.length > 3 && (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="search"
                      value={emptyLocalSearch}
                      onChange={(e) => setEmptyLocalSearch(e.target.value)}
                      placeholder="Search local characters…"
                      className="w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredLocalCardsForEmpty.map((card) => {
                    const meta = { id: card.id, localCharacterId: card.id, name: card.name, photoUrl: avatarDataUri(card.avatar), modelId: card.modelId }
                    return (
                      <article key={card.id} className="flex flex-col justify-between rounded-xl border border-border/50 bg-surface-elevated/40 p-4 soft-panel hover:border-accent/50 transition-all">
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <CharacterAvatar character={meta} cacheKey={`empty-local-${card.id}`} size="lg" />
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-text-primary truncate">{card.name}</h3>
                              <span className="text-[10px] uppercase tracking-wider text-accent font-mono">
                                {card.sourceFormat === 'tavern-v1-json' ? 'V1 Imported' : card.sourceFormat === 'card-v2-json' ? 'V2 JSON' : card.sourceFormat === 'card-v2-png' ? 'V2 PNG' : 'Local Character'}
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
                                <span key={tag} className="rounded bg-surface px-2 py-0.5 text-[11px] text-text-muted border border-border/30">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 pt-3 border-t border-border/30 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleStartLocalChat(card.id)}
                            className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
                          >
                            Start Chat
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('rp-studio')}
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {filteredLocalCardsForEmpty.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-text-muted">No local characters match "{emptyLocalSearch}".</p>
                )}
              </div>
            ) : (
              <div className="mesh-card max-w-md rounded-2xl p-8 text-center">
                <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Users size={22} /></div>
                <h2 className="text-[17px] font-semibold text-text-primary">No character chats yet</h2>
                <p className="mt-2 text-[13px] text-text-muted">Choose a hosted or local character to begin a dedicated character conversation.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={handleBrowseHosted} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                    Browse characters
                  </button>
                  <button type="button" onClick={() => void handleCreateNewLocalCard()} className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-secondary hover:text-text-primary">
                    Create local character
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {showPicker && (
        <AccessibleDialog
          title="New Character Chat"
          description="Select a local character or browse hosted characters to launch a chat."
          panelRef={pickerPanelRef}
          onClose={() => setShowPicker(false)}
          headerAction={
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
            >
              Close
            </button>
          }
        >
          <div className="flex flex-col gap-4 p-5 max-h-[75vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleBrowseHosted}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:border-accent/40"
              >
                Browse Hosted Characters ↗
              </button>
              <button
                type="button"
                onClick={() => void handleCreateNewLocalCard()}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-text-secondary hover:text-text-primary hover:border-accent/40"
              >
                + Create New ST Card
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                Local Characters ({localCards.length})
              </label>
              {localCards.length > 3 && (
                <input
                  type="search"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Filter local characters…"
                  className="w-full rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-accent"
                />
              )}
              {filteredLocalCardsForPicker.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filteredLocalCardsForPicker.map((card) => {
                    const meta = { id: card.id, localCharacterId: card.id, name: card.name, photoUrl: avatarDataUri(card.avatar) }
                    return (
                      <div
                        key={card.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:border-accent/40 transition-colors bg-surface-elevated/30"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <CharacterAvatar character={meta} cacheKey={`picker-local-${card.id}`} size="md" />
                          <div className="min-w-0">
                            <h4 className="truncate font-semibold text-[13px] text-text-primary">{card.name}</h4>
                            <p className="truncate text-[11.5px] text-text-muted">{card.description || 'Local character'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleStartLocalChat(card.id)}
                          className="shrink-0 rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg hover:bg-accent-hover cursor-pointer"
                        >
                          Chat
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-[12.5px] text-text-muted">
                  {localCards.length === 0 ? 'No local characters created yet.' : `No characters match "${pickerQuery}".`}
                </p>
              )}
            </div>
          </div>
        </AccessibleDialog>
      )}
    </div>
  )
}
