// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Generic public HTTP scrape provider with SSRF defenses.
 *
 * This provider is a minimal fallback for public web pages.
 * It is DISABLED by default and must be explicitly enabled.
 *
 * SSRF defense: renderer-side URL validation is followed by a local proxy
 * request through the Express server or Electron main process. The proxy
 * performs DNS resolution and blocks private resolved IP addresses before
 * opening the outbound connection.
 */

import type {
  ResearchProvider,
  ResearchProviderId,
  ScrapeInput,
  ScrapeResult,
} from "../providerTypes";

export interface GenericHttpConfig {
  /** Must be explicitly set to true to enable this provider. */
  enabled?: boolean;
  /** Maximum response body bytes to read. */
  maxResponseBytes?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Checks whether a URL is safe to fetch (SSRF blocklist). */
export function isSafeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  // Reject URLs with embedded credentials
  if (parsed.username || parsed.password) {
    return false;
  }

  // Block localhost and local/internal names
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }

  // Block all-zero hostnames (0, 0000, 0.0.0.0, etc.)
  if (/^[0.]+$/.test(hostname)) {
    return false;
  }

  // Block single-number IPv4 forms (e.g., "127.1", "2130706433")
  if (/^\d+$/.test(hostname)) {
    return false;
  }

  // Block hex-dotted IPv4 forms (e.g., "0x7f.0.0.1")
  if (/^0x[0-9a-f]+(\.[0-9a-f]+){0,3}$/i.test(hostname)) {
    return false;
  }

  // IPv4 checks
  const ipv4 = hostname;
  if (
    ipv4 === "0.0.0.0" ||
    isInCidr(ipv4, "127.0.0.0", 8) ||
    isInCidr(ipv4, "10.0.0.0", 8) ||
    isInCidr(ipv4, "172.16.0.0", 12) ||
    isInCidr(ipv4, "192.168.0.0", 16) ||
    isInCidr(ipv4, "169.254.0.0", 16) ||
    isInCidr(ipv4, "100.64.0.0", 10)
  ) {
    return false;
  }

  // IPv6 checks
  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return false;
  if (hostname === "::" || hostname === "0:0:0:0:0:0:0:0") return false;
  if (isIpv6InCidr(hostname, "fc00::", 7)) return false;
  if (isIpv6InCidr(hostname, "fe80::", 10)) return false;

  // IPv4-mapped IPv6 (::ffff:<private-v4>)
  // URL normalization may compress the IPv4 into hex (e.g. ::ffff:7f00:1).
  if (hostname.startsWith("::ffff:")) {
    const suffix = hostname.slice(7);
    let mappedV4: string | null = null;
    if (suffix.includes(".")) {
      mappedV4 = suffix;
    } else {
      const groups = suffix.split(":").map((g) => g.padStart(4, "0"));
      const hex = groups.join("");
      if (hex.length === 8) {
        mappedV4 = [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          parseInt(hex.slice(6, 8), 16),
        ].join(".");
      }
    }
    if (
      mappedV4 &&
      (mappedV4 === "0.0.0.0" ||
        isInCidr(mappedV4, "127.0.0.0", 8) ||
        isInCidr(mappedV4, "10.0.0.0", 8) ||
        isInCidr(mappedV4, "172.16.0.0", 12) ||
        isInCidr(mappedV4, "192.168.0.0", 16) ||
        isInCidr(mappedV4, "169.254.0.0", 16) ||
        isInCidr(mappedV4, "100.64.0.0", 10))
    ) {
      return false;
    }
  }

  return true;
}

