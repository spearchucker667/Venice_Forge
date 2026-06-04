import { createContext, useContext } from 'react';
import type { ModelInfo } from '../types/venice';

export const ModelsContext = createContext<Record<string, ModelInfo[]>>({});

export function useModels(type: string) {
  const models = useContext(ModelsContext);
  return { data: models[type] || [], isLoading: false };
}
