import { describe, expect, it } from "vitest";
import { toEpochMilliseconds } from "./syncTimestamp";

describe("toEpochMilliseconds", () => {
  it("accepts finite epoch milliseconds, ISO strings, and Date values", () => {
    const timestamp = 1_752_261_200_000;
    const iso = new Date(timestamp).toISOString();
    expect(toEpochMilliseconds(timestamp)).toBe(timestamp);
    expect(toEpochMilliseconds(iso)).toBe(timestamp);
    expect(toEpochMilliseconds(new Date(timestamp))).toBe(timestamp);
  });

  it("returns null for missing, invalid, negative, or non-finite values", () => {
    expect(toEpochMilliseconds(undefined)).toBeNull();
    expect(toEpochMilliseconds(null)).toBeNull();
    expect(toEpochMilliseconds("not-a-date")).toBeNull();
    expect(toEpochMilliseconds(-1)).toBeNull();
    expect(toEpochMilliseconds(Number.NaN)).toBeNull();
  });
});
