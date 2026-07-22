import { create } from 'zustand';
import type {
  ChatFolder,
  ChatFolderKind,
  ExportFolderBackupInput,
  FolderBackupPreview,
  FolderImportPreview,
  FolderLockState,
  ImportFolderBackupInput,
  LockFolderInput,
  PreviewFolderImportInput,
  UnlockFolderInput,
} from '../shared/chatFolderContracts';
import { desktopChatFolders } from '../services/desktopBridge';
import { toast } from './toast-store';

export interface ChatFolderState {
  folders: ChatFolder[];
  isLoading: boolean;
  isLoaded: boolean;
  loadFolders: (kind?: ChatFolderKind) => Promise<void>;
  createFolder: (name: string, kind: ChatFolderKind) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  reorderFolders: (folderIds: string[], kind: ChatFolderKind) => Promise<void>;
  moveConversation: (conversationId: string, destinationFolderId: string | null) => Promise<void>;
  moveConversations: (conversationIds: string[], destinationFolderId: string | null) => Promise<void>;
  deleteFolder: (id: string, deleteChats: boolean) => Promise<void>;
  getBackupPreview: (folderId: string) => Promise<FolderBackupPreview | null>;
  exportFolderBackup: (input: ExportFolderBackupInput) => Promise<string | null>;
  previewImport: (
    input: PreviewFolderImportInput,
  ) => Promise<FolderImportPreview | null>;
  importFolderBackup: (
    input: ImportFolderBackupInput,
  ) => Promise<{ ok: boolean; folderId?: string; error?: string }>;
  lockFolder: (input: LockFolderInput) => Promise<{ ok: boolean; error?: string; retryAfter?: string }>;
  unlockFolder: (
    input: UnlockFolderInput,
  ) => Promise<{ ok: boolean; error?: string; retryAfter?: string }>;
  getFolderLockState: (folderId: string) => Promise<FolderLockState | null>;
}