/** Parses an IPv4 string into a 32-bit integer. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/** Checks whether an IPv4 address falls inside a CIDR block. */
function isInCidr(ip: string, network: string, prefix: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt == null || netInt == null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/** Checks whether an IPv6 address falls inside a CIDR block (basic support). */
function isIpv6InCidr(ip: string, network: string, prefix: number): boolean {
  // Expand both to full 8-group notation
  const expand = (addr: string): string[] | null => {
    const halves = addr.split("::");
    if (halves.length > 2) return null;
    let parts = addr.split(":");
    if (halves.length === 2) {
      const left = halves[0] ? halves[0].split(":") : [];
      const right = halves[1] ? halves[1].split(":") : [];
      const missing = 8 - left.length - right.length;
      if (missing < 0) return null;
      parts = [...left, ...Array(missing).fill("0"), ...right];
    }
    if (parts.length !== 8) return null;
    return parts.map((p) => p.padStart(4, "0"));
  };

  const ipParts = expand(ip);
  const netParts = expand(network);
  if (!ipParts || !netParts) return false;

  const fullGroups = Math.floor(prefix / 16);
  const remainder = prefix % 16;

  for (let i = 0; i < fullGroups; i++) {
    if (ipParts[i] !== netParts[i]) return false;
  }

  if (remainder > 0) {
    const ipVal = Number.parseInt(ipParts[fullGroups], 16);
    const netVal = Number.parseInt(netParts[fullGroups], 16);
    const mask = (~0 << (16 - remainder)) & 0xffff;
    if ((ipVal & mask) !== (netVal & mask)) return false;
  }

  return true;
}

/** Returns true if string starts with a tag. */
function startsWithTag(lowerHtml: string, index: number, tagName: string): boolean {
  if (!lowerHtml.startsWith(`<${tagName}`, index)) return false;
  const next = lowerHtml[index + tagName.length + 1];
  return next === undefined || next === ">" || next === "/" || /\s/.test(next);
}

function findRawTextTagEnd(html: string, lowerHtml: string, fromIndex: number, tagName: string): number {
  let searchFrom = fromIndex;
  const closingPrefix = `</${tagName}`;
  while (searchFrom < lowerHtml.length) {
    const closeStart = lowerHtml.indexOf(closingPrefix, searchFrom);
    if (closeStart === -1) return html.length;
    const next = lowerHtml[closeStart + closingPrefix.length];
    if (next === undefined || next === ">" || /\s/.test(next)) {
      const closeEnd = html.indexOf(">", closeStart + closingPrefix.length);
      return closeEnd === -1 ? html.length : closeEnd + 1;
    }
    searchFrom = closeStart + closingPrefix.length;
  }
  return html.length;
}

/** Very basic tag stripper for HTML → plain text fallback. */
function stripHtml(html: string): string {
  const lowerHtml = html.toLowerCase();
  let text = "";
  let index = 0;

  while (index < html.length) {
    const char = html[index];
    if (char !== "<") {
      text += char;
      index++;
      continue;
    }

    if (startsWithTag(lowerHtml, index, "script")) {
      text += " ";
      index = findRawTextTagEnd(html, lowerHtml, index + 1, "script");
      continue;
    }
    if (startsWithTag(lowerHtml, index, "style")) {
      text += " ";
      index = findRawTextTagEnd(html, lowerHtml, index + 1, "style");
      continue;
    }

    const tagEnd = html.indexOf(">", index + 1);
    text += " ";
    index = tagEnd === -1 ? html.length : tagEnd + 1;
  }

  return text.replace(/\s+/g, " ").trim();
}

import { createTimeoutSignal } from "../../utils/timeout";
import { isElectron, desktopApp } from "../../services/desktopBridge";
import { useSettingsStore } from "../../stores/settings-store";

export function createGenericHttpProvider(config: GenericHttpConfig = {}): ResearchProvider {
  const enabled = config.enabled === true;

  return {
    id: "generic-http",
    label: "Generic HTTP",
    supports: {
      search: false,
      scrape: true,
      socialDiscovery: false,
      documentParsing: false,
    },

    async scrape(input: ScrapeInput): Promise<ScrapeResult> {
      if (!enabled) {
        throw new Error(
          "Generic HTTP provider is disabled by default. Enable it explicitly in settings."
        );
      }

      const url = input.url;
      if (!isSafeUrl(url)) {
        throw new Error("URL blocked by SSRF safety check.");
      }

      const timeout = input.timeoutMs && input.timeoutMs > 0
        ? createTimeoutSignal(input.timeoutMs, input.signal)
        : null;
      const signal = timeout?.signal ?? input.signal;

      let proxyData: { url: string; finalUrl: string; contentType: string; body: string };

      if (isElectron()) {
        const result = await desktopApp.proxyScrape(url);
        if (!result.ok || !result.data) throw new Error(result.error || "Desktop proxy scrape failed");
        proxyData = result.data;
      } else {
        const proxyRes = await fetch("/api/proxy-scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
          },
          body: JSON.stringify({ url }),
          signal,
        });

        if (!proxyRes.ok) {
          let errMsg = `HTTP ${proxyRes.status}`;
          try {
            const errJson = await proxyRes.json();
            if (errJson.error) errMsg = errJson.error;
          } catch { /* ignore */ }
          throw new Error(errMsg);
        }
        proxyData = await proxyRes.json();
      }

      const { finalUrl, contentType, body } = proxyData;

      const isHtml =
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml+xml");

      const text = isHtml ? stripHtml(body) : body;

      return {
        provider: "generic-http" as ResearchProviderId,
        url,
        finalUrl,
        text,
        content: text,
        raw: body,
        fetchedAt: nowIso(),
      };
    },
  };
}
