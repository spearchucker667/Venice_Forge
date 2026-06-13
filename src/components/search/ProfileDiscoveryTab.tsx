import React from "react";
import { Field } from "../../components/Field";
import { Chip } from "../../components/Chip";
import { safeHref, ALL_PLATFORMS } from "./searchScrapeUtils";
import type { SocialProfileCandidate } from "../../research/agent/socialDiscovery";

export function ProfileDiscoveryTab({
  targetName,
  setTargetName,
  knownUsername,
  setKnownUsername,
  knownWebsite,
  setKnownWebsite,
  knownOrg,
  setKnownOrg,
  knownLocation,
  setKnownLocation,
  maxDepth,
  setMaxDepth,
  allowedPlatforms,
  togglePlatform,
  authorized,
  setAuthorized,
  loading,
  runProfileDiscovery,
  cancelRun,
  profileCandidates
}: {
  targetName: string;
  setTargetName: (val: string) => void;
  knownUsername: string;
  setKnownUsername: (val: string) => void;
  knownWebsite: string;
  setKnownWebsite: (val: string) => void;
  knownOrg: string;
  setKnownOrg: (val: string) => void;
  knownLocation: string;
  setKnownLocation: (val: string) => void;
  maxDepth: number;
  setMaxDepth: (val: number) => void;
  allowedPlatforms: string[];
  togglePlatform: (platform: string) => void;
  authorized: boolean;
  setAuthorized: (val: boolean) => void;
  loading: string;
  runProfileDiscovery: () => void;
  cancelRun: () => void;
  profileCandidates: SocialProfileCandidate[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg flex flex-col gap-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Public Profile Discovery</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Aggregates social profile mappings from public databases (GitHub, Twitter, LinkedIn, etc.) using Venice web integration.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Target Name">
            <input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="Consenting person or Brand Name"
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
          <Field label="Known Handle/Username">
            <input
              value={knownUsername}
              onChange={(e) => setKnownUsername(e.target.value)}
              placeholder="@username"
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
            />
          </Field>
          <Field label="Known Website">
            <input
              value={knownWebsite}
              onChange={(e) => setKnownWebsite(e.target.value)}
              placeholder="example.com"
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
            />
          </Field>
          <Field label="Known Organization">
            <input
              value={knownOrg}
              onChange={(e) => setKnownOrg(e.target.value)}
              placeholder="GitHub Inc."
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
          <Field label="Known Location">
            <input
              value={knownLocation}
              onChange={(e) => setKnownLocation(e.target.value)}
              placeholder="San Francisco, CA"
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
          <Field label="Max Search Depth">
            <input
              type="number"
              min={1}
              max={10}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value) || 3)}
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
        </div>

        <div className="space-y-2">
          <label className="text-[12.5px] text-text-secondary block font-medium">Platforms to search</label>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map((platform) => {
              const isSelected = allowedPlatforms.includes(platform);
              return (
                <button
                  key={platform}
                  onClick={() => togglePlatform(platform)}
                  className={`text-[12px] px-2.5 py-1 rounded-lg border transition-all duration-150 cursor-pointer ${
                    isSelected 
                      ? "bg-accent/10 border-accent/30 text-accent font-medium" 
                      : "bg-transparent border-border text-text-muted hover:text-text-secondary hover:bg-surface-elevated/50"
                  }`}
                >
                  {platform}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface-elevated cursor-pointer mt-2">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border bg-surface text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          <span className="text-[12.5px] text-text-secondary leading-relaxed">
            I confirm this search is for myself, my organization/brand, a consenting person, a public figure, or another authorized public-interest use. Search will use public web results only.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer"
            onClick={runProfileDiscovery}
            disabled={loading === "profile-discovery" || !targetName.trim() || !authorized}
          >
            {loading === "profile-discovery" ? "Discovering…" : "Discover Profiles"}
          </button>
          {loading === "profile-discovery" && (
            <button 
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-surface border border-border text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              onClick={cancelRun}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {profileCandidates.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14.5px] font-medium text-text-primary">Discovered Profile Candidates</h3>
            <Chip tone="ok">{profileCandidates.length} Candidates</Chip>
          </div>
          <div className="space-y-3">
            {profileCandidates.map((c, idx) => (
              <div key={idx} className="rounded-lg bg-surface border border-border p-3 text-[13px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-primary">{c.platform}</span>
                  <Chip tone={c.confidence === "high" ? "ok" : c.confidence === "medium" ? "warn" : "neutral"}>
                    {c.confidence} confidence
                  </Chip>
                </div>
                <div className="text-text-secondary">
                  {c.displayName || "Unknown Identity"} {c.handle && <span className="text-text-muted ml-1">@{c.handle.replace(/^@+/, "")}</span>}
                </div>
                <a href={safeHref(c.url)} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all text-[11px] block">
                  {c.url}
                </a>
                {c.bioSnippet && <p className="text-[12px] text-text-muted italic leading-relaxed">{c.bioSnippet}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