export function selectStandardFolders(state: ChatFolderState): ChatFolder[] {
  return state.folders
    .filter((folder) => folder.kind === 'standard')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function selectCharacterFolders(state: ChatFolderState): ChatFolder[] {
  return state.folders
    .filter((folder) => folder.kind === 'character')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export const useChatFolderStore = create<ChatFolderState>((set, get) => ({
  folders: [],
  isLoading: false,
  isLoaded: false,

  loadFolders: async (kind?: ChatFolderKind) => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await desktopChatFolders.list();
      if (res.ok) {
        const next = res.folders
          .filter((folder) => !kind || folder.kind === kind)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        set((prev) => {
          if (!kind && !prev.isLoaded) {
            return { folders: next, isLoaded: true };
          }
          // Merge per-kind loads on top of the existing cache so calling
          // `loadFolders('standard')` does not wipe out character folders.
          const folderMap = new Map(prev.folders.map((folder) => [folder.id, folder]));
          for (const folder of next) folderMap.set(folder.id, folder);
          const merged = Array.from(folderMap.values()).sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          return { folders: merged, isLoaded: true };
        });
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to load chat folders', String(err));
    } finally {
      set({ isLoading: false });
    }
  },

  createFolder: async (name: string, kind: ChatFolderKind) => {
    try {
      const res = await desktopChatFolders.create({ name, kind });
      if (res.ok && res.folder) {
        set((state) => ({ folders: [...state.folders, res.folder!].sort((a, b) => a.sortOrder - b.sortOrder) }));
        toast.success('Folder created', name);
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to create folder', String(err));
    }
  },

  renameFolder: async (id: string, name: string) => {
    try {
      const res = await desktopChatFolders.rename({ folderId: id, name });
      if (res.ok && res.folder) {
        const renamed = res.folder;
        set((state) => ({
          folders: state.folders.map(f => f.id === id ? renamed : f)
        }));
        toast.success('Folder renamed', name);
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to rename folder', String(err));
    }
  },

  reorderFolders: async (folderIds: string[], kind: ChatFolderKind) => {
    try {
      const res = await desktopChatFolders.reorder({ folderIds, kind });
      if (res.ok) {
        set((state) => {
          const folderMap = new Map(state.folders.filter(f => f.kind === kind).map(f => [f.id, f]));
          const unchanged = state.folders.filter(f => f.kind !== kind);
          
          const newFolders = folderIds.map((id, index) => {
            const f = folderMap.get(id);
            if (f) {
              f.sortOrder = index + 1;
              return f;
            }
            return null;
          }).filter(Boolean) as ChatFolder[];
          
          return { folders: [...unchanged, ...newFolders].sort((a, b) => a.sortOrder - b.sortOrder) };
        });
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to reorder folders', String(err));
      await get().loadFolders(); // rollback
    }
  },

  moveConversation: async (conversationId: string, destinationFolderId: string | null) => {
    try {
      const res = await desktopChatFolders.moveConversation({ conversationId, folderId: destinationFolderId });
      if (res.ok) {
        // We don't update chat-store here, the caller should trigger conversation reload
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to move conversation', String(err));
      throw err;
    }
  },

  moveConversations: async (conversationIds: string[], destinationFolderId: string | null) => {
    try {
      for (const conversationId of conversationIds) {
        await desktopChatFolders.moveConversation({ conversationId, folderId: destinationFolderId });
      }
    } catch (err) {
      toast.error('Failed to move conversations', String(err));
      throw err;
    }
  },

  deleteFolder: async (id: string, deleteChats: boolean) => {
    try {
      const res = await desktopChatFolders.delete({ folderId: id, deleteConversations: deleteChats });
      if (res.ok) {
        set((state) => ({
          folders: state.folders.filter(f => f.id !== id)
        }));
        toast.success('Folder deleted');
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to delete folder', String(err));
      throw err;
    }
  },

  getBackupPreview: async (folderId: string) => {
    try {
      const res = await desktopChatFolders.getBackupPreview({ folderId });
      if (res.ok && res.preview) {
        return res.preview;
      }
      toast.error('Failed to read folder backup preview', res.error ?? 'Unknown error');
      return null;
    } catch (err) {
      toast.error('Failed to read folder backup preview', String(err));
      return null;
    }
  },

  exportFolderBackup: async (input: ExportFolderBackupInput) => {
    try {
      const res = await desktopChatFolders.exportBackup(input);
      if (res.ok) {
        toast.success('Folder backup exported', res.backupPath ?? '');
        return res.backupPath ?? null;
      }
      throw new Error(res.error ?? 'Unknown error');
    } catch (err) {
      toast.error('Failed to export folder backup', String(err));
      throw err;
    }
  },

  previewImport: async (input: PreviewFolderImportInput) => {
    try {
      const res = await desktopChatFolders.previewImport(input);
      if (res.ok && res.preview) {
        return res.preview;
      }
      toast.error('Failed to preview folder import', res.error ?? 'Unknown error');
      return null;
    } catch (err) {
      toast.error('Failed to preview folder import', String(err));
      return null;
    }
  },

  importFolderBackup: async (input: ImportFolderBackupInput) => {
    try {
      const res = await desktopChatFolders.importBackup(input);
      if (res.ok) {
        toast.success('Folder backup imported');
        // Reload folders so the menu reflects the merged state.
        await get().loadFolders();
        return res;
      }
      throw new Error(res.error ?? 'Unknown error');
    } catch (err) {
      toast.error('Failed to import folder backup', String(err));
      throw err;
    }
  },

  lockFolder: async (input: LockFolderInput) => {
    try {
      const res = await desktopChatFolders.lock(input);
      if (res.ok) {
        toast.success('Folder locked');
        return res;
      }
      // Lock failures may include a structured retry-after; the caller renders
      // the backoff dialog so the toast here is intentionally quiet.
      return res;
    } catch (err) {
      toast.error('Failed to lock folder', String(err));
      throw err;
    }
  },

  unlockFolder: async (input: UnlockFolderInput) => {
    try {
      const res = await desktopChatFolders.unlock(input);
      if (res.ok) {
        toast.success('Folder unlocked');
        return res;
      }
      return res;
    } catch (err) {
      toast.error('Failed to unlock folder', String(err));
      throw err;
    }
  },

  getFolderLockState: async (folderId: string) => {
    try {
      const res = await desktopChatFolders.getLockState({ folderId });
      if (res.ok && res.lockState) {
        return res.lockState;
      }
      return null;
    } catch {
      return null;
    }
  }
}));
