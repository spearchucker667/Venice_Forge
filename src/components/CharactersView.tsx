/** @fileoverview Character discovery view.
 *
 *  Lets the user search Venice hosted characters, filter by adult /
 *  web-enabled flags, browse character cards, and start a character
 *  conversation. Uses the official Venice Character API — never
 *  scrapes venice.ai pages.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCharacterStore } from "../stores/character-store";
import { useChatStore } from "../stores/chat-store";
import { useSettingsStore } from "../stores/settings-store";
import { DEFAULT_CHAT_MODEL, FALLBACK_MODELS } from "../constants/venice";
import { useCharacterImage } from "../hooks/useCharacterImage";
import type {
  CharacterModelOption,
  CharacterSortBy,
  CharacterSortOrder,
  VeniceCharacter,
} from "../types/characters";
import { useCharacterCardStore } from '../stores/character-card-store'
import { startNormalChatForCharacter } from '../services/rpHelpers'
import { avatarDataUri } from './rp-studio/_shared'
import { CharacterAvatar } from './characters/CharacterAvatar'
import { askDecision } from './ui/modal-requests'
import { AccessibleDialog } from './ui/AccessibleDialog'
import { toast } from '../stores/toast-store'

const SORT_OPTIONS: Array<{ value: CharacterSortBy; label: string }> = [
  { value: "featured", label: "Featured" },
  { value: "imports", label: "Most Imported" },
  { value: "highestRating", label: "Highest Rated" },
  { value: "highlyRated", label: "Highly Rated" },
  { value: "highlyRatedAndRecent", label: "Highly Rated & Recent" },
  { value: "mostRecent", label: "Most Recent" },
  { value: "ratingCount", label: "Most Rated" },
];

const SORT_ORDER_OPTIONS: Array<{ value: CharacterSortOrder; label: string }> = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" },
];

const MODEL_OPTIONS: CharacterModelOption[] = [
  { id: "", name: "Character default" },
  ...FALLBACK_MODELS.text.map((m) => ({ id: m.id, name: m.name })),
];

export function Avatar({ character }: { character: VeniceCharacter }) {
  const { imageUrl, fallbackInitials } = useCharacterImage(character);
  const altText = `${character.name} avatar`;
  return (
    <div
      className="h-16 w-16 rounded-full bg-surface-elevated border border-border flex items-center justify-center overflow-hidden text-text-secondary text-[18px] font-semibold shrink-0"
      role="img"
      aria-label={altText}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={altText}
          width={64}
          height={64}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{fallbackInitials}</span>
      )}
    </div>
  );
}

function CharacterCard({
  character,
  onChat,
  onSelect,
  isFavorite,
  onFavorite,
  onDetails,
  onRefresh,
  onDuplicate,
}: {
  character: VeniceCharacter;
  onChat: (character: VeniceCharacter) => void;
  onSelect: (character: VeniceCharacter) => void;
  isFavorite?: boolean;
  onFavorite?: (character: VeniceCharacter) => void;
  onDetails?: (character: VeniceCharacter) => void;
  onRefresh?: (character: VeniceCharacter) => void;
  onDuplicate?: (character: VeniceCharacter) => void;
}) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border/35 mesh-surface-elevated soft-panel p-4 shadow-sm hover:border-accent/40 transition-colors"
      data-testid="character-card"
      data-character-slug={character.slug}
    >
      <div className="flex items-start gap-3">
        <Avatar character={character} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-text-primary truncate">
              {character.name}
            </h3>
            {character.adult && (
              <span
                className="text-[12px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30 font-semibold uppercase tracking-wider"
                title="Adult character"
              >
                18+
              </span>
            )}
            {character.featured && (
              <span className="text-[12px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-semibold uppercase tracking-wider">
                Featured
              </span>
            )}
          </div>
          <div className="text-[12px] text-text-muted font-mono">/{character.slug}</div>
          {character.modelId && (
            <div className="text-[12px] text-text-secondary mt-1">Model: <span className="font-mono">{character.modelId}</span></div>
          )}
        </div>
      </div>
      {character.description && (
        <p className="text-[12.5px] text-text-secondary line-clamp-3 leading-relaxed">
          {character.description}
        </p>
      )}
      {character.tags && character.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {character.tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="text-[12px] px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {(character.stats?.averageRating !== undefined || character.stats?.imports !== undefined) && (
        <div className="flex items-center gap-3 text-[12px] text-text-muted">
          {character.stats?.averageRating !== undefined && (
            <span title="Average rating">★ {character.stats.averageRating.toFixed(2)}</span>
          )}
          {character.stats?.ratingCount !== undefined && (
            <span title="Rating count">{character.stats.ratingCount.toLocaleString()} ratings</span>
          )}
          {character.stats?.imports !== undefined && (
            <span title="Total imports">{character.stats.imports.toLocaleString()} imports</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={() => onChat(character)}
          className="flex-1 px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
          data-testid="character-chat-button"
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => onSelect(character)}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
        >
          Select
        </button>
        {character.shareUrl && (
          <a
            href={character.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
            title="Open on Venice"
          >
            Venice ↗
          </a>
        )}
      </div>
      {(onFavorite || onDetails || onRefresh || onDuplicate) && (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          {onFavorite && <button type="button" onClick={() => onFavorite(character)} className="rounded border border-border px-2 py-1.5 text-text-secondary">{isFavorite ? 'Unfavorite' : 'Favorite'}</button>}
          {onDetails && <button type="button" onClick={() => onDetails(character)} className="rounded border border-border px-2 py-1.5 text-text-secondary">Details</button>}
          {onRefresh && <button type="button" onClick={() => onRefresh(character)} className="rounded border border-border px-2 py-1.5 text-text-secondary">Refresh</button>}
          {onDuplicate && <button type="button" onClick={() => onDuplicate(character)} className="rounded border border-border px-2 py-1.5 text-text-secondary">Duplicate locally</button>}
        </div>
      )}
    </article>
  );
}

export function CharactersView() {
  const {
    searchQuery,
    results,
    isLoading,
    error,
    sortBy,
    sortOrder,
    includeAdultCharacters,
    webEnabledOnly,
    selectedModel,
    hasMore,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setIncludeAdult,
    setWebEnabledOnly,
    setSelectedModel,
    searchCharacters,
    loadMore,
    selectCharacter,
    fetchBySlug,
  } = useCharacterStore();

  const createCharacterConversation = useChatStore((s) => s.createCharacterConversation);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const fallbackModel = useSettingsStore((s) => s.selectedModels.chat) || DEFAULT_CHAT_MODEL;
  const localCards = useCharacterCardStore((s) => s.cards)
  const loadLocalCards = useCharacterCardStore((s) => s.load)
  const upsertLocalCard = useCharacterCardStore((s) => s.upsert)
  const removeLocalCard = useCharacterCardStore((s) => s.remove)
  const conversations = useChatStore((s) => s.conversations)
  const favoriteHostedCharacterSlugs = useSettingsStore((s) => s.favoriteHostedCharacterSlugs)
  const setFavoriteHostedCharacterSlugs = useSettingsStore((s) => s.setFavoriteHostedCharacterSlugs)
  const [hubSection, setHubSection] = useState<'hosted' | 'local' | 'favorites' | 'recent'>('hosted')
  const [hostedDetail, setHostedDetail] = useState<VeniceCharacter | null>(null)
  const detailPanelRef = useRef<HTMLDivElement>(null)

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const debounceRef = useRef<number | null>(null);

  // Debounce typing into the search box. Only commit to the store +
  // re-fetch after the user pauses.
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    void searchCharacters(debouncedQuery);
  }, [debouncedQuery, sortBy, sortOrder, includeAdultCharacters, webEnabledOnly, searchCharacters]);

  useEffect(() => { void loadLocalCards() }, [loadLocalCards])

  const handleChat = (character: VeniceCharacter) => {
    // Resolve the model BEFORE selectCharacter mutates selectedModel,
    // so a user-chosen override in the header dropdown is honoured.
    const effectiveModel = useCharacterStore.getState().getEffectiveModel(character, fallbackModel);
    selectCharacter(character);
    createCharacterConversation(character, effectiveModel);
    setActiveTab("chat");
  };

  const handleSelect = (character: VeniceCharacter) => {
    selectCharacter(character);
  };

  const grouped = useMemo(() => {
    return {
      adult: results.filter((c) => c.adult),
      featured: results.filter((c) => c.featured && !c.adult),
      standard: results.filter((c) => !c.adult && !c.featured),
    };
  }, [results]);

  const localLastUsed = useMemo(() => {
    const out = new Map<string, number>()
    for (const conversation of conversations) {
      const id = conversation.metadata?.character?.localCharacterId
      if (id) out.set(id, Math.max(out.get(id) ?? 0, conversation.updatedAt))
    }
    return out
  }, [conversations])

  const hostedRecentSlugs = useMemo(() => {
    const timestamps = new Map<string, number>()
    for (const conversation of conversations) {
      const slug = conversation.metadata?.character?.slug
      if (slug) timestamps.set(slug, Math.max(timestamps.get(slug) ?? 0, conversation.updatedAt))
    }
    return [...timestamps].sort((a, b) => b[1] - a[1]).map(([slug]) => slug)
  }, [conversations])

  const requestedHostedSlugs = useMemo(() => (
    hubSection === 'favorites'
      ? favoriteHostedCharacterSlugs
      : hubSection === 'recent'
        ? hostedRecentSlugs
        : []
  ), [favoriteHostedCharacterSlugs, hostedRecentSlugs, hubSection])

  useEffect(() => {
    for (const slug of requestedHostedSlugs) {
      if (!results.some((character) => character.slug === slug)) void fetchBySlug(slug)
    }
  }, [fetchBySlug, requestedHostedSlugs, results])

  const visibleHostedCards = requestedHostedSlugs
    .map((slug) => results.find((character) => character.slug === slug))
    .filter((character): character is VeniceCharacter => Boolean(character))

  const visibleLocalCards = useMemo(() => {
    const active = localCards.filter((card) => !card.archivedAt)
    if (hubSection === 'favorites') return active.filter((card) => card.metadata?.favorite === true)
    if (hubSection === 'recent') return active.filter((card) => localLastUsed.has(card.id)).sort((a, b) => (localLastUsed.get(b.id) ?? 0) - (localLastUsed.get(a.id) ?? 0))
    return active
  }, [hubSection, localCards, localLastUsed])

  const toggleHostedFavorite = (character: VeniceCharacter) => {
    const next = favoriteHostedCharacterSlugs.includes(character.slug)
      ? favoriteHostedCharacterSlugs.filter((slug) => slug !== character.slug)
      : [character.slug, ...favoriteHostedCharacterSlugs]
    setFavoriteHostedCharacterSlugs(next)
  }

  const refreshHostedCharacter = async (character: VeniceCharacter) => {
    const refreshed = await fetchBySlug(character.slug)
    if (!refreshed) return
    setHostedDetail((current) => current?.slug === refreshed.slug ? refreshed : current)
    toast.success(`Refreshed ${refreshed.name}`)
  }

  const duplicateHostedCharacter = async (character: VeniceCharacter) => {
    const now = Date.now()
    const saved = await upsertLocalCard({
      schema: 'CharacterCardV1',
      id: crypto.randomUUID(),
      name: `${character.name} Copy`,
      description: character.description || '',
      systemPrompt: '',
      tags: character.tags?.slice(0, 32) ?? [],
      modelId: character.modelId,
      author: character.author,
      adult: character.adult === true,
      exampleDialogues: [],
      firstMessage: character.greeting,
      metadata: { sourceHostedSlug: character.slug },
      createdAt: now,
      updatedAt: now,
    })
    if (saved) toast.success(`Duplicated ${character.name} to Local`)
  }

  const renderHostedCard = (character: VeniceCharacter) => (
    <CharacterCard
      key={character.slug}
      character={character}
      onChat={handleChat}
      onSelect={handleSelect}
      isFavorite={favoriteHostedCharacterSlugs.includes(character.slug)}
      onFavorite={toggleHostedFavorite}
      onDetails={setHostedDetail}
      onRefresh={(item) => void refreshHostedCharacter(item)}
      onDuplicate={(item) => void duplicateHostedCharacter(item)}
    />
  )

  const hostedDetailDialog = hostedDetail ? (
    <AccessibleDialog
      title={hostedDetail.name}
      description={`Hosted Venice character /${hostedDetail.slug}`}
      panelRef={detailPanelRef}
      onClose={() => setHostedDetail(null)}
      headerAction={<button type="button" onClick={() => setHostedDetail(null)} className="rounded border border-border px-2 py-1 text-text-secondary" aria-label="Close character details">Close</button>}
    >
      <div className="space-y-4 overflow-y-auto p-5 text-sm text-text-secondary">
        <div className="flex items-center gap-3"><Avatar character={hostedDetail} /><div><p className="font-semibold text-text-primary">{hostedDetail.name}</p><p>{hostedDetail.author || 'Unknown author'}</p></div></div>
        <p>{hostedDetail.description || 'No description provided.'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toggleHostedFavorite(hostedDetail)} className="rounded border border-border px-3 py-1.5">{favoriteHostedCharacterSlugs.includes(hostedDetail.slug) ? 'Unfavorite' : 'Favorite'}</button>
          <button type="button" onClick={() => void refreshHostedCharacter(hostedDetail)} className="rounded border border-border px-3 py-1.5">Refresh</button>
          <button type="button" onClick={() => void duplicateHostedCharacter(hostedDetail)} className="rounded border border-border px-3 py-1.5">Duplicate locally</button>
        </div>
      </div>
    </AccessibleDialog>
  ) : null

  const hubNav = (
    <nav aria-label="Character sections" className="flex flex-wrap gap-2">
      {(['hosted', 'local', 'favorites', 'recent'] as const).map((section) => (
        <button key={section} type="button" aria-pressed={hubSection === section} onClick={() => setHubSection(section)} className={`rounded-md border px-3 py-1.5 text-[12px] capitalize ${hubSection === section ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'}`}>{section}</button>
      ))}
    </nav>
  )

  if (hubSection !== 'hosted') {
    return (
      <div className="flex h-full flex-col mesh-surface shell-region">
        <div className="flex-none space-y-3 p-5 soft-panel bg-surface/40">
          <div><h2 className="text-[17px] font-semibold text-text-primary">Characters</h2><p className="text-[12.5px] text-text-muted">Hosted and locally authored characters in one hub.</p></div>
          {hubNav}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {visibleHostedCards.length > 0 && (
            <section className="mb-6">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-muted">Hosted</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleHostedCards.map(renderHostedCard)}</div>
            </section>
          )}
          {visibleLocalCards.length > 0 && <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-muted">Local</h3>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleLocalCards.map((card) => {
              const meta = { id: card.id, localCharacterId: card.id, name: card.name, photoUrl: avatarDataUri(card.avatar), modelId: card.modelId }
              return (
                <article key={card.id} className="rounded-xl border border-border p-4 mesh-surface-elevated">
                  <div className="flex gap-3"><CharacterAvatar character={meta} cacheKey={`hub-local-${card.id}`} size="lg" /><div className="min-w-0"><h3 className="truncate font-semibold text-text-primary">{card.name}</h3><span className="text-[11px] uppercase text-accent">Local</span></div></div>
                  <p className="mt-3 line-clamp-3 text-[12.5px] text-text-secondary">{card.description || 'No description'}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{card.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-surface px-2 py-0.5 text-[11px] text-text-muted">{tag}</span>)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                    <button type="button" onClick={() => void startNormalChatForCharacter(card.id)} className="rounded bg-accent px-2 py-1.5 text-accent-fg">Start chat</button>
                    <button type="button" onClick={() => setActiveTab('rp-studio')} className="rounded border border-border px-2 py-1.5 text-text-secondary">Edit</button>
                    <button type="button" onClick={() => void upsertLocalCard({ ...card, id: crypto.randomUUID(), name: `${card.name} Copy`, createdAt: Date.now(), updatedAt: Date.now() })} className="rounded border border-border px-2 py-1.5 text-text-secondary">Duplicate</button>
                    <button type="button" onClick={() => void upsertLocalCard({ ...card, metadata: { ...card.metadata, favorite: card.metadata?.favorite !== true }, updatedAt: Date.now() })} className="rounded border border-border px-2 py-1.5 text-text-secondary">{card.metadata?.favorite === true ? 'Unfavorite' : 'Favorite'}</button>
                    <button type="button" onClick={async () => { if (await askDecision({ title: `Delete ${card.name}?`, detail: 'This removes the locally owned character card.', actionLabel: 'Delete', danger: true })) await removeLocalCard(card.id) }} className="col-span-2 rounded border border-danger/40 px-2 py-1.5 text-danger">Delete local character</button>
                  </div>
                </article>
              )
            })}
          </div>
          {visibleLocalCards.length === 0 && visibleHostedCards.length === 0 && <div className="py-16 text-center text-[13px] text-text-muted">No {hubSection} characters yet.</div>}
        </div>
        {hostedDetailDialog}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full mesh-surface shell-region">
      <div className="flex-none flex flex-col gap-3 p-5 soft-panel z-10 bg-surface/40 backdrop-blur">
        <header>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[17px] font-semibold text-text-primary">Characters</h2>
              <p className="text-[12.5px] text-text-muted mt-0.5">
                Browse characters hosted on Venice.ai and chat using{" "}
                <code className="font-mono text-text-secondary">venice_parameters.character_slug</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[12px] uppercase tracking-wider text-text-muted font-semibold">
                Sort
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CharacterSortBy)}
                className="bg-surface-elevated border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as CharacterSortOrder)}
                className="bg-surface-elevated border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary cursor-pointer"
              >
                {SORT_ORDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="text-[12px] uppercase tracking-wider text-text-muted font-semibold">
                Model
              </label>
              <select
                value={selectedModel ?? ""}
                onChange={(e) => setSelectedModel(e.target.value || null)}
                aria-label="Character chat model"
                data-testid="character-model-select"
                className="bg-surface-elevated border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary cursor-pointer"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>
        {hubNav}

        <div className="flex flex-col gap-3 pt-3 soft-separator-y">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Venice characters…"
            aria-label="Search characters"
            className="w-full bg-surface-elevated border border-border rounded-md px-3 py-2 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors"
          />
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-text-secondary">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAdultCharacters}
                onChange={(e) => setIncludeAdult(e.target.checked)}
                data-testid="character-include-adult"
                className="rounded border-border bg-surface-elevated text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <span>Include adult characters</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webEnabledOnly}
                onChange={(e) => setWebEnabledOnly(e.target.checked)}
                className="rounded border-border bg-surface-elevated text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <span>Web-enabled only</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {error && (
          <div className="mb-4 p-3 rounded-lg border border-danger/30 bg-danger/5 text-[13px] text-danger">
            {error}
          </div>
        )}

        {isLoading && results.length === 0 && (
          <div className="text-center py-12 text-[13px] text-text-muted">Loading characters…</div>
        )}

        {!isLoading && results.length === 0 && !error && (
          <div className="text-center py-12 text-[13px] text-text-muted">
            No characters found. Try clearing the search box or enabling adult characters.
          </div>
        )}

        {grouped.standard.length > 0 && (
          <section className="mb-6">
            <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              Characters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.standard.map(renderHostedCard)}
            </div>
          </section>
        )}

        {grouped.featured.length > 0 && (
          <section className="mb-6">
            <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              Featured
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.featured.map(renderHostedCard)}
            </div>
          </section>
        )}

        {grouped.adult.length > 0 && (
          <section className="mb-6">
            <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              Adult
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.adult.map(renderHostedCard)}
            </div>
          </section>
        )}

        {hasMore && results.length > 0 && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isLoading}
              className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
      {hostedDetailDialog}
    </div>
  );
}
