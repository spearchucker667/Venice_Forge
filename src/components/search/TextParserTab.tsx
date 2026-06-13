import React from "react";

export function TextParserTab({
  file,
  setFile,
  loading,
  runParser,
  parserOutput,
  setParserOutput
}: {
  file: File | null;
  setFile: (val: File | null) => void;
  loading: string;
  runParser: () => void;
  parserOutput: string;
  setParserOutput: (val: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">Document Text Parser</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            Extract raw text from PDF, DOCX, XLSX, or TXT documents.
          </p>
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.txt,text/plain,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-[13px] text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12.5px] file:font-semibold file:bg-surface-elevated file:text-text-primary file:cursor-pointer"
          />
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
            onClick={runParser}
            disabled={loading === "parser" || !file}
          >
            {loading === "parser" ? "Parsing…" : "Parse Document"}
          </button>
        </div>
        <textarea
          value={parserOutput}
          onChange={(e) => setParserOutput(e.target.value)}
          placeholder="Extracted document text..."
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text-secondary outline-none font-mono focus:border-accent transition-all min-h-[160px] placeholder:text-text-muted/50"
        />
      </div>
    </div>
  );
}
