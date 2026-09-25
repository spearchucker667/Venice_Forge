// @vitest-environment node
/** @fileoverview Regression tests for FRAT-AUD-002: route-aware connection validation
 *  and error classification in apiKeyHandlers.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/secureStore", () => ({
  isApiKeyConfigured: vi.fn(),
}));

vi.mock("../../services/providerSettingsStore", () => ({
  getProviderSettings: vi.fn(),
}));

vi.mock("../../services/guardPipeline", () => ({
  performGuardedVeniceRequest: vi.fn(),
}));

import { isApiKeyConfigured } from "../../services/secureStore";
import { getProviderSettings } from "../../services/providerSettingsStore";
import { performGuardedVeniceRequest } from "../../services/guardPipeline";
import {
  classifyConnectivityFailure,
  testVeniceConnection,
} from "./apiKeyHandlers";

describe("FRAT-AUD-002 — classifyConnectivityFailure route-awareness", () => {
  it("classifies Fraterna 401 with ambiguous route-aware non-destructive copy", () => {
    const status = classifyConnectivityFailure(401, "Unauthorized", "fraterna");
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.statusCode).toBe(401);
    expect(status.safeMessage).toBe(
      "Fraterna rejected this request. The Venice key may be invalid or may not belong to an active Fraterna consorzio. Verify Fraterna membership and the stored key before replacing the credential.",
    );
  });

  it("classifies Fraterna 403 with ambiguous route-aware non-destructive copy", () => {
    const status = classifyConnectivityFailure(403, "Forbidden", "fraterna");
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.statusCode).toBe(403);
    expect(status.safeMessage).toBe(
      "Fraterna rejected this request. The Venice key may be invalid or may not belong to an active Fraterna consorzio. Verify Fraterna membership and the stored key before replacing the credential.",
    );
  });

  it("classifies Fraterna 429 as a retryable upstream error suggesting switch to Venice Direct", () => {
    const status = classifyConnectivityFailure(429, "Too Many Requests", "fraterna");
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.statusCode).toBe(429);
    expect(status.retryable).toBe(true);
    expect(status.safeMessage).toBe(
      "Fraterna returned an upstream error. Try again or switch to Venice Direct.",
    );
  });

  it("classifies Fraterna 503 as a retryable upstream error suggesting switch to Venice Direct", () => {
    const status = classifyConnectivityFailure(503, "Service Unavailable", "fraterna");
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.statusCode).toBe(503);
    expect(status.retryable).toBe(true);
    expect(status.safeMessage).toBe(
      "Fraterna returned an upstream error. Try again or switch to Venice Direct.",
    );
  });

  it("preserves canonical Venice 401 behavior when route is venice", () => {
    const status = classifyConnectivityFailure(401, "Unauthorized", "venice");
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.statusCode).toBe(401);
    expect(status.safeMessage).toBe(
      "API key was found, but Venice rejected it. Re-enter the key in Config.",
    );
  });

  it("preserves canonical Venice 429 / 5xx behavior when route is venice", () => {
    const status = classifyConnectivityFailure(429, "Too Many Requests", "venice");
    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.statusCode).toBe(429);
    expect(status.safeMessage).toBe(
      "Venice returned an error response. Try again or check provider status.",
    );
  });
});

describe("FRAT-AUD-002 — testVeniceConnection route-awareness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified when Fraterna /models call succeeds (200)", async () => {
    vi.mocked(isApiKeyConfigured).mockReturnValue(true);
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: {},
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {},
      primaryApiRoute: "fraterna",
    });
    vi.mocked(performGuardedVeniceRequest).mockResolvedValue({
      kind: "response",
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { data: [{ id: "model-1" }] },
        contentType: "application/json",
      },
    });

    const result = await testVeniceConnection("default");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.connectivity).toMatchObject({
      ok: true,
      kind: "verified",
      endpoint: "models",
      statusCode: 200,
    });
  });

  it("returns ambiguous auth error when Fraterna returns 401", async () => {
    vi.mocked(isApiKeyConfigured).mockReturnValue(true);
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: {},
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {},
      primaryApiRoute: "fraterna",
    });
    vi.mocked(performGuardedVeniceRequest).mockResolvedValue({
      kind: "response",
      response: {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        body: { error: "Unauthorized" },
        contentType: "application/json",
      },
    });

    const result = await testVeniceConnection("default");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    if (result.connectivity.ok) return;
    expect(result.connectivity.safeMessage).toContain("Fraterna rejected this request");
    expect(result.connectivity.safeMessage).toContain("Verify Fraterna membership");
  });

  it("returns Fraterna network failure message when request throws under fraterna route", async () => {
    vi.mocked(isApiKeyConfigured).mockReturnValue(true);
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: {},
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {},
      primaryApiRoute: "fraterna",
    });
    vi.mocked(performGuardedVeniceRequest).mockRejectedValue(new Error("ENOTFOUND fraterna.ai"));

    const result = await testVeniceConnection("default");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    if (result.connectivity.ok) return;
    expect(result.connectivity.safeMessage).toBe(
      "Failed to reach Fraterna. Check network/proxy/VPN/firewall or switch to Venice Direct.",
    );
  });

  it("returns Venice network failure message when request throws under venice route", async () => {
    vi.mocked(isApiKeyConfigured).mockReturnValue(true);
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: {},
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {},
      primaryApiRoute: "venice",
    });
    vi.mocked(performGuardedVeniceRequest).mockRejectedValue(new Error("ENOTFOUND api.venice.ai"));

    const result = await testVeniceConnection("default");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    if (result.connectivity.ok) return;
    expect(result.connectivity.safeMessage).toBe(
      "Network request failed before Venice responded. Check connection, proxy, VPN, or firewall.",
    );
  });
});
