import { useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, Search, Users } from 'lucide-react'
import { useChatStore } from '../../stores/chat-store'
import { useSettingsStore } from '../../stores/settings-store'
import { getCharacterConversationSource, getConversationKind } from '../../utils/conversationKind'
import { getConversationDisplayTitle } from '../../utils/conversationDisplayTitle'
import { CharacterAvatar } from '../characters/CharacterAvatar'
import { ChatView } from './chat-view'

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
  const [search, setSearch] = useState('')

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
              onClick={() => setActiveTab('characters')}
              className="mesh-input rounded-lg p-2 text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="New character chat"
              title="Choose a character"
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
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        {activeConversation ? <ChatView /> : (
          <div className="flex h-full items-center justify-center p-8">
            <div className="mesh-card max-w-md rounded-2xl p-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Users size={22} /></div>
              <h2 className="text-[17px] font-semibold text-text-primary">No character chats yet</h2>
              <p className="mt-2 text-[13px] text-text-muted">Choose a hosted or local character to begin a dedicated character conversation.</p>
              <button type="button" onClick={() => setActiveTab('characters')} className="mt-5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                Browse characters
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
