/** @fileoverview Canonical tab registry. The single source of truth for:
 *   - the `Tab` type union (used by `useSettingsStore`)
 *   - the visible tab order (used by `App.tsx` and `Sidebar.tsx`)
 *   - the grouped sidebar navigation (used by `Sidebar.tsx`)
 *   - keyboard-shortcut numbering (used by `App.tsx`)
 *
 * When you add a new tab:
 *   1. Add a `TabId` literal to `TAB_IDS`.
 *   2. Add an entry to `TAB_REGISTRY` (id, group, lazy?) and its navigation catalog keys.
 *   3. Add the view to `App.tsx` (or extend the lazy loader there).
 *   4. Update `README.md`, user/developer docs, and `docs/summary_of_work.md`.
 *
 * Aliases (e.g. `gallery` → `media`) are preserved as deprecated `TabId`
 * values so that persisted user state in localStorage continues to resolve
 * to the correct view.
 */

export const TAB_IDS = [
  "chat",
  "character-chats",
  "history",
  "image",
  "media",
  "image-inspector",
  "image-editor",
  "prompts",
  "scenes",
  "audio",
  "music",
  "video",
  "embeddings",
  "search",
  "characters",
  "character-creator",
  "rp-studio",
  "workflows",
  "documents",
  "privacy",
  "playground",
  "settings",
  "status",
  // Legacy aliases — kept so persisted `activeTab` from older builds
  // (v1.0.4 and earlier) still resolve to a valid view. New code MUST
  // NOT introduce new aliases.
  "gallery",
  "models",
  "batch",
  "diagnostics",
] as const;

export type TabId = (typeof TAB_IDS)[number];

export type TabGroup = "conversation" | "generate" | "build" | "system";

export interface TabDescriptor {
  /** Stable id used in `activeTab` and persisted settings. */
  id: TabId;
  /** Sidebar group. */
  group: TabGroup;
  /** True if the view is lazy-loaded via `React.lazy`. */
  lazy?: boolean;
  /**
   * Optional legacy id that resolves to this descriptor. The store's
   * `setActiveTab` normalises legacy ids to their canonical target on
   * first activation.
   */
  aliases?: readonly TabId[];
  /** Model selector type if this tab supports select models, otherwise undefined. */
  modelType?: "text" | "image" | "tts" | "music" | "embedding" | "video";
  /** Where the model selector is rendered (defaults to 'header' if modelType is set). */
  modelSelectorOwner?: "header" | "view";
}

export const TAB_REGISTRY: readonly TabDescriptor[] = [
  { id: "chat", group: "conversation", modelType: "text" },
  { id: "character-chats", group: "conversation", modelType: "text" },
  { id: "history", group: "conversation" },
  { id: "image", group: "generate", modelType: "image" },
  { id: "media", group: "generate", aliases: ["gallery"] },
  { id: "image-inspector", group: "generate", lazy: true },
  { id: "image-editor", group: "generate", lazy: true },
  { id: "prompts", group: "generate" },
  { id: "scenes", group: "generate" },
  { id: "audio", group: "generate", modelType: "tts" },
  { id: "music", group: "generate", modelType: "music" },
  {
    id: "video",
    group: "generate",
    modelType: "video",
    modelSelectorOwner: "view",
  },
  { id: "embeddings", group: "generate", modelType: "embedding" },
  { id: "search", group: "generate" },
  { id: "characters", group: "generate" },
  { id: "character-creator", group: "build", lazy: true },
  { id: "rp-studio", group: "build", lazy: true },
  { id: "workflows", group: "build", lazy: true },
  { id: "documents", group: "build", lazy: true },
  { id: "privacy", group: "system" },
  { id: "playground", group: "build", lazy: true },
  { id: "settings", group: "system" },
  { id: "status", group: "system" },
] as const;

export const TAB_ID_SET: ReadonlySet<TabId> = new Set(TAB_IDS);

/** True iff `id` is a known tab id (including legacy aliases). */
export function isTabId(id: string | null | undefined): id is TabId {
  return !!id && TAB_ID_SET.has(id as TabId);
}

/** Resolve a tab id (or legacy alias) to its canonical descriptor, or null. */
export function resolveTab(
  id: string | null | undefined,
): TabDescriptor | null {
  if (!id) return null;
  const direct = TAB_REGISTRY.find((t) => t.id === id);
  if (direct) return direct;
  return TAB_REGISTRY.find((t) => t.aliases?.includes(id as TabId)) ?? null;
}

/**
 * Normalise a tab id (resolving legacy aliases) and return the canonical id.
 * Returns `'chat'` as the safe fallback for unknown / null values.
 */
export function normaliseTab(id: string | null | undefined): TabId {
  const resolved = resolveTab(id);
  if (
    resolved &&
    resolved.id !== id &&
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development"
  ) {
    console.warn(
      `[tabs] Deprecation warning: tab alias '${id}' used. Please migrate to the canonical id '${resolved.id}'.`,
    );
  }
  return resolved?.id ?? "chat";
}

/** Ordered list of canonical (non-alias) tab ids. Used for ⌘1..N navigation. */
export const CANONICAL_TAB_ORDER: readonly TabId[] = TAB_REGISTRY.map(
  (t) => t.id,
);

/** Sidebar groups in display order. */
export const TAB_GROUP_LABELS: Record<TabGroup, string> = {
  conversation: "Conversation",
  generate: "Generate",
  build: "Build",
  system: "System",
};
