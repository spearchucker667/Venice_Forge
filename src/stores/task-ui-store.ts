import { create } from "zustand";

interface TaskUIStoreState {
  taskCenterOpen: boolean;
  openTaskCenter: () => void;
  closeTaskCenter: () => void;
  toggleTaskCenter: () => void;
}

export const useTaskUIStore = create<TaskUIStoreState>((set, get) => ({
  taskCenterOpen: false,
  openTaskCenter: () => set({ taskCenterOpen: true }),
  closeTaskCenter: () => set({ taskCenterOpen: false }),
  toggleTaskCenter: () => set({ taskCenterOpen: !get().taskCenterOpen }),
}));
