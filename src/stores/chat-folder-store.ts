import { create } from 'zustand';
import type { ChatFolder } from '../types/chatFolder';
import { desktopChatFolders } from '../services/desktopBridge';
import { toast } from './toast-store';

export interface ChatFolderState {
  folders: ChatFolder[];
  isLoading: boolean;
  isLoaded: boolean;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  reorderFolders: (folderIds: string[]) => Promise<void>;
  moveConversation: (conversationId: string, destinationFolderId: string | null) => Promise<void>;
  deleteFolder: (id: string, deleteChats: boolean) => Promise<void>;
}

export const useChatFolderStore = create<ChatFolderState>((set, get) => ({
  folders: [],
  isLoading: false,
  isLoaded: false,

  loadFolders: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await desktopChatFolders.list();
      if (res.ok) {
        set({ folders: res.folders.sort((a, b) => a.sortOrder - b.sortOrder), isLoaded: true });
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to load chat folders', String(err));
    } finally {
      set({ isLoading: false });
    }
  },

  createFolder: async (name: string) => {
    try {
      const res = await desktopChatFolders.create({ name });
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
      const res = await desktopChatFolders.rename({ id, name });
      if (res.ok) {
        set((state) => ({
          folders: state.folders.map(f => f.id === id ? { ...f, name, updatedAt: new Date().toISOString() } : f)
        }));
        toast.success('Folder renamed', name);
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      toast.error('Failed to rename folder', String(err));
    }
  },

  reorderFolders: async (folderIds: string[]) => {
    try {
      const res = await desktopChatFolders.reorder({ folderIds });
      if (res.ok) {
        set((state) => {
          const folderMap = new Map(state.folders.map(f => [f.id, f]));
          const newFolders = folderIds.map((id, index) => {
            const f = folderMap.get(id);
            if (f) {
              f.sortOrder = index + 1;
              return f;
            }
            return null;
          }).filter(Boolean) as ChatFolder[];
          
          return { folders: newFolders };
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
      const res = await desktopChatFolders.moveConversation({ conversationId, destinationFolderId });
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

  deleteFolder: async (id: string, deleteChats: boolean) => {
    try {
      const res = await desktopChatFolders.delete({ id, deleteChats });
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
  }
}));
