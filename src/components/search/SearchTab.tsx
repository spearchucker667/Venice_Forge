import React from "react";
import { Field } from "../../components/Field";
import { safeHref } from "./searchScrapeUtils";
import type { SearchResultItem } from "./searchScrapeTypes";
import { isElectron } from "../../services/desktopBridge";
import { isTrustedExternalUrl } from "../../shared/urlSecurity";

export function SearchTab({
  query,
  setQuery,
  provider,
  setProvider,
  loading,
  runSearch,
  searchResults,
  onOpenInBrowser,
  onScrapeWithVenice,
  onReadWithJina,
  onSaveToSession,
  onOpenExternal,
}: {
  query: string;
  setQuery: (val: string) => void;
  provider: string;
  setProvider: (val: string) => void;
  loading: string;
  runSearch: () => void;
  searchResults: SearchResultItem[];
  onOpenInBrowser?: (url: string) => void;
  onScrapeWithVenice?: (url: string) => void;
  onReadWithJina?: (url: string) => void;
  onSaveToSession?: (item: SearchResultItem) => void;
  onOpenExternal?: (url: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">Web Search</h3>
      
      <Field label="Query">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="latest model routing best practices"
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
        />
      </Field>

      <Field label="Provider">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
        >
          <option value="brave">Brave Search (Venice)</option>
          <option value="google">Google Search (Venice)</option>
          <option value="jina">Jina Search</option>
        </select>
      </Field>

      <button
        className="px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors self-start cursor-pointer"
        onClick={runSearch}
        disabled={loading === "search" || !query.trim()}
      >
        {loading === "search" ? "Searching…" : "Search"}
      </button>
      
      <div className="flex flex-col gap-3 mt-2 overflow-y-auto max-h-[360px]">
        {searchResults.map((r, idx) => {
          const url = r.url || r.link || "";
          return (
            <div key={idx} className="rounded-lg bg-surface border border-border p-3 text-[13px]">
              <strong className="text-text-primary block mb-1">
                {r.title || r.name || "Untitled result"}
              </strong>
              <a href={safeHref(url)} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all text-[11px] block mb-2">
                {url}
              </a>
              <div className="text-text-secondary leading-relaxed mb-2">
                {r.snippet || r.content || r.description || ""}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {isElectron() && onOpenInBrowser && (
                  <button
                    onClick={() => onOpenInBrowser(url)}
                    className="px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] hover:bg-surface-muted transition-colors"
                  >
                    Open in browser
                  </button>
                )}
                {onScrapeWithVenice && (
                  <button
                    onClick={() => onScrapeWithVenice(url)}
                    className="px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] hover:bg-surface-muted transition-colors"
                  >
                    Scrape with Venice
                  </button>
                )}
                {onReadWithJina && (
                  <button
                    onClick={() => onReadWithJina(url)}
                    className="px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] hover:bg-surface-muted transition-colors"
                  >
                    Read with Jina
                  </button>
                )}
                {onSaveToSession && (
                  <button
                    onClick={() => onSaveToSession(r)}
                    className="px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] hover:bg-surface-muted transition-colors"
                  >
                    Save to session
                  </button>
                )}
                {onOpenExternal && isTrustedExternalUrl(url) && (
                  <button
                    onClick={() => onOpenExternal(url)}
                    className="px-2 py-1 rounded bg-surface-elevated border border-border text-[11px] hover:bg-surface-muted transition-colors"
                  >
                    Open external
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!searchResults.length && (
          <div className="text-[12px] text-text-muted text-center py-6">
            No search results yet.
          </div>
        )}
      </div>
    </div>
  );
}
