import React, { useState, useRef, useEffect, useCallback } from "react";
import { veniceFetch } from "../services/veniceClient";
import { assessChildExploitationSafety, recordDecision } from "../shared/safety";
import { Field } from "../components/Field";
import { Chip } from "../components/Chip";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { copyText } from "../utils/download";
import { isValidSearchResponse } from "../utils/veniceValidation";
import { MAX_RAW_UPLOAD_BYTES } from "../services/veniceClient";
import { useSettingsStore } from "../stores/settings-store";
import { veniceResearchProvider } from "../research/providers/veniceResearchProvider";
import { createJinaProvider } from "../research/providers/jinaResearchProvider";
import { runResearchJob, type ResearchBudget } from "../research/agent/researchRunner";
import { synthesizeResearch } from "../research/agent/researchSynthesis";
import { runSocialDiscovery, type SocialProfileCandidate } from "../research/agent/socialDiscovery";
import { toast } from "../stores/toast-store";
import { isElectron } from "../services/desktopBridge";
import type { DiagnosticsEntry } from "../types/venice";

interface SearchResultItem {
  title?: string;
  name?: string;
  url?: string;
  link?: string;
  snippet?: string;
  content?: string;
  description?: string;
  date?: string;
}

type SubTab = "search" | "ai-research" | "profile-discovery";

const ALL_PLATFORMS = [
  "GitHub",
  "LinkedIn",
  "X/Twitter",
  "Instagram",
  "TikTok",
  "YouTube",
  "Reddit",
  "Facebook",
  "Bluesky",
  "Threads",
  "Mastodon",
  "personal website",
];

export function safeHref(url: string | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}

