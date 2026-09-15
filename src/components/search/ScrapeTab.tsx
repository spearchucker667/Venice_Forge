import React from "react";
import { Field } from "../../components/Field";
import { copyText } from "../../utils/download";
import { toast } from "../../stores/toast-store";
import { Trans, useTranslation } from "react-i18next";

export function ScrapeTab({
  url,
  setUrl,
  loading,
  runScrape,
  provider,
  setProvider,
  scrapeOutput,
  setScrapeOutput,
}: {
  url: string;
  setUrl: (val: string) => void;
  loading: string;
  runScrape: () => void;
  provider: "venice" | "jina";
  setProvider: (provider: "venice" | "jina") => void;
  scrapeOutput: string;
  setScrapeOutput: (val: string) => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  return (
    <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">
        <Trans i18nKey="common:surface.componentsSearchScrapetab.heading.webScrape" />
      </h3>

      <Field
        label={tRuntime(
          "runtimeGenerated.components.search.scrapetab.attribute.urlToScrape",
        )}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
        />
      </Field>

      <Field
        label={tRuntime(
          "runtimeGenerated.components.search.scrapetab.attribute.readerProvider",
        )}
      >
        <select
          value={provider}
          onChange={(event) =>
            setProvider(event.target.value as "venice" | "jina")
          }
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent"
        >
          <option value="venice">
            <Trans i18nKey="common:surface.componentsSearchScrapetab.option.veniceWebScrape" />
          </option>
          <option value="jina">
            <Trans i18nKey="common:surface.componentsSearchScrapetab.option.jinaReader" />
          </option>
        </select>
      </Field>

      <div className="flex gap-2">
        <button
          className="px-4 py-2 rounded-md text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer shadow-[0_0_8px_var(--color-vf-accent-glow)]"
          onClick={runScrape}
          disabled={loading === "scrape" || !url.trim()}
        >
          {loading === "scrape"
            ? tRuntime(
                "runtimeGenerated.components.search.scrapetab.text.scraping",
              )
            : tRuntime(
                "runtimeGenerated.components.search.scrapetab.text.scrape",
              )}
        </button>
        <button
          className="px-3.5 py-2 rounded-md text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
          onClick={() => {
            copyText(scrapeOutput);
            toast.success(
              tRuntime(
                "runtimeGenerated.components.search.scrapetab.notification.scrapedOutputCopied",
              ),
            );
          }}
          disabled={!scrapeOutput}
        >
          <Trans i18nKey="common:surface.componentsSearchScrapetab.action.copy" />
        </button>
      </div>

      <textarea
        value={scrapeOutput}
        onChange={(e) => setScrapeOutput(e.target.value)}
        placeholder={tRuntime(
          "runtimeGenerated.components.search.scrapetab.attribute.scrapedTextWillAppearHere",
        )}
        className="w-full flex-1 bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2.5 text-[13px] text-text-secondary outline-none font-mono focus:border-accent transition-all min-h-[220px] placeholder:text-text-muted/50"
      />
    </div>
  );
}
