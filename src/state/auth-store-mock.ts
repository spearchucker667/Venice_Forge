import { create } from 'zustand';

export const useAuthStore = create<{
  apiKey: string;
}>((set) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
  apiKey: 'proxy',
}));
