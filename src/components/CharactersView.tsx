import { translateRuntime } from "../i18n/runtimeTranslator";
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
import { useCharacterCardStore } from "../stores/character-card-store";
import { startNormalChatForCharacter } from "../services/rpHelpers";
import { avatarDataUri } from "./rp-studio/_shared";
import { CharacterAvatar } from "./characters/CharacterAvatar";
import { createBlankCharacterCardDraft } from "../services/characterCards/characterCardStudioHandoff";
import { desktopCharacterCards } from "../services/desktopBridge";
import { validateCharacterCardAuthoring } from "../types/character-card-spec";
import { askDecision } from "./ui/modal-requests";
import { AccessibleDialog } from "./ui/AccessibleDialog";
import { toast } from "../stores/toast-store";
import { Trans, useTranslation } from "react-i18next";

const SORT_OPTIONS: Array<{ value: CharacterSortBy; label: string }> = [
  {
    value: "featured",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.featured",
        "Featured",
      );
    },
  },
  {
    value: "imports",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.mostImported",
        "Most Imported",
      );
    },
  },
  {
    value: "highestRating",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.highestRated",
        "Highest Rated",
      );
    },
  },
  {
    value: "highlyRated",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.highlyRated",
        "Highly Rated",
      );
    },
  },
  {
    value: "highlyRatedAndRecent",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.highlyRatedRecent",
        "Highly Rated & Recent",
      );
    },
  },
  {
    value: "mostRecent",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.mostRecent",
        "Most Recent",
      );
    },
  },
  {
    value: "ratingCount",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.charactersview.metadata.mostRated",
        "Most Rated",
      );
    },
  },
];

