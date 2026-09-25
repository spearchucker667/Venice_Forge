// @vitest-environment node

import { EventEmitter } from "events";
import https from "https";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn(() => "1.0.0-test") },
}));

vi.mock("https", () => ({
  default: { request: vi.fn() },
}));

// Mock secureStore to return different keys based on the provider
vi.mock("./secureStore", () => ({
  getApiKey: vi.fn((_profileId, _providerId) => {
    return 'default-venice-key'
  }),
  getProviderApiKey: vi.fn((providerId, _profileId) => {
    if (providerId === 'anthropic') return 'test-anthropic-key'
    if (providerId === 'together') return 'test-together-key'
    return null
  }),
  getProviderCredentialOrFallback: vi.fn((providerId, _profileId) => {
    if (providerId === 'anthropic') return 'test-anthropic-key'
    if (providerId === 'together') return 'test-together-key'
    return null
  })
}));

vi.mock("./providerSettingsStore", () => ({
  getProviderSettings: vi.fn(() => ({
    enabledProviders: { anthropic: true, together: true },
    autoFallbackEnabled: false,
    fallbackOrdering: [],
    nativeFallbackModels: {
      anthropic: "claude-3-5-sonnet-latest",
      together: "meta-llama/Llama-3-70b-chat-hf",
    },
    primaryApiRoute: "venice",
  })),
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  setLastApiError: vi.fn(),
}));

import { performVeniceRequest } from "./veniceClient";
import { getProviderCredentialOrFallback } from "./secureStore";
import { getProviderSettings } from "./providerSettingsStore";

interface MockRequest extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: (error?: Error) => void;
}

interface MockResponse extends EventEmitter {
  headers: Record<string, string>;
  statusCode: number;
  statusMessage: string;
}

interface HttpsRequestMock {
  mockImplementation: (
    implementation: (options: unknown, callback: (response: MockResponse) => void) => MockRequest
  ) => void;
}