export function SearchScrapeView() {
  const [subTab, setSubTab] = useState<SubTab>("search");
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat) || "llama-3.3-70b";

  // --- Search / Scrape state ---
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("brave");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [url, setUrl] = useState("");
  const [scrapeOutput, setScrapeOutput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parserOutput, setParserOutput] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsEntry | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  // --- AI Research state ---
  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchOutput, setResearchOutput] = useState("");
  const [researchCitations, setResearchCitations] = useState("");
  const [researchProviderId, setResearchProviderId] = useState<"venice" | "jina">("venice");

  // --- Public Profile Discovery state ---
  const [targetName, setTargetName] = useState("");
  const [knownUsername, setKnownUsername] = useState("");
  const [knownWebsite, setKnownWebsite] = useState("");
  const [knownOrg, setKnownOrg] = useState("");
  const [knownLocation, setKnownLocation] = useState("");
  const [allowedPlatforms, setAllowedPlatforms] = useState<string[]>(["GitHub", "LinkedIn", "X/Twitter"]);
  const [maxDepth, setMaxDepth] = useState(5);
  const [authorized, setAuthorized] = useState(false);
  const [profileCandidates, setProfileCandidates] = useState<SocialProfileCandidate[]>([]);

  // Update diagnostics helper
  const refreshDiagnostics = useCallback(async () => {
    if (!isElectron()) return;
    try {
      const result = await window.veniceForge!.app.getDiagnostics();
      setDiagnostics(result as unknown as DiagnosticsEntry);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshDiagnostics();
    return () => {
      abortRef.current?.abort();
    };
  }, [refreshDiagnostics]);

  const beginRun = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return {
      runId: ++runIdRef.current,
      signal: controller.signal,
    };
  }, []);

  async function runSearch() {
    if (!query.trim()) return;
    setError("");
    const guardDecision = assessChildExploitationSafety({ text: query.trim(), endpoint: "/augment/search", method: "POST", source: "research" });
    recordDecision(guardDecision);
    if (!guardDecision.allow || guardDecision.action === "block") {
      setError(guardDecision.userMessage);
      return;
    }
    setLoading("search");
    setSearchResults([]);
    const { runId, signal } = beginRun();
    try {
      const { data, diagnostics: d } = await veniceFetch<Record<string, unknown>>("/augment/search", {
        method: "POST",
        body: { query: query.trim(), provider },
        signal,
        validator: isValidSearchResponse,
      });
      if (runIdRef.current !== runId) return;
      if (d) setDiagnostics(d as DiagnosticsEntry);
      const results =
        data?.results ||
        data?.data ||
        data?.items ||
        (Array.isArray(data) ? data : []);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "Search failed");
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runScrape() {
    if (!url.trim()) return;
    if (safeHref(url.trim()) === "#") {
      setError("Enter a valid public http(s) URL.");
      return;
    }
    setError("");
    setLoading("scrape");
    setScrapeOutput("");
    const { runId, signal } = beginRun();
    try {
      const { data, diagnostics: d } = await veniceFetch<Record<string, unknown>>("/augment/scrape", {
        method: "POST",
        body: { url: url.trim() },
        signal,
      });
      if (runIdRef.current !== runId) return;
      if (d) setDiagnostics(d as DiagnosticsEntry);
      const scrapeData = data as Record<string, unknown>;
      setScrapeOutput(
        String(scrapeData.markdown || scrapeData.content || scrapeData.text || JSON.stringify(scrapeData, null, 2))
      );
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "Scrape failed");
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runParser() {
    if (!file) return;
    if (file.size > MAX_RAW_UPLOAD_BYTES) {
      setError(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / (1024 * 1024))} MiB.`);
      return;
    }
    setError("");
    setLoading("parser");
    setParserOutput("");
    const { runId, signal } = beginRun();
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("response_format", "json");
      const { data, diagnostics: d } = await veniceFetch<Record<string, unknown>>("/augment/text-parser", {
        method: "POST",
        body: form,
        signal,
        isFormData: true,
      });
      if (runIdRef.current !== runId) return;
      if (d) setDiagnostics(d as DiagnosticsEntry);
      const parserData = data as Record<string, unknown>;
      setParserOutput(String(parserData.text || JSON.stringify(parserData, null, 2)));
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError")
        setError(error.message || "Text parser failed");
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runAiResearch() {
    if (!researchQuestion.trim()) return;
    setError("");
    const researchGuard = assessChildExploitationSafety({
      text: researchQuestion.trim(),
      endpoint: "/augment/search",
      method: "POST",
      source: "research",
    });
    recordDecision(researchGuard);
    if (!researchGuard.allow || researchGuard.action === "block") {
      setError(researchGuard.userMessage);
      return;
    }
    setLoading("ai-research");
    setResearchOutput("");
    setResearchCitations("");
    const { runId, signal } = beginRun();

    const budget: ResearchBudget = {
      maxQueries: 4,
      maxResultsPerQuery: 5,
      maxPages: 3,
      maxCharsPerPage: 4000,
      perRequestTimeoutMs: 15000,
      totalJobTimeoutMs: 120000,
    };

    try {
      const provider = researchProviderId === "jina" 
        ? createJinaProvider()
        : veniceResearchProvider;
      const job = await runResearchJob({
        question: researchQuestion.trim(),
        provider,
        budget,
        signal,
      });

      if (runIdRef.current !== runId) return;
      if (!job.ok) {
        setError(job.error || "Research job failed.");
        return;
      }

      const citations = Array.isArray(job.evidence?.citations) ? job.evidence.citations : [];
      setResearchCitations(citations.join("\n"));

      let full = "";
      await synthesizeResearch({
        question: researchQuestion.trim(),
        evidence: job.evidence,
        model: selectedModel,
        signal,
        onDelta: (delta) => {
          if (runIdRef.current !== runId) return;
          full += delta;
          setResearchOutput(full);
        },
      });
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "AI research failed");
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runProfileDiscovery() {
    if (!targetName.trim() || !authorized) return;
    setError("");
    const profileGuardText = [
      targetName.trim(),
      knownUsername.trim(),
      knownWebsite.trim(),
      knownOrg.trim(),
      knownLocation.trim(),
    ].filter(Boolean).join("\n\n");

    const profileGuard = assessChildExploitationSafety({
      text: profileGuardText,
      endpoint: "/augment/search",
      method: "POST",
      source: "research",
    });
    recordDecision(profileGuard);
    if (!profileGuard.allow || profileGuard.action === "block") {
      setError(profileGuard.userMessage);
      return;
    }
    setLoading("profile-discovery");
    setProfileCandidates([]);
    const { runId, signal } = beginRun();

    try {
      const result = await runSocialDiscovery(
        {
          targetName: targetName.trim(),
          knownUsername: knownUsername.trim() || undefined,
          knownWebsite: knownWebsite.trim() || undefined,
          knownOrganization: knownOrg.trim() || undefined,
          knownLocation: knownLocation.trim() || undefined,
          allowedPlatforms,
          maxSearchDepth: maxDepth,
          authorized,
          signal,
        },
        veniceResearchProvider
      );

      if (runIdRef.current !== runId) return;
      if (!result.ok) {
        setError(result.error || "Profile discovery failed.");
        return;
      }

      setProfileCandidates(result.candidates);
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "Profile discovery failed");
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  function togglePlatform(platform: string) {
    setAllowedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  function cancelRun() {
    runIdRef.current++;
    abortRef.current?.abort();
    setLoading("");
  }

  const tabBtn = (id: SubTab, label: string) => (
    <button
      key={id}
      onClick={() => setSubTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        subTab === id
          ? "bg-white/[0.06] text-white border border-white/[0.04]"
          : "text-white/50 hover:text-white/80 hover:bg-white/[0.02]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex-none p-5 border-b border-white/[0.05] bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-white/95">Research</h2>
            <p className="text-[12.5px] text-white/40 mt-0.5">
              Search the web, scrape articles, and analyze social profiles.
            </p>
          </div>
          <DiagPreview diagnostics={diagnostics} />
        </div>
        <div className="flex gap-2 mt-4">
          {tabBtn("search", "Search / Scrape")}
          {tabBtn("ai-research", "AI Research")}
          {tabBtn("profile-discovery", "Profile Discovery")}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {error && (
          <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm leading-relaxed">
            {error}
          </div>
        )}

        {subTab === "search" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Web Search */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg flex flex-col gap-4">
                <h3 className="text-[14.5px] font-medium text-white/85">Web Search</h3>
                
                <Field label="Query">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="latest model routing best practices"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  />
                </Field>

                <Field label="Provider">
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  >
                    <option value="brave">Brave Search</option>
                    <option value="google">Google Search</option>
                  </select>
                </Field>

                <button
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors self-start"
                  onClick={runSearch}
                  disabled={loading === "search" || !query.trim()}
                >
                  {loading === "search" ? "Searching…" : "Search"}
                </button>
                
                <div className="flex flex-col gap-3 mt-2 overflow-y-auto max-h-[360px]">
                  {searchResults.map((r, idx) => (
                    <div key={idx} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 text-[13px]">
                      <strong className="text-white/85 block mb-1">
                        {r.title || r.name || "Untitled result"}
                      </strong>
                      <a href={safeHref(r.url || r.link)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all text-[11px] block mb-2">
                        {r.url || r.link}
                      </a>
                      <div className="text-white/50 leading-relaxed">
                        {r.snippet || r.content || r.description || ""}
                      </div>
                    </div>
                  ))}
                  {!searchResults.length && (
                    <div className="text-[12px] text-white/30 text-center py-6">
                      No search results yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Web Scrape */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg flex flex-col gap-4">
                <h3 className="text-[14.5px] font-medium text-white/85">Web Scrape</h3>
                
                <Field label="URL to scrape">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  />
                </Field>

                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors"
                    onClick={runScrape}
                    disabled={loading === "scrape" || !url.trim()}
                  >
                    {loading === "scrape" ? "Scraping…" : "Scrape"}
                  </button>
                  <button
                    className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-white/[0.08] transition-colors"
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
                  className="w-full flex-1 bg-white/[0.01] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-[13px] text-white/70 outline-none font-mono focus:border-white/[0.15] transition-all min-h-[220px]"
                />
              </div>
            </div>

            {/* Document parser */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg space-y-4">
              <h3 className="text-[14.5px] font-medium text-white/85">Document Text Parser</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <p className="text-[12.5px] text-white/40 leading-relaxed">
                    Extract raw text from PDF, DOCX, XLSX, or TXT documents.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.txt,text/plain,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-[13px] text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[12.5px] file:font-semibold file:bg-white/[0.05] file:text-white file:cursor-pointer"
                  />
                  <button
                    className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors"
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
                  className="w-full bg-white/[0.01] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-[13px] text-white/70 outline-none font-mono focus:border-white/[0.15] transition-all min-h-[160px]"
                />
              </div>
            </div>
          </div>
        )}

        {subTab === "ai-research" && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg flex flex-col gap-4">
            <h3 className="text-[14.5px] font-medium text-white/85">Deep AI Research Agent</h3>
            <p className="text-[12.5px] text-white/40 leading-relaxed">
              Executes a recursive web search loop, scrapes multiple sources, parses citations, and synthesizes a comprehensive final response.
            </p>

            <Field label="Research Question">
              <input
                value={researchQuestion}
                onChange={(e) => setResearchQuestion(e.target.value)}
                placeholder="What are the latest changes in safety policies of frontier AI labs?"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
              />
            </Field>

            <Field label="Provider">
              <select
                value={researchProviderId}
                onChange={(e) => setResearchProviderId(e.target.value as "venice" | "jina")}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
              >
                <option value="venice">Venice AI Search Loop</option>
                <option value="jina">Jina AI Reader & Search API</option>
              </select>
            </Field>

            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors"
                onClick={runAiResearch}
                disabled={loading === "ai-research" || !researchQuestion.trim()}
              >
                {loading === "ai-research" ? "Researching…" : "Start Research"}
              </button>
              <button
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-white/[0.08] transition-colors"
                onClick={() => {
                  copyText(researchOutput);
                  toast.success("Answer copied!");
                }}
                disabled={!researchOutput}
              >
                Copy Answer
              </button>
              <button
                className="px-3.5 py-2 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 hover:bg-white/[0.08] transition-colors"
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
              className="w-full bg-white/[0.01] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-[13px] text-white/70 outline-none focus:border-white/[0.15] transition-all min-h-[300px]"
            />

            {researchCitations && (
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 space-y-2">
                <div className="text-[12.5px] font-medium text-white/80">Citations & References</div>
                <pre className="text-[11.5px] text-white/50 whitespace-pre-wrap font-mono">{researchCitations}</pre>
              </div>
            )}
          </div>
        )}

        {subTab === "profile-discovery" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-[14.5px] font-medium text-white/85">Public Profile Discovery</h3>
              <p className="text-[12.5px] text-white/40 leading-relaxed">
                Aggregates social profile mappings from public databases (GitHub, Twitter, LinkedIn, etc.) using Venice web integration.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Target Name">
                  <input
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="Consenting person or Brand Name"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  />
                </Field>
                <Field label="Known Handle/Username">
                  <input
                    value={knownUsername}
                    onChange={(e) => setKnownUsername(e.target.value)}
                    placeholder="@username"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all font-mono"
                  />
                </Field>
                <Field label="Known Website">
                  <input
                    value={knownWebsite}
                    onChange={(e) => setKnownWebsite(e.target.value)}
                    placeholder="example.com"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all font-mono"
                  />
                </Field>
                <Field label="Known Organization">
                  <input
                    value={knownOrg}
                    onChange={(e) => setKnownOrg(e.target.value)}
                    placeholder="GitHub Inc."
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  />
                </Field>
                <Field label="Known Location">
                  <input
                    value={knownLocation}
                    onChange={(e) => setKnownLocation(e.target.value)}
                    placeholder="San Francisco, CA"
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  />
                </Field>
                <Field label="Max Search Depth">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value) || 3)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3.5 py-2 text-[14px] text-white outline-none focus:border-white/[0.2] transition-all"
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <label className="text-[12.5px] text-white/50 block font-medium">Platforms to search</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PLATFORMS.map((platform) => {
                    const isSelected = allowedPlatforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        className={`text-[12px] px-2.5 py-1 rounded-lg border transition-all duration-150 ${
                          isSelected 
                            ? "bg-white/[0.08] border-white/[0.15] text-white font-medium" 
                            : "bg-transparent border-white/[0.04] text-white/40 hover:text-white/60 hover:bg-white/[0.01]"
                        }`}
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] cursor-pointer mt-2">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-white/[0.08] bg-white/[0.02] text-white focus:ring-offset-0 focus:ring-0 w-4 h-4"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
                <span className="text-[12.5px] text-white/50 leading-relaxed">
                  I confirm this search is for myself, my organization/brand, a consenting person, a public figure, or another authorized public-interest use. Search will use public web results only.
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black hover:bg-white/95 disabled:opacity-40 transition-colors"
                  onClick={runProfileDiscovery}
                  disabled={loading === "profile-discovery" || !targetName.trim() || !authorized}
                >
                  {loading === "profile-discovery" ? "Discovering…" : "Discover Profiles"}
                </button>
                {loading === "profile-discovery" && (
                  <button 
                    className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] transition-colors"
                    onClick={cancelRun}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {profileCandidates.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14.5px] font-medium text-white/85">Discovered Profile Candidates</h3>
                  <Chip tone="ok">{profileCandidates.length} Candidates</Chip>
                </div>
                <div className="space-y-3">
                  {profileCandidates.map((c, idx) => (
                    <div key={idx} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 text-[13px] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white/90">{c.platform}</span>
                        <Chip tone={c.confidence === "high" ? "ok" : c.confidence === "medium" ? "warn" : "neutral"}>
                          {c.confidence} confidence
                        </Chip>
                      </div>
                      <div className="text-white/70">
                        {c.displayName || "Unknown Identity"} {c.handle && <span className="text-white/40 ml-1">@{c.handle.replace(/^@+/, "")}</span>}
                      </div>
                      <a href={safeHref(c.url)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all text-[11px] block">
                        {c.url}
                      </a>
                      {c.bioSnippet && <p className="text-[12px] text-white/50 italic leading-relaxed">{c.bioSnippet}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
