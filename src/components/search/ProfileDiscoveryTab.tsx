import React from "react";
import { Field } from "../../components/Field";
import { Chip } from "../../components/Chip";
import { safeHref, ALL_PLATFORMS } from "./searchScrapeUtils";
import type { SocialProfileCandidate } from "../../research/agent/socialDiscovery";
import { Trans, useTranslation } from "react-i18next";

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
  profileCandidates,
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
  const { t: tRuntime } = useTranslation("common");
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg flex flex-col gap-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">
          <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.heading.publicProfileDiscovery" />
        </h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.description.aggregatesSocialProfileMappingsFromPublicDatabases" />
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label={tRuntime(
              "runtimeGenerated.components.search.profilediscoverytab.attribute.targetName",
            )}
          >
            <input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.search.profilediscoverytab.attribute.consentingPersonOrBrandName",
              )}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
          <Field label="Known Handle/Username">
            <input
              value={knownUsername}
              onChange={(e) => setKnownUsername(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.search.profilediscoverytab.attribute.username",
              )}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
            />
          </Field>
          <Field
            label={tRuntime(
              "runtimeGenerated.components.search.profilediscoverytab.attribute.knownWebsite",
            )}
          >
            <input
              value={knownWebsite}
              onChange={(e) => setKnownWebsite(e.target.value)}
              placeholder="example.com"
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all font-mono placeholder:text-text-muted/50"
            />
          </Field>
          <Field
            label={tRuntime(
              "runtimeGenerated.components.search.profilediscoverytab.attribute.knownOrganization",
            )}
          >
            <input
              value={knownOrg}
              onChange={(e) => setKnownOrg(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.search.profilediscoverytab.attribute.githubInc",
              )}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
          <Field
            label={tRuntime(
              "runtimeGenerated.components.search.profilediscoverytab.attribute.knownLocation",
            )}
          >
            <input
              value={knownLocation}
              onChange={(e) => setKnownLocation(e.target.value)}
              placeholder={tRuntime(
                "runtimeGenerated.components.search.profilediscoverytab.attribute.sanFranciscoCa",
              )}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
          <Field
            label={tRuntime(
              "runtimeGenerated.components.search.profilediscoverytab.attribute.maxSearchDepth",
            )}
          >
            <input
              type="number"
              min={1}
              max={10}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value) || 3)}
              className="w-full bg-vf-panel-bg border border-vf-panel-border rounded-md px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </Field>
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-discovery-1" className="text-[12.5px] text-text-secondary block font-medium">
            <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.label.platformsToSearch" />
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map((platform) => {
              const isSelected = allowedPlatforms.includes(platform);
              return (
                <button
                  key={platform}
                  onClick={() => togglePlatform(platform)}
                  className={`text-[12px] px-2.5 py-1 rounded-md border transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-accent/10 border-accent/30 text-accent font-medium"
                      : "bg-transparent border-vf-panel-border text-text-muted hover:text-text-primary hover:bg-vf-panel-bg-raised/50"
                  }`}
                >
                  {platform}
                </button>
              );
            })}
          </div>
        </div>

        <label htmlFor="profile-discovery-2" className="flex items-start gap-3 p-4 rounded-md border border-vf-panel-border bg-vf-panel-bg-raised cursor-pointer mt-2">
          <input
            type="checkbox" id="profile-discovery-2" 
            className="mt-0.5 rounded border-vf-panel-border bg-vf-panel-bg text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          <span className="text-[12.5px] text-text-secondary leading-relaxed">
            I confirm this search is for myself, my organization/brand, a
            consenting person, a public figure, or another authorized
            public-interest use. Search will use public web results only.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-md text-[13px] font-medium bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer shadow-[0_0_8px_var(--color-vf-accent-glow)]"
            onClick={runProfileDiscovery}
            disabled={
              loading === "profile-discovery" ||
              !targetName.trim() ||
              !authorized
            }
          >
            {loading === "profile-discovery"
              ? tRuntime(
                  "runtimeGenerated.components.search.profilediscoverytab.text.discovering",
                )
              : tRuntime(
                  "runtimeGenerated.components.search.profilediscoverytab.text.discoverProfiles",
                )}
          </button>
          {loading === "profile-discovery" && (
            <button
              className="px-4 py-2 rounded-md text-[13px] font-medium bg-vf-panel-bg border border-vf-panel-border text-text-primary hover:bg-vf-panel-bg-raised transition-colors cursor-pointer"
              onClick={cancelRun}
            >
              <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.action.cancel" />
            </button>
          )}
        </div>
      </div>

      {profileCandidates.length > 0 && (
        <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14.5px] font-medium text-text-primary">
              <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.heading.discoveredProfileCandidates" />
            </h3>
            <Chip tone="ok">
              {profileCandidates.length}{" "}
              <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.text.candidates" />
            </Chip>
          </div>
          <div className="space-y-3">
            {profileCandidates.map((c, idx) => (
              <div
                key={`${c.platform}-${c.handle}-${idx}`}
                className="rounded-md bg-vf-panel-bg border border-vf-panel-border p-3 text-[13px] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-primary">
                    {c.platform}
                  </span>
                  <Chip
                    tone={
                      c.confidence === "high"
                        ? "ok"
                        : c.confidence === "medium"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {c.confidence}{" "}
                    <Trans i18nKey="common:surface.componentsSearchProfilediscoverytab.text.confidence" />
                  </Chip>
                </div>
                <div className="text-text-secondary">
                  {c.displayName ||
                    tRuntime(
                      "runtimeGenerated.components.search.profilediscoverytab.text.unknownIdentity",
                    )}{" "}
                  {c.handle && (
                    <span className="text-text-muted ml-1">
                      @{c.handle.replace(/^@+/, "")}
                    </span>
                  )}
                </div>
                <a
                  href={safeHref(c.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline break-all text-[12px] block"
                >
                  {c.url}
                </a>
                {c.bioSnippet && (
                  <p className="text-[12px] text-text-muted italic leading-relaxed">
                    {c.bioSnippet}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
