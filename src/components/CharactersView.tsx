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
import { resolveCharacterImageUrl, avatarFallback } from "../utils/characterImageResolver";
import type {
  CharacterSortBy,
  CharacterSortOrder,
  VeniceCharacter,
} from "../types/characters";

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

function Avatar({ character, size = 64 }: { character: VeniceCharacter; size?: number }) {
  const [errored, setErrored] = useState(false);
  const resolvedUrl = resolveCharacterImageUrl(character);
  const showImage = !!resolvedUrl && !errored;
  const dim = `${size}px`;
  return (
    <div
      className="rounded-full bg-surface-elevated border border-border flex items-center justify-center overflow-hidden text-text-secondary text-[18px] font-semibold shrink-0"
      style={{ width: dim, height: dim }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={resolvedUrl!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{avatarFallback(character.name)}</span>
      )}
    </div>
  );
}

function CharacterCard({
  character,
  onChat,
  onSelect,
}: {
  character: VeniceCharacter;
  onChat: (character: VeniceCharacter) => void;
  onSelect: (character: VeniceCharacter) => void;
}) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-sm hover:border-accent/40 transition-colors"
      data-testid="character-card"
      data-character-slug={character.slug}
    >
      <div className="flex items-start gap-3">
        <Avatar character={character} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-text-primary truncate">
              {character.name}
            </h3>
            {character.adult && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30 font-semibold uppercase tracking-wider"
                title="Adult character"
              >
                18+
              </span>
            )}
            {character.featured && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-semibold uppercase tracking-wider">
                Featured
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-text-muted font-mono">/{character.slug}</div>
          {character.modelId && (
            <div className="text-[11px] text-text-secondary mt-1">Model: <span className="font-mono">{character.modelId}</span></div>
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
              className="text-[10.5px] px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {(character.stats?.averageRating !== undefined || character.stats?.imports !== undefined) && (
        <div className="flex items-center gap-3 text-[11.5px] text-text-muted">
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
    hasMore,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setIncludeAdult,
    setWebEnabledOnly,
    searchCharacters,
    loadMore,
    selectCharacter,
  } = useCharacterStore();

  const createCharacterConversation = useChatStore((s) => s.createCharacterConversation);
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const fallbackModel = useSettingsStore((s) => s.selectedModels.chat) || "llama-3.3-70b";

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

  const handleChat = (character: VeniceCharacter) => {
    selectCharacter(character);
    createCharacterConversation(character, fallbackModel);
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

  return (
    <div className="flex flex-col h-full bg-surface">
      <header className="flex-none p-5 border-b border-border bg-surface">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">Venice Characters</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              Browse characters hosted on Venice.ai and chat using{" "}
              <code className="font-mono text-text-secondary">venice_parameters.character_slug</code>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11.5px] uppercase tracking-wider text-text-muted font-semibold">
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
          </div>
        </div>
      </header>

      <div className="flex-none p-4 border-b border-border bg-surface flex flex-col gap-3">
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
            <h3 className="text-[11.5px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              Characters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.standard.map((c) => (
                <CharacterCard key={c.slug} character={c} onChat={handleChat} onSelect={handleSelect} />
              ))}
            </div>
          </section>
        )}

        {grouped.featured.length > 0 && (
          <section className="mb-6">
            <h3 className="text-[11.5px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              Featured
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.featured.map((c) => (
                <CharacterCard key={c.slug} character={c} onChat={handleChat} onSelect={handleSelect} />
              ))}
            </div>
          </section>
        )}

        {grouped.adult.length > 0 && (
          <section className="mb-6">
            <h3 className="text-[11.5px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              Adult
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.adult.map((c) => (
                <CharacterCard key={c.slug} character={c} onChat={handleChat} onSelect={handleSelect} />
              ))}
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
    </div>
  );
}