describe("performVeniceRequest multi-provider adapter integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes requests to Venice by default", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    let requestOptions: any = {};
    
    requestMock.mockImplementation((options, callback) => {
      requestOptions = options;
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        callback(res);
        res.emit("end");
      });
      return req;
    });

    await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { model: "default-model" }
    });

    expect(requestOptions.hostname).toBe("api.venice.ai");
    expect(requestOptions.headers["Authorization"]).toBe("Bearer default-venice-key");
  });

  it("dynamically routes requests to Anthropic and transforms payload", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    let requestOptions: any = {};
    let writtenBody: string = "";
    
    requestMock.mockImplementation((options, callback) => {
      requestOptions = options;
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn((data) => { writtenBody += data });
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        callback(res);
        res.emit("end");
      });
      return req;
    });

    await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { 
        model: "anthropic:claude-3-5-sonnet-latest",
        messages: [
          { role: 'system', content: 'You are a test.' },
          { role: 'user', content: 'Hi' }
        ]
      }
    });

    // Check host and headers
    expect(requestOptions.hostname).toBe("api.anthropic.com");
    expect(requestOptions.path).toBe("/v1/messages");
    expect(requestOptions.headers["x-api-key"]).toBe("test-anthropic-key");
    expect(requestOptions.headers["Authorization"]).toBeUndefined();

    // Check body transformation
    const parsedBody = JSON.parse(writtenBody);
    expect(parsedBody.model).toBe("claude-3-5-sonnet-latest");
    expect(parsedBody.system).toBe("You are a test.");
    expect(parsedBody.messages).toHaveLength(1);
    expect(parsedBody.messages[0]).toEqual({ role: 'user', content: 'Hi' });
  });

  it("uses request.profileId as the provider credential scope", async () => {
    const requestMock = https.request as unknown as HttpsRequestMock;
    let requestOptions: Record<string, unknown> = {};

    requestMock.mockImplementation((options, callback) => {
      requestOptions = options as Record<string, unknown>;
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        callback(res);
        res.emit("end");
      });
      return req;
    });

    await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      profileId: "work-profile",
      body: {
        model: "anthropic:claude-3-5-sonnet-latest",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(getProviderCredentialOrFallback).toHaveBeenCalledWith("anthropic", "work-profile");
    expect((requestOptions.headers as Record<string, string>)["x-api-key"]).toBe("test-anthropic-key");
  });

  it("ignores renderer fallback settings and uses the main-owned provider-native model", async () => {
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: { anthropic: true },
      autoFallbackEnabled: true,
      fallbackOrdering: ["anthropic"],
      nativeFallbackModels: { anthropic: "claude-3-5-sonnet-latest" },
      primaryApiRoute: "venice",
    });
    const requestMock = https.request as unknown as HttpsRequestMock;
    const requests: Array<{ options: Record<string, unknown>; body: string }> = [];

    requestMock.mockImplementation((options, callback) => {
      const record = { options: options as Record<string, unknown>, body: "" };
      requests.push(record);
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn((data) => { record.body += String(data); });
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = requests.length === 1 ? 503 : 200;
        res.statusMessage = requests.length === 1 ? "Unavailable" : "OK";
        callback(res);
        res.emit("data", Buffer.from("{}"));
        res.emit("end");
      });
      return req;
    });

    await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      profileId: "work-profile",
      fallbackConfig: { enabled: true, ordering: ["together"] },
      body: { model: "venice-model-id", messages: [{ role: "user", content: "Hi" }] },
    });

    expect(requests).toHaveLength(2);
    expect(requests[1].options.hostname).toBe("api.anthropic.com");
    expect(JSON.parse(requests[1].body).model).toBe("claude-3-5-sonnet-latest");
  });

  it("routes /images/generations through the selected Fraterna route with its documented payload", async () => {
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: { anthropic: true, together: true },
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {},
      primaryApiRoute: "fraterna",
    });

    const requestMock = https.request as unknown as HttpsRequestMock;
    let requestOptions: Record<string, unknown> = {};
    let writtenBody = "";
    requestMock.mockImplementation((options, callback) => {
      requestOptions = options as Record<string, unknown>;
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn((data) => { writtenBody += String(data); });
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        callback(res);
        res.emit("data", Buffer.from(JSON.stringify({ created: 1, data: [] })));
        res.emit("end");
      });
      return req;
    });

    await performVeniceRequest({
      endpoint: "/images/generations",
      method: "POST",
      body: { model: "gpt-image-1", prompt: "minimal geometric shapes" },
    });

    expect(requestOptions.hostname).toBe("fraterna.ai");
    expect(requestOptions.path).toBe("/api/v1/images/generations");
    expect(requestOptions.headers).toMatchObject({ Authorization: "Bearer default-venice-key" });
    expect(JSON.parse(writtenBody)).toEqual({ model: "gpt-image-1", prompt: "minimal geometric shapes" });
  });

  // FRATERNA primary routing — handoff §7.3 requires that an explicit
  // `provider:foo` prefix ALWAYS wins over the primary route selector, so
  // a Together / Anthropic / Groq request is never silently redirected
  // through Fraterna. This is the single contract guarantee that keeps
  // Fraterna out of the third-party fallback chain (handoff §5.1, §7.3.4).
  it("[FRATERNA-201] explicit provider: prefix bypasses Fraterna routing", async () => {
    vi.mocked(getProviderSettings).mockReturnValue({
      enabledProviders: { together: true, anthropic: true },
      autoFallbackEnabled: false,
      fallbackOrdering: [],
      nativeFallbackModels: {
        anthropic: "claude-3-5-sonnet-latest",
        together: "meta-llama/Llama-3-70b-chat-hf",
      },
      // Fraterna is selected — but this request uses an explicit
      // `together:foo` prefix and MUST route to Together, NOT Fraterna.
      primaryApiRoute: "fraterna",
    });

    const requestMock = https.request as unknown as HttpsRequestMock;
    const requests: Array<{ options: Record<string, unknown>; body: string }> = [];
    requestMock.mockImplementation((options, callback) => {
      const req = new EventEmitter() as MockRequest;
      req.write = vi.fn();
      req.end = vi.fn(() => {
        const res = new EventEmitter() as MockResponse;
        res.headers = { "content-type": "application/json" };
        res.statusCode = 200;
        callback(res);
        res.emit("end");
      });
      requests.push({ options: options as Record<string, unknown>, body: "{}" });
      return req;
    });

    await performVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        model: "together:meta-llama/Llama-3-70b-chat-hf",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    // The request must reach Together (api.together.xyz), not Fraterna.
    expect(requests).toHaveLength(1);
    expect(requests[0].options.hostname).not.toBe("fraterna.ai");
    expect(requests[0].options.hostname).not.toBe("api.venice.ai");
    // Together adapter writes Authorization header from the per-provider key.
    expect(requests[0].options.headers).toMatchObject({
      Authorization: "Bearer test-together-key",
    });
  });
});
