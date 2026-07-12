import React from "react";
import { Field } from "../../components/Field";
import { copyText } from "../../utils/download";
import { toast } from "../../stores/toast-store";
import type { ResearchBudget } from "../../research/agent/researchRunner";

export function AiResearchTab({
  researchQuestion,
  setResearchQuestion,
  researchProviderId,
  setResearchProviderId,
  researchSearchProvider,
  setResearchSearchProvider,
  researchScrapeProvider: _researchScrapeProvider,
  setResearchScrapeProvider: _setResearchScrapeProvider,
  researchRunMode,
  setResearchRunMode,
  researchBudget,
  setResearchBudget,
  loading,
  runAiResearch,
  researchOutput,
  setResearchOutput,
  researchEvidenceSources,
}: {
  researchQuestion: string;
  setResearchQuestion: (val: string) => void;
  researchProviderId: "venice" | "jina";
  setResearchProviderId: (val: "venice" | "jina") => void;
  researchSearchProvider: "brave" | "google" | "auto";
  setResearchSearchProvider: (val: "brave" | "google" | "auto") => void;
  researchScrapeProvider: "venice" | "jina" | "generic-http" | "auto";
  setResearchScrapeProvider: (val: "venice" | "jina" | "generic-http" | "auto") => void;
  researchRunMode: "retrieve-only" | "retrieve-and-synthesize";
  setResearchRunMode: (val: "retrieve-only" | "retrieve-and-synthesize") => void;
  researchBudget: ResearchBudget;
  setResearchBudget: (val: ResearchBudget) => void;
  loading: string;
  runAiResearch: () => void;
  researchOutput: string;
  setResearchOutput: (val: string) => void;
  researchEvidenceSources: string;
}) {
  const budgetField = (
    label: string,
    value: number,
    min: number,
    max: number,
    setter: (n: number) => void
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-text-muted">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setter(Math.min(max, Math.max(min, Number(e.target.value))))}
        className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent transition-all"
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">Deep AI Research Agent</h3>
      <p className="text-[12.5px] text-text-secondary leading-relaxed">
        Executes a recursive web search loop, scrapes multiple sources, parses citations, and synthesizes a comprehensive final response.
      </p>

      <Field label="Research Question">
        <input
          value={researchQuestion}
          onChange={(e) => setResearchQuestion(e.target.value)}
          placeholder="What are the latest changes in safety policies of frontier AI labs?"
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Search Provider">
          <select
            value={researchProviderId}
            onChange={(e) => setResearchProviderId(e.target.value as "venice" | "jina")}
            className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
          >
            <option value="venice">Venice (Brave/Google)</option>
            <option value="jina">Jina AI Search & Reader</option>
          </select>
        </Field>

        <Field label="Venice Search Engine">
          <select
            value={researchSearchProvider}
            onChange={(e) => setResearchSearchProvider(e.target.value as "brave" | "google" | "auto")}
            disabled={researchProviderId !== "venice"}
            className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer disabled:opacity-50"
          >
            <option value="auto">Auto (default from config)</option>
            <option value="brave">Brave Search</option>
            <option value="google">Google Search</option>
          </select>
        </Field>
      </div>

      <Field label="Run Mode">
        <select
          value={researchRunMode}
          onChange={(e) => setResearchRunMode(e.target.value as "retrieve-only" | "retrieve-and-synthesize")}
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
        >
          <option value="retrieve-and-synthesize">Retrieve & Synthesize (uses Venice model)</option>
          <option value="retrieve-only">Retrieve Only (no AI synthesis)</option>
        </select>
      </Field>

      <div className="rounded-lg bg-surface border border-border p-4 space-y-3">
        <div className="text-[12.5px] font-medium text-text-primary">Budget Controls</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {budgetField("Max Queries", researchBudget.maxQueries, 1, 8, (n) =>
            setResearchBudget({ ...researchBudget, maxQueries: n })
          )}
          {budgetField("Max Results/Query", researchBudget.maxResultsPerQuery, 1, 10, (n) =>
            setResearchBudget({ ...researchBudget, maxResultsPerQuery: n })
          )}
          {budgetField("Max Pages", researchBudget.maxPages, 0, 10, (n) =>
            setResearchBudget({ ...researchBudget, maxPages: n })
          )}
          {budgetField("Max Chars/Page", researchBudget.maxCharsPerPage, 1000, 20000, (n) =>
            setResearchBudget({ ...researchBudget, maxCharsPerPage: n })
          )}
          {budgetField("Request Timeout (ms)", researchBudget.perRequestTimeoutMs, 5000, 60000, (n) =>
            setResearchBudget({ ...researchBudget, perRequestTimeoutMs: n })
          )}
          {budgetField("Total Timeout (ms)", researchBudget.totalJobTimeoutMs, 30000, 180000, (n) =>
            setResearchBudget({ ...researchBudget, totalJobTimeoutMs: n })
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
          onClick={runAiResearch}
          disabled={loading === "ai-research" || !researchQuestion.trim()}
        >
          {loading === "ai-research" ? "Researching…" : "Start Research"}
        </button>
        <button
          className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          onClick={() => {
            copyText(researchOutput);
            toast.success("Answer copied!");
          }}
          disabled={!researchOutput}
        >
          Copy Answer
        </button>
        <button
          className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          onClick={() => {
            copyText(researchEvidenceSources);
            toast.success("Evidence sources copied!");
          }}
          disabled={!researchEvidenceSources}
        >
          Copy Evidence Sources
        </button>
      </div>

      <textarea
        value={researchOutput}
        onChange={(e) => setResearchOutput(e.target.value)}
        placeholder="Synthesized answers will be streamed here..."
        className="w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text-secondary outline-none focus:border-accent transition-all min-h-[300px] placeholder:text-text-muted/50"
      />

      {researchEvidenceSources && (
        <div className="rounded-lg bg-surface border border-border p-4 space-y-2">
          <div className="text-[12.5px] font-medium text-text-primary">Retrieved Evidence Sources</div>
          <pre className="text-[12px] text-text-muted whitespace-pre-wrap font-mono">{researchEvidenceSources}</pre>
        </div>
      )}
    </div>
  );
}
