// @vitest-environment node

/** @fileoverview Main-process profile-session authority regression tests. */
// VERIFY-097 regression guard: privileged IPC derives profile identity from WebContents session state.

import { beforeEach, describe, expect, it } from "vitest";
import type { WebContents } from "electron";
import {
  __resetProfileSessionsForTests,
  getProfileSessionId,
  requireProfileSessionId,
  setProfileSessionId,
} from "./profileSession";

function sender(): WebContents {
  return {} as WebContents;
}

describe("profileSession", () => {
  beforeEach(() => __resetProfileSessionsForTests());

  it("defaults each WebContents to the default profile", () => {
    expect(getProfileSessionId(sender())).toBe("default");
  });

  it("keeps profile sessions isolated by WebContents", () => {
    const first = sender();
    const second = sender();

    setProfileSessionId(first, "work");

    expect(getProfileSessionId(first)).toBe("work");
    expect(getProfileSessionId(second)).toBe("default");
  });

  it("rejects invalid profile ids", () => {
    expect(() => setProfileSessionId(sender(), "../escape")).toThrow("Invalid profile id");
  });

  it("fails closed for security-sensitive operations until the sender is explicitly bound", () => {
    const webContents = sender();
    expect(() => requireProfileSessionId(webContents)).toThrow("not bound");
    setProfileSessionId(webContents, "default");
    expect(requireProfileSessionId(webContents)).toBe("default");
  });
});
