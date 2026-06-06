/** @fileoverview Unit tests for inspector telemetry redaction and classification. */

import { describe, expect, it } from "vitest";
import {
  buildInspectorTelemetryPatch,
  classifyInspectorError,
  deriveCallOutcome,
  deriveGuardOutcome,
  exportRedactedInspectorLogs,
  matchesInspectorFilter,
  sanitizeInspectorPayload,
  sanitizeInspectorResponse,
} from "./inspectorTelemetry";

describe("inspectorTelemetry", () => {
  it("redacts chat prompt payloads without preserving raw message text", () => {
    const sanitized = sanitizeInspectorPayload({
      model: "venice-1",
      messages: [
        { role: "user", content: "This is a secret prompt that must never leak verbatim." },
      ],
    }) as Record<string, unknown>;

    const messages = sanitized.messages as Array<Record<string, unknown>>;
    expect(messages[0].content).toMatch(/^\[text: \d+ chars\]$/);
    expect(JSON.stringify(sanitized)).not.toContain("secret prompt");
  });

  it("redacts base64 image payloads and bearer tokens from export logs", () => {
    const exported = exportRedactedInspectorLogs([
      {
        id: "abc",
        timestamp: Date.now(),
        endpoint: "/image/generate",
        method: "POST",
        transport: "venice",
        requestHeaders: { Authorization: "Bearer vn-super-secret-key-12345678" },
        requestBody: {
          prompt: "draw a cat",
          image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        },
        responseBody: {
          dataUrl: "data:image/png;base64,QUJDREVGR0g=",
        },
      },
    ]);

    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("vn-super-secret-key");
    expect(serialized).not.toContain("iVBORw0KGgo");
    expect(serialized).not.toContain("draw a cat");
    expect(exported[0].requestHeaders.Authorization).toBe("******");
  });

  it("summarizes scrape bodies instead of storing full text", () => {
    const sanitized = sanitizeInspectorResponse({
      title: "Example",
      text: "x".repeat(5000),
      markdown: "y".repeat(5000),
    }) as Record<string, unknown>;

    expect(sanitized.text).toBe("[text: 5000 chars]");
    expect(sanitized.markdown).toBe("[text: 5000 chars]");
  });

  it("classifies timing/status telemetry without a provider column", () => {
    const patch = buildInspectorTelemetryPatch({
      status: 451,
      durationMs: 42,
      previewDurationMs: 3,
      guardOutcome: "block",
      error: "Blocked by Family Safe Mode",
    });

    expect(patch.durationMs).toBe(42);
    expect(patch.previewDurationMs).toBe(3);
    expect(patch.callOutcome).toBe("blocked");
    expect(patch.errorClass).toBe("safety-block");
    expect(patch).not.toHaveProperty("provider");
  });

  it("derives guard outcomes for family, adult, and electron preview states", () => {
    expect(
      deriveGuardOutcome({
        layer: "local-family-safe-mode",
        mode: "family",
        action: "allow",
      }),
    ).toBe("allow");
    expect(
      deriveGuardOutcome({
        layer: "local-family-safe-mode",
        mode: "adult",
        action: "skipped",
        reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      }),
    ).toBe("skipped");
    expect(
      deriveGuardOutcome({
        layer: "local-family-safe-mode",
        mode: "electron-main-authoritative",
        action: "deferred",
      }),
    ).toBe("deferred");
  });

  it("maps aborted and network failures to call outcomes and error classes", () => {
    expect(classifyInspectorError(0, "Request aborted")).toBe("aborted");
    expect(deriveCallOutcome(undefined, "aborted")).toBe("aborted");
    expect(classifyInspectorError(0, "Fetch failure: network down")).toBe("network");
    expect(deriveCallOutcome(500, "server")).toBe("error");
  });

  it("filters blocked, transport, and local-only rows", () => {
    const blocked = {
      transport: "venice" as const,
      status: 451,
      callOutcome: "blocked" as const,
    };
    const jina = { transport: "jina" as const, status: 200, callOutcome: "success" as const };
    const local = {
      transport: "venice" as const,
      guardOutcome: "deferred" as const,
      status: 200,
      callOutcome: "success" as const,
    };

    expect(matchesInspectorFilter(blocked, "blocked")).toBe(true);
    expect(matchesInspectorFilter(jina, "jina")).toBe(true);
    expect(matchesInspectorFilter(local, "local")).toBe(true);
    expect(matchesInspectorFilter(jina, "blocked")).toBe(false);
  });
});