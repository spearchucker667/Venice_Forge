import React from "react";
import { Field } from "../../components/Field";
import { safeHref } from "./searchScrapeUtils";
import type { SearchResultItem } from "./searchScrapeTypes";

export function SearchTab({
  query,
  setQuery,
  provider,
  setProvider,
  loading,
  runSearch,
  searchResults
}: {
  query: string;
  setQuery: (val: string) => void;
  provider: string;
  setProvider: (val: string) => void;
  loading: string;
  runSearch: () => void;
  searchResults: SearchResultItem[];
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
          <option value="brave">Brave Search</option>
          <option value="google">Google Search</option>
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
        {searchResults.map((r, idx) => (
          <div key={idx} className="rounded-lg bg-surface border border-border p-3 text-[13px]">
            <strong className="text-text-primary block mb-1">
              {r.title || r.name || "Untitled result"}
            </strong>
            <a href={safeHref(r.url || r.link)} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all text-[11px] block mb-2">
              {r.url || r.link}
            </a>
            <div className="text-text-secondary leading-relaxed">
              {r.snippet || r.content || r.description || ""}
            </div>
          </div>
        ))}
        {!searchResults.length && (
          <div className="text-[12px] text-text-muted text-center py-6">
            No search results yet.
          </div>
        )}
      </div>
    </div>
  );
}
