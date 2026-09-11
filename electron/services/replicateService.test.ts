// @vitest-environment node

/** @fileoverview Focused tests for the Replicate prediction lifecycle service. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateReplicateModel,
  createReplicatePrediction,
  cancelReplicatePrediction,
  downloadReplicateOutput,
  pollReplicatePrediction,
  testReplicateConnection,
  validateReplicateOutputUrl,
  MAX_DOWNLOAD_BYTES,
  type ReplicatePrediction,
} from "./replicateService";

const TOKEN = "r8_test_token";

vi.mock("electron", () => ({
  app: { getVersion: () => "3.0.0-beta.3" },
}));

function mockFetch(response: {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: Headers;
  text?: string;
  arrayBuffer?: ArrayBuffer;
  body?: ReadableStream<Uint8Array>;
}) {
  const headers = response.headers ?? new Headers();
  return vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText ?? "",
    headers,
    text: vi.fn().mockResolvedValue(response.text ?? ""),
    arrayBuffer: vi.fn().mockResolvedValue(response.arrayBuffer ?? new ArrayBuffer(0)),
    body: response.body,
  } as unknown as Response);
}

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
}

function buildStreamResponse(body: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
}

describe("replicateService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("validateReplicateModel", () => {
    it("accepts owner/name and owner/name:version", () => {
      expect(validateReplicateModel("black-forest-labs/flux-schnell")).toBe(
        "black-forest-labs/flux-schnell",
      );
      expect(validateReplicateModel("black-forest-labs/flux-schnell:1.0")).toBe(
        "black-forest-labs/flux-schnell:1.0",
      );
    });

    it("rejects invalid model identifiers", () => {
      expect(() => validateReplicateModel("")).toThrow("Replicate model is required.");
      expect(() => validateReplicateModel("../etc/passwd")).toThrow(
        "Replicate model identifier is invalid.",
      );
      expect(() => validateReplicateModel("https://evil.com/model")).toThrow(
        "Replicate model identifier is invalid.",
      );
    });
  });

  describe("createReplicatePrediction", () => {
    it("creates a prediction with Bearer auth and unencoded owner/name path", async () => {
      const prediction: ReplicatePrediction = {
        id: "pred-123",
        status: "starting",
        input: { prompt: "a cat" },
      };
      const fetchMock = mockFetch({ ok: true, status: 200, text: JSON.stringify(prediction) });
      vi.stubGlobal("fetch", fetchMock);

      const result = await createReplicatePrediction(TOKEN, {
        model: "black-forest-labs/flux-schnell",
        input: { prompt: "a cat" },
      });
      expect(result.id).toBe("pred-123");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions");
      expect((init as RequestInit).method).toBe("POST");
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: "Bearer r8_test_token",
        "Content-Type": "application/json",
        "User-Agent": "VeniceForge/3.0.0-beta.3",
      });
      const sentBody = JSON.parse((init as RequestInit).body as string);
      expect(sentBody).toEqual({ input: { prompt: "a cat" } });
    });

    it("sends version in body for versioned model identifiers", async () => {
      const prediction: ReplicatePrediction = {
        id: "pred-456",
        status: "starting",
        input: { prompt: "a cat" },
      };
      const fetchMock = mockFetch({ ok: true, status: 200, text: JSON.stringify(prediction) });
      vi.stubGlobal("fetch", fetchMock);

      await createReplicatePrediction(TOKEN, {
        model: "black-forest-labs/flux-schnell:1.0",
        input: { prompt: "a cat" },
      });
      const [, init] = fetchMock.mock.calls[0];
      const sentBody = JSON.parse((init as RequestInit).body as string);
      expect(sentBody).toEqual({ input: { prompt: "a cat" }, version: "1.0" });
    });

    it("throws a sanitized error on provider failure", async () => {
      const fetchMock = mockFetch({
        ok: false,
        status: 402,
        text: JSON.stringify({ detail: "Payment required" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        createReplicatePrediction(TOKEN, {
          model: "black-forest-labs/flux-schnell",
          input: { prompt: "a cat" },
        }),
      ).rejects.toThrow("Payment required");
    });

    it("throws acceptance-unknown error on creation timeout", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => new Promise((_resolve, reject) => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        })),
      );

      await expect(
        createReplicatePrediction(TOKEN, {
          model: "black-forest-labs/flux-schnell",
          input: { prompt: "a cat" },
        }),
      ).rejects.toThrow(/acceptance-unknown/);
    });
  });

  describe("pollReplicatePrediction", () => {
    it("returns pending while processing", async () => {
      const prediction: ReplicatePrediction = {
        id: "pred-123",
        status: "processing",
        input: {},
      };
      vi.stubGlobal("fetch", mockFetch({ ok: true, status: 200, text: JSON.stringify(prediction) }));

      const result = await pollReplicatePrediction(TOKEN, "pred-123");
      expect(result.kind).toBe("pending");
    });

    it("returns completed with output URL", async () => {
      const prediction: ReplicatePrediction = {
        id: "pred-123",
        status: "succeeded",
        input: {},
        output: ["https://replicate.delivery/out.png"],
      };
      vi.stubGlobal("fetch", mockFetch({ ok: true, status: 200, text: JSON.stringify(prediction) }));

      const result = await pollReplicatePrediction(TOKEN, "pred-123");
      expect(result.kind).toBe("completed");
      if (result.kind === "completed") {
        expect(result.outputUrl).toBe("https://replicate.delivery/out.png");
      }
    });

    it("returns failed when output URL is missing", async () => {
      const prediction: ReplicatePrediction = {
        id: "pred-123",
        status: "succeeded",
        input: {},
        output: {},
      };
      vi.stubGlobal("fetch", mockFetch({ ok: true, status: 200, text: JSON.stringify(prediction) }));

      const result = await pollReplicatePrediction(TOKEN, "pred-123");
      expect(result.kind).toBe("failed");
    });

    it("returns canceled for canceled predictions", async () => {
      const prediction: ReplicatePrediction = {
        id: "pred-123",
        status: "canceled",
        input: {},
      };
      vi.stubGlobal("fetch", mockFetch({ ok: true, status: 200, text: JSON.stringify(prediction) }));

      const result = await pollReplicatePrediction(TOKEN, "pred-123");
      expect(result.kind).toBe("canceled");
    });
  });

  describe("cancelReplicatePrediction", () => {
    it("treats 409 as already terminal", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: false, status: 409, text: "" }));
      await expect(cancelReplicatePrediction(TOKEN, "pred-123")).resolves.toBeDefined();
    });

    it("throws on other failures", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch({ ok: false, status: 500, text: JSON.stringify({ detail: "Server error" }) }),
      );
      await expect(cancelReplicatePrediction(TOKEN, "pred-123")).rejects.toThrow("Server error");
    });
  });

  describe("validateReplicateOutputUrl", () => {
    it("accepts trusted Replicate output URLs", () => {
      expect(() => validateReplicateOutputUrl("https://replicate.delivery/out.png")).not.toThrow();
      expect(() =>
        validateReplicateOutputUrl("https://pbxt.replicate.delivery/out.png"),
      ).not.toThrow();
    });

    it("rejects non-HTTPS URLs", () => {
      expect(() => validateReplicateOutputUrl("http://replicate.delivery/out.png")).toThrow(
        "HTTPS",
      );
      expect(() => validateReplicateOutputUrl("file:///etc/passwd")).toThrow("HTTPS");
    });

    it("rejects localhost, loopback, link-local, and private addresses", () => {
      expect(() => validateReplicateOutputUrl("https://localhost/out.png")).toThrow("private");
      expect(() => validateReplicateOutputUrl("https://127.0.0.1/out.png")).toThrow("private");
      expect(() => validateReplicateOutputUrl("https://[::1]/out.png")).toThrow("private");
      expect(() => validateReplicateOutputUrl("https://169.254.169.254/out.png")).toThrow(
        "private",
      );
      expect(() => validateReplicateOutputUrl("https://10.0.0.1/out.png")).toThrow("private");
      expect(() => validateReplicateOutputUrl("https://192.168.1.1/out.png")).toThrow("private");
      expect(() => validateReplicateOutputUrl("https://172.16.0.1/out.png")).toThrow("private");
    });

    it("rejects untrusted hostnames", () => {
      expect(() => validateReplicateOutputUrl("https://attacker.example/out.png")).toThrow(
        "not trusted",
      );
      expect(() => validateReplicateOutputUrl("https://trusted-host.evil.example/out.png")).toThrow(
        "not trusted",
      );
    });

    it("rejects credentials and unexpected ports", () => {
      expect(() =>
        validateReplicateOutputUrl("https://user:pass@replicate.delivery/out.png"),
      ).toThrow("credentials");
      expect(() => validateReplicateOutputUrl("https://replicate.delivery:8443/out.png")).toThrow(
        "port",
      );
    });
  });

  describe("downloadReplicateOutput", () => {
    it("downloads a valid HTTPS output URL", async () => {
      const buffer = pngBytes();
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "image/png" }),
        body: buildStreamResponse(buffer),
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      const result = await downloadReplicateOutput("https://replicate.delivery/out.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.buffer.toString("hex")).toBe(buffer.toString("hex"));
    });

    it("rejects non-HTTPS URLs", async () => {
      await expect(downloadReplicateOutput("http://replicate.delivery/out.png")).rejects.toThrow(
        "HTTPS",
      );
      await expect(downloadReplicateOutput("file:///etc/passwd")).rejects.toThrow("HTTPS");
    });

    it("rejects redirect from trusted host to untrusted host", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 302,
          statusText: "Found",
          headers: new Headers({ location: "https://attacker.example/out.png" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/png" }),
          body: buildStreamResponse(pngBytes()),
        } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        "not trusted",
      );
    });

    it("rejects oversized content-length", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({
          "content-type": "image/png",
          "content-length": String(MAX_DOWNLOAD_BYTES + 1),
        }),
        body: buildStreamResponse(pngBytes()),
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        "maximum allowed size",
      );
    });

    it("rejects oversized streamed response", async () => {
      const huge = Buffer.alloc(MAX_DOWNLOAD_BYTES + 1, 0x89);
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "image/png" }),
        body: buildStreamResponse(huge),
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        /exceeds maximum/i,
      );
    });

    it("rejects disallowed MIME types", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/html" }),
        body: buildStreamResponse(Buffer.from("<html></html>")),
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        "MIME type",
      );
    });

    it("rejects invalid media signatures", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "image/png" }),
        body: buildStreamResponse(Buffer.from("not a png")),
      } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        "signature",
      );
    });

    it("downloads after validating a chain of trusted redirects", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 302,
          statusText: "Found",
          headers: new Headers({ location: "https://pbxt.replicate.delivery/out.png" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "image/jpeg" }),
          body: buildStreamResponse(jpegBytes()),
        } as unknown as Response);
      vi.stubGlobal("fetch", fetchMock);

      const result = await downloadReplicateOutput("https://replicate.delivery/out.png");
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("rejects redirect loops exceeding the hop limit", async () => {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 302,
          statusText: "Found",
          headers: new Headers({ location: "https://replicate.delivery/next.png" }),
        } as unknown as Response),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        "redirect limit",
      );
    });

    it("classifies an aborted fetch as a download timeout", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      }));

      await expect(downloadReplicateOutput("https://replicate.delivery/out.png")).rejects.toThrow(
        "timed out",
      );
    });
  });

  describe("testReplicateConnection", () => {
    it("reports verified on 200", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: true, status: 200, text: "{}" }));
      const result = await testReplicateConnection(TOKEN);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it("reports reachable on 404", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: false, status: 404, text: "{}" }));
      const result = await testReplicateConnection(TOKEN);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(404);
    });

    it("reports invalid token on 401/403", async () => {
      vi.stubGlobal("fetch", mockFetch({ ok: false, status: 401, text: "{}" }));
      const result = await testReplicateConnection(TOKEN);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/Invalid Replicate API token/i);
    });

    it("reports failure on other non-success statuses", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch({ ok: false, status: 500, text: JSON.stringify({ detail: "Server error" }) }),
      );
      const result = await testReplicateConnection(TOKEN);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("Server error");
    });
  });
});
