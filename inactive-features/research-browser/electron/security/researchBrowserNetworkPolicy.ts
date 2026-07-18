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

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return dns.lookup(hostname, { all: true, verbatim: true });
}

/**
 * Validates a Research Browser URL against both syntactic URL policy and DNS
 * resolution. Every call performs a fresh lookup; main-frame, redirect, and
 * subresource callers must invoke it for every HTTP(S) request so an earlier
 * public answer cannot authorize a later private DNS answer.
 */
export async function validateResearchBrowserNetworkUrl(
  url: string,
  lookup: ResearchBrowserDnsLookup = defaultLookup,
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

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname);
  } catch {
    return { allowed: false, url, reason: "DNS lookup failed." };
  }

  if (records.length === 0) {
    return { allowed: false, url, reason: "DNS lookup returned no addresses." };
  }

  const resolvedAddresses = records.map((record) => record.address);
  const privateAddress = resolvedAddresses.find((address) => isPrivateHostname(address));
  if (privateAddress) {
    return {
      allowed: false,
      url,
      reason: `DNS resolved to a private or reserved address: ${privateAddress}`,
      resolvedAddresses,
    };
  }

  return { allowed: true, url, resolvedAddresses };
}
