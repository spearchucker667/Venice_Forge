/** @fileoverview Single source of truth for the in-app Research Browser's
 *  internal home / splash page. Builds a static HTML payload from a
 *  `ResearchBrowserThemeSnapshot` so the home matches the active app theme
 *  rather than the OS prefers-color-scheme or hardcoded fallbacks.
 *
 *  Encoded data URLs are fingerprinted with a sentinel prefix so the main
 *  process can recognise "internal home" without re-decoding the body, and
 *  so equality checks remain stable even when the theme snapshot changes.
 */

import type { ResearchBrowserThemeSnapshot } from "../../src/types/researchBrowser";

/** Prefix placed at the start of every home data URL so the main process
 *  can identify "we are currently showing the internal home page" without
 *  decoding the HTML body. */
const RESEARCH_HOME_URL_PREFIX = "data:text/html;charset=utf-8;__venice_research_internal_home__=1,";

const FALLBACK_THEME: ResearchBrowserThemeSnapshot = {
  mode: "dark",
  background: "#101318",
  surface: "#171c24",
  surfaceElevated: "#1f2530",
  surfaceMuted: "#222a36",
  border: "#2d3542",
  borderStrong: "#3a4452",
  foreground: "#eef2f7",
  foregroundMuted: "#a9b3c2",
  foregroundSubtle: "#7a8699",
  accent: "#f97066",
  accentHover: "#ff8a80",
  accentForeground: "#0a0a0c",
  focusRing: "#6ee7d3",
  glow: "rgba(110,231,211,0.18)",
};

/** Returns the default theme snapshot. Used when the renderer has not yet
 *  published one or when the main process needs to build the home before
 *  any IPC setTheme call has arrived. */
export function getFallbackResearchBrowserThemeSnapshot(): ResearchBrowserThemeSnapshot {
  return { ...FALLBACK_THEME };
}

/** Returns true when `url` is the data URL for the internal home page, in
 *  any theme flavour. Theme swaps change the encoded payload but never the
 *  sentinel prefix. */
export function isInternalResearchHomeUrl(url: string): boolean {
  return url.startsWith(RESEARCH_HOME_URL_PREFIX);
}

/** Produces the data URL that the WebContentsView is loaded with when the
 *  user requests the internal home. The sentinel prefix lets the main
 *  process recognise the URL without parsing HTML. */
export function buildResearchBrowserHomeDataUrl(theme: ResearchBrowserThemeSnapshot): string {
  const html = buildResearchBrowserHomeHtml(theme);
  return `${RESEARCH_HOME_URL_PREFIX}${encodeURIComponent(html)}`;
}

/** HTML string for the in-app home / splash page. Strict CSP, neutral of
 *  the OS theme — colors are read from the supplied theme snapshot. */
export function buildResearchBrowserHomeHtml(theme: ResearchBrowserThemeSnapshot): string {
  const t = { ...FALLBACK_THEME, ...theme };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; navigate-to https: http:;">
  <title>${escapeText("Venice Research Home")}</title>
  <style>
    :root {
      color-scheme: ${t.mode};
      --vf-bg: ${t.background};
      --vf-panel: ${t.surfaceElevated};
      --vf-text: ${t.foreground};
      --vf-muted: ${t.foregroundMuted};
      --vf-accent: ${t.accent};
      --vf-border: ${t.border};
      --vf-link-bg: ${t.glow};
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--vf-bg);
      color: var(--vf-text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    main {
      width: min(520px, 100%);
      padding: 22px;
      border: 1px solid var(--vf-border);
      border-radius: 8px;
      background: var(--vf-panel);
    }
    h1 { margin: 0; font-size: 1.35rem; line-height: 1.2; letter-spacing: 0; }
    p { margin: 8px 0 0; color: var(--vf-muted); font-size: 0.94rem; line-height: 1.45; }
    nav {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      gap: 8px;
      margin-top: 18px;
    }
    a {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid var(--vf-border);
      border-radius: 6px;
      background: var(--vf-link-bg);
      color: var(--vf-text);
      font-size: 0.88rem;
      font-weight: 650;
      text-decoration: none;
    }
    a:focus-visible { outline: 2px solid var(--vf-accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <main>
    <h1>Research Browser</h1>
    <p>Search or open a site from the address bar.</p>
    <nav aria-label="Research Browser quick links">
      <a href="https://www.google.com/">Google</a>
      <a href="https://search.brave.com/">Brave</a>
      <a href="https://duckduckgo.com/">DuckDuckGo</a>
      <a href="https://venice.ai/">Venice</a>
      <a href="https://jina.ai/">Jina</a>
    </nav>
  </main>
</body>
</html>`;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
