/** Returns true if the hostname is loopback, private, link-local, CGNAT, ULA, multicast, or reserved. */
export function isPrivateHostname(hostname: string): boolean {
  let h = hostname.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();

  // Canonicalize via URL parser (handles 0::1 -> ::1, ::127.0.0.1 -> ::7f00:1, etc.)
  try {
    const parsed = new URL(`http://${h.includes(":") ? `[${h}]` : h}`);
    h = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    // fallback to original if unparseable
  }

  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "0" ||
    h === "0.0.0.0" ||
    h === "::" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:0" ||
    h === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  // IPv4-mapped (::ffff:127.0.0.1) or IPv4-compatible (::127.0.0.1)
  if (h.startsWith("::ffff:") || h.startsWith("::")) {
    const rest = h.startsWith("::ffff:") ? h.slice(7) : h.slice(2);
    if (rest.includes(".")) return isPrivateHostname(rest);

    const hexParts = rest.split(":");
    if (hexParts.length === 2 || hexParts.length === 1) {
      // e.g. ::7f00:1 or ::ffff:7f00:1
      const p1 = hexParts.length === 2 ? hexParts[0] : "0";
      const p2 = hexParts.length === 2 ? hexParts[1] : hexParts[0];
      const high = parseInt(p1, 16);
      const low = parseInt(p2, 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const bytes = [
          (high >> 8) & 0xff,
          high & 0xff,
          (low >> 8) & 0xff,
          low & 0xff,
        ];
        return isPrivateHostname(bytes.join("."));
      }
    }
  }

  // IPv6 unique-local and link-local ranges.
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) {
    return true;
  }

  // Normalize short-form IPv4 (127.1 → 127.0.0.1, 10.1 → 10.0.0.1).
  const normalized = normalizeShortIpv4(h);
  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts;

    if (a === 0) return true;                         // 0.0.0.0/8
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true;            // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
    if (a >= 224) return true;                        // multicast + reserved
  }

  return false;
}

/** Expands short-form IPv4 addresses to dotted-quad notation. */
function normalizeShortIpv4(h: string): string {
  // Try to parse using POSIX inet_aton rules
  // Handle hex (0x), octal (0), and decimal
  const parsePart = (part: string) => {
    if (/^0x[0-9a-f]+$/i.test(part)) return parseInt(part, 16);
    if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
    if (/^\d+$/.test(part)) return parseInt(part, 10);
    return NaN;
  };

  const segments = h.split(".");
  if (segments.length < 1 || segments.length > 4) return h;
  const parts = segments.map(parsePart);
  if (parts.some(Number.isNaN)) return h;

  const val = parts.pop()!;
  
  // Combine parts into a single 32-bit number
  let num = 0;
  if (parts.length === 0) {
    num = val;
  } else if (parts.length === 1) {
    if (parts[0] > 0xff || val > 0xffffff) return h;
    num = (parts[0] << 24) + val;
  } else if (parts.length === 2) {
    if (parts[0] > 0xff || parts[1] > 0xff || val > 0xffff) return h;
    num = (parts[0] << 24) + (parts[1] << 16) + val;
  } else if (parts.length === 3) {
    if (parts[0] > 0xff || parts[1] > 0xff || parts[2] > 0xff || val > 0xff) return h;
    num = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + val;
  }
  
  // Extract dotted quad from 32-bit number
  // Use unsigned right shift to avoid sign extension
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff
  ].join(".");
}

/** Determines whether a URL is a trusted external https: link.
 *  Rejects private/loopback addresses (RFC 1918, 127.x, localhost, ::1, 0.0.0.0)
 *  so that Electron's shell.openExternal cannot be directed at internal hosts.
 *  Check is pure hostname string parsing — no DNS resolution.
 *  @param url The URL to evaluate.
 *  @returns True when the URL uses https: and the hostname is not a private address.
 */
export function isTrustedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}
