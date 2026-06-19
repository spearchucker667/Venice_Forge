import React, { useState, useRef, useEffect, useCallback } from "react";
import { veniceFetch } from "../../services/veniceClient";
import { maybeRunLocalFamilyGuard } from "../../shared/safety";
import { DiagPreview } from "../../components/DiagnosticsPreview";
import { isValidSearchResponse } from "../../utils/veniceValidation";
import { describeResearchError } from "../../utils/researchError";
import { MAX_RAW_UPLOAD_BYTES } from "../../services/veniceClient";
import { useSettingsStore } from "../../stores/settings-store";
import { veniceResearchProvider } from "../../research/providers/veniceResearchProvider";
import { createJinaProvider } from "../../research/providers/jinaResearchProvider";
import { runResearchJob, type ResearchBudget } from "../../research/agent/researchRunner";
import { synthesizeResearch } from "../../research/agent/researchSynthesis";
import { runSocialDiscovery, type SocialProfileCandidate } from "../../research/agent/socialDiscovery";
import { useAuthStore } from "../../stores/auth-store";
import type { DiagnosticsEntry } from "../../types/venice";

import { SearchTab } from "./SearchTab";
import { ScrapeTab } from "./ScrapeTab";
import { TextParserTab } from "./TextParserTab";
import { AiResearchTab } from "./AiResearchTab";
import { ProfileDiscoveryTab } from "./ProfileDiscoveryTab";
import { ResearchWorkspacePanel } from "./ResearchWorkspacePanel";
import type { SubTab, SearchResultItem } from "./searchScrapeTypes";

import { ResearchProviderStatus } from "./ResearchProviderStatus";
import { ResearchBrowserView } from "../research/ResearchBrowserView";
import { useResearchStore } from "../../stores/research-store";
import { toast } from "../../stores/toast-store";
import { runResearchScrape } from "../../services/researchService";
import { researchBrowserBridge } from "../../services/researchBrowserBridge";
import { isElectron } from "../../services/desktopBridge";
import { isTrustedExternalUrl } from "../../shared/urlSecurity";

import { DEFAULT_CHAT_MODEL } from "../../constants/venice";

