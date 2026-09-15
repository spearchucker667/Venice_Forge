import React from "react";
import { Field } from "../../components/Field";
import type { SearchResultItem } from "./searchScrapeTypes";
import { Trans, useTranslation } from "react-i18next";

export function SearchTab({
  query,
  setQuery,
  provider,
  setProvider,
  loading,
  runSearch,
  searchResults,
  onScrapeWithVenice,
  onReadWithJina,
  onSaveToSession,
}: {
  query: string;
  setQuery: (val: string) => void;
  provider: string;
  setProvider: (val: string) => void;
  loading: string;
  runSearch: () => void;
  searchResults: SearchResultItem[];
  onScrapeWithVenice?: (url: string) => void;
  onReadWithJina?: (url: string) => void;
  onSaveToSession?: (item: SearchResultItem) => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  return (
    <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">
        <Trans i18nKey="common:surface.componentsSearchSearchtab.heading.webSearch" />
      </h3>

      <Field
        label={tRuntime(
          "runtimeGenerated.components.search.searchtab.attribute.query",
        )}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tRuntime(
            "runtimeGenerated.components.search.searchtab.attribute.latestModelRoutingBestPractices",
          )}
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
        />
      </Field>

      <Field
        label={tRuntime(
          "runtimeGenerated.components.search.searchtab.attribute.provider",
        )}
      >
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
        >
          <option value="brave">
            <Trans i18nKey="common:surface.componentsSearchSearchtab.option.braveSearchVenice" />
          </option>
          <option value="google">
            <Trans i18nKey="common:surface.componentsSearchSearchtab.option.googleSearchVenice" />
          </option>
          <option value="jina">
            <Trans i18nKey="common:surface.componentsSearchSearchtab.option.jinaSearch" />
          </option>
        </select>
      </Field>

      <button
        className="px-4 py-2 rounded-md text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors self-start cursor-pointer shadow-[0_0_8px_var(--color-vf-accent-glow)]"
        onClick={runSearch}
        disabled={loading === "search" || !query.trim()}
      >
        {loading === "search"
          ? tRuntime(
              "runtimeGenerated.components.search.searchtab.text.searching",
            )
          : tRuntime(
              "runtimeGenerated.components.search.searchtab.text.search",
            )}
      </button>

      <div className="flex flex-col gap-3 mt-2 overflow-y-auto max-h-[360px]">
        {searchResults.map((r, idx) => {
          const url = r.url || r.link || "";
          return (
            <div
              key={url || idx}
              className="rounded-md bg-vf-panel-bg border border-vf-panel-border p-3 text-[13px]"
            >
              <strong className="text-text-primary block mb-1">
                {r.title ||
                  r.name ||
                  tRuntime(
                    "runtimeGenerated.components.search.searchtab.text.untitledResult",
                  )}
              </strong>
              <span className="text-accent break-all text-[12px] block mb-2">
                {url}
              </span>
              <div className="text-text-secondary leading-relaxed mb-2">
                {r.snippet || r.content || r.description || ""}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {onScrapeWithVenice && (
                  <button
                    onClick={() => onScrapeWithVenice(url)}
                    className="px-2 py-1 rounded bg-vf-panel-bg-raised border border-vf-panel-border text-[12px] hover:bg-vf-panel-bg-muted transition-colors"
                  >
                    <Trans i18nKey="common:surface.componentsSearchSearchtab.action.scrapeWithVenice" />
                  </button>
                )}
                {onReadWithJina && (
                  <button
                    onClick={() => onReadWithJina(url)}
                    className="px-2 py-1 rounded bg-vf-panel-bg-raised border border-vf-panel-border text-[12px] hover:bg-vf-panel-bg-muted transition-colors"
                  >
                    <Trans i18nKey="common:surface.componentsSearchSearchtab.action.readWithJina" />
                  </button>
                )}
                {onSaveToSession && (
                  <button
                    onClick={() => onSaveToSession(r)}
                    className="px-2 py-1 rounded bg-vf-panel-bg-raised border border-vf-panel-border text-[12px] hover:bg-vf-panel-bg-muted transition-colors"
                  >
                    <Trans i18nKey="common:surface.componentsSearchSearchtab.action.saveToSession" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!searchResults.length && (
          <div className="text-[12px] text-text-muted text-center py-6">
            <Trans i18nKey="common:surface.componentsSearchSearchtab.text.noSearchResultsYet" />
          </div>
        )}
      </div>
    </div>
  );
}
