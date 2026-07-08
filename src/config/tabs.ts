/** @fileoverview Canonical tab registry. The single source of truth for:
 *   - the `Tab` type union (used by `useSettingsStore`)
 *   - the visible tab order (used by `App.tsx` and `Sidebar.tsx`)
 *   - the grouped sidebar navigation (used by `Sidebar.tsx`)
 *   - keyboard-shortcut numbering (used by `App.tsx`)
 *
 * When you add a new tab:
 *   1. Add a `TabId` literal to `TAB_IDS`.
 *   2. Add an entry to `TAB_REGISTRY` (id, label, group, lazy?).
 *   3. Add the view to `App.tsx` (or extend the lazy loader there).
 *   4. Update `README.md` and `CHANGELOG.md`.
 *
 * Aliases (e.g. `gallery` → `media`) are preserved as deprecated `TabId`
 * values so that persisted user state in localStorage continues to resolve
 * to the correct view.
 */

export const TAB_IDS = [
  'chat',
  'history',
  'image',
  'media',
  'prompts',
  'scenes',
  'audio',
  'music',
  'video',
  'embeddings',
  'search',
  'characters',
  'rp-studio',
  'workflows',
  'privacy',
  'playground',
  'settings',
  'status',
  // Legacy aliases — kept so persisted `activeTab` from older builds
  // (v1.0.4 and earlier) still resolve to a valid view. New code MUST
  // NOT introduce new aliases.
  'gallery',
  'models',
  'batch',
  'diagnostics',
] as const;

export type TabId = (typeof TAB_IDS)[number];

export type TabGroup = 'conversation' | 'generate' | 'build' | 'system';

export interface TabDescriptor {
  /** Stable id used in `activeTab` and persisted settings. */
  id: TabId;
  /** Visible label in the sidebar / chrome. */
  label: string;
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
  /** Subtitle for the page header. */
  subtitle?: string;
  /** Model selector type if this tab supports select models, otherwise undefined. */
  modelType?: 'text' | 'image' | 'tts' | 'music' | 'embedding' | 'video';
}

export const TAB_REGISTRY: readonly TabDescriptor[] = [
  { id: 'chat', label: 'Chat', group: 'conversation', subtitle: 'Conversational AI', modelType: 'text' },
  { id: 'history', label: 'History', group: 'conversation', subtitle: 'Browse past conversations' },
  { id: 'image', label: 'Image Studio', group: 'generate', subtitle: 'Generate images from text', modelType: 'image' },
  { id: 'media', label: 'Media Studio', group: 'generate', aliases: ['gallery'], subtitle: 'Browse, tag, edit, and export your generated media' },
  { id: 'prompts', label: 'Prompts', group: 'generate', subtitle: 'Browse and manage your prompt library' },
  { id: 'scenes', label: 'Scene Composer', group: 'generate', subtitle: 'Compose complex image generation scenes' },
  { id: 'audio', label: 'Audio Studio', group: 'generate', subtitle: 'Text-to-speech and transcription', modelType: 'tts' },
  { id: 'music', label: 'Music Studio', group: 'generate', subtitle: 'Generate music and sound', modelType: 'music' },
  { id: 'video', label: 'Video Studio', group: 'generate', subtitle: 'Generate video clips', modelType: 'video' },
  { id: 'embeddings', label: 'Embeddings', group: 'generate', subtitle: 'Vector representations of text', modelType: 'embedding' },
  { id: 'search', label: 'Research', group: 'generate', subtitle: 'Deep research and web scraping' },
  { id: 'characters', label: 'Characters', group: 'generate', subtitle: 'Configure roleplay characters' },
  { id: 'rp-studio', label: 'RP Studio', group: 'build', lazy: true, subtitle: 'Roleplay character and scenario workshop' },
  { id: 'workflows', label: 'Workflows', group: 'build', lazy: true, subtitle: 'Chain models visually' },
  { id: 'privacy', label: 'Privacy', group: 'system', subtitle: 'Manage storage and privacy settings' },
  { id: 'playground', label: 'Playground', group: 'build', lazy: true, subtitle: 'Build workflows by chatting' },
  { id: 'settings', label: 'Config', group: 'system', subtitle: 'App configuration' },
  { id: 'status', label: 'Status', group: 'system', subtitle: 'App status and diagnostics' },
] as const;

export const TAB_ID_SET: ReadonlySet<TabId> = new Set(TAB_IDS);

/** True iff `id` is a known tab id (including legacy aliases). */
export function isTabId(id: string | null | undefined): id is TabId {
  return !!id && TAB_ID_SET.has(id as TabId);
}

/** Resolve a tab id (or legacy alias) to its canonical descriptor, or null. */
export function resolveTab(id: string | null | undefined): TabDescriptor | null {
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
  if (resolved && resolved.id !== id && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.warn(`[tabs] Deprecation warning: tab alias '${id}' used. Please migrate to the canonical id '${resolved.id}'.`);
  }
  return resolved?.id ?? 'chat';
}

/** Ordered list of canonical (non-alias) tab ids. Used for ⌘1..N navigation. */
export const CANONICAL_TAB_ORDER: readonly TabId[] = TAB_REGISTRY.map((t) => t.id);

/** Sidebar groups in display order. */
export const TAB_GROUP_LABELS: Record<TabGroup, string> = {
  conversation: 'Conversation',
  generate: 'Generate',
  build: 'Build',
  system: 'System',
};