const SORT_ORDER_OPTIONS: Array<{ value: CharacterSortOrder; label: string }> =
  [
    {
      value: "desc",
      get label() {
        return translateRuntime(
          "runtimeGenerated.components.charactersview.metadata.descending",
          "Descending",
        );
      },
    },
    {
      value: "asc",
      get label() {
        return translateRuntime(
          "runtimeGenerated.components.charactersview.metadata.ascending",
          "Ascending",
        );
      },
    },
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
      className="h-16 w-16 rounded-full bg-vf-panel-bg-raised border border-vf-panel-border flex items-center justify-center overflow-hidden text-text-secondary text-[18px] font-semibold shrink-0"
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
  const { t: tRuntime } = useTranslation("common");
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-vf-panel-border soft-panel p-4 shadow-sm hover:border-accent/40 transition-colors"
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
                title={tRuntime(
                  "runtimeGenerated.components.charactersview.attribute.adultCharacter",
                )}
              >
                18+
              </span>
            )}
            {character.featured && (
              <span className="text-[12px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-semibold uppercase tracking-wider">
                <Trans i18nKey="common:surface.componentsCharactersview.text.featured" />
              </span>
            )}
          </div>
          <div className="text-[12px] text-text-muted font-mono">
            /{character.slug}
          </div>
          {character.modelId && (
            <div className="text-[12px] text-text-secondary mt-1">
              <Trans i18nKey="common:surface.componentsCharactersview.text.model" />{" "}
              <span className="font-mono">{character.modelId}</span>
            </div>
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
              className="text-[12px] px-2 py-0.5 rounded-full bg-vf-panel-bg border border-vf-panel-border text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {(character.stats?.averageRating !== undefined ||
        character.stats?.imports !== undefined) && (
        <div className="flex items-center gap-3 text-[12px] text-text-muted">
          {character.stats?.averageRating !== undefined && (
            <span
              title={tRuntime(
                "runtimeGenerated.components.charactersview.attribute.averageRating",
              )}
            >
              ★ {character.stats.averageRating.toFixed(2)}
            </span>
          )}
          {character.stats?.ratingCount !== undefined && (
            <span
              title={tRuntime(
                "runtimeGenerated.components.charactersview.attribute.ratingCount",
              )}
            >
              {character.stats.ratingCount.toLocaleString()}{" "}
              <Trans i18nKey="common:surface.componentsCharactersview.text.ratings" />
            </span>
          )}
          {character.stats?.imports !== undefined && (
            <span
              title={tRuntime(
                "runtimeGenerated.components.charactersview.attribute.totalImports",
              )}
            >
              {character.stats.imports.toLocaleString()}{" "}
              <Trans i18nKey="common:surface.componentsCharactersview.text.imports" />
            </span>
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
          <Trans i18nKey="common:surface.componentsCharactersview.action.chat" />
        </button>
        <button
          type="button"
          onClick={() => onSelect(character)}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
        >
          <Trans i18nKey="common:surface.componentsCharactersview.action.select" />
        </button>
        {character.shareUrl && (
          <a
            href={character.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
            title={tRuntime(
              "runtimeGenerated.components.charactersview.attribute.openOnVenice",
            )}
          >
            <Trans i18nKey="common:surface.componentsCharactersview.text.venice" />
          </a>
        )}
      </div>
      {(onFavorite || onDetails || onRefresh || onDuplicate) && (
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          {onFavorite && (
            <button
              type="button"
              onClick={() => onFavorite(character)}
              className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
            >
              {isFavorite
                ? tRuntime(
                    "runtimeGenerated.components.charactersview.text.unfavorite",
                  )
                : tRuntime(
                    "runtimeGenerated.components.charactersview.text.favorite",
                  )}
            </button>
          )}
          {onDetails && (
            <button
              type="button"
              onClick={() => onDetails(character)}
              className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
            >
              <Trans i18nKey="common:surface.componentsCharactersview.action.details" />
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh(character)}
              className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
            >
              <Trans i18nKey="common:surface.componentsCharactersview.action.refresh" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={() => onDuplicate(character)}
              className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
            >
              <Trans i18nKey="common:surface.componentsCharactersview.action.duplicateLocally" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function CharactersView() {
  const { t: tRuntime } = useTranslation("common");
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

  const createCharacterConversation = useChatStore(
    (s) => s.createCharacterConversation,
  );
  const setActiveTab = useSettingsStore((s) => s.setActiveTab);
  const fallbackModel =
    useSettingsStore((s) => s.selectedModels.chat) || DEFAULT_CHAT_MODEL;
  const localCards = useCharacterCardStore((s) => s.cards);
  const loadLocalCards = useCharacterCardStore((s) => s.load);
  const upsertLocalCard = useCharacterCardStore((s) => s.upsert);
  const removeLocalCard = useCharacterCardStore((s) => s.remove);
  const conversations = useChatStore((s) => s.conversations);
  const favoriteHostedCharacterSlugs = useSettingsStore(
    (s) => s.favoriteHostedCharacterSlugs,
  );
  const setFavoriteHostedCharacterSlugs = useSettingsStore(
    (s) => s.setFavoriteHostedCharacterSlugs,
  );
  const [hubSection, setHubSection] = useState<
    "hosted" | "local" | "favorites" | "recent"
  >("hosted");
  const [hostedDetail, setHostedDetail] = useState<VeniceCharacter | null>(
    null,
  );
  const detailPanelRef = useRef<HTMLDivElement>(null);

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
      if (debounceRef.current !== null)
        window.clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    void searchCharacters(debouncedQuery);
  }, [
    debouncedQuery,
    sortBy,
    sortOrder,
    includeAdultCharacters,
    webEnabledOnly,
    searchCharacters,
  ]);

  useEffect(() => {
    void loadLocalCards();
  }, [loadLocalCards]);

  const handleChat = (character: VeniceCharacter) => {
    // Resolve the model BEFORE selectCharacter mutates selectedModel,
    // so a user-chosen override in the header dropdown is honoured.
    const effectiveModel = useCharacterStore
      .getState()
      .getEffectiveModel(character, fallbackModel);
    selectCharacter(character);
    createCharacterConversation(character, effectiveModel);
    setActiveTab("character-chats");
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
    const out = new Map<string, number>();
    for (const conversation of conversations) {
      const id = conversation.metadata?.character?.localCharacterId;
      if (id) out.set(id, Math.max(out.get(id) ?? 0, conversation.updatedAt));
    }
    return out;
  }, [conversations]);

  const hostedRecentSlugs = useMemo(() => {
    const timestamps = new Map<string, number>();
    for (const conversation of conversations) {
      const slug = conversation.metadata?.character?.slug;
      if (slug)
        timestamps.set(
          slug,
          Math.max(timestamps.get(slug) ?? 0, conversation.updatedAt),
        );
    }
    return [...timestamps].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
  }, [conversations]);

  const requestedHostedSlugs = useMemo(
    () =>
      hubSection === "favorites"
        ? favoriteHostedCharacterSlugs
        : hubSection === "recent"
          ? hostedRecentSlugs
          : [],
    [favoriteHostedCharacterSlugs, hostedRecentSlugs, hubSection],
  );

  useEffect(() => {
    for (const slug of requestedHostedSlugs) {
      if (!results.some((character) => character.slug === slug))
        void fetchBySlug(slug);
    }
  }, [fetchBySlug, requestedHostedSlugs, results]);

  const visibleHostedCards = requestedHostedSlugs
    .map((slug) => results.find((character) => character.slug === slug))
    .filter((character): character is VeniceCharacter => Boolean(character));

  const visibleLocalCards = useMemo(() => {
    const active = localCards.filter((card) => !card.archivedAt);
    const query = debouncedQuery.trim().toLowerCase();
    let filtered = active;
    if (query) {
      filtered = filtered.filter(
        (card) =>
          card.name.toLowerCase().includes(query) ||
          (card.description &&
            card.description.toLowerCase().includes(query)) ||
          card.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }
    if (hubSection === "favorites")
      return filtered.filter((card) => card.metadata?.favorite === true);
    if (hubSection === "recent")
      return filtered
        .filter((card) => localLastUsed.has(card.id))
        .sort(
          (a, b) =>
            (localLastUsed.get(b.id) ?? 0) - (localLastUsed.get(a.id) ?? 0),
        );
    return filtered;
  }, [debouncedQuery, hubSection, localCards, localLastUsed]);

  const toggleHostedFavorite = (character: VeniceCharacter) => {
    const next = favoriteHostedCharacterSlugs.includes(character.slug)
      ? favoriteHostedCharacterSlugs.filter((slug) => slug !== character.slug)
      : [character.slug, ...favoriteHostedCharacterSlugs];
    setFavoriteHostedCharacterSlugs(next);
  };

  const refreshHostedCharacter = async (character: VeniceCharacter) => {
    const refreshed = await fetchBySlug(character.slug);
    if (!refreshed) return;
    setHostedDetail((current) =>
      current?.slug === refreshed.slug ? refreshed : current,
    );
    toast.success(
      tRuntime(
        "runtimeGenerated.components.charactersview.notification.refreshedValue1",
        { value1: refreshed.name },
      ),
    );
  };

  const duplicateHostedCharacter = async (character: VeniceCharacter) => {
    const now = Date.now();
    const saved = await upsertLocalCard({
      schema: "CharacterCardV1",
      id: crypto.randomUUID(),
      name: `${character.name} Copy`,
      description: character.description || "",
      systemPrompt: "",
      tags: character.tags?.slice(0, 32) ?? [],
      modelId: character.modelId,
      author: character.author,
      adult: character.adult === true,
      exampleDialogues: [],
      firstMessage: character.greeting,
      metadata: { sourceHostedSlug: character.slug },
      createdAt: now,
      updatedAt: now,
    });
    if (saved)
      toast.success(
        tRuntime(
          "runtimeGenerated.components.charactersview.notification.duplicatedValue1ToLocal",
          { value1: character.name },
        ),
      );
  };

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
  );

  const renderLocalCard = (card: import("../types/rp").CharacterCardV1) => {
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
        className="rounded-xl border border-vf-panel-border p-4"
      >
        <div className="flex gap-3">
          <CharacterAvatar
            character={meta}
            cacheKey={`hub-local-${card.id}`}
            size="lg"
          />
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-text-primary">
              {card.name}
            </h3>
            <div className="flex flex-wrap gap-1">
              <span className="text-[11px] uppercase text-accent">
                {card.sourceFormat === "tavern-v1-json"
                  ? tRuntime(
                      "runtimeGenerated.components.charactersview.text.v1Imported",
                    )
                  : card.sourceFormat === "card-v2-json"
                    ? tRuntime(
                        "runtimeGenerated.components.charactersview.text.v2Json",
                      )
                    : card.sourceFormat === "card-v2-png"
                      ? tRuntime(
                          "runtimeGenerated.components.charactersview.text.v2Png",
                        )
                      : tRuntime(
                          "runtimeGenerated.components.charactersview.text.vfNative",
                        )}
              </span>
              {validateCharacterCardAuthoring(card).length > 0 && (
                <span className="text-[11px] uppercase text-warning">
                  <Trans i18nKey="common:surface.componentsCharactersview.text.needsValidation" />
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 line-clamp-3 text-[12.5px] text-text-secondary">
          {card.description ||
            tRuntime(
              "runtimeGenerated.components.charactersview.text.noDescription",
            )}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {card.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-vf-panel-bg px-2 py-0.5 text-[11px] text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => void startNormalChatForCharacter(card.id)}
            className="rounded bg-accent px-2 py-1.5 text-accent-fg"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.startChat" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rp-studio")}
            className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.edit" />
          </button>
          <button
            type="button"
            onClick={() =>
              void upsertLocalCard({
                ...card,
                id: crypto.randomUUID(),
                name: `${card.name} Copy`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
            }
            className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.duplicate" />
          </button>
          <button
            type="button"
            onClick={() =>
              void upsertLocalCard({
                ...card,
                metadata: {
                  ...card.metadata,
                  favorite: card.metadata?.favorite !== true,
                },
                updatedAt: Date.now(),
              })
            }
            className="rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
          >
            {card.metadata?.favorite === true
              ? tRuntime(
                  "runtimeGenerated.components.charactersview.text.unfavorite",
                )
              : tRuntime(
                  "runtimeGenerated.components.charactersview.text.favorite",
                )}
          </button>
          <button
            type="button"
            onClick={async () => {
              const result = await desktopCharacterCards.exportJson({
                cardId: card.id,
                profile: "standard",
              });
              if (!result.ok)
                toast.error(
                  result.error ??
                    tRuntime(
                      "runtimeGenerated.components.charactersview.notification.exportFailed",
                    ),
                );
            }}
            className="col-span-2 rounded border border-vf-panel-border px-2 py-1.5 text-text-secondary"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.exportStCardJson" />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (
                await askDecision({
                  title: tRuntime(
                    "runtimeGenerated.components.charactersview.metadata.deleteValue1",
                    { value1: card.name },
                  ),
                  detail: "This removes the locally owned character card.",
                  actionLabel: "Delete",
                  danger: true,
                })
              )
                await removeLocalCard(card.id);
            }}
            className="col-span-2 rounded border border-danger/40 px-2 py-1.5 text-danger"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.deleteLocalCharacter" />
          </button>
        </div>
      </article>
    );
  };

  const hostedDetailDialog = hostedDetail ? (
    <AccessibleDialog
      title={hostedDetail.name}
      description={`Hosted Venice character /${hostedDetail.slug}`}
      panelRef={detailPanelRef}
      onClose={() => setHostedDetail(null)}
      headerAction={
        <button
          type="button"
          onClick={() => setHostedDetail(null)}
          className="rounded border border-vf-panel-border px-2 py-1 text-text-secondary"
          aria-label={tRuntime(
            "runtimeGenerated.components.charactersview.attribute.closeCharacterDetails",
          )}
        >
          <Trans i18nKey="common:surface.componentsCharactersview.action.close" />
        </button>
      }
    >
      <div className="space-y-4 overflow-y-auto p-5 text-sm text-text-secondary">
        <div className="flex items-center gap-3">
          <Avatar character={hostedDetail} />
          <div>
            <p className="font-semibold text-text-primary">
              {hostedDetail.name}
            </p>
            <p>
              {hostedDetail.author ||
                tRuntime(
                  "runtimeGenerated.components.charactersview.text.unknownAuthor",
                )}
            </p>
          </div>
        </div>
        <p>
          {hostedDetail.description ||
            tRuntime(
              "runtimeGenerated.components.charactersview.text.noDescriptionProvided",
            )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleHostedFavorite(hostedDetail)}
            className="rounded border border-vf-panel-border px-3 py-1.5"
          >
            {favoriteHostedCharacterSlugs.includes(hostedDetail.slug)
              ? tRuntime(
                  "runtimeGenerated.components.charactersview.text.unfavorite",
                )
              : tRuntime(
                  "runtimeGenerated.components.charactersview.text.favorite",
                )}
          </button>
          <button
            type="button"
            onClick={() => void refreshHostedCharacter(hostedDetail)}
            className="rounded border border-vf-panel-border px-3 py-1.5"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.refresh" />
          </button>
          <button
            type="button"
            onClick={() => void duplicateHostedCharacter(hostedDetail)}
            className="rounded border border-vf-panel-border px-3 py-1.5"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.duplicateLocally" />
          </button>
        </div>
      </div>
    </AccessibleDialog>
  ) : null;

  const hubNav = (
    <nav
      aria-label={tRuntime(
        "runtimeGenerated.components.charactersview.attribute.characterSections",
      )}
      className="flex flex-wrap gap-2"
    >
      {(["hosted", "local", "favorites", "recent"] as const).map((section) => (
        <button
          key={section}
          type="button"
          aria-pressed={hubSection === section}
          onClick={() => setHubSection(section)}
          className={`rounded-md border px-3 py-1.5 text-[12px] capitalize ${hubSection === section ? "border-accent bg-accent/10 text-accent" : "border-vf-panel-border text-text-secondary"}`}
        >
          {section}
        </button>
      ))}
    </nav>
  );

  const showHosted =
    hubSection === "hosted" ||
    hubSection === "favorites" ||
    hubSection === "recent";
  const showLocal =
    hubSection === "local" ||
    hubSection === "hosted" ||
    hubSection === "favorites" ||
    hubSection === "recent";
  const hostedList = hubSection === "hosted" ? results : visibleHostedCards;

  return (
    <div className="flex flex-col h-full shell-region">
      <div className="flex-none flex flex-col gap-3 p-5 soft-panel z-10 bg-vf-panel-bg backdrop-blur">
        <header>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[17px] font-semibold text-text-primary">
                <Trans i18nKey="common:surface.componentsCharactersview.heading.characters" />
              </h2>
              <p className="text-[12.5px] text-text-muted mt-0.5">
                <Trans i18nKey="common:surface.componentsCharactersview.description.browseHostedAndLocallyAuthoredCharactersIn" />
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[12px] uppercase tracking-wider text-text-muted font-semibold">
                <Trans i18nKey="common:surface.componentsCharactersview.label.sort" />
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CharacterSortBy)}
                className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as CharacterSortOrder)
                }
                className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary cursor-pointer"
              >
                {SORT_ORDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="text-[12px] uppercase tracking-wider text-text-muted font-semibold">
                <Trans i18nKey="common:surface.componentsCharactersview.label.model" />
              </label>
              <select
                value={selectedModel ?? ""}
                onChange={(e) => setSelectedModel(e.target.value || null)}
                aria-label={tRuntime(
                  "runtimeGenerated.components.charactersview.attribute.characterChatModel",
                )}
                data-testid="character-model-select"
                className="bg-vf-panel-bg-raised border border-vf-panel-border rounded-md px-2 py-1 text-[12.5px] text-text-primary cursor-pointer"
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

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={async () => {
              await createBlankCharacterCardDraft();
              setActiveTab("rp-studio");
            }}
            className="rounded bg-accent px-3 py-1.5 text-[12px] text-accent-fg font-medium"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.createStCard" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("rp-studio");
              toast.info(
                "Use Import card in the Character Library to review the mandatory preview.",
              );
            }}
            className="rounded border border-vf-panel-border px-3 py-1.5 text-[12px] text-text-secondary"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.importStCard" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("rp-studio");
              toast.info("Open Drafts in the Character Library.");
            }}
            className="rounded border border-vf-panel-border px-3 py-1.5 text-[12px] text-text-secondary"
          >
            <Trans i18nKey="common:surface.componentsCharactersview.action.drafts" />
          </button>
        </div>

        <div className="flex flex-col gap-3 pt-3 border-vf-panel-border">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tRuntime(
              "runtimeGenerated.components.charactersview.attribute.searchCharacters",
            )}
            aria-label={tRuntime(
              "runtimeGenerated.components.charactersview.attribute.searchCharacters2",
            )}
            className="w-full bg-vf-panel-bg-raised border border-vf-panel-border rounded-md px-3 py-2 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors"
          />
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-text-secondary">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAdultCharacters}
                onChange={(e) => setIncludeAdult(e.target.checked)}
                data-testid="character-include-adult"
                className="rounded border-vf-panel-border bg-vf-panel-bg-raised text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <span>
                <Trans i18nKey="common:surface.componentsCharactersview.text.includeAdultCharacters" />
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webEnabledOnly}
                onChange={(e) => setWebEnabledOnly(e.target.checked)}
                className="rounded border-vf-panel-border bg-vf-panel-bg-raised text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <span>
                <Trans i18nKey="common:surface.componentsCharactersview.text.webEnabledOnly" />
              </span>
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

        {isLoading && results.length === 0 && localCards.length === 0 && (
          <div className="text-center py-12 text-[13px] text-text-muted">
            <Trans i18nKey="common:surface.componentsCharactersview.text.loadingCharacters" />
          </div>
        )}

        {showLocal && visibleLocalCards.length > 0 && (
          <section className="mb-6">
            <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
              <Trans i18nKey="common:surface.componentsCharactersview.heading.local" />
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleLocalCards.map(renderLocalCard)}
            </div>
          </section>
        )}

        {showHosted && hubSection === "hosted" && (
          <>
            {grouped.standard.length > 0 && (
              <section className="mb-6">
                <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
                  <Trans i18nKey="common:surface.componentsCharactersview.heading.characters" />
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped.standard.map(renderHostedCard)}
                </div>
              </section>
            )}

            {grouped.featured.length > 0 && (
              <section className="mb-6">
                <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
                  <Trans i18nKey="common:surface.componentsCharactersview.heading.featured" />
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped.featured.map(renderHostedCard)}
                </div>
              </section>
            )}

            {grouped.adult.length > 0 && (
              <section className="mb-6">
                <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
                  <Trans i18nKey="common:surface.componentsCharactersview.heading.adult" />
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped.adult.map(renderHostedCard)}
                </div>
              </section>
            )}
          </>
        )}

        {showHosted &&
          hubSection !== "hosted" &&
          visibleHostedCards.length > 0 && (
            <section className="mb-6">
              <h3 className="text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold mb-3">
                <Trans i18nKey="common:surface.componentsCharactersview.heading.hosted" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleHostedCards.map(renderHostedCard)}
              </div>
            </section>
          )}

        {!isLoading &&
          visibleLocalCards.length === 0 &&
          hostedList.length === 0 &&
          !error && (
            <div className="text-center py-12 text-[13px] text-text-muted">
              <Trans i18nKey="common:surface.componentsCharactersview.text.noCharactersFoundTryClearingTheSearch" />
            </div>
          )}

        {hasMore && hubSection === "hosted" && results.length > 0 && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={isLoading}
              className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium bg-vf-panel-bg-raised border border-vf-panel-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading
                ? tRuntime(
                    "runtimeGenerated.components.charactersview.text.loading",
                  )
                : tRuntime(
                    "runtimeGenerated.components.charactersview.text.loadMore",
                  )}
            </button>
          </div>
        )}
      </div>
      {hostedDetailDialog}
    </div>
  );
}
