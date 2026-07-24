import { create } from 'zustand';
import StorageService from '../services/storageService';
import type { 
  ImageInspectorSession,
  ImageInspectorInput,
  PromptTarget,
  ImageAnalysisDepth,
  ImageSearchResult,
  ImageInspectorSearchRun
} from '../types/imageInspector';
import { toast } from './toast-store';
import { runResearchSearch } from '../services/researchService';
import { desktopImageInspector } from '../services/desktopBridge';
import {
  buildImageInspectorSystemPrompt,
  buildImageInspectorResponseFormat,
  ImageInspectorAnalysisError,
  parseImageInspectorAnalysis,
} from '../services/imageInspectorAnalysis';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Image Inspector request failed.";
}

async function persistSession(session: ImageInspectorSession): Promise<ImageInspectorSession> {
  return await StorageService.saveItem(
    "imageInspectorSessions",
    session as unknown as Record<string, unknown>,
  ) as unknown as ImageInspectorSession;
}

function safeSourceUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

async function resolveInputDataUrl(input: ImageInspectorInput | undefined): Promise<string> {
  if (!input?.mediaId) throw new Error("No durable image media is available.");
  const result = await desktopImageInspector.readMediaDataUrl({ mediaId: input.mediaId });
  if (!result.ok || !result.result) throw new Error(result.error || "Image media could not be read.");
  return result.result.dataUrl;
}

interface ImageInspectorState {
  // Current active session in the workspace
  activeSession: ImageInspectorSession | null;
  // All sessions loaded from IDB
  sessions: ImageInspectorSession[];
  loading: boolean;
  searchLoading: boolean;
  searchResults: ImageSearchResult[];
  activeAbortController: AbortController | null;
  
  // Actions
  refreshSessions: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  createSession: (input: ImageInspectorInput) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearActiveSession: () => void;
  updateSession: (id: string, patch: Partial<ImageInspectorSession>) => Promise<void>;
  
  // Analysis Actions
  startAnalysis: (
    modelId: string,
    depth: ImageAnalysisDepth,
    target: PromptTarget,
    instructions?: string,
    supportsResponseSchema?: boolean,
  ) => Promise<void>;
  cancelAnalysis: () => Promise<void>;
  performSearch: (provider: 'venice-google' | 'venice-brave', queryOverride?: string) => Promise<void>;
}

