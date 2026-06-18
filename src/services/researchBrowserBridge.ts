import type {
  ResearchBrowserPreloadApi,
  ResearchBrowserState,
} from "../types/researchBrowser";

function getWebFallbackState(): ResearchBrowserState {
  return {
    visible: false,
    url: null,
    title: "",
    canGoBack: false,
    canGoForward: false,
    loading: false,
    error: "Live browser is not available in web mode.",
    securityLabel: "blocked",
  };
}

/**
 * Bridge for the Research Mini Browser.
 * Automatically degrading to error/unavailability when running in web mode.
 */
/* eslint-disable no-restricted-syntax */
export const researchBrowserBridge: ResearchBrowserPreloadApi = {
  create: async () => window.veniceForge?.researchBrowser?.create() ?? { ok: false, error: "Unavailable in web mode" },
  destroy: async () => window.veniceForge?.researchBrowser?.destroy() ?? { ok: false, error: "Unavailable in web mode" },
  setVisible: async (visible) => window.veniceForge?.researchBrowser?.setVisible(visible) ?? { ok: false, error: "Unavailable in web mode" },
  setBounds: async (input) => window.veniceForge?.researchBrowser?.setBounds(input) ?? { ok: false, error: "Unavailable in web mode" },
  navigate: async (input) => window.veniceForge?.researchBrowser?.navigate(input) ?? { ok: false, state: getWebFallbackState(), error: "Unavailable in web mode" },
  back: async () => window.veniceForge?.researchBrowser?.back() ?? { ok: false, state: getWebFallbackState(), error: "Unavailable in web mode" },
  forward: async () => window.veniceForge?.researchBrowser?.forward() ?? { ok: false, state: getWebFallbackState(), error: "Unavailable in web mode" },
  reload: async () => window.veniceForge?.researchBrowser?.reload() ?? { ok: false, state: getWebFallbackState(), error: "Unavailable in web mode" },
  stop: async () => window.veniceForge?.researchBrowser?.stop() ?? { ok: false, state: getWebFallbackState(), error: "Unavailable in web mode" },
  getState: async () => window.veniceForge?.researchBrowser?.getState() ?? { ok: false, state: getWebFallbackState(), error: "Unavailable in web mode" },
  scrapeCurrent: async () => window.veniceForge?.researchBrowser?.scrapeCurrent() ?? { ok: false, error: "Unavailable in web mode" },
  captureMetadata: async () => window.veniceForge?.researchBrowser?.captureMetadata() ?? { ok: false, error: "Unavailable in web mode" },
  onStateChanged: (callback) => {
    if (window.veniceForge?.researchBrowser?.onStateChanged) {
      return window.veniceForge.researchBrowser.onStateChanged(callback);
    }
    // No-op for web mode
    return () => {};
  },
};
