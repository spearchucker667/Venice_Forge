import { create } from 'zustand';

export const useSettingsStore = create<{
  playgroundAgentModel: string;
  setPlaygroundAgentModel: (modelId: string) => void;
}>((set) => ({
  playgroundAgentModel: 'qwen3-next-80b',
  setPlaygroundAgentModel: (modelId) => set({ playgroundAgentModel: modelId }),
}));
