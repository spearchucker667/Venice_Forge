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
  })
}));

vi.mock("./logger", () => ({
  logError: vi.fn(),
  setLastApiError: vi.fn(),
}));

import { performVeniceRequest } from "./veniceClient";
import { getProviderApiKey } from "./secureStore";

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

    expect(getProviderApiKey).toHaveBeenCalledWith("anthropic", "work-profile");
    expect((requestOptions.headers as Record<string, string>)["x-api-key"]).toBe("test-anthropic-key");
  });
});
