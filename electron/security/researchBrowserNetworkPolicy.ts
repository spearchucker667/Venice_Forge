import dns from "node:dns/promises";
import { isIP } from "node:net";
import { isAllowedResearchBrowserUrl, isPrivateHostname } from "../utils/urlSecurity";

export interface ResearchBrowserNetworkDecision {
  allowed: boolean;
  url: string;
  reason?: string;
  resolvedAddresses?: string[];
}

export interface ResearchBrowserDnsLookup {
  (hostname: string): Promise<Array<{ address: string; family: number }>>;
}

const DEFAULT_DNS_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  decision: ResearchBrowserNetworkDecision;
}

const dnsDecisionCache = new Map<string, CacheEntry>();

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function cacheKey(parsed: URL): string {
  return `${parsed.protocol}//${normalizeHostname(parsed.hostname)}`;
}

function cloneDecision(decision: ResearchBrowserNetworkDecision): ResearchBrowserNetworkDecision {
  return {
    ...decision,
    resolvedAddresses: decision.resolvedAddresses ? [...decision.resolvedAddresses] : undefined,
  };
}

function getCachedDecision(key: string, now: number): ResearchBrowserNetworkDecision | null {
  const cached = dnsDecisionCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    dnsDecisionCache.delete(key);
    return null;
  }
  return cloneDecision(cached.decision);
}

function setCachedDecision(key: string, decision: ResearchBrowserNetworkDecision, now: number): void {
  dnsDecisionCache.set(key, {
    expiresAt: now + DEFAULT_DNS_CACHE_TTL_MS,
    decision: cloneDecision(decision),
  });
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

export function clearResearchBrowserDnsCache(): void {
  dnsDecisionCache.clear();
}

/**
 * Validates a Research Browser URL against both syntactic URL policy and DNS
 * resolution. Chromium still performs its own connection, so this is not the
 * same guarantee as a DNS-pinned Node request; it is a defense-in-depth gate
 * for main-frame, redirect, and subresource requests.
 */
export async function validateResearchBrowserNetworkUrl(
  url: string,
  lookup: ResearchBrowserDnsLookup = defaultLookup,
  now = Date.now(),
): Promise<ResearchBrowserNetworkDecision> {
  if (!isAllowedResearchBrowserUrl(url)) {
    return { allowed: false, url, reason: "Blocked disallowed URL, protocol, credentials, or private hostname." };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, url, reason: "Invalid URL." };
  }

  const hostname = normalizeHostname(parsed.hostname);
  const literalIp = isIP(hostname);
  if (literalIp) {
    return { allowed: true, url, resolvedAddresses: [hostname] };
  }

  const key = cacheKey(parsed);
  const cached = getCachedDecision(key, now);
  if (cached) return cached;

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname);
  } catch {
    const decision = { allowed: false, url, reason: "DNS lookup failed." };
    setCachedDecision(key, decision, now);
    return decision;
  }

  if (records.length === 0) {
    const decision = { allowed: false, url, reason: "DNS lookup returned no addresses." };
    setCachedDecision(key, decision, now);
    return decision;
  }

  const resolvedAddresses = records.map((record) => record.address);
  const privateAddress = resolvedAddresses.find((address) => isPrivateHostname(address));
  if (privateAddress) {
    const decision = {
      allowed: false,
      url,
      reason: `DNS resolved to a private or reserved address: ${privateAddress}`,
      resolvedAddresses,
    };
    setCachedDecision(key, decision, now);
    return decision;
  }

  const decision = { allowed: true, url, resolvedAddresses };
  setCachedDecision(key, decision, now);
  return decision;
}
