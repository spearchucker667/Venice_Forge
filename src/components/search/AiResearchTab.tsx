import React from "react";
import { Field } from "../../components/Field";
import { copyText } from "../../utils/download";
import { toast } from "../../stores/toast-store";

export function AiResearchTab({
  researchQuestion,
  setResearchQuestion,
  researchProviderId,
  setResearchProviderId,
  loading,
  runAiResearch,
  researchOutput,
  setResearchOutput,
  researchCitations
}: {
  researchQuestion: string;
  setResearchQuestion: (val: string) => void;
  researchProviderId: "venice" | "jina";
  setResearchProviderId: (val: "venice" | "jina") => void;
  loading: string;
  runAiResearch: () => void;
  researchOutput: string;
  setResearchOutput: (val: string) => void;
  researchCitations: string;
}) {
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

      <Field label="Provider">
        <select
          value={researchProviderId}
          onChange={(e) => setResearchProviderId(e.target.value as "venice" | "jina")}
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
        >
          <option value="venice">Venice AI Search Loop</option>
          <option value="jina">Jina AI Reader & Search API</option>
        </select>
      </Field>

      <div className="flex gap-2">
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
            copyText(researchCitations);
            toast.success("Citations copied!");
          }}
          disabled={!researchCitations}
        >
          Copy Citations
        </button>
      </div>

      <textarea
        value={researchOutput}
        onChange={(e) => setResearchOutput(e.target.value)}
        placeholder="Synthesized answers will be streamed here..."
        className="w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text-secondary outline-none focus:border-accent transition-all min-h-[300px] placeholder:text-text-muted/50"
      />

      {researchCitations && (
        <div className="rounded-lg bg-surface border border-border p-4 space-y-2">
          <div className="text-[12.5px] font-medium text-text-primary">Citations & References</div>
          <pre className="text-[11.5px] text-text-muted whitespace-pre-wrap font-mono">{researchCitations}</pre>
        </div>
      )}
    </div>
  );
}