export function SearchScrapeView() {
  const [subTab, setSubTab] = useState<SubTab>("workspace");
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat) || DEFAULT_CHAT_MODEL;
  const localFamilySafeModeEnabled = useSettingsStore((s) => s.localFamilySafeModeEnabled);
  const veniceKeyConfigured = useAuthStore((s) => s.isConfigured);

  function requireVeniceApiKey(where: string): boolean {
    if (veniceKeyConfigured) return true;
    setError(
      `Venice API key is not configured. Open the API Key dialog (lock icon in the header) and add your Venice key before ${where}.`,
    );
    return false;
  }

  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("brave");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [url, setUrl] = useState("");
  const [scrapeOutput, setScrapeOutput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parserOutput, setParserOutput] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<Partial<DiagnosticsEntry> | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchOutput, setResearchOutput] = useState("");
  const [researchCitations, setResearchCitations] = useState("");
  const [researchProviderId, setResearchProviderId] = useState<"venice" | "jina">("venice");
  const [researchSearchProvider, setResearchSearchProvider] = useState<"brave" | "google" | "auto">("auto");
  const [researchScrapeProvider, setResearchScrapeProvider] = useState<"venice" | "jina" | "generic-http" | "auto">("auto");
  const [researchRunMode, setResearchRunMode] = useState<"retrieve-only" | "retrieve-and-synthesize">("retrieve-and-synthesize");
  const [researchBudget, setResearchBudget] = useState<ResearchBudget>({
    maxQueries: 4,
    maxResultsPerQuery: 5,
    maxPages: 3,
    maxCharsPerPage: 4000,
    perRequestTimeoutMs: 15000,
    totalJobTimeoutMs: 120000,
  });

  const [targetName, setTargetName] = useState("");
  const [knownUsername, setKnownUsername] = useState("");
  const [knownWebsite, setKnownWebsite] = useState("");
  const [knownOrg, setKnownOrg] = useState("");
  const [knownLocation, setKnownLocation] = useState("");
  const [allowedPlatforms, setAllowedPlatforms] = useState<string[]>(["GitHub", "LinkedIn", "X/Twitter"]);
  const [maxDepth, setMaxDepth] = useState(5);
  const [authorized, setAuthorized] = useState(false);
  const [profileCandidates, setProfileCandidates] = useState<SocialProfileCandidate[]>([]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
    if (!requireVeniceApiKey("running web search")) return;
    setError("");
    const guardDecision = maybeRunLocalFamilyGuard(
      { text: query.trim(), endpoint: "/augment/search", method: "POST", source: "research" },
      localFamilySafeModeEnabled,
    );
    if (!guardDecision.allowed) {
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
      if (d) setDiagnostics(d as Partial<DiagnosticsEntry>);
      const results =
        data?.results ||
        data?.data ||
        data?.items ||
        (Array.isArray(data) ? data : []);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(describeResearchError(error, "Search failed."));
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runScrape(explicitUrl?: string) {
    const targetUrl = (explicitUrl ?? url).trim();
    if (!targetUrl) return;
    if (!requireVeniceApiKey("scraping a URL")) return;
    setError("");
    setLoading("scrape");
    setScrapeOutput("");
    const { runId, signal } = beginRun();
    try {
      const { data, diagnostics: d } = await veniceFetch<Record<string, unknown>>("/augment/scrape", {
        method: "POST",
        body: { url: targetUrl },
        signal,
      });
      if (runIdRef.current !== runId) return;
      if (d) setDiagnostics(d as Partial<DiagnosticsEntry>);
      const scrapeData = data as Record<string, unknown>;
      setScrapeOutput(
        String(scrapeData.markdown || scrapeData.content || scrapeData.text || JSON.stringify(scrapeData, null, 2))
      );
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(describeResearchError(error, "Scrape failed."));
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runParser() {
    if (!file) return;
    if (!requireVeniceApiKey("parsing a document")) return;
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
      if (d) setDiagnostics(d as Partial<DiagnosticsEntry>);
      const parserData = data as Record<string, unknown>;
      setParserOutput(String(parserData.text || JSON.stringify(parserData, null, 2)));
    } catch (err: unknown) {
      if (runIdRef.current !== runId) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError")
        setError(describeResearchError(error, "Text parser failed."));
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runAiResearch() {
    if (!researchQuestion.trim()) return;
    if (researchRunMode === "retrieve-and-synthesize" && !requireVeniceApiKey("running AI research synthesis")) return;
    setError("");
    const researchGuard = maybeRunLocalFamilyGuard({
      text: researchQuestion.trim(),
      endpoint: "/augment/search",
      method: "POST",
      source: "research",
    }, localFamilySafeModeEnabled);
    if (!researchGuard.allowed) {
      setError(researchGuard.userMessage);
      return;
    }
    setLoading("ai-research");
    setResearchOutput("");
    setResearchCitations("");
    const { runId, signal } = beginRun();

    try {
      // Resolve search provider
      let searchProvider = researchProviderId === "jina" ? createJinaProvider() : veniceResearchProvider;
      if (researchProviderId === "venice" && researchSearchProvider !== "auto") {
        searchProvider = {
          ...veniceResearchProvider,
          search: veniceResearchProvider.search
            ? (input) => veniceResearchProvider.search!({ ...input, options: { ...input.options, provider: researchSearchProvider } })
            : undefined,
        };
      }
      if (researchProviderId === "jina" && researchSearchProvider !== "auto") {
        // Jina search is just jina search, no sub-provider variant
      }

      const job = await runResearchJob({
        question: researchQuestion.trim(),
        provider: searchProvider,
        budget: researchBudget,
        signal,
      });

      if (runIdRef.current !== runId) return;
      if (!job.ok) {
        setError(job.error || "Research job failed.");
        return;
      }

      const citations = Array.isArray(job.evidence?.citations) ? job.evidence.citations : [];
      setResearchCitations(citations.join("\n"));

      if (researchRunMode === "retrieve-only") {
        setResearchOutput(
          `## Retrieved Evidence\n\n` +
          `**Queries used:** ${job.queriesUsed.join(", ")}\n\n` +
          `**Sources found:** ${job.evidence.searchResults.length}\n\n` +
          `**Pages scraped:** ${job.evidence.scrapes.length}\n\n` +
          `---\n\n` +
          job.evidence.searchResults.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   > ${r.snippet || ""}`).join("\n\n")
        );
        return;
      }

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
      if (error.name !== "AbortError")
        setError(describeResearchError(error, "AI research failed.", researchProviderId));
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runProfileDiscovery() {
    if (!targetName.trim() || !authorized) return;
    if (!requireVeniceApiKey("running profile discovery")) return;
    setError("");
    const profileGuardText = [
      targetName.trim(),
      knownUsername.trim(),
      knownWebsite.trim(),
      knownOrg.trim(),
      knownLocation.trim(),
    ].filter(Boolean).join("\n\n");

    const profileGuard = maybeRunLocalFamilyGuard({
      text: profileGuardText,
      endpoint: "/augment/search",
      method: "POST",
      source: "research",
    }, localFamilySafeModeEnabled);
    if (!profileGuard.allowed) {
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
      if (error.name !== "AbortError") setError(describeResearchError(error, "Profile discovery failed."));
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
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
        subTab === id
          ? "bg-accent/10 text-accent border border-accent/20"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex-none p-5 border-b border-border/50 bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">Research</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              Search, scrape, browse, collect evidence, and synthesize findings.
            </p>
          </div>
          <DiagPreview diagnostics={diagnostics} />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mt-4">
          <div className="flex gap-2 flex-wrap">
            {tabBtn("workspace", "Workspace")}
            {tabBtn("search", "Search / Scrape")}
            {tabBtn("ai-research", "AI Research")}
            {tabBtn("browser", "Browser")}
            {tabBtn("profile-discovery", "Profile Discovery")}
          </div>
          <div className="shrink-0">
            <ResearchProviderStatus onOpenApiKeyDialog={() => setError("Open the API Key dialog (lock icon in the header) to add your Venice key.")} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {error && (
          <div role="alert" className="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-sm leading-relaxed">
            {error}
          </div>
        )}

        {subTab === "workspace" && <ResearchWorkspacePanel />}

        {subTab === "search" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SearchTab
                query={query}
                setQuery={setQuery}
                provider={provider}
                setProvider={setProvider}
                loading={loading}
                runSearch={runSearch}
                searchResults={searchResults}
                onOpenInBrowser={async (url) => {
                  await researchBrowserBridge.navigate({ urlOrQuery: url });
                  setSubTab("browser");
                }}
                onScrapeWithVenice={async (url) => {
                  setUrl(url);
                  await runScrape(url);
                }}
                onReadWithJina={async (url) => {
                  setUrl(url);
                  setScrapeOutput("Reading with Jina...");
                  try {
                    const result = await runResearchScrape({ url, provider: "jina" });
                    if (result.sources[0]?.excerpt) {
                      setScrapeOutput(String(result.sources[0].excerpt));
                    }
                  } catch (err) {
                    setScrapeOutput(String(err));
                  }
                }}
                onSaveToSession={async (item) => {
                  const store = useResearchStore.getState();
                  if (!store.activeSessionId) {
                    setError("No active research session. Open the Workspace tab and create a session first.");
                    return;
                  }
                  await store.addSource(store.activeSessionId, {
                    kind: "search_result",
                    provider: "venice",
                    title: item.title || "Untitled",
                    url: item.url || item.link,
                    excerpt: item.snippet || item.content || item.description,
                    retrievedAt: new Date().toISOString(),
                    citations: [],
                    tags: [],
                  });
                  toast.success("Saved to active research session");
                }}
                onOpenExternal={async (url) => {
                  if (isElectron()) {
                    await researchBrowserBridge.openExternal(url);
                  } else if (isTrustedExternalUrl(url)) {
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                }}
              />
              <ScrapeTab
                url={url}
                setUrl={setUrl}
                loading={loading}
                runScrape={runScrape}
                scrapeOutput={scrapeOutput}
                setScrapeOutput={setScrapeOutput}
              />
            </div>
            <TextParserTab
              file={file}
              setFile={setFile}
              loading={loading}
              runParser={runParser}
              parserOutput={parserOutput}
              setParserOutput={setParserOutput}
            />
          </div>
        )}

        {subTab === "ai-research" && (
          <AiResearchTab
            researchQuestion={researchQuestion}
            setResearchQuestion={setResearchQuestion}
            researchProviderId={researchProviderId}
            setResearchProviderId={setResearchProviderId}
            researchSearchProvider={researchSearchProvider}
            setResearchSearchProvider={setResearchSearchProvider}
            researchScrapeProvider={researchScrapeProvider}
            setResearchScrapeProvider={setResearchScrapeProvider}
            researchRunMode={researchRunMode}
            setResearchRunMode={setResearchRunMode}
            researchBudget={researchBudget}
            setResearchBudget={setResearchBudget}
            loading={loading}
            runAiResearch={runAiResearch}
            researchOutput={researchOutput}
            setResearchOutput={setResearchOutput}
            researchCitations={researchCitations}
          />
        )}

        {subTab === "browser" && (
          <div className="h-[calc(100vh-220px)] min-h-[400px]">
            <ResearchBrowserView
              onCaptureWithJina={async (url) => {
                setUrl(url);
                setScrapeOutput("Reading with Jina...");
                try {
                  const result = await runResearchScrape({ url, provider: "jina" });
                  if (result.sources[0]?.excerpt) {
                    setScrapeOutput(String(result.sources[0].excerpt));
                    setSubTab("search");
                  }
                } catch (err) {
                  setScrapeOutput(String(err));
                }
              }}
            />
          </div>
        )}

        {subTab === "profile-discovery" && (
          <ProfileDiscoveryTab
            targetName={targetName}
            setTargetName={setTargetName}
            knownUsername={knownUsername}
            setKnownUsername={setKnownUsername}
            knownWebsite={knownWebsite}
            setKnownWebsite={setKnownWebsite}
            knownOrg={knownOrg}
            setKnownOrg={setKnownOrg}
            knownLocation={knownLocation}
            setKnownLocation={setKnownLocation}
            maxDepth={maxDepth}
            setMaxDepth={setMaxDepth}
            allowedPlatforms={allowedPlatforms}
            togglePlatform={togglePlatform}
            authorized={authorized}
            setAuthorized={setAuthorized}
            loading={loading}
            runProfileDiscovery={runProfileDiscovery}
            cancelRun={cancelRun}
            profileCandidates={profileCandidates}
          />
        )}
      </div>
    </div>
  );
}
