import React from "react";
import { Field } from "../../components/Field";
import { copyText } from "../../utils/download";
import { toast } from "../../stores/toast-store";

export function ScrapeTab({
  url,
  setUrl,
  loading,
  runScrape,
  scrapeOutput,
  setScrapeOutput
}: {
  url: string;
  setUrl: (val: string) => void;
  loading: string;
  runScrape: () => void;
  scrapeOutput: string;
  setScrapeOutput: (val: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">Web Scrape</h3>
      
      <Field label="URL to scrape">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
        />
      </Field>

      <div className="flex gap-2">
        <button
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
          onClick={runScrape}
          disabled={loading === "scrape" || !url.trim()}
        >
          {loading === "scrape" ? "Scraping…" : "Scrape"}
        </button>
        <button
          className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          onClick={() => {
            copyText(scrapeOutput);
            toast.success("Scraped output copied!");
          }}
          disabled={!scrapeOutput}
        >
          Copy
        </button>
      </div>

      <textarea
        value={scrapeOutput}
        onChange={(e) => setScrapeOutput(e.target.value)}
        placeholder="Scraped text will appear here..."
        className="w-full flex-1 bg-surface border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text-secondary outline-none font-mono focus:border-accent transition-all min-h-[220px] placeholder:text-text-muted/50"
      />
    </div>
  );
}
