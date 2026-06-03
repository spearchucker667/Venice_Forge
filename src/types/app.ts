/** @fileoverview Core application type definitions for state, actions, and UI models. */

import { GalleryImage, FileRecord } from "./storage";
import type { Conversation } from "./conversation";
import type { Theme } from "../theme/themeTypes";

/** Represents a single message in a chat conversation. */
export interface ChatRecord {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Captures the current image generation form state. */
export interface ImageDraft {
  prompt: string;
  negative: string;
  /** Form state: always a parsed number (coerced by UI before dispatch). */
  width: number;
  /** Form state: always a parsed number (coerced by UI before dispatch). */
  height: number;
  aspectRatio: string;
  steps: number | string;
  cfg: number | string;
  style: string;
  safeMode: boolean;
  disableWatermark: boolean;
  imageCount: number | string;
  currentImage: string;
  currentImages: GalleryImage[];
  currentBatchId: string | null;
  lastSavedImageId: string | null;
  generationProgress: string;
  batchQueueStatus: string;
}

/** Captures the current video generation form state. */
export interface VideoDraft {
  prompt: string;
  negative: string;
  aspectRatio: string;
  duration: string;
  resolution: string;
  audio: boolean;
  videoUrl: string;
  imageUrl: string;
  sourceVideoUrl: string;
  generationProgress: string;
  queueId: string | null;
  status: string | null;
  downloadUrl: string | null;
}

/** Captures the current batch job form state. */
export interface BatchDraft {
  type: "text" | "image";
  promptsText: string;
}

/** User-configurable settings persisted across sessions. API keys are stored separately via safeStorage and never written here. */
export interface AppSettings {
  defaultSystemPrompt: string;
  includeVeniceSystemPrompt: boolean;
  webSearch: string;
  webScraping: boolean;
  webCitations: boolean;
  theme: "dark" | "light" | "system";
  customModels: string[];
  selectedThemeId: string;
  appearanceMode: "dark" | "light";
  customTheme: Theme | null;
}

/** Describes a transient toast notification shown to the user. */
export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
  duration?: number;
}

/** Explicit shape of the global application state. Defined here to break the circular
 *  dependency between appReducer (which needs AppAction) and this file (which needed initialState). */
export interface AppState {
  activeTab: string;
  models: Record<string, import("./venice").ModelInfo[]>;
  usingFallbackModels: boolean;
  selectedChatModel: string;
  selectedImageModel: string;
  selectedVideoModel: string;
  settings: AppSettings;
  diagnostics: import("./venice").DiagnosticsEntry | null;
  diagnosticsLog: import("./venice").DiagnosticsEntry[];
  gallery: import("./storage").GalleryImage[];
  files: FileRecord[];
  chats: import("./storage").ChatHistoryItem[];
  conversations: Conversation[];
  activeConversationId: string | null;
  sourcePanelOpen: boolean;
  sidebarCollapsed: boolean;
  isOnline: boolean;
  modelLoadError: string;
  imageDraft: ImageDraft;
  videoDraft: VideoDraft;
  batchDraft: BatchDraft;
  chatDraft: {
    systemPrompt: string;
    messages: ChatRecord[];
  };
  toasts: ToastMessage[];
}

/** Discriminated union of all actions accepted by the application reducer. */
export type AppAction =
  | { type: "SET_TAB"; tab: string }
  | { type: "TOGGLE_SOURCE_PANEL" }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_MODELS"; models: Record<string, import("./venice").ModelInfo[]> | undefined; fallback?: boolean; error?: string }
  | { type: "SET_SELECTED_CHAT_MODEL"; model: string }
  | { type: "SET_SELECTED_IMAGE_MODEL"; model: string }
  | { type: "SET_SELECTED_VIDEO_MODEL"; model: string }
  | { type: "SET_SETTINGS"; settings: Partial<AppSettings> }
  | { type: "SET_DIAGNOSTICS"; diagnostics: Partial<import("./venice").DiagnosticsEntry> }
  | { type: "SET_GALLERY"; items: GalleryImage[] }
  | { type: "SET_IMAGE_DRAFT"; patch: Partial<ImageDraft> }
  | { type: "SET_VIDEO_DRAFT"; patch: Partial<VideoDraft> }
  | { type: "SET_FILES"; items: FileRecord[] }
  | { type: "SET_CHATS"; items: import("./storage").ChatHistoryItem[] }
  | { type: "SET_CONVERSATIONS"; items: Conversation[] }
  | { type: "SET_ACTIVE_CONVERSATION"; id: string | null }
  | { type: "SET_CHAT_DRAFT"; patch: Partial<AppState['chatDraft']> }
  | { type: "SET_BATCH_DRAFT"; patch: Partial<BatchDraft> }
  | { type: "SET_ONLINE"; online: boolean }
  | { type: "ADD_TOAST"; toast: ToastMessage }
  | { type: "REMOVE_TOAST"; id: string };

/** Dispatch function type for the global application reducer. */
export type AppDispatch = import("react").Dispatch<AppAction>;

/** Shared props type for feature modules that consume global state + dispatch. */
export interface ModuleProps {
  state: AppState;
  dispatch: AppDispatch;
}
