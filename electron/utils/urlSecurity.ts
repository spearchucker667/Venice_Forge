/** Returns true if the hostname is a loopback, link-local, or RFC 1918 private address. */
export function isPrivateHostname(hostname: string): boolean {
  // Strip IPv6 brackets: new URL("https://[::1]/").hostname === "[::1]"
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  const parts = h.split(".").map(Number);
  if (parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255)) {
    const [a, b] = parts;
    if (a === 127) return true;                       // 127.0.0.0/8
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  }
  return false;
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
