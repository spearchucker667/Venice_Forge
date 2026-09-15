import React from "react";
import { Field } from "../../components/Field";
import { copyText } from "../../utils/download";
import { toast } from "../../stores/toast-store";
import type { ResearchBudget } from "../../research/agent/researchRunner";
import { Trans, useTranslation } from "react-i18next";

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
  setResearchScrapeProvider: (
    val: "venice" | "jina" | "generic-http" | "auto",
  ) => void;
  researchRunMode: "retrieve-only" | "retrieve-and-synthesize";
  setResearchRunMode: (
    val: "retrieve-only" | "retrieve-and-synthesize",
  ) => void;
  researchBudget: ResearchBudget;
  setResearchBudget: (val: ResearchBudget) => void;
  loading: string;
  runAiResearch: () => void;
  researchOutput: string;
  setResearchOutput: (val: string) => void;
  researchEvidenceSources: string;
}) {
  const { t: tRuntime } = useTranslation("common");
  const budgetField = (
    label: string,
    value: number,
    min: number,
    max: number,
    setter: (n: number) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor="ai-research-1" className="text-[12px] text-text-muted">{label}</label>
      <input
        type="number" id="ai-research-1" 
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          setter(Math.min(max, Math.max(min, Number(e.target.value))))
        }
        className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent transition-all"
      />
    </div>
  );

  return (
    <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">
        <Trans i18nKey="common:surface.componentsSearchAiresearchtab.heading.deepAiResearchAgent" />
      </h3>
      <p className="text-[12.5px] text-text-secondary leading-relaxed">
        <Trans i18nKey="common:surface.componentsSearchAiresearchtab.description.executesARecursiveWebSearchLoopScrapes" />
      </p>

      <Field
        label={tRuntime(
          "runtimeGenerated.components.search.airesearchtab.attribute.researchQuestion",
        )}
      >
        <input
          value={researchQuestion}
          onChange={(e) => setResearchQuestion(e.target.value)}
          placeholder={tRuntime(
            "runtimeGenerated.components.search.airesearchtab.attribute.whatAreTheLatestChangesInSafetyPoliciesOfFrontier",
          )}
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={tRuntime(
            "runtimeGenerated.components.search.airesearchtab.attribute.searchProvider",
          )}
        >
          <select
            value={researchProviderId}
            onChange={(e) =>
              setResearchProviderId(e.target.value as "venice" | "jina")
            }
            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
          >
            <option value="venice">Venice (Brave/Google)</option>
            <option value="jina">
              <Trans i18nKey="common:surface.componentsSearchAiresearchtab.option.jinaAiSearchReader" />
            </option>
          </select>
        </Field>

        <Field
          label={tRuntime(
            "runtimeGenerated.components.search.airesearchtab.attribute.veniceSearchEngine",
          )}
        >
          <select
            value={researchSearchProvider}
            onChange={(e) =>
              setResearchSearchProvider(
                e.target.value as "brave" | "google" | "auto",
              )
            }
            disabled={researchProviderId !== "venice"}
            className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer disabled:opacity-50"
          >
            <option value="auto">
              <Trans i18nKey="common:surface.componentsSearchAiresearchtab.option.autoDefaultFromConfig" />
            </option>
            <option value="brave">
              <Trans i18nKey="common:surface.componentsSearchAiresearchtab.option.braveSearch" />
            </option>
            <option value="google">
              <Trans i18nKey="common:surface.componentsSearchAiresearchtab.option.googleSearch" />
            </option>
          </select>
        </Field>
      </div>

      <Field
        label={tRuntime(
          "runtimeGenerated.components.search.airesearchtab.attribute.runMode",
        )}
      >
        <select
          value={researchRunMode}
          onChange={(e) =>
            setResearchRunMode(
              e.target.value as "retrieve-only" | "retrieve-and-synthesize",
            )
          }
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
        >
          <option value="retrieve-and-synthesize">
            <Trans i18nKey="common:surface.componentsSearchAiresearchtab.option.retrieveSynthesizeUsesVeniceModel" />
          </option>
          <option value="retrieve-only">
            <Trans i18nKey="common:surface.componentsSearchAiresearchtab.option.retrieveOnlyNoAiSynthesis" />
          </option>
        </select>
      </Field>

      <div className="rounded-md bg-vf-panel-bg border border-vf-panel-border p-4 space-y-3">
        <div className="text-[12.5px] font-medium text-text-primary">
          <Trans i18nKey="common:surface.componentsSearchAiresearchtab.text.budgetControls" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {budgetField("Max Queries", researchBudget.maxQueries, 1, 8, (n) =>
            setResearchBudget({ ...researchBudget, maxQueries: n }),
          )}
          {budgetField(
            "Max Results/Query",
            researchBudget.maxResultsPerQuery,
            1,
            10,
            (n) =>
              setResearchBudget({ ...researchBudget, maxResultsPerQuery: n }),
          )}
          {budgetField("Max Pages", researchBudget.maxPages, 0, 10, (n) =>
            setResearchBudget({ ...researchBudget, maxPages: n }),
          )}
          {budgetField(
            "Max Chars/Page",
            researchBudget.maxCharsPerPage,
            1000,
            20000,
            (n) => setResearchBudget({ ...researchBudget, maxCharsPerPage: n }),
          )}
          {budgetField(
            "Request Timeout (ms)",
            researchBudget.perRequestTimeoutMs,
            5000,
            60000,
            (n) =>
              setResearchBudget({ ...researchBudget, perRequestTimeoutMs: n }),
          )}
          {budgetField(
            "Total Timeout (ms)",
            researchBudget.totalJobTimeoutMs,
            30000,
            180000,
            (n) =>
              setResearchBudget({ ...researchBudget, totalJobTimeoutMs: n }),
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          className="px-4 py-2 rounded-md text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer shadow-[0_0_8px_var(--color-vf-accent-glow)]"
          onClick={runAiResearch}
          disabled={loading === "ai-research" || !researchQuestion.trim()}
        >
          {loading === "ai-research"
            ? tRuntime(
                "runtimeGenerated.components.search.airesearchtab.text.researching",
              )
            : tRuntime(
                "runtimeGenerated.components.search.airesearchtab.text.startResearch",
              )}
        </button>
        <button
          className="px-3.5 py-2 rounded-md text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
          onClick={() => {
            copyText(researchOutput);
            toast.success(
              tRuntime(
                "runtimeGenerated.components.search.airesearchtab.notification.answerCopied",
              ),
            );
          }}
          disabled={!researchOutput}
        >
          <Trans i18nKey="common:surface.componentsSearchAiresearchtab.action.copyAnswer" />
        </button>
        <button
          className="px-3.5 py-2 rounded-md text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
          onClick={() => {
            copyText(researchEvidenceSources);
            toast.success(
              tRuntime(
                "runtimeGenerated.components.search.airesearchtab.notification.evidenceSourcesCopied",
              ),
            );
          }}
          disabled={!researchEvidenceSources}
        >
          <Trans i18nKey="common:surface.componentsSearchAiresearchtab.action.copyEvidenceSources" />
        </button>
      </div>

      <textarea
        value={researchOutput}
        onChange={(e) => setResearchOutput(e.target.value)}
        placeholder={tRuntime(
          "runtimeGenerated.components.search.airesearchtab.attribute.synthesizedAnswersWillBeStreamedHere",
        )}
        className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2.5 text-[13px] text-text-secondary outline-none focus:border-accent transition-all min-h-[300px] placeholder:text-text-muted/50"
      />

      {researchEvidenceSources && (
        <div className="rounded-md bg-vf-panel-bg border border-vf-panel-border p-4 space-y-2">
          <div className="text-[12.5px] font-medium text-text-primary">
            <Trans i18nKey="common:surface.componentsSearchAiresearchtab.text.retrievedEvidenceSources" />
          </div>
          <pre className="text-[12px] text-text-muted whitespace-pre-wrap font-mono">
            {researchEvidenceSources}
          </pre>
        </div>
      )}
    </div>
  );
}
