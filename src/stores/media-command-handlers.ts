/** @fileoverview Phase 2B Media Studio command handler registry.
 *
 * The Command Palette is a global component that does not have direct
 * access to the gallery-view's `MediaItem[]` cache. To keep the
 * palette decoupled from the gallery, this module exposes a small
 * registry of "media command handlers" the gallery-view registers
 * while it is mounted. The palette looks up the handlers and invokes
 * them by name.
 *
 * Safety: handlers are only registered when the user is on the Media
 * Studio tab. The palette hides the related commands when no
 * handlers are registered, so the user can never invoke a media-only
 * action outside the Media Studio.
 */

import type { MediaItem } from "../types/media";

export type MediaCommandHandler =
  | "select-all-visible"
  | "clear-selection"
  | "compare-selected"
  | "export-selected"
  | "favorite-selected"
  | "add-tag-selected"
  | "send-selected-to-image"
  | "copy-selected-recipe";

export interface MediaCommandHandlers {
  /** Returns the visible (filtered) MediaItem ids. */
  visibleIds: () => string[];
  /** Resolves the supplied ids to MediaItem records. */
  resolveItems: (ids: string[]) => MediaItem[];
  /** True when the user is currently on the Media Studio tab. */
  isMediaActive: () => boolean;
  /** Optional callbacks for the bulk actions. Each must be a no-op
   *  when the corresponding precondition is not met. */
  onSelectAllVisible?: () => void;
  onClearSelection?: () => void;
  onCompare?: (ids: string[]) => void;
  onExport?: (ids: string[]) => void;
  onFavorite?: (ids: string[]) => void;
  onAddTag?: (ids: string[]) => void | Promise<void>;
  onSendToImage?: (ids: string[]) => void;
  onCopyRecipe?: (ids: string[]) => void;
}

let current: MediaCommandHandlers | null = null;
const subscribers = new Set<() => void>();

export function registerMediaCommandHandlers(handlers: MediaCommandHandlers): () => void {
  current = handlers;
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // Subscriber errors must not break registration.
    }
  }
  return () => {
    if (current === handlers) {
      current = null;
      for (const fn of subscribers) {
        try {
          fn();
        } catch {
          // ignore
        }
      }
    }
  };
}

export function getMediaCommandHandlers(): MediaCommandHandlers | null {
  return current;
}

/** True iff any of the selection-context handlers are registered. */
export function hasMediaCommandHandlers(): boolean {
  return current !== null;
}

/** Subscribe to handler registry changes. Returns the unsubscribe
 *  function. Used by the Command Palette so the media section appears
 *  / disappears without a polling loop. */
export function subscribeMediaCommandHandlers(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
