/** @fileoverview Unit tests for src/lib/workflow-validator.ts (validatePatch helper). */

import { describe, it, expect } from "vitest";
import { validatePatch } from "./workflow-validator";

describe("validatePatch", () => {
  it("returns no issues for a valid add_node patch", () => {
    const issues = validatePatch({
      op: "add_node",
      nodeType: "chat",
      id: "n1",
      params: { model: "llama-3.3-70b", prompt: "hello", temperature: 0.7 },
    });
    expect(issues).toEqual([]);
  });

  it("rejects add_node with a wrong-type param (prompt as number)", () => {
    const issues = validatePatch({
      op: "add_node",
      nodeType: "chat",
      id: "n1",
      // @ts-expect-error intentional wrong-type value
      params: { prompt: 12345 },
    });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
    expect(issues[0].message).toMatch(/prompt.*text/);
  });

  it("rejects add_node with a number param out of range", () => {
    const issues = validatePatch({
      op: "add_node",
      nodeType: "chat",
      id: "n1",
      params: { temperature: 99 },
    });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("rejects unknown node type", () => {
    const issues = validatePatch({
      op: "add_node",
      // @ts-expect-error intentional unknown type to exercise the guard
      nodeType: "bogus",
      id: "n1",
    });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("flags unknown param name as a warning (not an error)", () => {
    const issues = validatePatch({
      op: "add_node",
      nodeType: "chat",
      id: "n1",
      params: { prompt: "hi", totallyMadeUp: 1 },
    });
    const warns = issues.filter((i) => i.severity === "warning");
    expect(warns.length).toBe(1);
  });

  it("rejects set_params with non-primitive values", () => {
    const issues = validatePatch({
      op: "set_params",
      id: "n1",
      params: { prompt: { nested: "object" } as unknown as string },
    });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("accepts set_params with primitives only", () => {
    const issues = validatePatch({
      op: "set_params",
      id: "n1",
      params: { prompt: "hi", temperature: 0.5, hidden: true },
    });
    expect(issues).toEqual([]);
  });
});