export const useImageInspectorStore = create<ImageInspectorState>((set, get) => ({
  activeSession: null,
  sessions: [],
  loading: false,
  searchLoading: false,
  searchResults: [],
  activeAbortController: null,

  refreshSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await StorageService.getItems<ImageInspectorSession>("imageInspectorSessions");
      // Sort by updatedAt descending
      sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      set({ sessions });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      set({ loading: false });
    }
  },

  loadSession: async (id: string) => {
    set({ loading: true });
    try {
      const session = await StorageService.getItem("imageInspectorSessions", id) as ImageInspectorSession | null;
      if (session) {
        set({ activeSession: session });
      } else {
        toast.error(`Could not load session ${id}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      set({ loading: false });
    }
  },

  createSession: async (input: ImageInspectorInput) => {
    try {
      const newSession: ImageInspectorSession = {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: input.displayName || "New Session",
        status: "draft",
        inputs: [input],
        request: {
          modelId: "",
          depth: "standard",
          promptTarget: "generic"
        },
        searches: []
      };
      const saved = await persistSession(newSession);
      set((state) => ({
        sessions: [saved, ...state.sessions],
        activeSession: saved
      }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  },

  deleteSession: async (id: string) => {
    try {
      await StorageService.deleteItem("imageInspectorSessions", id);
      set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id),
        activeSession: state.activeSession?.id === id ? null : state.activeSession,
        searchResults: state.activeSession?.id === id ? [] : state.searchResults,
      }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  },

  clearActiveSession: () => {
    set({ activeSession: null });
  },

  updateSession: async (id: string, patch: Partial<ImageInspectorSession>) => {
    try {
      const existing = await StorageService.getItem("imageInspectorSessions", id) as ImageInspectorSession | null;
      if (!existing) return;
      
      const updated: ImageInspectorSession = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      const saved = await persistSession(updated);
      
      set((state) => ({
        sessions: state.sessions.map(s => s.id === id ? saved : s),
        activeSession: state.activeSession?.id === id ? saved : state.activeSession
      }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  },

  startAnalysis: async (modelId, depth, target, instructions, supportsResponseSchema) => {
    const { activeSession } = get();
    if (!activeSession) {
      toast.error("Load a session before starting analysis.");
      return;
    }

    set({ loading: true });
    
    // Create an abort controller
    const abortController = new AbortController();
    set({ activeAbortController: abortController });
    
    try {
      // Update session status to analyzing
      const activeInput = activeSession.inputs[0];
      const runningSession = {
        ...activeSession,
        status: "analyzing" as const,
        request: {
          modelId,
          depth,
          promptTarget: target,
          userInstructions: instructions?.slice(0, 2_000)
        },
        updatedAt: new Date().toISOString()
      };
      await persistSession(runningSession);
      set({ activeSession: runningSession });
      // Resolve durable main-owned media only for this bounded provider call.
      const dataUrl = await resolveInputDataUrl(activeInput);

      const systemPrompt = buildImageInspectorSystemPrompt({ depth, target });

      // 3. Import veniceFetch dynamically to avoid circular dependencies if any, but since we're in a store action it's fine
      const { veniceFetch } = await import('../services/veniceClient/fetch');
      
      const result = await veniceFetch("/chat/completions", {
        method: "POST",
        signal: abortController.signal,
        body: {
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: [
              { type: "text", text: JSON.stringify({ depth, target, instructions: instructions?.slice(0, 2_000) ?? "" }) },
              { type: "image_url", image_url: { url: dataUrl } }
            ]}
          ],
          temperature: 0.2,
          ...(supportsResponseSchema
            ? { response_format: buildImageInspectorResponseFormat(target) }
            : {}),
        }
      });
      
      const analysis = parseImageInspectorAnalysis(result.data, target);

      // Update session with analysis
      const updated: ImageInspectorSession = { 
        ...runningSession, 
        status: "complete" as const,
        analysis, 
        updatedAt: new Date().toISOString() 
      };
      const saved = await persistSession(updated);
      
      set((state) => ({
        sessions: state.sessions.map(s => s.id === updated.id ? saved : s),
        activeSession: saved
      }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        const message = errorMessage(error);
        toast.error(message);
        
        // Update session status to failed
        const { activeSession: currentSession } = get();
        if (currentSession) {
           const failedSession: ImageInspectorSession = {
             ...currentSession,
             status: "failed" as const,
             error: {
               code: error instanceof ImageInspectorAnalysisError
                 ? error.code
                 : "ANALYSIS_REQUEST_FAILED" as const,
               message,
             },
             updatedAt: new Date().toISOString()
           };
           const saved = await persistSession(failedSession);
           set((state) => ({
             sessions: state.sessions.map(s => s.id === saved.id ? saved : s),
             activeSession: saved
           }));
        }
      }
    } finally {
      set({ loading: false, activeAbortController: null });
    }
  },

  cancelAnalysis: async () => {
    const { activeAbortController, activeSession, updateSession } = get();
    if (activeAbortController) {
      activeAbortController.abort();
      set({ activeAbortController: null });
    }
    if (activeSession && activeSession.status === 'analyzing') {
      await updateSession(activeSession.id, {
        status: 'canceled',
      });
    }
  },

  performSearch: async (provider, queryOverride) => {
    const { activeSession } = get();
    if (!activeSession) {
      toast.error('No active session for search.');
      return;
    }

    const query = (
      queryOverride ||
      activeSession.analysis?.searchQueries?.[0]?.query ||
      activeSession.analysis?.summary ||
      activeSession.title
    )?.trim();

    if (!query) {
      toast.error('No query available to search.');
      return;
    }

    set({ searchLoading: true });
    try {
      const searchRes = await runResearchSearch({
        query,
        provider,
        maxResults: 10
      });

      const mappedResults: ImageSearchResult[] = [];
      for (const src of searchRes.sources) {
        const pageUrl = safeSourceUrl(src.url);
        if (!pageUrl) continue;
        mappedResults.push({
          id: crypto.randomUUID(),
          providerId: provider,
          title: src.title || 'Search Result',
          pageUrl: pageUrl.href,
          sourceDomain: pageUrl.hostname,
          matchType: 'potential-source',
          matchReason: src.excerpt || `Web search result via ${provider === 'venice-google' ? 'Google Search' : 'Brave Search'}`,
          rank: mappedResults.length + 1,
        });
      }

      const newSearchRun: ImageInspectorSearchRun = {
        id: crypto.randomUUID(),
        providerId: provider,
        mode: 'text-source-discovery',
        createdAt: new Date().toISOString(),
        queryIds: [query],
        resultIds: mappedResults.map(r => r.id),
        status: 'complete',
        warnings: searchRes.warnings.map(w => w.message)
      };

      const updatedSession: ImageInspectorSession = {
        ...activeSession,
        searches: [newSearchRun, ...(activeSession.searches || [])],
        updatedAt: new Date().toISOString()
      };

      await persistSession(updatedSession);

      set((state) => ({
        sessions: state.sessions.map(s => s.id === updatedSession.id ? updatedSession : s),
        activeSession: updatedSession,
        searchResults: mappedResults
      }));

      if (mappedResults.length > 0) {
        toast.success(`Found ${mappedResults.length} search results via ${provider === 'venice-google' ? 'Google' : 'Brave'}`);
      } else {
        toast.error(`No search results returned from ${provider === 'venice-google' ? 'Google' : 'Brave'}`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      set({ searchLoading: false });
    }
  }
}));
