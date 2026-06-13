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
import { isElectron, desktopApp } from "../../services/desktopBridge";
import { useAuthStore } from "../../stores/auth-store";
import type { DiagnosticsEntry } from "../../types/venice";

import { SearchTab } from "./SearchTab";
import { ScrapeTab } from "./ScrapeTab";
import { TextParserTab } from "./TextParserTab";
import { AiResearchTab } from "./AiResearchTab";
import { ProfileDiscoveryTab } from "./ProfileDiscoveryTab";
import { ResearchWorkspacePanel } from "./ResearchWorkspacePanel";
import type { SubTab, SearchResultItem } from "./searchScrapeTypes";

export function SearchScrapeView() {
  const [subTab, setSubTab] = useState<SubTab>("workspace");
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat) || "llama-3.3-70b";
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticsEntry | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchOutput, setResearchOutput] = useState("");
  const [researchCitations, setResearchCitations] = useState("");
  const [researchProviderId, setResearchProviderId] = useState<"venice" | "jina">("venice");

  const [targetName, setTargetName] = useState("");
  const [knownUsername, setKnownUsername] = useState("");
  const [knownWebsite, setKnownWebsite] = useState("");
  const [knownOrg, setKnownOrg] = useState("");
  const [knownLocation, setKnownLocation] = useState("");
  const [allowedPlatforms, setAllowedPlatforms] = useState<string[]>(["GitHub", "LinkedIn", "X/Twitter"]);
  const [maxDepth, setMaxDepth] = useState(5);
  const [authorized, setAuthorized] = useState(false);
  const [profileCandidates, setProfileCandidates] = useState<SocialProfileCandidate[]>([]);

  const refreshDiagnostics = useCallback(async () => {
    if (!isElectron()) return;
    try {
      const result = await desktopApp.getDiagnostics();
      setDiagnostics(result as unknown as DiagnosticsEntry);
    } catch {
      // Ignore diagnostics failure on non-Electron platforms
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
      if (error.name !== "AbortError") setError(describeResearchError(error, "Search failed."));
    } finally {
      if (runIdRef.current === runId) setLoading("");
    }
  }

  async function runScrape() {
    if (!url.trim()) return;
    if (!requireVeniceApiKey("scraping a URL")) return;
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
      if (d) setDiagnostics(d as DiagnosticsEntry);
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
    if (researchProviderId !== "jina") {
      if (!requireVeniceApiKey("running AI research")) return;
    }
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
      <div className="flex-none p-5 border-b border-border bg-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">Research</h2>
            <p className="text-[12.5px] text-text-muted mt-0.5">
              Search the web, scrape articles, and analyze social profiles.
            </p>
          </div>
          <DiagPreview diagnostics={diagnostics} />
        </div>
        <div className="flex gap-2 mt-4">
          {tabBtn("workspace", "Workspace")}
          {tabBtn("search", "Search / Scrape")}
          {tabBtn("ai-research", "AI Research")}
          {tabBtn("profile-discovery", "Profile Discovery")}
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
            loading={loading}
            runAiResearch={runAiResearch}
            researchOutput={researchOutput}
            setResearchOutput={setResearchOutput}
            researchCitations={researchCitations}
          />
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
