import { PROMPT_STARTERS, type PromptStarter, type PromptStarterCategory } from "../data/promptStarters";

// Remote config scaffolding (disabled by default)
export const ENABLE_REMOTE_PROMPT_STARTERS = false;
export const REMOTE_PROMPT_STARTERS_URL = "";

let cachedPromptStarters: PromptStarter[] = PROMPT_STARTERS;

const RECENT_KEY = "venice-forge.recentPromptStarterIds";

let memoryStorage: Record<string, string> = {};

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      return localStorage;
    }
  } catch {
    // localStorage unavailable in this environment
  }
  return {
    getItem: (key: string) => memoryStorage[key] || null,
    setItem: (key: string, value: string) => { memoryStorage[key] = value; },
    removeItem: (key: string) => { delete memoryStorage[key]; },
    clear: () => { memoryStorage = {}; },
    get length() { return Object.keys(memoryStorage).length; },
    key: (index: number) => Object.keys(memoryStorage)[index] || null,
  };
}

function getRecentIds(): string[] {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(RECENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === "string");
        }
      }
    }
  } catch {
    // Ignore storage errors silently
  }
  return [];
}

function saveRecentIds(ids: string[]): void {
  try {
    const storage = getStorage();
    if (storage) {
      // Store up to 32 recent IDs
      storage.setItem(RECENT_KEY, JSON.stringify(ids.slice(-32)));
    }
  } catch {
    // Ignore storage errors silently
  }
}

function getRandomIndex(max: number): number {
  if (max <= 0) return 0;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

function isValidPromptStarter(item: unknown): item is PromptStarter {
  const i = item as Record<string, unknown>;
  return (
    Boolean(i) &&
    typeof i["id"] === "string" &&
    typeof i["prompt"] === "string" &&
    ["writing", "coding", "learning", "research", "creative", "productivity", "analysis", "image", "audio", "music", "embeddings"].includes(i["category"] as string)
  );
}

/**
 * Scaffolding to fetch remote prompt starters if enabled.
 * Does not block startup, fails silently and falls back to local data.
 */
export async function fetchRemotePromptStarters(): Promise<void> {
  if (!ENABLE_REMOTE_PROMPT_STARTERS || !REMOTE_PROMPT_STARTERS_URL) {
    return;
  }
  try {
    const res = await fetch(REMOTE_PROMPT_STARTERS_URL);
    if (!res.ok) throw new Error("Failed to fetch remote prompt starters");
    const data = await res.json();
    if (Array.isArray(data) && data.every(isValidPromptStarter)) {
      cachedPromptStarters = data;
    }
  } catch {
    // Fail silently, preserving cachedPromptStarters (bundled prompts)
  }
}

/**
 * Returns exactly 4 prompts (or requested count), preferring different categories when possible.
 * Excludes recently shown IDs based on localStorage tracking.
 */
export function getBalancedPromptStarters(count = 4): PromptStarter[] {
  const recentIds = getRecentIds();
  const chatCategories: PromptStarterCategory[] = ["writing", "coding", "learning", "research", "creative", "productivity", "analysis"];
  const chatStarters = cachedPromptStarters.filter((p) => chatCategories.includes(p.category));
  let pool = chatStarters.filter((p) => !recentIds.includes(p.id));

  // If the available pool without recent IDs is too small to fulfill the count,
  // fall back to the full set of starters.
  if (pool.length < count) {
    pool = chatStarters;
  }

  const shuffled = shuffleArray(pool);
  const selected: PromptStarter[] = [];
  const usedCategories = new Set<PromptStarterCategory>();

  // Pass 1: Select one from different categories when possible
  for (const p of shuffled) {
    if (!usedCategories.has(p.category)) {
      selected.push(p);
      usedCategories.add(p.category);
      if (selected.length === count) break;
    }
  }

  // Pass 2: Fill in the remaining slots if the number of unique categories was insufficient
  if (selected.length < count) {
    for (const p of shuffled) {
      if (!selected.some((s) => s.id === p.id)) {
        selected.push(p);
        if (selected.length === count) break;
      }
    }
  }

  // Record the selected prompts in recent history
  const updatedRecentIds = [...recentIds, ...selected.map((p) => p.id)];
  saveRecentIds(updatedRecentIds);

  return selected;
}

/**
 * Returns exactly `count` prompts for a specific category (e.g. image, audio, music, embeddings).
 * Excludes recently shown IDs based on a partitioned localStorage tracking key.
 */
export function getPromptStartersForCategory(category: PromptStarterCategory, count = 4): string[] {
  const recentKey = `venice-forge.recentPromptStarterIds.${category}`;

  const getRecent = (): string[] => {
    try {
      const storage = getStorage();
      if (storage) {
        const stored = storage.getItem(recentKey);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            return (parsed as unknown[]).filter((id): id is string => typeof id === "string");
          }
        }
      }
    } catch {
      // Ignore storage errors silently
    }
    return [];
  };

  const saveRecent = (ids: string[]): void => {
    try {
      const storage = getStorage();
      if (storage) {
        storage.setItem(recentKey, JSON.stringify(ids.slice(-16)));
      }
    } catch {
      // Ignore storage errors silently
    }
  };

  const allByCategory = cachedPromptStarters.filter((p) => p.category === category);
  if (allByCategory.length === 0) return [];

  const recentIds = getRecent();
  let pool = allByCategory.filter((p) => !recentIds.includes(p.id));

  if (pool.length < count) {
    pool = allByCategory;
  }

  const shuffled = shuffleArray(pool);
  const selected = shuffled.slice(0, Math.min(count, pool.length));

  const updatedRecentIds = [...recentIds, ...selected.map((p) => p.id)];
  saveRecent(updatedRecentIds);

  return selected.map((p) => p.prompt);
}

// Reset helper for testing
export function clearRecentPromptStarters(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(RECENT_KEY);
      storage.removeItem("venice-forge.recentPromptStarterIds.image");
      storage.removeItem("venice-forge.recentPromptStarterIds.audio");
      storage.removeItem("venice-forge.recentPromptStarterIds.music");
      storage.removeItem("venice-forge.recentPromptStarterIds.embeddings");
    }
  } catch {
    // Ignore storage errors silently
  }
}
