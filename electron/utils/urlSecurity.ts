/** Returns true if the hostname is a loopback, link-local, or RFC 1918 private address. */
export function isPrivateHostname(hostname: string): boolean {
  // Strip IPv6 brackets: new URL("https://[::1]/").hostname === "[::1]"
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "0" || h === "::1" || h === "0:0:0:0:0:0:0:1" || h === "::") return true;

  // IPv4-mapped IPv6: ::ffff:127.0.0.1 or ::ffff:7f00:1 (URL-normalized hex)
  if (h.startsWith("::ffff:")) {
    const rest = h.slice(7);
    if (rest.includes(".")) {
      return isPrivateHostname(rest);
    }
    const hexParts = rest.split(":");
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!Number.isNaN(high) && !Number.isNaN(low)) {
        const bytes = [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
        return isPrivateHostname(bytes.join("."));
      }
    }
  }

  // IPv6 link-local
  if (h.startsWith("fe80:")) return true;

  // Normalize short-form IPv4 (e.g., 127.1 → 127.0.0.1, 10.1 → 10.0.0.1)
  const normalized = normalizeShortIpv4(h);
  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts;
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
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
