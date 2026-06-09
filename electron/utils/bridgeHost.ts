/** Loopback hosts allowed for the bridge server. Rejects 0.0.0.0, public IPs,
 *  private LAN IPs, and empty or malformed values.
 */
const ALLOWED_BRIDGE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isValidBridgeHost(host: string): boolean {
  if (!host || typeof host !== "string") return false;
  if (host.includes("\0")) return false;
  if (host.includes("/") || host.includes("\\")) return false;
  return ALLOWED_BRIDGE_HOSTS.has(host.trim());
}
