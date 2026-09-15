import React from "react";
import { Trans, useTranslation } from "react-i18next";

const SUPPORTED_DOCUMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".doc",
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".csv",
  ".xml",
  ".html",
  ".htm",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".java",
  ".kt",
  ".kts",
  ".swift",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".bat",
  ".cmd",
  ".sql",
  ".toml",
  ".ini",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ".svg",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  "text/plain",
  "application/pdf",
  "application/json",
  "image/*",
].join(",");

export function TextParserTab({
  file,
  setFile,
  loading,
  runParser,
  parserOutput,
  setParserOutput,
}: {
  file: File | null;
  setFile: (val: File | null) => void;
  loading: string;
  runParser: () => void;
  parserOutput: string;
  setParserOutput: (val: string) => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  return (
    <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
      <h3 className="text-[14.5px] font-medium text-text-primary">
        <Trans i18nKey="common:surface.componentsSearchTextparsertab.heading.documentTextParser" />
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            <Trans i18nKey="common:surface.componentsSearchTextparsertab.description.extractRawTextFromPdfDocxXlsx" />
          </p>
          <input
            type="file"
            accept={SUPPORTED_DOCUMENT_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-[13px] text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[12.5px] file:font-semibold file:bg-vf-panel-bg-raised file:text-text-primary file:cursor-pointer"
          />
          <button
            className="px-4 py-2 rounded-md text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer shadow-[0_0_8px_var(--color-vf-accent-glow)]"
            onClick={runParser}
            disabled={loading === "parser" || !file}
          >
            {loading === "parser"
              ? tRuntime(
                  "runtimeGenerated.components.search.textparsertab.text.parsing",
                )
              : tRuntime(
                  "runtimeGenerated.components.search.textparsertab.text.parseDocument",
                )}
          </button>
        </div>
        <textarea
          value={parserOutput}
          onChange={(e) => setParserOutput(e.target.value)}
          placeholder={tRuntime(
            "runtimeGenerated.components.search.textparsertab.attribute.extractedDocumentText",
          )}
          className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2.5 text-[13px] text-text-secondary outline-none font-mono focus:border-accent transition-all min-h-[160px] placeholder:text-text-muted/50"
        />
      </div>
    </div>
  );
}
